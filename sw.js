const CACHE_NAME = "kizomba-atlas-restore-map-20260722-3";

const APP_SHELL = [
  "./",
  "./index.html",

  "./style.css?v=restore-map-20260722-3",
  "./app.js?v=restore-map-20260722-3",
  "./i18n.js?v=restore-map-20260722-3",
  "./supabase-config.js?v=restore-map-20260722-3",

  "./organizer.html",
  "./organizer.js",

  "./admin.html",
  "./admin.js",

  "./contact.html",
  "./contact.js",
  "./contact-config.js",

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
      .then((cache) => {
        return Promise.all(
          APP_SHELL.map((url) => {
            return cache.add(url).catch((error) => {
              console.warn(
                "Kizomba Atlas cache skipped:",
                url,
                error
              );

              return null;
            });
          })
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return cacheName !== CACHE_NAME;
            })
            .map((cacheName) => {
              return caches.delete(cacheName);
            })
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
          if (
            response &&
            response.status === 200
          ) {
            const responseCopy = response.clone();

            caches
              .open(CACHE_NAME)
              .then((cache) => {
                cache.put(request, responseCopy);
              });
          }

          return response;
        })
        .catch(async () => {
          const cachedResponse =
            await caches.match(request);

          if (cachedResponse) {
            return cachedResponse;
          }

          if (request.mode === "navigate") {
            return caches.match("./index.html");
          }

          throw new Error(
            "Kizomba Atlas resource unavailable"
          );
        })
    );

    return;
  }

  const isLiveOnlineResource =
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("openstreetmap.org") ||
    url.hostname.includes("nominatim.openstreetmap.org");

  if (isLiveOnlineResource) {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(request);
      })
    );

    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        if (
          !response ||
          response.status !== 200
        ) {
          return response;
        }

        const responseCopy = response.clone();

        caches
          .open(CACHE_NAME)
          .then((cache) => {
            cache.put(request, responseCopy);
          });

        return response;
      });
    })
  );
});
