import app from '../worker/index';

const BACKEND_PORT = Number(process.env.BACKEND_PORT || 3001); // Use different port
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT || 5000);

async function main() {
  const jwtSecret = process.env.JWT_SECRET || 'REDACTED_JWT_SECRET';
  const pin = process.env.KIOSK_PIN || '1234';

  console.log(`🔐 Using JWT_SECRET: ${jwtSecret.substring(0, 10)}...`);
  console.log(`🔑 Using PIN: ${pin}`);

  // Einfacher Fetcher, der statische Anfragen zur Vite-Dev-Server weiterleitet
  const ASSETS = {
    async fetch(input: RequestInfo, init?: RequestInit) {
      const req = typeof input === 'string' ? new Request(input, init) : input as Request;
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
    KIOSK_PIN: string;
    JWT_SECRET: string;
  } = {
    ASSETS,
    GOOGLE_DRIVE_API_KEY: 'REDACTED_GOOGLE_API_KEY',
    KIOSK_PIN: pin,
    JWT_SECRET: jwtSecret
  };

  const server = Bun.serve({
    port: BACKEND_PORT,
    fetch: (req: Request) => app.fetch(req, env),
  });

  console.log(`Hono Dev-Backend läuft auf http://localhost:${server.port}`);
  
  // Graceful shutdown handler
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down gracefully...');
    process.exit(0);
  });
}

main();