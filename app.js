(() => {
  "use strict";

  const t = (key, replacements) => window.KizombaAtlasLanguage.t(key, replacements);

  const state = {
    events: [],
    news: [],
    filteredEvents: [],
    category: "all",
    dateFilter: "all",
    search: "",
    selectedEvent: null,
    favorites: new Set(JSON.parse(localStorage.getItem("kizomba-atlas-favorites") || "[]")),
    map: null,
    markerLayer: null,
    userMarker: null,
    deferredInstallPrompt: null,
    supabase: null,
    tileLayer: null,
    mapTheme: localStorage.getItem("kizomba-atlas-map-theme") || "dark"
  };

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
      description_fr: "Festival à Fribourg-en-Brisgau réunissant Kizomba et Bachata. Le programme annoncé comprend des bootcamps immersifs, des workshops, des soirées et des socials. L’EVOKEEZ Bootcamp réunit Martina & Lea, Andrea & Aurélie, Antho & Caro : 6 professeurs, 3 heures de travail et des places limitées.",
      description_en: "A festival in Freiburg im Breisgau bringing together Kizomba and Bachata. The announced programme includes immersive bootcamps, workshops, parties and socials. The EVOKEEZ Bootcamp features Martina & Lea, Andrea & Aurélie, Antho & Caro: 6 teachers, 3 hours of training and limited places.",
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

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    window.scrollTo(0, 0);
    document.body.dataset.activeView = "mapView";

    bindUI();
    setupWelcomeScreen();
    initMap();
    initInstallPrompt();

    const backendConfigPromise = typeof window.loadKizombaAtlasConfig === "function"
      ? window.loadKizombaAtlasConfig()
      : Promise.resolve(window.KIZOMBA_ATLAS_CONFIG);

    // Affichage immédiat : jamais de bandeau bloqué sur « Chargement ».
    state.events = [...demoEvents];
    state.news = [...demoNews];
    applyFilters(true);
    renderTicker();

    await backendConfigPromise;

    if (window.isSupabaseConfigured()) {
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
        console.error("Kizomba Atlas backend:", error);
        useDemoFallback();
      }
    }

    registerServiceWorker();
  }

  function useDemoFallback() {
    if (window.KIZOMBA_ATLAS_CONFIG.DEMO_FALLBACK === false) {
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
        window.KizombaAtlasLanguage.toggle();
      });
    });

    window.addEventListener("kizomba-atlas:languagechange", () => {
      applyFilters(false);
      renderTicker();
      updateMapThemeControl();
      if (state.selectedEvent) openEventSheet(state.selectedEvent);
    });

    document.getElementById("searchInput").addEventListener("input", (event) => {
      state.search = event.target.value.trim().toLowerCase();
      applyFilters(true);
    });

    document.querySelectorAll("#categoryFilters .filter-chip").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("#categoryFilters .filter-chip").forEach((item) => item.classList.remove("is-active"));
        button.classList.add("is-active");
        state.category = button.dataset.category;
        applyFilters(true);
      });
    });

    document.querySelectorAll("#dateFilters .date-filter").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("#dateFilters .date-filter").forEach((item) => item.classList.remove("is-active"));
        button.classList.add("is-active");
        state.dateFilter = button.dataset.dateFilter;
        applyFilters(true);
      });
    });

    document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.view, button));
    });

    document.getElementById("locateButton").addEventListener("click", locateUser);
    document.getElementById("mapThemeButton").addEventListener("click", cycleMapTheme);
    document.getElementById("recenterButton").addEventListener("click", fitVisibleEvents);
    document.getElementById("closeSheetButton").addEventListener("click", closeEventSheet);
    document.getElementById("eventSheetBackdrop").addEventListener("click", closeEventSheet);
  }

  function setupWelcomeScreen() {
    const screen = document.getElementById("welcomeScreen");
    const button = document.getElementById("openMapButton");
    if (!screen || !button) return;

    if (localStorage.getItem("kizomba-atlas-welcome-seen-premium-gold-v4") === "1") {
      screen.hidden = true;
      return;
    }

    button.addEventListener("click", () => {
      localStorage.setItem("kizomba-atlas-welcome-seen-premium-gold-v4", "1");
      screen.classList.add("is-closing");
      window.setTimeout(() => {
        screen.hidden = true;
        state.map?.invalidateSize();
        fitVisibleEvents();
      }, 420);
    });
  }

  function initMap() {
    const { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } = window.KIZOMBA_ATLAS_CONFIG;
    state.map = L.map("map", {
      zoomControl: true,
      attributionControl: true
    }).setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);

    state.map.attributionControl.setPrefix(false);

    applyMapTheme(state.mapTheme, false);

    const systemTheme = window.matchMedia?.("(prefers-color-scheme: dark)");
    systemTheme?.addEventListener?.("change", () => {
      if (state.mapTheme === "auto") applyMapTheme("auto", false);
    });

    state.markerLayer = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 48
    });
    state.map.addLayer(state.markerLayer);
  }

  async function loadEvents() {
    const { data, error } = await state.supabase
      .from("events")
      .select("*")
      .eq("status", "published")
      .order("starts_at", { ascending: true });

    if (error) {
      console.error("Kizomba Atlas events:", error);
      showMapStatus("Mode local actif");
      useDemoFallback();
      return false;
    }

    if ((!data || data.length === 0) && window.KIZOMBA_ATLAS_CONFIG.DEMO_FALLBACK !== false) {
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
          console.warn("Kizomba Atlas realtime:", status);
        }
      });
  }

  function buildEventNews(events) {
    const upcoming = [...(events || [])]
      .filter((event) => event.status === "published" && new Date(event.starts_at).getTime() >= Date.now())
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
    document.getElementById("eventCount").textContent = String(state.filteredEvents.length);
    showMapStatus(t("mapEvents", { count: state.filteredEvents.length }));
    if (shouldFit) window.setTimeout(fitVisibleEvents, 120);
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
          iconSize: [48, 52],
          iconAnchor: [24, 47]
        }),
        title: localText(event, "title")
      });

      marker.on("click", () => openEventSheet(event));
      state.markerLayer.addLayer(marker);
    });
  }

  function renderEventList() {
    const container = document.getElementById("eventList");
    if (!state.filteredEvents.length) {
      container.innerHTML = `<div class="empty-state">${escapeHTML(t("noEvents"))}</div>`;
      return;
    }

    container.innerHTML = "";
    state.filteredEvents.forEach((event) => container.appendChild(createEventCard(event)));
  }

  function renderFavorites() {
    const container = document.getElementById("favoritesList");
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
        window.KizombaAtlasLanguage.current === "fr" ? "fr-FR" : "en-GB",
        { day: "2-digit" }
      ).format(eventDate);

      const month = document.createElement("span");
      month.textContent = new Intl.DateTimeFormat(
        window.KizombaAtlasLanguage.current === "fr" ? "fr-FR" : "en-GB",
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
    title.textContent = localText(event, "title") || "Kizomba Atlas Event";

    const meta = document.createElement("div");
    meta.className = "event-meta";

    const date = document.createElement("span");
    date.textContent = `◷ ${formatDate(event.starts_at)}`;

    const place = document.createElement("span");
    place.textContent = `⌖ ${event.venue_name || event.city || ""}`;

    const address = document.createElement("span");
    address.textContent = event.city && event.country ? `${event.city}, ${event.country}` : (event.address || "");

    meta.append(date, place, address);

    const styleTags = createStyleTags(event);

    const favorite = document.createElement("button");
    favorite.className = "favorite-inline";
    favorite.type = "button";
    favorite.textContent = state.favorites.has(String(event.id)) ? `♥ ${t("removeFavorite")}` : `♡ ${t("addFavorite")}`;
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
    title.textContent = localText(event, "title") || "Kizomba Atlas Event";

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
    favorite.textContent = state.favorites.has(String(event.id)) ? `♥ ${t("removeFavorite")}` : `♡ ${t("addFavorite")}`;
    favorite.addEventListener("click", () => {
      toggleFavorite(event.id);
      openEventSheet(event);
    });

    content.append(cover, category, title);
    if (description.textContent) content.appendChild(description);
    content.append(details, actions, favorite);

    document.getElementById("eventSheetBackdrop").hidden = false;
    document.getElementById("eventSheet").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeEventSheet() {
    document.getElementById("eventSheetBackdrop").hidden = true;
    document.getElementById("eventSheet").hidden = true;
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
    localStorage.setItem("kizomba-atlas-favorites", JSON.stringify([...state.favorites]));
    renderEventList();
    renderFavorites();
  }

  function renderTicker() {
    const track = document.getElementById("tickerTrack");
    const visibleNews = state.news.filter(isNewsCurrentlyVisible);

    if (!visibleNews.length) {
      track.innerHTML = `<span class="ticker-item">${escapeHTML(t("noData"))}</span>`;
      return;
    }

    const doubled = [...visibleNews, ...visibleNews];
    track.innerHTML = doubled.map((item) => {
      const text = window.KizombaAtlasLanguage.current === "fr" ? item.text_fr : item.text_en;
      return `<span class="ticker-item" data-type="${escapeAttribute(item.type || "info")}">${escapeHTML(text || item.text_fr || item.text_en || "")}</span>`;
    }).join("");
  }

  function switchView(viewId, activeButton) {
    document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.remove("is-active"));
    document.querySelectorAll(".nav-item").forEach((button) => button.classList.remove("is-active"));

    const targetPanel = document.getElementById(viewId);
    targetPanel.classList.add("is-active");
    activeButton.classList.add("is-active");
    document.body.dataset.activeView = viewId;

    // Chaque onglet s'ouvre toujours proprement depuis le haut.
    // Cela évite que le titre ou le logo restent coupés après un ancien scroll.
    if (typeof targetPanel.scrollTo === "function") {
      targetPanel.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } else {
      targetPanel.scrollTop = 0;
    }

    if (viewId === "mapView") {
      window.setTimeout(() => {
        state.map.invalidateSize();
        fitVisibleEvents();
      }, 80);
    }
  }

  function locateUser() {
    if (!navigator.geolocation) {
      showMapStatus(t("locationUnavailable"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
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
    const points = state.filteredEvents
      .map((event) => [Number(event.latitude), Number(event.longitude)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

    state.map.invalidateSize();

    if (!points.length) {
      state.map.setView(window.KIZOMBA_ATLAS_CONFIG.DEFAULT_MAP_CENTER, window.KIZOMBA_ATLAS_CONFIG.DEFAULT_MAP_ZOOM);
      return;
    }

    if (points.length === 1) {
      state.map.setView(points[0], 12, { animate: true });
      state.map.panBy([0, -60], { animate: true });
      return;
    }

    state.map.fitBounds(points, {
      paddingTopLeft: [54, 96],
      paddingBottomRight: [54, 80],
      maxZoom: 12,
      animate: true
    });
  }

  function showMapStatus(message) {
    const element = document.getElementById("mapStatus");
    element.textContent = message;
    element.classList.add("is-visible");
    window.clearTimeout(showMapStatus.timeout);
    showMapStatus.timeout = window.setTimeout(() => element.classList.remove("is-visible"), 2400);
  }

  function localText(event, field) {
    const language = window.KizombaAtlasLanguage.current;
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

    // Compatibilité avec les anciens événements enregistrés avant l’ajout des styles multiples.
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
    return theme === "light" ? "light" : "dark";
  }

  function applyMapTheme(theme, persist = true) {
    state.mapTheme = theme === "light" ? "light" : "dark";
    if (persist) localStorage.setItem("kizomba-atlas-map-theme", state.mapTheme);

    const selected = effectiveMapTheme(state.mapTheme);
    const mapElement = document.getElementById("map");
    if (mapElement) mapElement.dataset.mapTheme = selected;

    if (state.map) {
      if (state.tileLayer) state.map.removeLayer(state.tileLayer);

      const tileConfig = selected === "dark"
        ? {
            url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
            maxZoom: 20,
            attribution: "© OpenStreetMap © CARTO"
          }
        : {
            url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            maxZoom: 19,
            attribution: "© OpenStreetMap"
          };

      state.tileLayer = L.tileLayer(tileConfig.url, {
        maxZoom: tileConfig.maxZoom,
        attribution: tileConfig.attribution,
        subdomains: "abcd"
      }).addTo(state.map);
      state.tileLayer.bringToBack();
    }

    updateMapThemeControl();
  }

  function cycleMapTheme() {
    applyMapTheme(state.mapTheme === "dark" ? "light" : "dark");
  }

  function updateMapThemeControl() {
    const icon = document.getElementById("mapThemeIcon");
    const label = document.getElementById("mapThemeLabel");
    if (!icon || !label) return;

    const dark = state.mapTheme !== "light";
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
    return new Intl.DateTimeFormat(window.KizombaAtlasLanguage.current === "fr" ? "fr-FR" : "en-GB", {
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
      } else {
        await navigator.clipboard.writeText(`${data.title}\n${data.text}\n${data.url}`);
        showMapStatus("Lien copié / Link copied");
      }
    } catch (error) {
      if (error?.name !== "AbortError") console.error(error);
    }
  }

  function initInstallPrompt() {
    const button = document.getElementById("installButton");

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
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("SW:", error));
    }
  }

  function isSafeHttpUrl(value) {
    if (!value) return false;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHTML(value).replaceAll("`", "&#096;");
  }
})();
