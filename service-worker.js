// Service worker minimum — cache app-shell supaya PWA boleh-pasang & buka pantas.
// Widget TradingView & data kadar SENTIASA dari rangkaian (tidak di-cache).
const CACHE = "forex-tv-v9";
const SHELL = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  "./js/pairs.js",
  "./js/widgets.js",
  "./js/sessions.js",
  "./js/calculator.js",
  "./js/alerts.js",
  "./js/checklist.js",
  "./js/journal.js",
  "./js/news.js",
  "./js/store.js",
  "./js/analytics.js",
  "./js/risk.js",
  "./js/indicators.js",
  "./js/marketdata.js",
  "./js/scoring.js",
  "./js/smc.js",
  "./js/backtest.js",
  "./js/dashboard.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Hanya layan app-shell asal-sama; selebihnya terus ke rangkaian.
  // Strategi stale-while-revalidate: serve dari cache (laju), tapi sentiasa
  // ambil versi terkini di latar & kemas kini cache supaya reload berikut auto-terkini.
  if (e.request.method === "GET" && url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then((hit) => {
        const ambil = fetch(e.request)
          .then((res) => {
            const salinan = res.clone();
            caches
              .open(CACHE)
              .then((c) => c.put(e.request, salinan))
              .catch(() => {});
            return res;
          })
          .catch(() => hit);
        return hit || ambil;
      })
    );
  }
});
