/**
 * Cloudflare Worker API server
 *
 * Provides:
 * - PIN authentication with JWT sessions
 * - Google Drive API proxy for media files
 * - Rate limiting for login attempts
 * - Streaming responses for large files (RPi memory optimization)
 *
 * Endpoints:
 * - POST /api/auth/login - PIN authentication
 * - GET /api/auth/check - Verify session
 * - POST /api/auth/logout - Clear session
 * - GET /api/locations/:location/files - List media for location
 * - ALL /api/drive/* - Google Drive API proxy
 * - GET /api/health - Health check
 *
 * @module worker/index
 */

import { Hono } from "hono";
import type { Context, Next } from "hono";
import { cors } from "hono/cors";
import { jwt, sign } from "hono/jwt";
import { getCookie, setCookie } from "hono/cookie";

/** Cloudflare Worker environment bindings */
type Env = {
  Bindings: {
    ASSETS: Fetcher;
    GOOGLE_DRIVE_API_KEY: string;
    GOOGLE_DRIVE_ROOT_FOLDER_ID: string;
    KIOSK_PIN: string;
    JWT_SECRET: string;
  };
};

const app = new Hono<Env>();

// --- Rate Limiting ---

/** Track login attempts per IP */
const loginAttempts = new Map<string, { count: number; resetTime: number }>();
/** Max failed login attempts before lockout */
const MAX_LOGIN_ATTEMPTS = 5;
/** Lockout window duration (15 minutes) */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/**
 * Validate required environment variables
 * @returns Object with validation result and list of missing vars
 */
function validateEnvironment(c: Context<Env>): {
  isValid: boolean;
  missingVars: string[];
} {
  const missingVars: string[] = [];

  if (!c.env.GOOGLE_DRIVE_API_KEY) {
    missingVars.push("GOOGLE_DRIVE_API_KEY");
  }
  if (!c.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
    missingVars.push("GOOGLE_DRIVE_ROOT_FOLDER_ID");
  }
  if (!c.env.KIOSK_PIN) {
    missingVars.push("KIOSK_PIN");
  }
  if (!c.env.JWT_SECRET) {
    missingVars.push("JWT_SECRET");
  }

  if (missingVars.length > 0) {
    console.error("❌ Missing environment variables:", missingVars.join(", "));
    console.error(
      "⚠️  Please configure the following in Cloudflare Workers settings:",
    );
    missingVars.forEach((varName) => {
      console.error(`   - ${varName}`);
    });
    return { isValid: false, missingVars };
  }

  return { isValid: true, missingVars: [] };
}

/**
 * Rate limit middleware for login endpoint
 * Blocks IP after MAX_LOGIN_ATTEMPTS failed attempts
 */
async function rateLimitLoginMiddleware(c: Context<Env>, next: Next) {
  const clientIp =
    c.req.header("x-forwarded-for") ||
    c.req.header("cf-connecting-ip") ||
    "unknown";
  const now = Date.now();

  const attempt = loginAttempts.get(clientIp);
  if (
    attempt &&
    attempt.count >= MAX_LOGIN_ATTEMPTS &&
    now < attempt.resetTime
  ) {
    const waitSeconds = Math.ceil((attempt.resetTime - now) / 1000);
    return c.json(
      {
        error: `Zu viele Versuche. Versuchen Sie es in ${waitSeconds} Sekunden erneut.`,
      },
      429,
    );
  }

  await next();
}

// --- CORS & Headers ---

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    maxAge: 86400,
  }),
);

// Allow video autoplay
app.use("*", async (c, next) => {
  await next();
  c.header("Permissions-Policy", "autoplay=(self)");
});

// --- Authentication Endpoints ---
app.post("/api/auth/login", rateLimitLoginMiddleware, async (c) => {
  const clientIp =
    c.req.header("x-forwarded-for") ||
    c.req.header("cf-connecting-ip") ||
    "unknown";
  const now = Date.now();

  try {
    const { pin } = await c.req.json();

    // Get PIN from environment variable
    const storedPin = c.env.KIOSK_PIN;

    if (!storedPin) {
      console.error("❌ KIOSK_PIN is not configured in environment variables");
      return c.json({ error: "Server configuration error - PIN not set" }, 500);
    }

    if (pin !== storedPin) {
      // Track failed attempt
      const attempt = loginAttempts.get(clientIp) || {
        count: 0,
        resetTime: now + LOGIN_WINDOW_MS,
      };
      attempt.count++;
      attempt.resetTime = now + LOGIN_WINDOW_MS;
      loginAttempts.set(clientIp, attempt);

      return c.json({ error: "PIN ungültig" }, 401);
    }

    // Success - clear attempts
    loginAttempts.delete(clientIp);

    // Get JWT secret from environment variable
    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error("❌ JWT_SECRET is not configured in environment variables");
      return c.json(
        { error: "Server configuration error - JWT_SECRET not set" },
        500,
      );
    }

    // Generate JWT token (10 years expiry)
    const payload = {
      authenticated: true,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 10, // 10 years
    };

    const token = await sign(payload, jwtSecret);

    // Set cookie (secure only in production, not for localhost)
    const isProduction = c.req.url.includes("https://");
    setCookie(c, "kiosk_session", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "Strict",
      // Max 400 days per spec (~34560000 seconds)
      maxAge: 60 * 60 * 24 * 400,
      path: "/",
    });

    return c.json({ success: true });
  } catch (err) {
    console.error("Login error:", err);
    return c.json({ error: "Login failed" }, 500);
  }
});

// Auth Check Endpoint
app.get("/api/auth/check", async (c) => {
  const token = getCookie(c, "kiosk_session");
  if (!token) {
    return c.json({ authenticated: false }, 401);
  }

  try {
    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error("❌ JWT_SECRET is not configured in environment variables");
      return c.json({ authenticated: false }, 500);
    }

    // Verify JWT
    const jwtMiddleware = jwt({ secret: jwtSecret, cookie: "kiosk_session", alg: "HS256" });
    await jwtMiddleware(c, async () => {});

    return c.json({ authenticated: true });
  } catch {
    return c.json({ authenticated: false }, 401);
  }
});

/** Logout - clear session cookie */
app.post("/api/auth/logout", (c) => {
  const isProduction = c.req.url.includes("https://");
  setCookie(c, "kiosk_session", "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "Strict",
    maxAge: 0,
    path: "/",
  });
  return c.json({ success: true });
});

/**
 * Auth middleware for protected routes
 * Verifies JWT session cookie
 */
async function authMiddleware(c: Context<Env>, next: Next) {
  const token = getCookie(c, "kiosk_session");

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error("❌ JWT_SECRET is not configured in environment variables");
      return c.json({ error: "Server configuration error" }, 500);
    }

    const jwtMiddleware = jwt({ secret: jwtSecret, cookie: "kiosk_session", alg: "HS256" });
    await jwtMiddleware(c, next);
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
}

// --- API Endpoints ---

/** List all media files for a specific gym location */
app.get("/api/locations/:location/files", authMiddleware, async (c) => {
  const location = c.req.param("location");
  const apiKey = c.env.GOOGLE_DRIVE_API_KEY;
  const rootFolderId = c.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  if (!apiKey) {
    console.error("❌ GOOGLE_DRIVE_API_KEY not configured");
    return c.json({ error: "Server not configured - missing API key" }, 500);
  }
  if (!rootFolderId) {
    console.error("❌ GOOGLE_DRIVE_ROOT_FOLDER_ID not configured");
    return c.json(
      { error: "Server not configured - missing root folder ID" },
      500,
    );
  }

  try {
    // Helper function to list folder contents
    const listFolder = async (folderId: string) => {
      const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${apiKey}&fields=files(id,name,mimeType,size,modifiedTime)`;
      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Drive API error: ${response.status} - ${errorText}`);
      }
      const data = (await response.json()) as { files: any[] };
      return data.files || [];
    };

    // 1. List all folders in root directory
    const folders = await listFolder(rootFolderId);

    // 2. Find shared folder and location folder
    const sharedFolder = folders.find(
      (f) =>
        f.name?.toLowerCase() === "shared" &&
        f.mimeType === "application/vnd.google-apps.folder",
    );
    const locationFolder = folders.find(
      (f) =>
        f.name?.toLowerCase() === location.toLowerCase() &&
        f.mimeType === "application/vnd.google-apps.folder",
    );

    const allFiles: any[] = [];

    // 3. Get files from Shared folder
    if (sharedFolder) {
      const sharedFiles = await listFolder(sharedFolder.id);
      for (const file of sharedFiles) {
        if (
          file.mimeType?.startsWith("image/") ||
          file.mimeType?.startsWith("video/")
        ) {
          allFiles.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            size: file.size,
            modifiedTime: file.modifiedTime,
          });
        }
      }
    }

    // 4. Get files from location-specific folder
    if (locationFolder) {
      const locationFiles = await listFolder(locationFolder.id);
      for (const file of locationFiles) {
        if (
          file.mimeType?.startsWith("image/") ||
          file.mimeType?.startsWith("video/")
        ) {
          allFiles.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            size: file.size,
            modifiedTime: file.modifiedTime,
          });
        }
      }
    }

    return c.json({
      location,
      files: allFiles,
      count: allFiles.length,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`❌ Error listing location files:`, err);
    return c.json(
      { error: "Failed to list location files", details: errorMessage },
      500,
    );
  }
});

/**
 * Google Drive API proxy
 * Streams responses to prevent memory issues on large files
 */
app.all("/api/drive/*", authMiddleware, async (c) => {
  const apiKey = c.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) {
    console.error(
      "❌ GOOGLE_DRIVE_API_KEY is not configured in environment variables",
    );
    return c.json({ error: "Server not configured - missing API key" }, 500);
  }
  const reqUrl = new URL(c.req.url);

  // Entferne /api/drive/ prefix und füge API Key hinzu
  const drivePath = reqUrl.pathname.replace("/api/drive", "");

  // Konstruiere URL korrekt - prüfe ob bereits Query Parameter vorhanden sind
  let upstreamUrl: string;
  if (reqUrl.search) {
    upstreamUrl = `https://www.googleapis.com/drive/v3${drivePath}${reqUrl.search}&key=${apiKey}`;
  } else {
    upstreamUrl = `https://www.googleapis.com/drive/v3${drivePath}?key=${apiKey}`;
  }

  const headers = new Headers(c.req.header());
  headers.delete("host");
  headers.set("User-Agent", "GF-Kiosk/1.0");

  const method = c.req.method;
  const body = ["GET", "HEAD"].includes(method)
    ? undefined
    : await c.req.arrayBuffer();

  try {
    // 5 minute timeout for large file downloads
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    const resp = await fetch(upstreamUrl, {
      method,
      headers,
      body,
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Kopiere alle Headers und füge CORS hinzu
    const respHeaders = new Headers();
    resp.headers.forEach((value, key) => {
      // Entferne gzip-encoding Header, da wir bereits dekomprimiert haben
      if (key.toLowerCase() !== "content-encoding") {
        respHeaders.set(key, value);
      }
    });
    respHeaders.set("Access-Control-Allow-Origin", "*");
    respHeaders.set("Access-Control-Allow-Credentials", "true");

    // STATT arrayBuffer() zu verwenden, streamen wir die Response direkt
    // Dies verhindert Memory-Limit-Überschreitungen bei großen Dateien
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    if (err instanceof DOMException && err.name === "AbortError") {
      console.error(`⏱️ Drive API timeout (5 min exceeded)`);
      return new Response(
        JSON.stringify({
          error: "Request timeout - file too large or server too slow",
        }),
        {
          status: 504,
          headers: {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    console.error(`❌ Drive API error:`, err);
    return new Response(
      JSON.stringify({
        error: "Google Drive API fetch failed",
        details: errorMessage,
      }),
      {
        status: 502,
        headers: {
          "content-type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
});

/** Health check - returns config status */
app.get("/api/health", (c) => {
  const { isValid, missingVars } = validateEnvironment(c);

  return c.json({
    status: isValid ? "ok" : "degraded",
    service: "GF Kiosk Proxy",
    timestamp: new Date().toISOString(),
    environment: {
      configured: isValid,
      missingVariables: missingVars.length > 0 ? missingVars : undefined,
    },
  });
});

/** Test endpoint for Google Drive API connectivity */
app.get("/api/test-drive", async (c) => {
  const apiKey = c.env.GOOGLE_DRIVE_API_KEY;
  const rootFolderId = c.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  if (!apiKey) {
    console.error("❌ GOOGLE_DRIVE_API_KEY not configured");
    return c.json({ error: "GOOGLE_DRIVE_API_KEY not configured" }, 500);
  }
  if (!rootFolderId) {
    console.error("❌ GOOGLE_DRIVE_ROOT_FOLDER_ID not configured");
    return c.json({ error: "GOOGLE_DRIVE_ROOT_FOLDER_ID not configured" }, 500);
  }

  const testUrl = `https://www.googleapis.com/drive/v3/files?q='${rootFolderId}'+in+parents&key=${apiKey}`;

  try {
    const response = await fetch(testUrl);
    const data = await response.text();

    return c.json({
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: data.substring(0, 500) + (data.length > 500 ? "..." : ""),
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return c.json({
      error: errorMessage,
      testUrl,
    });
  }
});

// --- Static Assets ---

/** Serve static assets from ASSETS binding with Cache-Control headers */
app.get("*", async (c) => {
  try {
    const response = await c.env.ASSETS.fetch(c.req.raw);
    const url = new URL(c.req.url);

    // Clone response to add headers
    const headers = new Headers(response.headers);

    if (url.pathname.startsWith("/assets/")) {
      // Hashed filenames (index-CuBaN70S.js) → immutable, cache forever
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    } else if (url.pathname.endsWith(".js")) {
      // sw.js, registerSW.js, workbox-*.js → must revalidate (SW-Update-Mechanismus)
      headers.set("Cache-Control", "public, max-age=0, must-revalidate");
    } else {
      // index.html → 7 Tage frisch, 1 Jahr stale-while-revalidate
      // Cold Boot: Chromium Disk Cache servt ohne Netzwerk und ohne SW
      // stale-while-revalidate: Nach 7d wird stale serviert + im Hintergrund aktualisiert
      headers.set(
        "Cache-Control",
        "public, max-age=604800, stale-while-revalidate=31536000",
      );
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
});

export default app;
