(() => {
  "use strict";

  const t = (key, replacements) => {
    if (window.KizombaAtlasLanguage && typeof window.KizombaAtlasLanguage.t === "function") {
      return window.KizombaAtlasLanguage.t(key, replacements);
    }
    return key;
  };

  const currentLanguage = () =>
    (window.KizombaAtlasLanguage && window.KizombaAtlasLanguage.current) || "fr";

  const state = {
    events: [],
    news: [],
    filteredEvents: [],
    category: "all",
    dateFilter: "all",
    search: "",
    selectedEvent: null,
    favorites: new Set(readStoredFavorites()),
    map: null,
    markerLayer: null,
    userMarker: null,
    deferredInstallPrompt: null,
    supabase: null,
    tileLayer: null,
    tileIndex: 0,
    tileWatchdog: null,
    mapReady: false,
    mapTheme: readStoredMapTheme()
  };

  /* =========================================================
     Fournisseurs de tuiles
     Ordre demandé : CARTO en premier, OpenStreetMap puis Esri
     en secours si le premier fournisseur ne répond pas.
     ========================================================= */
  const TILE_PROVIDERS = {
    light: [
      {
        id: "carto-light",
        url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        options: { subdomains: "abcd", maxZoom: 20, attribution: "© OpenStreetMap · © CARTO" }
      },
      {
        id: "osm",
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        options: { maxZoom: 19, attribution: "© OpenStreetMap" }
      },
      {
        id: "esri-street",
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
        options: { maxZoom: 19, attribution: "© Esri" }
      }
    ],
    dark: [
      {
        id: "carto-dark",
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        options: { subdomains: "abcd", maxZoom: 20, attribution: "© OpenStreetMap · © CARTO" }
      },
      {
        id: "esri-dark",
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        options: { maxZoom: 16, attribution: "© Esri" }
      },
      {
        id: "osm",
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        options: { maxZoom: 19, attribution: "© OpenStreetMap" }
      }
    ]
  };

  const LEAFLET_SOURCES = [
    {
      css: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css",
      js: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"
    },
    {
      css: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css",
      js: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"
    }
  ];

  const CLUSTER_SOURCES = [
    {
      css: "https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/MarkerCluster.css",
      cssDefault: "https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css",
      js: "https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"
    }
  ];

  const demoEvents = [
    {
      id: "pkc-2026-hilton-cdg",
      title_fr: "Paris Kizomba Congress 2026 — PKC",
      title_en: "Paris Kizomba Congress 2026 — PKC",
      description_fr: "Événement international dédié à la Kizomba, au Semba, à la Tarraxinha et aux danses africaines. Ce point correspond au festival principal organisé au Hilton Paris Charles de Gaulle Airport.",
      description_en: "An international event dedicated to Kizomba, Semba, Tarraxinha and African dances. This pin marks the main festival venue at Hilton Paris Charles de Gaulle Airport.",
      category: "festival",
      styles: ["kizomba", "urban-kiz", "semba"],
      map_style: "kizomba",
      logo_url: "",
      starts_at: "2026-11-20T20:00:00+01:00",
      ends_at: "2026-11-23T07:00:00+01:00",
      venue_name: "Hilton Paris Charles de Gaulle Airport",
      address: "8 Rue de Rome, 93290 Tremblay-en-France",
      city: "Tremblay-en-France",
      country: "France",
      latitude: 49.010263,
      longitude: 2.557379,
      organizer_name: "Paris Kizomba Congress",
      price_text_fr: "Voir la billetterie officielle",
      price_text_en: "See official ticketing",
      ticket_url: "https://my.weezevent.com/paris-kizomba-congress-2026",
      image_url: "",
      status: "published"
    },
    {
      id: "dance-affinity-2026-freiburg",
      title_fr: "Dance Affinity Festival 2026",
      title_en: "Dance Affinity Festival 2026",
      description_fr: "Festival à Fribourg-en-Brisgau réunissant Kizomba et Bachata. Le programme annoncé comprend des bootcamps immersifs, des workshops, des soirées et des socials.",
      description_en: "A festival in Freiburg im Breisgau bringing together Kizomba and Bachata. The announced programme includes immersive bootcamps, workshops, parties and socials.",
      category: "festival",
      styles: ["kizomba", "bachata", "sbk"],
      map_style: "sbk",
      logo_url: "",
      starts_at: "2026-10-30T20:00:00+01:00",
      ends_at: "2026-11-02T04:00:00+01:00",
      venue_name: "M.A.K Studio",
      address: "Kaiser-Joseph-Straße 268, 79098 Freiburg im Breisgau",
      city: "Freiburg im Breisgau",
      country: "Allemagne",
      latitude: 47.991997,
      longitude: 7.848298,
      organizer_name: "Dance Affinity Festival",
      price_text_fr: "Voir la billetterie officielle",
      price_text_en: "See official ticketing",
      ticket_url: "https://my.weezevent.com/dance-affinity-2026",
      image_url: "",
      status: "published"
    }
  ];

  const demoNews = [
    {
      id: "demo-news-1",
      text_fr: "Nouveau sur la carte : Paris Kizomba Congress 2026 au Hilton Paris Charles de Gaulle.",
      text_en: "New on the map: Paris Kizomba Congress 2026 at Hilton Paris Charles de Gaulle.",
      type: "new",
      priority: 20,
      active: true
    },
    {
      id: "dance-affinity-news-2026",
      text_fr: "Nouveau sur la carte : Dance Affinity Festival, du 30 octobre au 2 novembre 2026 à Fribourg-en-Brisgau.",
      text_en: "New on the map: Dance Affinity Festival, from 30 October to 2 November 2026 in Freiburg im Breisgau.",
      type: "new",
      priority: 19,
      active: true
    },
    {
      id: "demo-news-2",
      text_fr: "Les annonces publiées dans l’espace privé apparaissent ici instantanément.",
      text_en: "Updates published in the private dashboard appear here instantly.",
      type: "info",
      priority: 10,
      active: true
    }
  ];

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* =========================================================
     Démarrage
     Chaque étape est isolée : une étape en échec ne peut plus
     bloquer toutes les suivantes.
     ========================================================= */
  async function init() {
    window.scrollTo(0, 0);
    document.body.dataset.activeView = "mapView";

    safely(bindUI, "bindUI");
    safely(setupWelcomeScreen, "setupWelcomeScreen");
    safely(initInstallPrompt, "initInstallPrompt");
    safely(bindViewportEvents, "bindViewportEvents");

    // Contenu immédiat : le bandeau ne reste jamais sur « Chargement ».
    state.events = [...demoEvents];
    state.news = [...demoNews];
    safely(() => applyFilters(false), "applyFilters");
    safely(renderTicker, "renderTicker");

    // La carte est initialisée après l'affichage du contenu.
    try {
      const ready = await ensureLeaflet();
      if (ready) {
        initMap();
        state.mapReady = true;
        renderMarkers();
        fitVisibleEvents();
      } else {
        showMapStatus("Carte momentanément indisponible");
      }
    } catch (error) {
      console.error("Kizomba Atlas carte :", error);
      showMapStatus("Carte momentanément indisponible");
    }

    const backendConfigPromise = typeof window.loadKizombaAtlasConfig === "function"
      ? window.loadKizombaAtlasConfig()
      : Promise.resolve(window.KIZOMBA_ATLAS_CONFIG);

    try {
      await backendConfigPromise;
    } catch (error) {
      console.warn("Kizomba Atlas configuration :", error);
    }

    if (typeof window.isSupabaseConfigured === "function" && window.isSupabaseConfigured()) {
      try {
        state.supabase = window.supabase.createClient(
          window.KIZOMBA_ATLAS_CONFIG.SUPABASE_URL,
          window.KIZOMBA_ATLAS_CONFIG.SUPABASE_ANON_KEY
        );

        const loaded = await loadEvents();
        if (loaded) {
          state.news = buildEventNews(state.events);
          applyFilters(true);
          renderTicker();
          subscribeRealtime();
        }
      } catch (error) {
        console.error("Kizomba Atlas backend :", error);
        useDemoFallback();
      }
    }

    safely(registerServiceWorker, "registerServiceWorker");
  }

  function safely(action, label) {
    try {
      return action();
    } catch (error) {
      console.error(`Kizomba Atlas (${label}) :`, error);
      return null;
    }
  }

  /* =========================================================
     Chargement sécurisé de Leaflet
     ========================================================= */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.crossOrigin = "anonymous";
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error(src));
      document.head.appendChild(script);
    });
  }

  function loadStylesheet(href) {
    return new Promise((resolve) => {
      const existing = document.querySelector(`link[href="${href}"]`);
      if (existing) {
        resolve(true);
        return;
      }
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.crossOrigin = "anonymous";
      link.onload = () => resolve(true);
      link.onerror = () => resolve(false);
      document.head.appendChild(link);
    });
  }

  async function ensureLeaflet() {
    if (window.L && typeof window.L.map === "function") {
      await ensureCluster();
      return true;
    }

    for (const source of LEAFLET_SOURCES) {
      try {
        await loadStylesheet(source.css);
        await loadScript(source.js);
        if (window.L && typeof window.L.map === "function") break;
      } catch (error) {
        console.warn("Kizomba Atlas — source de carte indisponible :", error.message);
      }
    }

    if (!window.L || typeof window.L.map !== "function") return false;

    await ensureCluster();
    return true;
  }

  async function ensureCluster() {
    if (!window.L) return;
    if (typeof window.L.markerClusterGroup === "function") return;

    for (const source of CLUSTER_SOURCES) {
      try {
        await loadStylesheet(source.css);
        await loadStylesheet(source.cssDefault);
        await loadScript(source.js);
        if (typeof window.L.markerClusterGroup === "function") return;
      } catch (error) {
        console.warn("Kizomba Atlas — regroupement de marqueurs indisponible.");
      }
    }
  }

  function useDemoFallback() {
    const config = window.KIZOMBA_ATLAS_CONFIG || {};
    if (config.DEMO_FALLBACK === false) {
      state.events = [];
      state.news = buildEventNews([]);
    } else {
      state.events = [...demoEvents];
      state.news = [...demoNews];
    }
    applyFilters(true);
    renderTicker();
  }

  function bindUI() {
    document.querySelectorAll(".language-button").forEach((button) => {
      button.addEventListener("click", () => {
        if (window.KizombaAtlasLanguage) window.KizombaAtlasLanguage.toggle();
      });
    });

    window.addEventListener("kizomba-atlas:languagechange", () => {
      applyFilters(false);
      renderTicker();
      updateMapThemeControl();
      if (state.selectedEvent) openEventSheet(state.selectedEvent);
    });

    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
      searchInput.addEventListener("input", (event) => {
        state.search = event.target.value.trim().toLowerCase();
        applyFilters(true);
      });
    }

    document.querySelectorAll("#categoryFilters .filter-chip").forEach((button) => {
      button.addEventListener("click", () => {
        document
          .querySelectorAll("#categoryFilters .filter-chip")
          .forEach((item) => item.classList.remove("is-active"));
        button.classList.add("is-active");
        state.category = button.dataset.category;
        applyFilters(true);
      });
    });

    document.querySelectorAll("#dateFilters .date-filter").forEach((button) => {
      button.addEventListener("click", () => {
        document
          .querySelectorAll("#dateFilters .date-filter")
          .forEach((item) => item.classList.remove("is-active"));
        button.classList.add("is-active");
        state.dateFilter = button.dataset.dateFilter;
        applyFilters(true);
      });
    });

    document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.view, button));
    });

    on("locateButton", "click", locateUser);
    on("mapThemeButton", "click", cycleMapTheme);
    on("recenterButton", "click", fitVisibleEvents);
    on("closeSheetButton", "click", closeEventSheet);
    on("eventSheetBackdrop", "click", closeEventSheet);
  }

  function on(id, eventName, handler) {
    const element = document.getElementById(id);
    if (element) element.addEventListener(eventName, handler);
  }

  function bindViewportEvents() {
    const refresh = () => {
      if (!state.map) return;
      window.setTimeout(() => state.map.invalidateSize(), 120);
    };

    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);
    window.addEventListener("pageshow", refresh);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refresh();
    });
  }

  function setupWelcomeScreen() {
    const screen = document.getElementById("welcomeScreen");
    const button = document.getElementById("openMapButton");
    if (!screen || !button) return;

    let seen = false;
    try {
      seen =
        localStorage.getItem("kizomba-atlas-welcome-seen-premium-gold-v4") === "1" ||
        localStorage.getItem("kizomba-atlas-welcome-seen") === "1";
    } catch (error) {
      seen = false;
    }

    if (seen) {
      screen.hidden = true;
      document.documentElement.classList.add("atlas-welcome-seen");
      return;
    }

    button.addEventListener("click", () => {
      try {
        localStorage.setItem("kizomba-atlas-welcome-seen-premium-gold-v4", "1");
        localStorage.setItem("kizomba-atlas-welcome-seen", "1");
      } catch (error) {
        /* stockage indisponible */
      }

      screen.classList.add("is-closing");
      window.setTimeout(() => {
        screen.hidden = true;
        document.documentElement.classList.add("atlas-welcome-seen");
        if (state.map) state.map.invalidateSize();
        fitVisibleEvents();
      }, 380);
    });
  }

  function initMap() {
    const config = window.KIZOMBA_ATLAS_CONFIG || {};
    const center = config.DEFAULT_MAP_CENTER || [48.25, 3.05];
    const zoom = config.DEFAULT_MAP_ZOOM || 5.35;

    const container = document.getElementById("map");
    if (!container) throw new Error("Conteneur de carte introuvable");

    state.map = L.map("map", {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true
    }).setView(center, zoom);

    if (state.map.attributionControl) {
      state.map.attributionControl.setPrefix(false);
    }

    applyMapTheme(state.mapTheme, false);

    const systemTheme = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    if (systemTheme && typeof systemTheme.addEventListener === "function") {
      systemTheme.addEventListener("change", () => {
        if (state.mapTheme === "auto") applyMapTheme("auto", false);
      });
    }

    state.markerLayer = typeof L.markerClusterGroup === "function"
      ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 46 })
      : L.layerGroup();

    state.map.addLayer(state.markerLayer);

    // La carte est calée dès que la mise en page est stabilisée.
    window.requestAnimationFrame(() => state.map.invalidateSize());
    window.setTimeout(() => state.map.invalidateSize(), 300);
    window.setTimeout(() => state.map.invalidateSize(), 900);
  }

  /* =========================================================
     Tuiles et carte de secours
     ========================================================= */
  function tileChain() {
    return state.mapTheme === "light" ? TILE_PROVIDERS.light : TILE_PROVIDERS.dark;
  }

  function mountTileProvider(index) {
    if (!state.map) return;

    const chain = tileChain();
    const provider = chain[Math.min(index, chain.length - 1)];
    if (!provider) return;

    state.tileIndex = index;

    if (state.tileLayer) {
      state.map.removeLayer(state.tileLayer);
      state.tileLayer = null;
    }

    window.clearTimeout(state.tileWatchdog);

    let loadedOnce = false;
    let errorCount = 0;

    const layer = L.tileLayer(provider.url, provider.options);

    layer.on("load", () => {
      loadedOnce = true;
      window.clearTimeout(state.tileWatchdog);
    });

    layer.on("tileload", () => {
      loadedOnce = true;
    });

    layer.on("tileerror", () => {
      errorCount += 1;
      if (!loadedOnce && errorCount >= 6 && index < chain.length - 1) {
        console.warn(`Kizomba Atlas — bascule vers le fournisseur suivant (${provider.id} indisponible).`);
        mountTileProvider(index + 1);
      }
    });

    layer.addTo(state.map);
    layer.bringToBack();
    state.tileLayer = layer;

    // Si rien n'est arrivé au bout de six secondes, on passe au secours.
    state.tileWatchdog = window.setTimeout(() => {
      if (!loadedOnce && index < chain.length - 1) {
        console.warn(`Kizomba Atlas — délai dépassé pour ${provider.id}, passage au secours.`);
        mountTileProvider(index + 1);
      }
    }, 6000);
  }

  async function loadEvents() {
    const { data, error } = await state.supabase
      .from("events")
      .select("*")
      .eq("status", "published")
      .order("starts_at", { ascending: true });

    if (error) {
      console.error("Kizomba Atlas événements :", error);
      showMapStatus("Mode local actif");
      useDemoFallback();
      return false;
    }

    const config = window.KIZOMBA_ATLAS_CONFIG || {};

    if ((!data || data.length === 0) && config.DEMO_FALLBACK !== false) {
      state.events = [...demoEvents];
    } else {
      state.events = data || [];
    }

    state.news = buildEventNews(state.events);
    return true;
  }

  function subscribeRealtime() {
    state.supabase
      .channel("kizomba-atlas-public")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, async () => {
        const loaded = await loadEvents();
        if (!loaded) return;
        state.news = buildEventNews(state.events);
        applyFilters();
        renderTicker();
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("Kizomba Atlas temps réel :", status);
        }
      });
  }

  function buildEventNews(events) {
    const upcoming = [...(events || [])]
      .filter((event) => event.status === "published" && new Date(event.ends_at || event.starts_at).getTime() >= Date.now())
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .slice(0, 3);

    if (!upcoming.length) {
      return [{
        id: "atlas-news-empty",
        text_fr: "De nouvelles dates seront ajoutées prochainement sur Kizomba Atlas.",
        text_en: "New dates will be added soon to Kizomba Atlas.",
        active: true,
        priority: 1
      }];
    }

    return upcoming.map((event, index) => ({
      id: `event-news-${event.id}`,
      text_fr: `À venir : ${event.title_fr || event.title_en} — ${event.city || event.country || ""}.`,
      text_en: `Coming up: ${event.title_en || event.title_fr} — ${event.city || event.country || ""}.`,
      active: true,
      priority: upcoming.length - index
    }));
  }

  function isNewsCurrentlyVisible(item) {
    if (!item) return false;
    if (item.active === false) return false;

    const now = Date.now();

    if (item.starts_at) {
      const start = new Date(item.starts_at).getTime();
      if (!Number.isNaN(start) && start > now) return false;
    }

    if (item.ends_at) {
      const end = new Date(item.ends_at).getTime();
      if (!Number.isNaN(end) && end < now) return false;
    }

    return true;
  }

  function applyFilters(shouldFit = false) {
    const now = new Date();

    state.filteredEvents = state.events.filter((event) => {
      if (event.status && event.status !== "published") return false;

      const categoryMatch = eventMatchesFilter(event, state.category);
      const searchable = [
        localText(event, "title"),
        localText(event, "description"),
        event.organizer_name,
        event.venue_name,
        event.address,
        event.city,
        event.country
      ].filter(Boolean).join(" ").toLowerCase();
      const searchMatch = !state.search || searchable.includes(state.search);
      const dateMatch = matchesDateFilter(event, state.dateFilter, now);

      return categoryMatch && searchMatch && dateMatch;
    });

    renderMarkers();
    renderEventList();
    renderFavorites();

    const counter = document.getElementById("eventCount");
    if (counter) counter.textContent = String(state.filteredEvents.length);

    showMapStatus(t("mapEvents", { count: state.filteredEvents.length }));

    if (shouldFit) window.setTimeout(fitVisibleEvents, 140);
  }

  function matchesDateFilter(event, filter, now) {
    if (filter === "all") return true;
    const start = new Date(event.starts_at);
    if (Number.isNaN(start.getTime())) return false;

    if (filter === "today") {
      return start.toDateString() === now.toDateString();
    }

    if (filter === "weekend") {
      const weekendStart = new Date(now);
      const day = now.getDay();
      const daysUntilSaturday = (6 - day + 7) % 7;
      weekendStart.setDate(now.getDate() + daysUntilSaturday);
      weekendStart.setHours(0, 0, 0, 0);

      const weekendEnd = new Date(weekendStart);
      weekendEnd.setDate(weekendStart.getDate() + 2);
      weekendEnd.setHours(23, 59, 59, 999);

      return start >= weekendStart && start <= weekendEnd;
    }

    return true;
  }

  function renderMarkers() {
    if (!state.markerLayer || !window.L) return;

    state.markerLayer.clearLayers();

    state.filteredEvents.forEach((event) => {
      const lat = Number(event.latitude);
      const lng = Number(event.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const style = markerStyle(event);
      const hasLogo = isSafeHttpUrl(event.logo_url);
      const face = hasLogo
        ? `<img src="${escapeAttribute(event.logo_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
        : `<span>${escapeHTML(shortCategory(event.category))}</span>`;
      const badge = hasLogo && event.category !== "party"
        ? `<b>${escapeHTML(event.category === "festival" ? "F" : "W")}</b>`
        : "";

      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: "",
          html: `<div class="kiz-marker${hasLogo ? " has-logo" : ""}" data-style="${escapeAttribute(style)}" data-type="${escapeAttribute(event.category || "party")}"><div class="marker-face">${face}</div>${badge}</div>`,
          iconSize: [36, 40],
          iconAnchor: [18, 36]
        }),
        title: localText(event, "title")
      });

      marker.on("click", () => openEventSheet(event));
      state.markerLayer.addLayer(marker);
    });
  }

  function renderEventList() {
    const container = document.getElementById("eventList");
    if (!container) return;

    if (!state.filteredEvents.length) {
      container.innerHTML = `<div class="empty-state">${escapeHTML(t("noEvents"))}</div>`;
      return;
    }

    container.innerHTML = "";
    state.filteredEvents.forEach((event) => container.appendChild(createEventCard(event)));
  }

  function renderFavorites() {
    const container = document.getElementById("favoritesList");
    if (!container) return;

    const favorites = state.events.filter((event) => state.favorites.has(String(event.id)));

    if (!favorites.length) {
      container.innerHTML = `<div class="empty-state">${escapeHTML(t("noFavorites"))}</div>`;
      return;
    }

    container.innerHTML = "";
    favorites.forEach((event) => container.appendChild(createEventCard(event)));
  }

  function createEventCard(event) {
    const card = document.createElement("article");
    card.className = "event-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");

    const media = document.createElement("div");
    media.className = "event-card-media";

    if (isSafeHttpUrl(event.image_url)) {
      const image = document.createElement("img");
      image.src = event.image_url;
      image.alt = "";
      image.loading = "lazy";
      media.appendChild(image);
    }

    const eventDate = new Date(event.starts_at);
    if (!Number.isNaN(eventDate.getTime())) {
      const dateBadge = document.createElement("div");
      dateBadge.className = "event-date-badge";

      const day = document.createElement("strong");
      day.textContent = new Intl.DateTimeFormat(
        currentLanguage() === "fr" ? "fr-FR" : "en-GB",
        { day: "2-digit" }
      ).format(eventDate);

      const month = document.createElement("span");
      month.textContent = new Intl.DateTimeFormat(
        currentLanguage() === "fr" ? "fr-FR" : "en-GB",
        { month: "short" }
      ).format(eventDate).replace(".", "").toUpperCase();

      dateBadge.append(day, month);
      media.appendChild(dateBadge);
    }

    const category = document.createElement("span");
    category.className = "event-card-category";
    category.textContent = eventTypeLabel(event.category);
    media.appendChild(category);

    const body = document.createElement("div");
    body.className = "event-card-body";

    const title = document.createElement("h2");
    title.textContent = localText(event, "title") || "Kizomba Atlas";

    const meta = document.createElement("div");
    meta.className = "event-meta";

    const date = document.createElement("span");
    date.textContent = `◷ ${formatDate(event.starts_at)}`;

    const place = document.createElement("span");
    place.textContent = `⌖ ${event.venue_name || event.city || ""}`;

    const address = document.createElement("span");
    address.textContent = event.city && event.country
      ? `${event.city}, ${event.country}`
      : (event.address || "");

    meta.append(date, place, address);

    const styleTags = createStyleTags(event);

    const favorite = document.createElement("button");
    favorite.className = "favorite-inline";
    favorite.type = "button";
    favorite.textContent = state.favorites.has(String(event.id))
      ? `♥ ${t("removeFavorite")}`
      : `♡ ${t("addFavorite")}`;
    favorite.addEventListener("click", (clickEvent) => {
      clickEvent.stopPropagation();
      toggleFavorite(event.id);
    });

    body.append(title, meta);
    if (styleTags) body.appendChild(styleTags);
    body.appendChild(favorite);
    card.append(media, body);

    card.addEventListener("click", () => openEventSheet(event));
    card.addEventListener("keydown", (keyboardEvent) => {
      if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") openEventSheet(event);
    });

    return card;
  }

  function openEventSheet(event) {
    state.selectedEvent = event;

    const content = document.getElementById("eventSheetContent");
    if (!content) return;

    content.innerHTML = "";

    const cover = document.createElement("div");
    if (isSafeHttpUrl(event.image_url)) {
      const image = document.createElement("img");
      image.className = "sheet-cover";
      image.src = event.image_url;
      image.alt = "";
      cover.appendChild(image);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "sheet-cover";
      cover.appendChild(placeholder);
    }

    const category = document.createElement("div");
    category.className = "sheet-category";
    category.textContent = eventLabelLine(event);

    const title = document.createElement("h2");
    title.className = "sheet-title";
    title.id = "sheetTitle";
    title.textContent = localText(event, "title") || "Kizomba Atlas";

    const description = document.createElement("p");
    description.className = "sheet-description";
    description.textContent = localText(event, "description") || "";

    const details = document.createElement("div");
    details.className = "detail-grid";
    details.append(
      detailRow("◷", t("dateAndTime"), formatDateRange(event.starts_at, event.ends_at)),
      detailRow("⌖", t("exactAddress"), [event.venue_name, event.address, event.city, event.country].filter(Boolean).join(" — ")),
      detailRow("◎", t("organizer"), event.organizer_name || "Kizomba Atlas"),
      detailRow("€", t("price"), localText(event, "price_text") || t("freeOrUnknown"))
    );

    const actions = document.createElement("div");
    actions.className = "sheet-actions";

    const directions = actionLink(t("directions"), googleMapsUrl(event), "primary-button");
    const waze = actionLink(t("openWaze"), wazeUrl(event), "secondary-button");

    actions.append(directions, waze);

    if (isSafeHttpUrl(event.ticket_url)) {
      actions.append(actionLink(t("tickets"), event.ticket_url, "secondary-button"));
    }

    const share = document.createElement("button");
    share.className = "secondary-button";
    share.type = "button";
    share.textContent = t("share");
    share.addEventListener("click", () => shareEvent(event));
    actions.appendChild(share);

    const favorite = document.createElement("button");
    favorite.className = "secondary-button full-width";
    favorite.type = "button";
    favorite.textContent = state.favorites.has(String(event.id))
      ? `♥ ${t("removeFavorite")}`
      : `♡ ${t("addFavorite")}`;
    favorite.addEventListener("click", () => {
      toggleFavorite(event.id);
      openEventSheet(event);
    });

    content.append(cover, category, title);
    if (description.textContent) content.appendChild(description);
    content.append(details, actions, favorite);

    const backdrop = document.getElementById("eventSheetBackdrop");
    const sheet = document.getElementById("eventSheet");
    if (backdrop) backdrop.hidden = false;
    if (sheet) sheet.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeEventSheet() {
    const backdrop = document.getElementById("eventSheetBackdrop");
    const sheet = document.getElementById("eventSheet");
    if (backdrop) backdrop.hidden = true;
    if (sheet) sheet.hidden = true;
    document.body.style.overflow = "";
    state.selectedEvent = null;
  }

  function detailRow(icon, label, value) {
    const row = document.createElement("div");
    row.className = "detail-row";
    row.innerHTML = `<div aria-hidden="true">${escapeHTML(icon)}</div><div><strong>${escapeHTML(label)}</strong><span>${escapeHTML(value || "—")}</span></div>`;
    return row;
  }

  function actionLink(label, url, className) {
    const anchor = document.createElement("a");
    anchor.className = className;
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = label;
    anchor.style.display = "grid";
    anchor.style.placeItems = "center";
    return anchor;
  }

  function toggleFavorite(id) {
    const key = String(id);
    if (state.favorites.has(key)) {
      state.favorites.delete(key);
    } else {
      state.favorites.add(key);
    }

    try {
      localStorage.setItem("kizomba-atlas-favorites", JSON.stringify([...state.favorites]));
    } catch (error) {
      /* stockage indisponible */
    }

    renderEventList();
    renderFavorites();
  }

  function renderTicker() {
    const track = document.getElementById("tickerTrack");
    if (!track) return;

    const visibleNews = state.news.filter(isNewsCurrentlyVisible);

    if (!visibleNews.length) {
      track.innerHTML = `<span class="ticker-item">${escapeHTML(t("noData"))}</span>`;
      return;
    }

    const doubled = [...visibleNews, ...visibleNews];
    track.innerHTML = doubled.map((item) => {
      const text = currentLanguage() === "fr" ? item.text_fr : item.text_en;
      return `<span class="ticker-item" data-type="${escapeAttribute(item.type || "info")}">${escapeHTML(text || item.text_fr || item.text_en || "")}</span>`;
    }).join("");
  }

  function switchView(viewId, activeButton) {
    document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.remove("is-active"));
    document.querySelectorAll(".nav-item").forEach((button) => button.classList.remove("is-active"));

    const targetPanel = document.getElementById(viewId);
    if (!targetPanel) return;

    targetPanel.classList.add("is-active");
    if (activeButton) activeButton.classList.add("is-active");
    document.body.dataset.activeView = viewId;

    // Chaque onglet s'ouvre toujours proprement depuis le haut.
    if (typeof targetPanel.scrollTo === "function") {
      targetPanel.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } else {
      targetPanel.scrollTop = 0;
    }

    if (viewId === "mapView") {
      window.setTimeout(() => {
        if (!state.map) return;
        state.map.invalidateSize();
        fitVisibleEvents();
      }, 90);
    }
  }

  function locateUser() {
    if (!navigator.geolocation) {
      showMapStatus(t("locationUnavailable"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!state.map) return;

        const latlng = [position.coords.latitude, position.coords.longitude];
        if (state.userMarker) state.userMarker.remove();

        state.userMarker = L.circleMarker(latlng, {
          radius: 8,
          color: "#ffffff",
          weight: 3,
          fillColor: "#45d4a4",
          fillOpacity: 1
        }).addTo(state.map);

        state.map.setView(latlng, 12);
        showMapStatus(t("locationFound"));
      },
      () => showMapStatus(t("locationUnavailable")),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  function fitVisibleEvents() {
    if (!state.map) return;

    const config = window.KIZOMBA_ATLAS_CONFIG || {};
    const center = config.DEFAULT_MAP_CENTER || [48.25, 3.05];
    const zoom = config.DEFAULT_MAP_ZOOM || 5.35;

    const points = state.filteredEvents
      .map((event) => [Number(event.latitude), Number(event.longitude)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

    state.map.invalidateSize();

    if (!points.length) {
      state.map.setView(center, zoom);
      return;
    }

    if (points.length === 1) {
      state.map.setView(points[0], 12, { animate: true });
      return;
    }

    state.map.fitBounds(points, {
      paddingTopLeft: [46, 52],
      paddingBottomRight: [46, 66],
      maxZoom: 12,
      animate: true
    });
  }

  function showMapStatus(message) {
    const element = document.getElementById("mapStatus");
    if (!element) return;

    element.textContent = message;
    element.classList.add("is-visible");
    window.clearTimeout(showMapStatus.timeout);
    showMapStatus.timeout = window.setTimeout(() => element.classList.remove("is-visible"), 2400);
  }

  function localText(event, field) {
    const language = currentLanguage();
    return event[`${field}_${language}`] || event[`${field}_fr`] || event[`${field}_en`] || "";
  }

  function normalizedStyles(event) {
    if (Array.isArray(event.styles)) return event.styles.filter(Boolean);

    if (typeof event.styles === "string") {
      return event.styles
        .replace(/[{}]/g, "")
        .split(",")
        .map((item) => item.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
    }

    // Compatibilité avec les anciens événements enregistrés avant les styles multiples.
    if (["kizomba", "urban-kiz", "bachata", "sbk", "semba", "tarraxo"].includes(event.category)) {
      return [event.category];
    }

    return [];
  }

  function eventMatchesFilter(event, filter) {
    if (filter === "all") return true;
    if (["festival", "workshop"].includes(filter)) return event.category === filter;
    return normalizedStyles(event).includes(filter);
  }

  function styleLabel(style) {
    return {
      "kizomba": "Kizomba",
      "urban-kiz": "Urban Kiz",
      "bachata": "Bachata",
      "sbk": "SBK",
      "semba": "Semba",
      "tarraxo": "Tarraxo"
    }[style] || style;
  }

  function eventTypeLabel(category) {
    return {
      "party": t("party"),
      "festival": t("festival"),
      "workshop": t("workshop"),
      "kizomba": "Kizomba",
      "urban-kiz": "Urban Kiz",
      "bachata": "Bachata",
      "sbk": "SBK",
      "semba": "Semba",
      "tarraxo": "Tarraxo"
    }[category] || t("party");
  }

  function eventLabelLine(event) {
    const labels = [eventTypeLabel(event.category), ...normalizedStyles(event).map(styleLabel)];
    return [...new Set(labels.filter(Boolean))].join(" · ");
  }

  function createStyleTags(event) {
    const styles = normalizedStyles(event);
    if (!styles.length) return null;

    const container = document.createElement("div");
    container.className = "event-style-tags";

    styles.slice(0, 4).forEach((style) => {
      const tag = document.createElement("span");
      tag.dataset.style = style;
      tag.textContent = styleLabel(style);
      container.appendChild(tag);
    });

    return container;
  }

  function markerStyle(event) {
    const allowed = ["kizomba", "urban-kiz", "bachata", "sbk", "semba", "tarraxo"];
    if (allowed.includes(event.map_style)) return event.map_style;

    const styles = normalizedStyles(event);
    if (styles.includes("sbk") && styles.length > 1) return "sbk";
    return styles.find((style) => allowed.includes(style)) || "kizomba";
  }

  function effectiveMapTheme(theme) {
    return theme === "dark" ? "dark" : "light";
  }

  function applyMapTheme(theme, persist = true) {
    state.mapTheme = effectiveMapTheme(theme);

    if (persist) {
      try {
        localStorage.setItem("kizomba-atlas-map-theme", state.mapTheme);
      } catch (error) {
        /* stockage indisponible */
      }
    }

    const mapElement = document.getElementById("map");
    if (mapElement) mapElement.dataset.mapTheme = state.mapTheme;

    if (state.map) mountTileProvider(0);

    updateMapThemeControl();
  }

  function cycleMapTheme() {
    applyMapTheme(state.mapTheme === "dark" ? "light" : "dark");
  }

  function updateMapThemeControl() {
    const icon = document.getElementById("mapThemeIcon");
    const label = document.getElementById("mapThemeLabel");
    if (!icon || !label) return;

    const dark = state.mapTheme === "dark";
    icon.textContent = dark ? "☾" : "☀";
    label.textContent = t(dark ? "mapDark" : "mapLight");
  }

  function shortCategory(category) {
    const labels = {
      "party": "KIZ",
      "kizomba": "KIZ",
      "urban-kiz": "UK",
      "bachata": "BACH",
      "sbk": "SBK",
      "semba": "SEM",
      "tarraxo": "TRX",
      "festival": "FEST",
      "workshop": "WK"
    };
    return labels[category] || "KIZ";
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat(currentLanguage() === "fr" ? "fr-FR" : "en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function formatDateRange(startValue, endValue) {
    const start = formatDate(startValue);
    if (!endValue) return start;
    const end = formatDate(endValue);
    return `${start} → ${end}`;
  }

  function googleMapsUrl(event) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${event.latitude},${event.longitude}`)}`;
  }

  function wazeUrl(event) {
    return `https://www.waze.com/ul?ll=${encodeURIComponent(`${event.latitude},${event.longitude}`)}&navigate=yes`;
  }

  async function shareEvent(event) {
    const data = {
      title: localText(event, "title"),
      text: `${t("shareText")} — ${event.venue_name || event.city || ""}`,
      url: googleMapsUrl(event)
    };

    try {
      if (navigator.share) {
        await navigator.share(data);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${data.title}\n${data.text}\n${data.url}`);
        showMapStatus("Lien copié / Link copied");
      }
    } catch (error) {
      if (error && error.name !== "AbortError") console.error(error);
    }
  }

  function initInstallPrompt() {
    const button = document.getElementById("installButton");
    if (!button) return;

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.deferredInstallPrompt = event;
      button.classList.remove("is-hidden");
    });

    button.addEventListener("click", async () => {
      if (!state.deferredInstallPrompt) return;
      state.deferredInstallPrompt.prompt();
      await state.deferredInstallPrompt.userChoice;
      state.deferredInstallPrompt = null;
      button.classList.add("is-hidden");
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("./sw.js")
      .then((registration) => registration.update())
      .catch((error) => console.warn("Service worker :", error));
  }

  function readStoredFavorites() {
    try {
      return JSON.parse(localStorage.getItem("kizomba-atlas-favorites") || "[]");
    } catch (error) {
      return [];
    }
  }

  function readStoredMapTheme() {
    try {
      const stored = localStorage.getItem("kizomba-atlas-map-theme");
      return stored === "dark" ? "dark" : "light";
    } catch (error) {
      return "light";
    }
  }

  function isSafeHttpUrl(value) {
    if (!value) return false;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch (error) {
      return false;
    }
  }

  function escapeHTML(value) {
    return String(value === null || value === undefined ? "" : value)
      .split("&").join("&amp;")
      .split("<").join("&lt;")
      .split(">").join("&gt;")
      .split('"').join("&quot;")
      .split("'").join("&#039;");
  }

  function escapeAttribute(value) {
    return escapeHTML(value).split("`").join("&#096;");
  }
})();
