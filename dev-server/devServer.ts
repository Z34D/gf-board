import app from '../worker/index';
import { LocalKV } from './localKV';

const BACKEND_PORT = Number(process.env.BACKEND_PORT || 3001); // Use different port
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT || 5000);

async function main() {
  const kv = new LocalKV();
  await kv.init();

  // Initialize KV with default auth values if not present
  const existingSecret = await kv.get('jwt_secret');
  if (!existingSecret) {
    // Generate a random JWT secret for dev
    const secret = 'dev-secret-' + Math.random().toString(36).substring(2, 15);
    await kv.put('jwt_secret', secret);
    console.log('🔐 Initialized JWT secret');
  }

  // Log PIN configuration
  const pin = process.env.KIOSK_PIN || '1234';
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
    GF_KIOSK_KV: LocalKV;
    ASSETS: { fetch: (req: Request) => Promise<Response> };
    GOOGLE_DRIVE_API_KEY: string;
    KIOSK_PIN: string;
  } = {
    GF_KIOSK_KV: kv,
    ASSETS,
    GOOGLE_DRIVE_API_KEY: 'REDACTED_GOOGLE_API_KEY',
    KIOSK_PIN: process.env.KIOSK_PIN || '1234'
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