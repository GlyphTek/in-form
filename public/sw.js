/* IN-FORM service worker.
 *
 * Its only job is to let the app open from the home screen when the network is
 * slow or gone. It keeps a copy of the app's own files (page, script, styles,
 * fonts, icons), NEVER anything from /api/, so it can never show old news or
 * old results: items always come live from the server, and when they cannot,
 * the app says so itself.
 *
 * Files are fetched network-first, so an update to the app shows up as soon as
 * you are online; the saved copy is only the fallback.
 */

const CACHE = "in-form-shell-v1";
const WAIT_MS = 4000; // on a poor connection, give up on the network after this and use the saved copy

const SHELL = [
  "/",
  "/style.css",
  "/app.js",
  "/manifest.webmanifest",
  "/fonts/michroma-latin-400-normal.woff2",
  "/fonts/michroma-latin-ext-400-normal.woff2",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await withTimeout(fetch(request), WAIT_MS);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const saved = await cache.match(request, { ignoreSearch: true });
    if (saved) return saved;
    if (request.mode === "navigate") {
      const home = await cache.match("/");
      if (home) return home;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // only the app's own files
  if (url.pathname.startsWith("/api/")) return; // live data: always the network, never saved
  event.respondWith(networkFirst(request));
});
