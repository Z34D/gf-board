import app from "../worker/index";

const BACKEND_PORT = Number(process.env.BACKEND_PORT || 3001);
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT || 5000);
const RANDOM_ERROR_RATE = Number(process.env.RANDOM_ERROR_RATE || 0); // 0-100, percentage chance of error
const SIMULATE_502 =
  process.env.SIMULATE_502 === "true" || Bun.argv.includes("--502"); // Simulate Cloudflare 502 for all pages

async function main() {
  const jwtSecret =
    process.env.JWT_SECRET ||
    "REDACTED_JWT_SECRET";
  const pin = process.env.KIOSK_PIN || "1234";
  const apiKey =
    process.env.GOOGLE_DRIVE_API_KEY ||
    "REDACTED_GOOGLE_API_KEY";
  const rootFolderId =
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ||
    "REDACTED_FOLDER_ID";

  console.log(`🔐 Using JWT_SECRET: ${jwtSecret.substring(0, 10)}...`);
  console.log(`🔑 Using PIN: ${pin}`);
  console.log(`📁 Using Root Folder ID: ${rootFolderId}`);
  if (RANDOM_ERROR_RATE > 0) {
    console.log(`🎲 Random errors enabled: ${RANDOM_ERROR_RATE}% chance`);
  }
  if (SIMULATE_502) {
    console.log(`🔴 502 simulation enabled - all page requests return 502`);
  }
  if (!apiKey) {
    console.warn("⚠️  GOOGLE_DRIVE_API_KEY not set in environment");
  }

  // Einfacher Fetcher, der statische Anfragen zur Vite-Dev-Server weiterleitet
  const ASSETS = {
    async fetch(input: RequestInfo, init?: RequestInit) {
      const req =
        typeof input === "string"
          ? new Request(input, init)
          : (input as Request);
      const url = new URL(req.url);
      const target = `http://localhost:${FRONTEND_PORT}${url.pathname}${url.search}`;
      return fetch(target, {
        method: req.method,
        headers: req.headers,
        body: req.body ? req.body : undefined,
      });
    },
  };

  const env: {
    ASSETS: { fetch: (req: Request) => Promise<Response> };
    GOOGLE_DRIVE_API_KEY: string;
    GOOGLE_DRIVE_ROOT_FOLDER_ID: string;
    KIOSK_PIN: string;
    JWT_SECRET: string;
  } = {
    ASSETS,
    GOOGLE_DRIVE_API_KEY: apiKey || "",
    GOOGLE_DRIVE_ROOT_FOLDER_ID: rootFolderId,
    KIOSK_PIN: pin,
    JWT_SECRET: jwtSecret,
  };

  const server = Bun.serve({
    port: BACKEND_PORT,
    fetch: (req: Request) => {
      const url = new URL(req.url);

      // Simulate Cloudflare 502 for page requests (not API)
      if (SIMULATE_502 && !url.pathname.startsWith("/api/")) {
        return new Response(
          `<!DOCTYPE html>
          <html>
          <head><title>502 Bad Gateway</title></head>
          <body>
            <h1>502 Bad Gateway</h1>
            <p>cloudflare - Web server is down</p>
          </body>
          </html>`,
          { status: 502, headers: { "Content-Type": "text/html" } },
        );
      }

      // Random error simulation for testing
      if (RANDOM_ERROR_RATE > 0 && Math.random() * 100 < RANDOM_ERROR_RATE) {
        const url = new URL(req.url);
        // Only affect API routes, not static assets
        if (url.pathname.startsWith("/api/")) {
          const errorType = Math.random();
          if (errorType < 0.33) {
            console.log(`🎲 Simulated 500 error: ${url.pathname}`);
            return new Response("Simulated server error", { status: 500 });
          } else if (errorType < 0.66) {
            console.log(`🎲 Simulated 503 error: ${url.pathname}`);
            return new Response("Simulated service unavailable", {
              status: 503,
            });
          } else {
            console.log(`🎲 Simulated timeout: ${url.pathname}`);
            // Simulate a very slow response (will likely trigger client timeout)
            return new Promise((resolve) => {
              setTimeout(
                () => {
                  resolve(
                    new Response("Simulated slow response", { status: 200 }),
                  );
                },
                15 * 60 * 1000,
              ); // 15 minutes
            });
          }
        }
      }
      return app.fetch(req, env);
    },
  });

  console.log(`Hono Dev-Backend läuft auf http://localhost:${server.port}`);

  // Graceful shutdown handler
  process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down gracefully...");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n🛑 Shutting down gracefully...");
    process.exit(0);
  });
}

main();
