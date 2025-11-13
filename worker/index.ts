import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { cors } from 'hono/cors'
import { jwt, sign } from 'hono/jwt'
import { getCookie, setCookie } from 'hono/cookie'

type Env = {
	Bindings: {
		ASSETS: Fetcher
		GOOGLE_DRIVE_API_KEY: string
		GF_KIOSK_KV: KVNamespace
	}
}

const app = new Hono<Env>()

// Rate Limiting für Login
const loginAttempts = new Map<string, { count: number; resetTime: number }>()
const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000  // 15 Minuten

// Rate Limit Middleware für Login
async function rateLimitLoginMiddleware(c: Context<Env>, next: Next) {
	const clientIp = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown'
	const now = Date.now()

	const attempt = loginAttempts.get(clientIp)
	if (attempt && attempt.count >= MAX_LOGIN_ATTEMPTS && now < attempt.resetTime) {
		const waitSeconds = Math.ceil((attempt.resetTime - now) / 1000)
		return c.json(
			{ error: `Zu viele Versuche. Versuchen Sie es in ${waitSeconds} Sekunden erneut.` },
			429
		)
	}

	await next()
}

// CORS für alle Routen
app.use('*', cors({
	origin: '*',
	allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
	allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
	maxAge: 86400,
}))

// Permissions Policy für Autoplay
app.use('*', async (c, next) => {
	await next()
	c.header('Permissions-Policy', 'autoplay=(self)')
})

// Auth Login Endpoint
app.post('/api/auth/login', rateLimitLoginMiddleware, async (c) => {
	const clientIp = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown'
	const now = Date.now()

	try {
		const { pin } = await c.req.json()

		// Get stored PIN from KV
		const storedPin = await c.env.GF_KIOSK_KV.get('kiosk_pin')

		if (!storedPin || pin !== storedPin) {
			// Track failed attempt
			const attempt = loginAttempts.get(clientIp) || { count: 0, resetTime: now + LOGIN_WINDOW_MS }
			attempt.count++
			attempt.resetTime = now + LOGIN_WINDOW_MS
			loginAttempts.set(clientIp, attempt)

			return c.json({ error: 'PIN ungültig' }, 401)
		}

		// Success - clear attempts
		loginAttempts.delete(clientIp)

		// Get JWT secret from KV
		const jwtSecret = await c.env.GF_KIOSK_KV.get('jwt_secret')
		if (!jwtSecret) {
			return c.json({ error: 'Server configuration error' }, 500)
		}

		// Generate JWT token (10 years expiry)
		const payload = {
			authenticated: true,
			exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 365 * 10), // 10 years
		}

		const token = await sign(payload, jwtSecret)

		// Set cookie (secure only in production, not for localhost)
		const isProduction = c.req.url.includes('https://')
		setCookie(c, 'kiosk_session', token, {
			httpOnly: true,
			secure: isProduction,
			sameSite: 'Strict',
			// Max 400 days per spec (~34560000 seconds)
			maxAge: 60 * 60 * 24 * 400,
			path: '/',
		})

		return c.json({ success: true })
	} catch (err) {
		console.error('Login error:', err)
		return c.json({ error: 'Login failed' }, 500)
	}
})

// Auth Check Endpoint
app.get('/api/auth/check', async (c) => {
	const token = getCookie(c, 'kiosk_session')
	if (!token) {
		return c.json({ authenticated: false }, 401)
	}

	try {
		const jwtSecret = await c.env.GF_KIOSK_KV.get('jwt_secret')
		if (!jwtSecret) {
			return c.json({ authenticated: false }, 500)
		}

		// Verify JWT
		const jwtMiddleware = jwt({ secret: jwtSecret, cookie: 'kiosk_session' })
		await jwtMiddleware(c, async () => { })

		return c.json({ authenticated: true })
	} catch {
		return c.json({ authenticated: false }, 401)
	}
})

// Auth Logout Endpoint
app.post('/api/auth/logout', (c) => {
	const isProduction = c.req.url.includes('https://')
	setCookie(c, 'kiosk_session', '', {
		httpOnly: true,
		secure: isProduction,
		sameSite: 'Strict',
		maxAge: 0,
		path: '/',
	})
	return c.json({ success: true })
})

// Auth Middleware für geschützte Routen
async function authMiddleware(c: Context<Env>, next: Next) {
	const token = getCookie(c, 'kiosk_session')

	if (!token) {
		return c.json({ error: 'Unauthorized' }, 401)
	}

	try {
		const jwtSecret = await c.env.GF_KIOSK_KV.get('jwt_secret')
		if (!jwtSecret) {
			return c.json({ error: 'Server configuration error' }, 500)
		}

		const jwtMiddleware = jwt({ secret: jwtSecret, cookie: 'kiosk_session' })
		await jwtMiddleware(c, next)
	} catch {
		return c.json({ error: 'Invalid token' }, 401)
	}
}

// Google Drive API Proxy: leitet `/api/drive/*` an Google Drive API weiter (geschützt)
app.all('/api/drive/*', authMiddleware, async (c) => {
	const apiKey = c.env.GOOGLE_DRIVE_API_KEY
	if (!apiKey) {
		return c.json({ error: 'Server not configured - missing API key' }, 500)
	}
	const reqUrl = new URL(c.req.url)

	// Entferne /api/drive/ prefix und füge API Key hinzu
	const drivePath = reqUrl.pathname.replace('/api/drive', '')

	// Konstruiere URL korrekt - prüfe ob bereits Query Parameter vorhanden sind
	let upstreamUrl: string
	if (reqUrl.search) {
		upstreamUrl = `https://www.googleapis.com/drive/v3${drivePath}${reqUrl.search}&key=${apiKey}`
	} else {
		upstreamUrl = `https://www.googleapis.com/drive/v3${drivePath}?key=${apiKey}`
	}

	const headers = new Headers(c.req.header())
	headers.delete('host')
	headers.set('User-Agent', 'GF-Board-Kiosk/1.0')

	const method = c.req.method
	const body = ['GET', 'HEAD'].includes(method) ? undefined : await c.req.arrayBuffer()

	try {
		// 5 minute timeout for large file downloads
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000)

		const resp = await fetch(upstreamUrl, {
			method,
			headers,
			body,
			redirect: 'follow',
			signal: controller.signal
		})

		clearTimeout(timeoutId)

		// Kopiere alle Headers und füge CORS hinzu
		const respHeaders = new Headers()
		resp.headers.forEach((value, key) => {
			// Entferne gzip-encoding Header, da wir bereits dekomprimiert haben
			if (key.toLowerCase() !== 'content-encoding') {
				respHeaders.set(key, value)
			}
		})
		respHeaders.set('Access-Control-Allow-Origin', '*')
		respHeaders.set('Access-Control-Allow-Credentials', 'true')

		// STATT arrayBuffer() zu verwenden, streamen wir die Response direkt
		// Dies verhindert Memory-Limit-Überschreitungen bei großen Dateien
		return new Response(resp.body, {
			status: resp.status,
			statusText: resp.statusText,
			headers: respHeaders
		})
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error'

		if (err instanceof DOMException && err.name === 'AbortError') {
			console.error(`⏱️ Drive API timeout (5 min exceeded)`)
			return new Response(JSON.stringify({ error: 'Request timeout - file too large or server too slow' }), {
				status: 504,
				headers: {
					'content-type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			})
		}

		console.error(`❌ Drive API error:`, err)
		return new Response(JSON.stringify({ error: 'Google Drive API fetch failed', details: errorMessage }), {
			status: 502,
			headers: {
				'content-type': 'application/json',
				'Access-Control-Allow-Origin': '*',
			},
		})
	}
})

// Health check endpoint
app.get('/api/health', (c) => {
	return c.json({
		status: 'ok',
		service: 'GF Board Kiosk Proxy',
		timestamp: new Date().toISOString()
	})
})

// Test endpoint for Google Drive API
app.get('/api/test-drive', async (c) => {
	const apiKey = c.env.GOOGLE_DRIVE_API_KEY || 'REDACTED_GOOGLE_API_KEY'
	const testUrl = `https://www.googleapis.com/drive/v3/files?q='REDACTED_FOLDER_ID'+in+parents&key=${apiKey}`

	try {
		const response = await fetch(testUrl)
		const data = await response.text()

		return c.json({
			status: response.status,
			statusText: response.statusText,
			headers: Object.fromEntries(response.headers.entries()),
			body: data.substring(0, 500) + (data.length > 500 ? '...' : '')
		})
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error'
		return c.json({
			error: errorMessage,
			testUrl
		})
	}
})

// Static Serving – liefert Assets aus der `ASSETS`-Binding.
app.get('*', async (c) => {
	try {
		const response = await c.env.ASSETS.fetch(c.req.raw)
		return response
	} catch {
		return new Response('Not found', { status: 404 })
	}
})

export default app