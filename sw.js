const CACHE = "kizomba-atlas-map-fixed-20260718-2245";
const ASSETS = [
  "./", "./index.html", "./contact.html", "./style.css", "./app.js", "./contact.js",
  "./i18n.js", "./supabase-config.js", "./manifest.json", "./assets/logo.svg",
  "./assets/icon-192.png", "./assets/icon-512.png"
];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then(response => {
    const clone = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, clone));
    return response;
  }).catch(() => caches.match(event.request)));
});

// Emergency stable build: removes all previous caches on activation.
