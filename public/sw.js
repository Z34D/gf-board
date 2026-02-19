/**
 * Service Worker for offline-first app shell caching
 *
 * Pre-caches ALL build assets (JS chunks, CSS) at install time
 * so the app works fully offline - including code-split routes.
 */

// Cache busting: replaced at build time
const BUILD_TIME = "__BUILD_TIME__";
const CACHE_NAME = `gf-kiosk-${BUILD_TIME}`;

// App shell + all build assets (injected at build time)
const APP_SHELL = ["/", "/index.html"];
const BUILD_ASSETS = __BUILD_ASSETS__;

// Install: cache app shell AND all JS/CSS chunks
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([...APP_SHELL, ...BUILD_ASSETS])),
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      const oldCaches = keys.filter((key) => key !== CACHE_NAME);
      return Promise.all(oldCaches.map((key) => caches.delete(key)));
    }),
  );
  self.clients.claim();
});

// Check if request is for a static asset (JS, CSS, images)
function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".woff") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico")
  );
}

// Fetch: cache first for app files, network for API
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip API requests - let them fail if offline
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Skip WebSocket/HMR in dev
  if (url.protocol === "ws:" || url.protocol === "wss:") {
    return;
  }

  // Static assets: Network first with timeout + cache fallback
  // This ensures fresh assets after deploy, but works offline or on slow networks
  if (isStaticAsset(url)) {
    event.respondWith(
      Promise.race([
        // Try network with 3 second timeout
        fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        }),
        // Timeout after 3 seconds
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 3000),
        ),
      ]).catch(() => {
        // Network failed or timeout - try cache
        return caches.match(event.request);
      }),
    );
    return;
  }

  // HTML/navigation: Cache first with background update
  event.respondWith(
    caches
      .match(event.request)
      .then((cached) => {
        if (cached) {
          // Return cache immediately, update in background
          fetch(event.request)
            .then((response) => {
              // Only cache successful responses (not error pages)
              if (response.ok) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, response);
                });
              }
            })
            .catch(() => {});
          return cached;
        }

        // Not in cache - fetch and cache
        return fetch(event.request)
          .then((response) => {
            // If server returns error (502, 503, etc), try SPA fallback
            if (!response.ok) {
              return caches.match("/").then((r) => r || response);
            }
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
            return response;
          })
          .catch(() => {
            // Offline and not cached - return index for SPA routing
            return caches.match("/").then((r) => r || new Response("Offline", { status: 503 }));
          });
      })
      .catch(() => {
        // Cache API error - try SPA fallback
        return caches.match("/").then((r) => r || new Response("Offline", { status: 503 }));
      }),
  );
});
