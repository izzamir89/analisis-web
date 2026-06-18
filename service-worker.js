// Service worker minimum — cache app-shell supaya PWA boleh-pasang & buka pantas.
// Widget TradingView & data kadar SENTIASA dari rangkaian (tidak di-cache).
const CACHE = "forex-tv-v1";
const SHELL = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  "./js/pairs.js",
  "./js/widgets.js",
  "./js/calculator.js",
  "./js/alerts.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Hanya layan app-shell asal-sama dari cache; selebihnya terus ke rangkaian.
  if (e.request.method === "GET" && url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then((hit) =>
        hit || fetch(e.request).then((res) => {
          const salinan = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, salinan)).catch(() => {});
          return res;
        }).catch(() => hit)
      )
    );
  }
});
