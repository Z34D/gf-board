import { Hono } from "hono";
import type { Context, Next } from "hono";
import { cors } from "hono/cors";
import { jwt, sign } from "hono/jwt";
import { getCookie, setCookie } from "hono/cookie";

type Env = {
  Bindings: {
    GOOGLE_DRIVE_API_KEY: string;
    GOOGLE_DRIVE_ROOT_FOLDER_ID: string;
    KIOSK_PIN: string;
    JWT_SECRET: string;
  };
};

const app = new Hono<Env>();

// --- Rate Limiting ---

const loginAttempts = new Map<string, { count: number; resetTime: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

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
    return c.json({ error: `Too many attempts. Retry in ${waitSeconds}s.` }, 429);
  }

  await next();
}

// --- CORS ---

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    maxAge: 86400,
  }),
);

// --- Authentication ---

app.post("/api/auth/login", rateLimitLoginMiddleware, async (c) => {
  const clientIp =
    c.req.header("x-forwarded-for") ||
    c.req.header("cf-connecting-ip") ||
    "unknown";
  const now = Date.now();

  try {
    const { pin } = await c.req.json();
    const storedPin = c.env.KIOSK_PIN;

    if (!storedPin) {
      return c.json({ error: "Server configuration error - PIN not set" }, 500);
    }

    if (pin !== storedPin) {
      const attempt = loginAttempts.get(clientIp) || {
        count: 0,
        resetTime: now + LOGIN_WINDOW_MS,
      };
      attempt.count++;
      attempt.resetTime = now + LOGIN_WINDOW_MS;
      loginAttempts.set(clientIp, attempt);

      return c.json({ error: "Invalid PIN" }, 401);
    }

    loginAttempts.delete(clientIp);

    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) {
      return c.json({ error: "Server configuration error - JWT_SECRET not set" }, 500);
    }

    const payload = {
      authenticated: true,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 10,
    };

    const token = await sign(payload, jwtSecret);

    setCookie(c, "kiosk_session", token, {
      httpOnly: true,
      secure: c.req.url.includes("https://"),
      sameSite: "Strict",
      maxAge: 60 * 60 * 24 * 400,
      path: "/",
    });

    return c.json({ success: true });
  } catch (err) {
    console.error("Login error:", err);
    return c.json({ error: "Login failed" }, 500);
  }
});

app.get("/api/auth/check", async (c) => {
  const token = getCookie(c, "kiosk_session");
  if (!token) {
    return c.json({ authenticated: false }, 401);
  }

  try {
    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) return c.json({ authenticated: false }, 500);

    const jwtMiddleware = jwt({ secret: jwtSecret, cookie: "kiosk_session", alg: "HS256" });
    await jwtMiddleware(c, async () => {});

    return c.json({ authenticated: true });
  } catch {
    return c.json({ authenticated: false }, 401);
  }
});

app.post("/api/auth/logout", (c) => {
  setCookie(c, "kiosk_session", "", {
    httpOnly: true,
    secure: c.req.url.includes("https://"),
    sameSite: "Strict",
    maxAge: 0,
    path: "/",
  });
  return c.json({ success: true });
});

// --- Auth Middleware ---

async function authMiddleware(c: Context<Env>, next: Next) {
  const token = getCookie(c, "kiosk_session");
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) return c.json({ error: "Server configuration error" }, 500);

    const jwtMiddleware = jwt({ secret: jwtSecret, cookie: "kiosk_session", alg: "HS256" });
    await jwtMiddleware(c, next);
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
}

// --- API Endpoints ---

app.get("/api/locations/:location/files", authMiddleware, async (c) => {
  const location = c.req.param("location");
  const apiKey = c.env.GOOGLE_DRIVE_API_KEY;
  const rootFolderId = c.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  if (!apiKey || !rootFolderId) {
    return c.json({ error: "Server not configured" }, 500);
  }

  try {
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

    const folders = await listFolder(rootFolderId);

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
    const isMedia = (f: any) =>
      f.mimeType?.startsWith("image/") || f.mimeType?.startsWith("video/");
    const toFile = (f: any) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      modifiedTime: f.modifiedTime,
    });

    if (sharedFolder) {
      const files = await listFolder(sharedFolder.id);
      allFiles.push(...files.filter(isMedia).map(toFile));
    }

    if (locationFolder) {
      const files = await listFolder(locationFolder.id);
      allFiles.push(...files.filter(isMedia).map(toFile));
    }

    return c.json({ location, files: allFiles, count: allFiles.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Error listing location files:", msg);
    return c.json({ error: "Failed to list location files", details: msg }, 500);
  }
});

app.all("/api/drive/*", authMiddleware, async (c) => {
  const apiKey = c.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) {
    return c.json({ error: "Server not configured - missing API key" }, 500);
  }

  const reqUrl = new URL(c.req.url);
  const drivePath = reqUrl.pathname.replace("/api/drive", "");
  const upstreamUrl = reqUrl.search
    ? `https://www.googleapis.com/drive/v3${drivePath}${reqUrl.search}&key=${apiKey}`
    : `https://www.googleapis.com/drive/v3${drivePath}?key=${apiKey}`;

  const headers = new Headers(c.req.header());
  headers.delete("host");
  headers.set("User-Agent", "GF-Kiosk/1.0");

  const method = c.req.method;
  const body = ["GET", "HEAD"].includes(method) ? undefined : await c.req.arrayBuffer();

  try {
    const resp = await fetch(upstreamUrl, {
      method,
      headers,
      body,
      redirect: "follow",
      signal: AbortSignal.timeout(5 * 60 * 1000),
    });

    const respHeaders = new Headers();
    resp.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "content-encoding") {
        respHeaders.set(key, value);
      }
    });
    respHeaders.set("Access-Control-Allow-Origin", "*");

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return c.json({ error: "Request timeout" }, 504);
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Drive API error:", msg);
    return c.json({ error: "Google Drive API fetch failed", details: msg }, 502);
  }
});

app.get("/api/health", (c) => {
  const missing: string[] = [];
  if (!c.env.GOOGLE_DRIVE_API_KEY) missing.push("GOOGLE_DRIVE_API_KEY");
  if (!c.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) missing.push("GOOGLE_DRIVE_ROOT_FOLDER_ID");
  if (!c.env.KIOSK_PIN) missing.push("KIOSK_PIN");
  if (!c.env.JWT_SECRET) missing.push("JWT_SECRET");

  return c.json({
    status: missing.length === 0 ? "ok" : "degraded",
    service: "GF Kiosk API",
    timestamp: new Date().toISOString(),
    missingVars: missing.length > 0 ? missing : undefined,
  });
});

export default app;
