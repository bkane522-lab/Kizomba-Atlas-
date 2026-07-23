/* =========================================================
   KIZOMBA ATLAS — Service worker
   Règle principale : l'installation ne doit JAMAIS échouer.
   Un seul fichier absent suffisait auparavant à annuler
   l'installation complète, donc les anciens caches n'étaient
   jamais supprimés et d'anciennes versions restaient servies.
   ========================================================= */

const CACHE_NAME = "kizomba-atlas-20260723-stable";

/* Fichiers réellement indispensables au démarrage. */
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./i18n.js",
  "./supabase-config.js",
  "./manifest.json",
  "./assets/logo.svg",
  "./assets/favicon-64.png",
  "./assets/icon-180.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) =>
        // Chaque fichier est mis en cache indépendamment : une absence
        // est simplement ignorée au lieu de faire échouer l'installation.
        Promise.all(
          CORE_ASSETS.map((asset) =>
            cache.add(new Request(asset, { cache: "reload" })).catch(() => null)
          )
        )
      )
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "atlas-skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }

  /* Configuration serveur : toujours frais. */
  if (url.pathname === "/api/config") {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  /* L'espace privé ne doit jamais être servi depuis le cache. */
  if (
    url.pathname === "/admin" ||
    url.pathname === "/admin/" ||
    url.pathname.endsWith("/admin.html") ||
    url.pathname.endsWith("/admin.js")
  ) {
    event.respondWith(fetch(request));
    return;
  }

  /* Base de données et géocodage : réseau prioritaire. */
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("nominatim.openstreetmap.org")
  ) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  /* Tuiles de carte : jamais interceptées, jamais mises en cache ici.
     Cela évite qu'un fournisseur en échec soit figé dans le cache. */
  if (
    url.hostname.includes("basemaps.cartocdn.com") ||
    url.hostname.includes("tile.openstreetmap.org") ||
    url.hostname.includes("arcgisonline.com")
  ) {
    return;
  }

  /* Pages et scripts : réseau prioritaire, cache en secours. */
  if (
    request.mode === "navigate" ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".html")
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok && url.origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => null);
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  /* Images et polices : cache prioritaire. */
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response && response.ok && url.origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => null);
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
