/* sw.js — app-shell caching for offline use.
   Registered only on secure contexts (https/localhost), i.e. exactly where
   GitHub Pages and Vercel serve the app. */

const CACHE = "quiz-practice-v1";

const APP_SHELL = [
  "./",
  "index.html",
  "css/styles.css",
  "js/main.js",
  "js/ui.js",
  "js/dom.js",
  "js/state.js",
  "js/model.js",
  "js/storage.js",
  "js/session.js",
  "js/utils.js",
  "js/pwa.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  "samples/quiz-sample.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn("SW install cache failed:", err))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Let cross-origin requests (e.g. remote question images) go straight to the network.
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, fall back to the cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("index.html")));
    return;
  }

  // JSON (question banks) can be large — network first, cache as fallback only.
  if (url.pathname.endsWith(".json")) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  // Static assets: cache first, then network (and remember it).
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
    )
  );
});
