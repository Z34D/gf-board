import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Env = {
  Bindings: {
    ASSETS: Fetcher
    GOOGLE_DRIVE_API_KEY: string
  }
}

const app = new Hono<Env>()

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

// Google Drive API Proxy: leitet `/api/drive/*` an Google Drive API weiter
app.all('/api/drive/*', async (c) => {
  const apiKey = c.env.GOOGLE_DRIVE_API_KEY || 'REDACTED_GOOGLE_API_KEY'
  const reqUrl = new URL(c.req.url)
  
  // Entferne /api/drive/ prefix und füge API Key hinzu
  const drivePath = reqUrl.pathname.replace('/api/drive', '')
  
  // Konstruiere URL korrekt - prüfe ob bereits Query Parameter vorhanden sind
  let upstreamUrl: string
  if (reqUrl.search) {
    // Query Parameter bereits vorhanden, füge API Key hinzu
    upstreamUrl = `https://www.googleapis.com/drive/v3${drivePath}${reqUrl.search}&key=${apiKey}`
  } else {
    // Keine Query Parameter, füge API Key hinzu
    upstreamUrl = `https://www.googleapis.com/drive/v3${drivePath}?key=${apiKey}`
  }
  
  console.log(`🔄 [PROXY] Forwarding to Google Drive API: ${upstreamUrl}`)

  const headers = new Headers(c.req.header())
  headers.delete('host')
  headers.set('User-Agent', 'GF-Board-Kiosk/1.0')

  const method = c.req.method
  const body = ['GET', 'HEAD'].includes(method) ? undefined : await c.req.arrayBuffer()

  try {
    const resp = await fetch(upstreamUrl, {
      method,
      headers,
      body,
      redirect: 'follow',
    })
    
    console.log(`✅ [PROXY] Google Drive API response: ${resp.status}`)
    
    // Prüfe Content-Type und handle entsprechend
    const contentType = resp.headers.get('content-type') || ''
    console.log(`📄 [PROXY] Response content-type: ${contentType}`)
    
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
    
    // Verwende arrayBuffer() für alle Inhalte - das funktioniert zuverlässig
    const buf = await resp.arrayBuffer()
    console.log(`📄 [PROXY] Forwarding ${buf.byteLength} bytes: ${contentType}`)
    
    return new Response(buf, { 
      status: resp.status, 
      statusText: resp.statusText,
      headers: respHeaders 
    })
  } catch (error: any) {
    console.error(`❌ [PROXY] Google Drive API error:`, error)
    return new Response(JSON.stringify({ error: 'Google Drive API fetch failed', details: error.message }), {
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
  
  console.log(`🧪 [TEST] Testing Google Drive API: ${testUrl}`)
  
  try {
    const response = await fetch(testUrl)
    const data = await response.text()
    
    return c.json({
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: data.substring(0, 500) + (data.length > 500 ? '...' : '')
    })
  } catch (error: any) {
    return c.json({
      error: error.message,
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