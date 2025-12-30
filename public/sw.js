/**
 * Service Worker for offline-first app shell caching
 */

// Cache busting: use timestamp so every deploy gets fresh cache
const BUILD_TIME = "__BUILD_TIME__";
const CACHE_NAME = `gf-kiosk-${BUILD_TIME}`;

// App shell files to cache
const APP_SHELL = ["/", "/index.html"];

// Install: cache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
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

  // Cache first strategy - instant offline response
  event.respondWith(
    caches.match(event.request).then((cached) => {
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
          // If server returns error (502, 503, etc), try cache first
          if (!response.ok) {
            return caches.match("/") || response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(() => {
          // Offline and not cached - return index for SPA routing
          return caches.match("/");
        });
    }),
  );
});
