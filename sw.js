const CACHE_NAME = "kizomba-atlas-fix-supabase-20260722-1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./organizer.html",
  "./admin.html",

  "./style.css?v=fix-supabase-20260722-1",
  "./app.js?v=fix-supabase-20260722-1",
  "./i18n.js?v=fix-supabase-20260722-1",
  "./supabase-config.js?v=fix-supabase-20260722-1",

  "./organizer.js",
  "./admin.js",

  "./manifest.json",

  "./assets/logo.svg",
  "./assets/logo-lockup.svg",
  "./assets/favicon-64.png",
  "./assets/icon-180.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  const isApplicationFile =
    request.mode === "navigate" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js");

  if (isApplicationFile) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseCopy = response.clone();

          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, responseCopy));

          return response;
        })
        .catch(() => caches.match(request))
    );

    return;
  }

  const isOnlineData =
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("openstreetmap.org") ||
    url.hostname.includes("nominatim.openstreetmap.org");

  if (isOnlineData) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );

    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        const responseCopy = response.clone();

        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(request, responseCopy));

        return response;
      });
    })
  );
});
