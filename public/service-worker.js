/**
 * service-worker.js
 * ------------------
 * Workbox-based offline cache. This is what makes the "100% Offline /
 * Zero cloud dependency after install" claim in the deck true: once the
 * app shell + model files are cached on first visit, everything after
 * runs without a network request.
 *
 * Register this in your app entry point with:
 *   if ('serviceWorker' in navigator) {
 *     navigator.serviceWorker.register('/service-worker.js');
 *   }
 */

importScripts(
  "https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js"
);

const { precaching, routing, strategies, expiration } = workbox;

// 1. App shell (HTML/JS/CSS) -- cache-first, instant load offline.
precaching.precacheAndRoute([
  { url: "/index.html", revision: "1" },
  { url: "/manifest.json", revision: "1" },
  // Build tooling (e.g. Workbox Webpack/Vite plugin) should inject the
  // hashed bundle filenames here automatically at build time.
]);

// 2. Model weights (model.json + .bin shards) -- large, rarely change,
//    so cache-first with no expiry once downloaded.
routing.registerRoute(
  ({ url }) => url.pathname.startsWith("/model/"),
  new strategies.CacheFirst({
    cacheName: "cropguard-model-v1",
    plugins: [
      new expiration.ExpirationPlugin({
        maxEntries: 30,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// 3. Static ICAR treatment database (JSON) -- cache-first.
routing.registerRoute(
  ({ url }) => url.pathname.endsWith("treatments.json"),
  new strategies.CacheFirst({ cacheName: "cropguard-data-v1" })
);

// 4. Everything else (icons, fonts) -- stale-while-revalidate so the app
//    still updates gracefully on the rare occasions it does have signal.
routing.registerRoute(
  ({ request }) => ["style", "script", "image", "font"].includes(request.destination),
  new strategies.StaleWhileRevalidate({ cacheName: "cropguard-assets-v1" })
);
