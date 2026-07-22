(() => {
  "use strict";

  const APP_VERSION = "kizomba-atlas-map-fix-20260722-7";

  const t = (key, replacements) => {
    if (
      window.KizombaAtlasLanguage &&
      typeof window.KizombaAtlasLanguage.t === "function"
    ) {
      return window.KizombaAtlasLanguage.t(key, replacements);
    }

    return key;
  };

  function readFavorites() {
    try {
      const saved = JSON.parse(
        localStorage.getItem("kizomba-atlas-favorites") || "[]"
      );

      return new Set(Array.isArray(saved) ? saved : []);
    } catch {
      return new Set();
    }
  }

  const state = {
    events: [],
    news: [],
    filteredEvents: [],
    category: "all",
    dateFilter: "all",
    search: "",
    selectedEvent: null,
    favorites: readFavorites(),
    map: null,
    markerLayer: null,
    userMarker: null,
    deferredInstallPrompt: null,
    supabase: null,
    tileLayer: null,
    mapTheme: "light"
  };

  const demoEvents = [
    {
      id: "pkc-2026-hilton-cdg",

      title_fr:
        "Paris Kizomba Congress 2026 — PKC",

      title_en:
        "Paris Kizomba Congress 2026 — PKC",

      description_fr:
        "Événement international dédié à la Kizomba, au Semba, à la Tarraxinha et aux danses africaines. Ce point correspond au festival principal organisé au Hilton Paris Charles de Gaulle Airport.",

      description_en:
        "An international event dedicated to Kizomba, Semba, Tarraxinha and African dances. This pin marks the main festival venue at Hilton Paris Charles de Gaulle Airport.",

      category: "festival",

      styles: [
        "kizomba",
        "urban-kiz",
        "semba"
      ],

      map_style: "kizomba",

      logo_url: "",

      starts_at:
        "2026-11-20T20:00:00+01:00",

      ends_at:
        "2026-11-23T07:00:00+01:00",

      venue_name:
        "Hilton Paris Charles de Gaulle Airport",

      address:
        "8 Rue de Rome, 93290 Tremblay-en-France",

      city:
        "Tremblay-en-France",

      country:
        "France",

      latitude:
        49.010263,

      longitude:
        2.557379,

      organizer_name:
        "Paris Kizomba Congress",

      price_text_fr:
        "Voir la billetterie officielle",

      price_text_en:
        "See official ticketing",

      ticket_url:
        "https://my.weezevent.com/paris-kizomba-congress-2026",

      image_url: "",

      status:
        "published"
    },

    {
      id:
        "dance-affinity-2026-freiburg",

      title_fr:
        "Dance Affinity Festival 2026",

      title_en:
        "Dance Affinity Festival 2026",

      description_fr:
        "Festival à Fribourg-en-Brisgau réunissant Kizomba et Bachata. Le programme annoncé comprend des bootcamps immersifs, des workshops, des soirées et des socials. L’EVOKEEZ Bootcamp réunit Martina & Lea, Andrea & Aurélie, Antho & Caro : 6 professeurs, 3 heures de travail et des places limitées.",

      description_en:
        "A festival in Freiburg im Breisgau bringing together Kizomba and Bachata. The announced programme includes immersive bootcamps, workshops, parties and socials. The EVOKEEZ Bootcamp features Martina & Lea, Andrea & Aurélie, Antho & Caro: 6 teachers, 3 hours of training and limited places.",

      category:
        "festival",

      styles: [
        "kizomba",
        "bachata",
        "sbk"
      ],

      map_style:
        "sbk",

      logo_url: "",

      starts_at:
        "2026-10-30T20:00:00+01:00",

      ends_at:
        "2026-11-02T04:00:00+01:00",

      venue_name:
        "M.A.K Studio",

      address:
        "Kaiser-Joseph-Straße 268, 79098 Freiburg im Breisgau",

      city:
        "Freiburg im Breisgau",

      country:
        "Allemagne",

      latitude:
        47.991997,

      longitude:
        7.848298,

      organizer_name:
        "Dance Affinity Festival",

      price_text_fr:
        "Voir la billetterie officielle",

      price_text_en:
        "See official ticketing",

      ticket_url:
        "https://my.weezevent.com/dance-affinity-2026",

      image_url: "",

      status:
        "published"
    }
  ];

  const demoNews = [
    {
      id:
        "demo-news-1",

      text_fr:
        "Nouveau sur la carte : Paris Kizomba Congress 2026 au Hilton Paris Charles de Gaulle.",

      text_en:
        "New on the map: Paris Kizomba Congress 2026 at Hilton Paris Charles de Gaulle.",

      type:
        "new",

      priority:
        20,

      active:
        true
    },

    {
      id:
        "dance-affinity-news-2026",

      text_fr:
        "Nouveau sur la carte : Dance Affinity Festival, du 30 octobre au 2 novembre 2026 à Fribourg-en-Brisgau.",

      text_en:
        "New on the map: Dance Affinity Festival, from 30 October to 2 November 2026 in Freiburg im Breisgau.",

      type:
        "new",

      priority:
        19,

      active:
        true
    },

    {
      id:
        "demo-news-2",

      text_fr:
        "Les annonces publiées dans l’espace privé apparaissent ici instantanément.",

      text_en:
        "Updates published in the private dashboard appear here instantly.",

      type:
        "info",

      priority:
        10,

      active:
        true
    }
  ];

  hideWelcomeImmediately();

  document.addEventListener(
    "DOMContentLoaded",
    init
  );

  function hideWelcomeImmediately() {
    try {
      const alreadySeen =
        localStorage.getItem(
          "kizomba-atlas-welcome-seen"
        ) === "1";

      if (!alreadySeen) {
        return;
      }

      document.documentElement.classList.add(
        "welcome-already-seen"
      );

      const screen =
        document.getElementById(
          "welcomeScreen"
        );

      if (screen) {
        screen.hidden = true;
        screen.style.display = "none";

        screen.setAttribute(
          "aria-hidden",
          "true"
        );
      }
    } catch (error) {
      console.warn(
        "Kizomba Atlas welcome:",
        error
      );
    }
  }

  async function init() {
    await clearOldCachesOnce();

    bindUI();
    setupWelcomeScreen();
    initMap();
    initInstallPrompt();

    const configured =
      typeof window.isSupabaseConfigured ===
        "function" &&
      window.isSupabaseConfigured();

    if (
      configured &&
      window.supabase &&
      typeof window.supabase.createClient ===
        "function"
    ) {
      state.supabase =
        window.supabase.createClient(
          window
            .KIZOMBA_ATLAS_CONFIG
            .SUPABASE_URL,

          window
            .KIZOMBA_ATLAS_CONFIG
            .SUPABASE_ANON_KEY
        );

      await Promise.all([
        loadEvents(),
        loadNews()
      ]);

      subscribeRealtime();
    } else {
      console.warn(
        "Kizomba Atlas : Supabase non configuré."
      );

      state.events =
        demoEvents;

      state.news =
        demoNews;
    }

    applyFilters(true);
    renderTicker();
    registerServiceWorker();

    window.setTimeout(() => {
      if (!state.map) {
        return;
      }

      state.map.invalidateSize(true);
      fitVisibleEvents();
    }, 300);

    window.setTimeout(() => {
      if (!state.map) {
        return;
      }

      state.map.invalidateSize(true);
      fitVisibleEvents();
    }, 1000);
  }

  async function clearOldCachesOnce() {
    try {
      const savedVersion =
        localStorage.getItem(
          "kizomba-atlas-app-version"
        );

      if (
        savedVersion ===
        APP_VERSION
      ) {
        return;
      }

      if ("caches" in window) {
        const cacheNames =
          await caches.keys();

        await Promise.all(
          cacheNames
            .filter((cacheName) =>
              cacheName
                .toLowerCase()
                .includes(
                  "kizomba-atlas"
                )
            )
            .map((cacheName) =>
              caches.delete(cacheName)
            )
        );
      }

      localStorage.setItem(
        "kizomba-atlas-app-version",
        APP_VERSION
      );
    } catch (error) {
      console.warn(
        "Kizomba Atlas cache:",
        error
      );
    }
  }

  function bindUI() {
    const languageButton =
      document.getElementById(
        "languageButton"
      );

    if (languageButton) {
      languageButton.addEventListener(
        "click",
        () => {
          window
            .KizombaAtlasLanguage
            ?.toggle?.();
        }
      );
    }

    window.addEventListener(
      "kizomba-atlas:languagechange",
      () => {
        applyFilters(false);
        renderTicker();
        updateMapThemeControl();

        if (state.selectedEvent) {
          openEventSheet(
            state.selectedEvent
          );
        }
      }
    );

    const searchInput =
      document.getElementById(
        "searchInput"
      );

    if (searchInput) {
      searchInput.addEventListener(
        "input",
        (event) => {
          state.search =
            event.target.value
              .trim()
              .toLowerCase();

          applyFilters(true);
        }
      );
    }

    document
      .querySelectorAll(
        "#categoryFilters .filter-chip"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            document
              .querySelectorAll(
                "#categoryFilters .filter-chip"
              )
              .forEach((item) => {
                item.classList.remove(
                  "is-active"
                );
              });

            button.classList.add(
              "is-active"
            );

            state.category =
              button.dataset.category;

            applyFilters(true);
          }
        );
      });

    document
      .querySelectorAll(
        "#dateFilters .date-filter"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            document
              .querySelectorAll(
                "#dateFilters .date-filter"
              )
              .forEach((item) => {
                item.classList.remove(
                  "is-active"
                );
              });

            button.classList.add(
              "is-active"
            );

            state.dateFilter =
              button.dataset.dateFilter;

            applyFilters(true);
          }
        );
      });

    document
      .querySelectorAll(
        ".nav-item[data-view]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            switchView(
              button.dataset.view,
              button
            );
          }
        );
      });

    const locateButton =
      document.getElementById(
        "locateButton"
      );

    if (locateButton) {
      locateButton.addEventListener(
        "click",
        locateUser
      );
    }

    const mapThemeButton =
      document.getElementById(
        "mapThemeButton"
      );

    if (mapThemeButton) {
      mapThemeButton.addEventListener(
        "click",
        cycleMapTheme
      );
    }

    const recenterButton =
      document.getElementById(
        "recenterButton"
      );

    if (recenterButton) {
      recenterButton.addEventListener(
        "click",
        fitVisibleEvents
      );
    }

    const closeSheetButton =
      document.getElementById(
        "closeSheetButton"
      );

    if (closeSheetButton) {
      closeSheetButton.addEventListener(
        "click",
        closeEventSheet
      );
    }

    const sheetBackdrop =
      document.getElementById(
        "eventSheetBackdrop"
      );

    if (sheetBackdrop) {
      sheetBackdrop.addEventListener(
        "click",
        closeEventSheet
      );
    }
  }

  function setupWelcomeScreen() {
    const screen =
      document.getElementById(
        "welcomeScreen"
      );

    const button =
      document.getElementById(
        "openMapButton"
      );

    if (!screen || !button) {
      return;
    }

    let alreadySeen = false;

    try {
      alreadySeen =
        localStorage.getItem(
          "kizomba-atlas-welcome-seen"
        ) === "1";
    } catch {
      alreadySeen = false;
    }

    if (alreadySeen) {
      screen.hidden = true;
      screen.style.display = "none";

      screen.setAttribute(
        "aria-hidden",
        "true"
      );

      document.documentElement
        .classList
        .add(
          "welcome-already-seen"
        );

      return;
    }

    button.addEventListener(
      "click",
      () => {
        try {
          localStorage.setItem(
            "kizomba-atlas-welcome-seen",
            "1"
          );
        } catch (error) {
          console.warn(error);
        }

        screen.classList.add(
          "is-closing"
        );

        window.setTimeout(() => {
          screen.hidden = true;
          screen.style.display = "none";

          screen.setAttribute(
            "aria-hidden",
            "true"
          );

          document.documentElement
            .classList
            .add(
              "welcome-already-seen"
            );

          if (state.map) {
            state.map.invalidateSize(
              true
            );

            fitVisibleEvents();
          }
        }, 420);
      }
    );
  }

  function initMap() {
    const mapElement =
      document.getElementById(
        "map"
      );

    if (
      !mapElement ||
      !window.L
    ) {
      console.error(
        "Kizomba Atlas : Leaflet indisponible."
      );

      return;
    }

    const config =
      window.KIZOMBA_ATLAS_CONFIG || {};

    const defaultCenter =
      Array.isArray(
        config.DEFAULT_MAP_CENTER
      )
        ? config.DEFAULT_MAP_CENTER
        : [48.25, 3.05];

    const defaultZoom =
      Number.isFinite(
        Number(
          config.DEFAULT_MAP_ZOOM
        )
      )
        ? Number(
            config.DEFAULT_MAP_ZOOM
          )
        : 5.35;

    state.mapTheme =
      "light";

    try {
      localStorage.setItem(
        "kizomba-atlas-map-theme",
        "light"
      );
    } catch (error) {
      console.warn(error);
    }

    mapElement.dataset.mapTheme =
      "light";

    mapElement.style.background =
      "#e8edf2";

    try {
      state.map = L.map(
        "map",
        {
          zoomControl: true,
          attributionControl: true,
          preferCanvas: true,
          minZoom: 2,
          worldCopyJump: true
        }
      ).setView(
        defaultCenter,
        defaultZoom
      );

      state.map
        .attributionControl
        .setPrefix(false);

      setBaseMap("light");

      state.markerLayer =
        typeof L.markerClusterGroup ===
        "function"
          ? L.markerClusterGroup({
              showCoverageOnHover:
                false,

              zoomToBoundsOnClick:
                true,

              spiderfyOnMaxZoom:
                true,

              removeOutsideVisibleBounds:
                true,

              maxClusterRadius:
                48
            })
          : L.layerGroup();

      state.map.addLayer(
        state.markerLayer
      );

      updateMapThemeControl();

      window.setTimeout(() => {
        state.map?.invalidateSize(
          true
        );
      }, 100);

      window.setTimeout(() => {
        state.map?.invalidateSize(
          true
        );
      }, 500);
    } catch (error) {
      console.error(
        "Initialisation de la carte impossible :",
        error
      );

      showMapStatus(
        "Carte indisponible"
      );
    }
  }

  function setBaseMap(theme) {
    if (!state.map) {
      return;
    }

    if (state.tileLayer) {
      try {
        state.map.removeLayer(
          state.tileLayer
        );
      } catch (error) {
        console.warn(error);
      }

      state.tileLayer = null;
    }

    const realTheme =
      effectiveMapTheme(theme);

    const mapElement =
      document.getElementById(
        "map"
      );

    if (mapElement) {
      mapElement.style.background =
        realTheme === "dark"
          ? "#20242b"
          : "#e8edf2";
    }

    const cartoStyle =
      realTheme === "dark"
        ? "dark_all"
        : "light_all";

    const cartoUrl =
      `https://{s}.basemaps.cartocdn.com/${cartoStyle}/{z}/{x}/{y}{r}.png`;

    let tileErrors = 0;
    let fallbackActivated = false;

    const primaryLayer =
      L.tileLayer(
        cartoUrl,
        {
          subdomains:
            "abcd",

          maxZoom:
            20,

          minZoom:
            2,

          detectRetina:
            true,

          updateWhenIdle:
            true,

          keepBuffer:
            4,

          attribution:
            "&copy; OpenStreetMap contributors &copy; CARTO"
        }
      );

    primaryLayer.on(
      "tileload",
      () => {
        tileErrors = 0;
      }
    );

    primaryLayer.on(
      "tileerror",
      () => {
        tileErrors += 1;

        if (
          tileErrors >= 4 &&
          !fallbackActivated
        ) {
          fallbackActivated = true;

          activateFallbackMap(
            primaryLayer
          );
        }
      }
    );

    state.tileLayer =
      primaryLayer;

    primaryLayer.addTo(
      state.map
    );

    window.setTimeout(() => {
      if (
        tileErrors >= 4 &&
        !fallbackActivated
      ) {
        fallbackActivated = true;

        activateFallbackMap(
          primaryLayer
        );
      }
    }, 4500);
  }

  function activateFallbackMap(
    oldLayer
  ) {
    if (!state.map) {
      return;
    }

    try {
      if (
        oldLayer &&
        state.map.hasLayer(
          oldLayer
        )
      ) {
        state.map.removeLayer(
          oldLayer
        );
      }
    } catch (error) {
      console.warn(error);
    }

    const fallbackLayer =
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",

        {
          maxZoom:
            19,

          minZoom:
            2,

          updateWhenIdle:
            true,

          keepBuffer:
            4,

          attribution:
            "Tiles &copy; Esri"
        }
      );

    state.tileLayer =
      fallbackLayer;

    fallbackLayer.addTo(
      state.map
    );

    const mapElement =
      document.getElementById(
        "map"
      );

    if (mapElement) {
      mapElement.style.background =
        "#e8edf2";
    }

    showMapStatus(
      "Carte de secours activée"
    );
  }

  async function loadEvents() {
    if (!state.supabase) {
      return;
    }

    const { data, error } =
      await state.supabase
        .from("events")
        .select("*")
        .eq(
          "status",
          "published"
        )
        .order(
          "starts_at",
          {
            ascending: true
          }
        );

    if (error) {
      console.error(
        "Kizomba Atlas events:",
        error
      );

      showMapStatus(
        "Erreur de chargement"
      );

      return;
    }

    state.events =
      Array.isArray(data)
        ? data
        : [];
  }

  async function loadNews() {
    if (!state.supabase) {
      return;
    }

    const { data, error } =
      await state.supabase
        .from("live_news")
        .select("*")
        .eq(
          "active",
          true
        )
        .order(
          "priority",
          {
            ascending: false
          }
        )
        .order(
          "created_at",
          {
            ascending: false
          }
        );

    if (error) {
      console.warn(
        "Kizomba Atlas news:",
        error
      );

      state.news = [];

      return;
    }

    state.news =
      (data || []).filter(
        isNewsCurrentlyVisible
      );
  }

  function subscribeRealtime() {
    if (!state.supabase) {
      return;
    }

    state.supabase
      .channel(
        "kizomba-atlas-public"
      )

      .on(
        "postgres_changes",

        {
          event: "*",
          schema: "public",
          table: "events"
        },

        async () => {
          await loadEvents();
          applyFilters();
        }
      )

      .on(
        "postgres_changes",

        {
          event: "*",
          schema: "public",
          table: "live_news"
        },

        async () => {
          await loadNews();
          renderTicker();
        }
      )

      .subscribe();
  }

  function isNewsCurrentlyVisible(
    item
  ) {
    const now = Date.now();

    if (!item.active) {
      return false;
    }

    if (
      item.starts_at &&
      new Date(
        item.starts_at
      ).getTime() > now
    ) {
      return false;
    }

    if (
      item.ends_at &&
      new Date(
        item.ends_at
      ).getTime() < now
    ) {
      return false;
    }

    return true;
  }

  function applyFilters(
    shouldFit = false
  ) {
    const now = new Date();

    state.filteredEvents =
      state.events.filter(
        (event) => {
          if (
            event.status &&
            event.status !==
              "published"
          ) {
            return false;
          }

          const categoryMatch =
            eventMatchesFilter(
              event,
              state.category
            );

          const searchable = [
            localText(
              event,
              "title"
            ),

            localText(
              event,
              "description"
            ),

            event.organizer_name,
            event.venue_name,
            event.address,
            event.city,
            event.country
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          const searchMatch =
            !state.search ||
            searchable.includes(
              state.search
            );

          const dateMatch =
            matchesDateFilter(
              event,
              state.dateFilter,
              now
            );

          return (
            categoryMatch &&
            searchMatch &&
            dateMatch
          );
        }
      );

    renderMarkers();
    renderEventList();
    renderFavorites();

    const eventCount =
      document.getElementById(
        "eventCount"
      );

    if (eventCount) {
      eventCount.textContent =
        String(
          state
            .filteredEvents
            .length
        );
    }

    showMapStatus(
      t(
        "mapEvents",
        {
          count:
            state
              .filteredEvents
              .length
        }
      )
    );

    if (shouldFit) {
      window.setTimeout(
        fitVisibleEvents,
        180
      );
    }
  }

  function matchesDateFilter(
    event,
    filter,
    now
  ) {
    if (filter === "all") {
      return true;
    }

    const start =
      new Date(
        event.starts_at
      );

    if (
      Number.isNaN(
        start.getTime()
      )
    ) {
      return false;
    }

    if (
      filter === "today"
    ) {
      return (
        start.toDateString() ===
        now.toDateString()
      );
    }

    if (
      filter === "weekend"
    ) {
      const weekendStart =
        new Date(now);

      const day =
        now.getDay();

      const daysUntilSaturday =
        (6 - day + 7) % 7;

      weekendStart.setDate(
        now.getDate() +
          daysUntilSaturday
      );

      weekendStart.setHours(
        0,
        0,
        0,
        0
      );

      const weekendEnd =
        new Date(
          weekendStart
        );

      weekendEnd.setDate(
        weekendStart.getDate() +
          2
      );

      weekendEnd.setHours(
        23,
        59,
        59,
        999
      );

      return (
        start >= weekendStart &&
        start <= weekendEnd
      );
    }

    return true;
  }

  function renderMarkers() {
    if (!state.markerLayer) {
      return;
    }

    state.markerLayer.clearLayers();

    state.filteredEvents.forEach(
      (event) => {
        const lat =
          Number(
            event.latitude
          );

        const lng =
          Number(
            event.longitude
          );

        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lng)
        ) {
          return;
        }

        const style =
          markerStyle(event);

        const hasLogo =
          isSafeHttpUrl(
            event.logo_url
          );

        const face =
          hasLogo
            ? `
              <img
                src="${escapeAttribute(
                  event.logo_url
                )}"
                alt=""
                loading="lazy"
                referrerpolicy="no-referrer"
              />
            `
            : `
              <span>
                ${escapeHTML(
                  shortCategory(
                    event.category
                  )
                )}
              </span>
            `;

        const badge =
          hasLogo &&
          event.category !==
            "party"
            ? `
              <b>
                ${escapeHTML(
                  event.category ===
                    "festival"
                    ? "F"
                    : "W"
                )}
              </b>
            `
            : "";

        const marker =
          L.marker(
            [lat, lng],
            {
              icon:
                L.divIcon({
                  className:
                    "",

                  html: `
                    <div
                      class="kiz-marker${hasLogo ? " has-logo" : ""}"
                      data-style="${escapeAttribute(style)}"
                      data-type="${escapeAttribute(event.category || "party")}"
                    >
                      <div class="marker-face">
                        ${face}
                      </div>

                      ${badge}
                    </div>
                  `,

                  iconSize:
                    [48, 52],

                  iconAnchor:
                    [24, 47]
                }),

              title:
                localText(
                  event,
                  "title"
                )
            }
          );

        marker.on(
          "click",
          () => {
            openEventSheet(
              event
            );
          }
        );

        state.markerLayer.addLayer(
          marker
        );
      }
    );
  }

  function renderEventList() {
    const container =
      document.getElementById(
        "eventList"
      );

    if (!container) {
      return;
    }

    if (
      !state.filteredEvents.length
    ) {
      container.innerHTML = `
        <div class="empty-state">
          ${escapeHTML(
            t("noEvents")
          )}
        </div>
      `;

      return;
    }

    container.innerHTML = "";

    state.filteredEvents.forEach(
      (event) => {
        container.appendChild(
          createEventCard(event)
        );
      }
    );
  }

  function renderFavorites() {
    const container =
      document.getElementById(
        "favoritesList"
      );

    if (!container) {
      return;
    }

    const favorites =
      state.events.filter(
        (event) =>
          state.favorites.has(
            String(event.id)
          )
      );

    if (!favorites.length) {
      container.innerHTML = `
        <div class="empty-state">
          ${escapeHTML(
            t("noFavorites")
          )}
        </div>
      `;

      return;
    }

    container.innerHTML = "";

    favorites.forEach(
      (event) => {
        container.appendChild(
          createEventCard(event)
        );
      }
    );
  }

  function createEventCard(event) {
    const card =
      document.createElement(
        "article"
      );

    card.className =
      "event-card";

    card.tabIndex = 0;

    card.setAttribute(
      "role",
      "button"
    );

    const media =
      document.createElement(
        "div"
      );

    media.className =
      "event-card-media";

    if (
      isSafeHttpUrl(
        event.image_url
      )
    ) {
      const image =
        document.createElement(
          "img"
        );

      image.src =
        event.image_url;

      image.alt = "";

      image.loading =
        "lazy";

      media.appendChild(
        image
      );
    }

    const category =
      document.createElement(
        "span"
      );

    category.className =
      "event-card-category";

    category.textContent =
      eventTypeLabel(
        event.category
      );

    media.appendChild(
      category
    );

    const body =
      document.createElement(
        "div"
      );

    body.className =
      "event-card-body";

    const title =
      document.createElement(
        "h2"
      );

    title.textContent =
      localText(
        event,
        "title"
      ) ||
      "Kizomba Atlas Event";

    const meta =
      document.createElement(
        "div"
      );

    meta.className =
      "event-meta";

    const date =
      document.createElement(
        "span"
      );

    date.textContent =
      `◷ ${formatDate(
        event.starts_at
      )}`;

    const place =
      document.createElement(
        "span"
      );

    place.textContent =
      `⌖ ${
        event.venue_name ||
        event.city ||
        ""
      }`;

    const address =
      document.createElement(
        "span"
      );

    address.textContent =
      event.city &&
      event.country
        ? `${event.city}, ${event.country}`
        : event.address || "";

    meta.append(
      date,
      place,
      address
    );

    const styleTags =
      createStyleTags(
        event
      );

    const favorite =
      document.createElement(
        "button"
      );

    favorite.className =
      "favorite-inline";

    favorite.type =
      "button";

    favorite.textContent =
      state.favorites.has(
        String(event.id)
      )
        ? `♥ ${t("removeFavorite")}`
        : `♡ ${t("addFavorite")}`;

    favorite.addEventListener(
      "click",
      (clickEvent) => {
        clickEvent.stopPropagation();

        toggleFavorite(
          event.id
        );
      }
    );

    body.append(
      title,
      meta
    );

    if (styleTags) {
      body.appendChild(
        styleTags
      );
    }

    body.appendChild(
      favorite
    );

    card.append(
      media,
      body
    );

    card.addEventListener(
      "click",
      () => {
        openEventSheet(
          event
        );
      }
    );

    card.addEventListener(
      "keydown",
      (keyboardEvent) => {
        if (
          keyboardEvent.key ===
            "Enter" ||
          keyboardEvent.key ===
            " "
        ) {
          openEventSheet(
            event
          );
        }
      }
    );

    return card;
  }

  function openEventSheet(event) {
    state.selectedEvent =
      event;

    const content =
      document.getElementById(
        "eventSheetContent"
      );

    if (!content) {
      return;
    }

    content.innerHTML = "";

    const cover =
      document.createElement(
        "div"
      );

    if (
      isSafeHttpUrl(
        event.image_url
      )
    ) {
      const image =
        document.createElement(
          "img"
        );

      image.className =
        "sheet-cover";

      image.src =
        event.image_url;

      image.alt = "";

      cover.appendChild(
        image
      );
    } else {
      const placeholder =
        document.createElement(
          "div"
        );

      placeholder.className =
        "sheet-cover";

      cover.appendChild(
        placeholder
      );
    }

    const category =
      document.createElement(
        "div"
      );

    category.className =
      "sheet-category";

    category.textContent =
      eventLabelLine(
        event
      );

    const title =
      document.createElement(
        "h2"
      );

    title.className =
      "sheet-title";

    title.id =
      "sheetTitle";

    title.textContent =
      localText(
        event,
        "title"
      ) ||
      "Kizomba Atlas Event";

    const description =
      document.createElement(
        "p"
      );

    description.className =
      "sheet-description";

    description.textContent =
      localText(
        event,
        "description"
      ) || "";

    const details =
      document.createElement(
        "div"
      );

    details.className =
      "detail-grid";

    details.append(
      detailRow(
        "◷",
        t("dateAndTime"),
        formatDateRange(
          event.starts_at,
          event.ends_at
        )
      ),

      detailRow(
        "⌖",
        t("exactAddress"),
        [
          event.venue_name,
          event.address,
          event.city,
          event.country
        ]
          .filter(Boolean)
          .join(" — ")
      ),

      detailRow(
        "◎",
        t("organizer"),
        event.organizer_name ||
          "Kizomba Atlas"
      ),

      detailRow(
        "€",
        t("price"),
        localText(
          event,
          "price_text"
        ) ||
          t("freeOrUnknown")
      )
    );

    const actions =
      document.createElement(
        "div"
      );

    actions.className =
      "sheet-actions";

    const directions =
      actionLink(
        t("directions"),
        googleMapsUrl(event),
        "primary-button"
      );

    const waze =
      actionLink(
        t("openWaze"),
        wazeUrl(event),
        "secondary-button"
      );

    actions.append(
      directions,
      waze
    );

    if (
      isSafeHttpUrl(
        event.ticket_url
      )
    ) {
      actions.append(
        actionLink(
          t("tickets"),
          event.ticket_url,
          "secondary-button"
        )
      );
    }

    const share =
      document.createElement(
        "button"
      );

    share.className =
      "secondary-button";

    share.type =
      "button";

    share.textContent =
      t("share");

    share.addEventListener(
      "click",
      () => {
        shareEvent(event);
      }
    );

    actions.appendChild(
      share
    );

    const favorite =
      document.createElement(
        "button"
      );

    favorite.className =
      "secondary-button full-width";

    favorite.type =
      "button";

    favorite.textContent =
      state.favorites.has(
        String(event.id)
      )
        ? `♥ ${t("removeFavorite")}`
        : `♡ ${t("addFavorite")}`;

    favorite.addEventListener(
      "click",
      () => {
        toggleFavorite(
          event.id
        );

        openEventSheet(
          event
        );
      }
    );

    content.append(
      cover,
      category,
      title
    );

    if (
      description.textContent
    ) {
      content.appendChild(
        description
      );
    }

    content.append(
      details,
      actions,
      favorite
    );

    const backdrop =
      document.getElementById(
        "eventSheetBackdrop"
      );

    const sheet =
      document.getElementById(
        "eventSheet"
      );

    if (backdrop) {
      backdrop.hidden =
        false;
    }

    if (sheet) {
      sheet.hidden =
        false;
    }

    document.body.style.overflow =
      "hidden";
  }

  function closeEventSheet() {
    const backdrop =
      document.getElementById(
        "eventSheetBackdrop"
      );

    const sheet =
      document.getElementById(
        "eventSheet"
      );

    if (backdrop) {
      backdrop.hidden =
        true;
    }

    if (sheet) {
      sheet.hidden =
        true;
    }

    document.body.style.overflow =
      "";

    state.selectedEvent =
      null;
  }

  function detailRow(
    icon,
    label,
    value
  ) {
    const row =
      document.createElement(
        "div"
      );

    row.className =
      "detail-row";

    row.innerHTML = `
      <div aria-hidden="true">
        ${escapeHTML(icon)}
      </div>

      <div>
        <strong>
          ${escapeHTML(label)}
        </strong>

        <span>
          ${escapeHTML(value || "—")}
        </span>
      </div>
    `;

    return row;
  }

  function actionLink(
    label,
    url,
    className
  ) {
    const anchor =
      document.createElement(
        "a"
      );

    anchor.className =
      className;

    anchor.href =
      url;

    anchor.target =
      "_blank";

    anchor.rel =
      "noopener noreferrer";

    anchor.textContent =
      label;

    anchor.style.display =
      "grid";

    anchor.style.placeItems =
      "center";

    return anchor;
  }

  function toggleFavorite(id) {
    const key =
      String(id);

    if (
      state.favorites.has(key)
    ) {
      state.favorites.delete(
        key
      );
    } else {
      state.favorites.add(
        key
      );
    }

    try {
      localStorage.setItem(
        "kizomba-atlas-favorites",
        JSON.stringify(
          [
            ...state.favorites
          ]
        )
      );
    } catch (error) {
      console.warn(error);
    }

    renderEventList();
    renderFavorites();
  }

  function renderTicker() {
    const track =
      document.getElementById(
        "tickerTrack"
      );

    if (!track) {
      return;
    }

    const visibleNews =
      state.news.filter(
        isNewsCurrentlyVisible
      );

    if (
      !visibleNews.length
    ) {
      track.innerHTML = `
        <span class="ticker-item">
          ${escapeHTML(
            t("noData")
          )}
        </span>
      `;

      return;
    }

    const doubled = [
      ...visibleNews,
      ...visibleNews
    ];

    track.innerHTML =
      doubled
        .map((item) => {
          const language =
            window
              .KizombaAtlasLanguage
              ?.current ||
            "fr";

          const text =
            language === "fr"
              ? item.text_fr
              : item.text_en;

          return `
            <span
              class="ticker-item"
              data-type="${escapeAttribute(item.type || "info")}"
            >
              ${escapeHTML(
                text ||
                item.text_fr ||
                item.text_en ||
                ""
              )}
            </span>
          `;
        })
        .join("");
  }

  function switchView(
    viewId,
    activeButton
  ) {
    document
      .querySelectorAll(
        ".view-panel"
      )
      .forEach((panel) => {
        panel.classList.remove(
          "is-active"
        );
      });

    document
      .querySelectorAll(
        ".nav-item"
      )
      .forEach((button) => {
        button.classList.remove(
          "is-active"
        );
      });

    const targetPanel =
      document.getElementById(
        viewId
      );

    if (!targetPanel) {
      return;
    }

    targetPanel.classList.add(
      "is-active"
    );

    activeButton?.classList.add(
      "is-active"
    );

    targetPanel.scrollTop = 0;

    if (
      viewId === "mapView"
    ) {
      window.setTimeout(() => {
        if (!state.map) {
          return;
        }

        state.map.invalidateSize(
          true
        );

        fitVisibleEvents();
      }, 100);
    }
  }

  function locateUser() {
    if (
      !navigator.geolocation
    ) {
      showMapStatus(
        t("locationUnavailable")
      );

      return;
    }

    if (!state.map) {
      showMapStatus(
        "Carte indisponible"
      );

      return;
    }

    navigator.geolocation
      .getCurrentPosition(
        (position) => {
          const latlng = [
            position.coords.latitude,
            position.coords.longitude
          ];

          if (
            state.userMarker
          ) {
            state.userMarker.remove();
          }

          state.userMarker =
            L.circleMarker(
              latlng,
              {
                radius:
                  8,

                color:
                  "#ffffff",

                weight:
                  3,

                fillColor:
                  "#45d4a4",

                fillOpacity:
                  1
              }
            ).addTo(
              state.map
            );

          state.map.setView(
            latlng,
            12
          );

          showMapStatus(
            t("locationFound")
          );
        },

        () => {
          showMapStatus(
            t(
              "locationUnavailable"
            )
          );
        },

        {
          enableHighAccuracy:
            true,

          timeout:
            12000,

          maximumAge:
            60000
        }
      );
  }

  function fitVisibleEvents() {
    if (!state.map) {
      return;
    }

    const points =
      state.filteredEvents
        .map((event) => [
          Number(
            event.latitude
          ),

          Number(
            event.longitude
          )
        ])

        .filter(
          ([lat, lng]) =>
            Number.isFinite(lat) &&
            Number.isFinite(lng)
        );

    state.map.invalidateSize(
      true
    );

    const config =
      window.KIZOMBA_ATLAS_CONFIG ||
      {};

    const defaultCenter =
      Array.isArray(
        config.DEFAULT_MAP_CENTER
      )
        ? config.DEFAULT_MAP_CENTER
        : [48.25, 3.05];

    const defaultZoom =
      Number.isFinite(
        Number(
          config.DEFAULT_MAP_ZOOM
        )
      )
        ? Number(
            config.DEFAULT_MAP_ZOOM
          )
        : 5.35;

    if (!points.length) {
      state.map.setView(
        defaultCenter,
        defaultZoom
      );

      return;
    }

    if (
      points.length === 1
    ) {
      state.map.setView(
        points[0],
        12,
        {
          animate:
            true
        }
      );

      state.map.panBy(
        [0, -60],
        {
          animate:
            true
        }
      );

      return;
    }

    state.map.fitBounds(
      points,
      {
        paddingTopLeft:
          [54, 96],

        paddingBottomRight:
          [54, 80],

        maxZoom:
          12,

        animate:
          true
      }
    );
  }

  function showMapStatus(message) {
    const element =
      document.getElementById(
        "mapStatus"
      );

    if (!element) {
      return;
    }

    element.textContent =
      message;

    element.classList.add(
      "is-visible"
    );

    window.clearTimeout(
      showMapStatus.timeout
    );

    showMapStatus.timeout =
      window.setTimeout(
        () => {
          element.classList.remove(
            "is-visible"
          );
        },
        2400
      );
  }

  function localText(
    event,
    field
  ) {
    const language =
      window
        .KizombaAtlasLanguage
        ?.current ||
      "fr";

    return (
      event[
        `${field}_${language}`
      ] ||

      event[
        `${field}_fr`
      ] ||

      event[
        `${field}_en`
      ] ||

      ""
    );
  }

  function normalizedStyles(
    event
  ) {
    if (
      Array.isArray(
        event.styles
      )
    ) {
      return event.styles.filter(
        Boolean
      );
    }

    if (
      typeof event.styles ===
      "string"
    ) {
      return event.styles
        .replace(
          /[{}]/g,
          ""
        )

        .split(",")

        .map((item) =>
          item
            .trim()
            .replace(
              /^"|"$/g,
              ""
            )
        )

        .filter(Boolean);
    }

    if (
      [
        "kizomba",
        "urban-kiz",
        "bachata",
        "sbk",
        "semba",
        "tarraxo"
      ].includes(
        event.category
      )
    ) {
      return [
        event.category
      ];
    }

    return [];
  }

  function eventMatchesFilter(
    event,
    filter
  ) {
    if (
      filter === "all"
    ) {
      return true;
    }

    if (
      [
        "festival",
        "workshop"
      ].includes(filter)
    ) {
      return (
        event.category ===
        filter
      );
    }

    return normalizedStyles(
      event
    ).includes(filter);
  }

  function styleLabel(style) {
    return (
      {
        "kizomba":
          "Kizomba",

        "urban-kiz":
          "Urban Kiz",

        "bachata":
          "Bachata",

        "sbk":
          "SBK",

        "semba":
          "Semba",

        "tarraxo":
          "Tarraxo"
      }[style] ||
      style
    );
  }

  function eventTypeLabel(
    category
  ) {
    return (
      {
        "party":
          t("party"),

        "festival":
          t("festival"),

        "workshop":
          t("workshop"),

        "kizomba":
          "Kizomba",

        "urban-kiz":
          "Urban Kiz",

        "bachata":
          "Bachata",

        "sbk":
          "SBK",

        "semba":
          "Semba",

        "tarraxo":
          "Tarraxo"
      }[category] ||
      t("party")
    );
  }

  function eventLabelLine(event) {
    const labels = [
      eventTypeLabel(
        event.category
      ),

      ...normalizedStyles(
        event
      ).map(
        styleLabel
      )
    ];

    return [
      ...new Set(
        labels.filter(
          Boolean
        )
      )
    ].join(" · ");
  }

  function createStyleTags(event) {
    const styles =
      normalizedStyles(
        event
      );

    if (!styles.length) {
      return null;
    }

    const container =
      document.createElement(
        "div"
      );

    container.className =
      "event-style-tags";

    styles
      .slice(0, 4)
      .forEach((style) => {
        const tag =
          document.createElement(
            "span"
          );

        tag.dataset.style =
          style;

        tag.textContent =
          styleLabel(style);

        container.appendChild(
          tag
        );
      });

    return container;
  }

  function markerStyle(event) {
    const allowed = [
      "kizomba",
      "urban-kiz",
      "bachata",
      "sbk",
      "semba",
      "tarraxo"
    ];

    if (
      allowed.includes(
        event.map_style
      )
    ) {
      return event.map_style;
    }

    const styles =
      normalizedStyles(
        event
      );

    if (
      styles.includes(
        "sbk"
      ) &&
      styles.length > 1
    ) {
      return "sbk";
    }

    return (
      styles.find(
        (style) =>
          allowed.includes(
            style
          )
      ) ||
      "kizomba"
    );
  }

  function effectiveMapTheme(theme) {
    if (
      theme === "auto"
    ) {
      return window
        .matchMedia?.(
          "(prefers-color-scheme: dark)"
        )
        ?.matches
        ? "dark"
        : "light";
    }

    return theme === "dark"
      ? "dark"
      : "light";
  }

  function applyMapTheme(
    theme,
    persist = true
  ) {
    state.mapTheme =
      [
        "light",
        "dark",
        "auto"
      ].includes(theme)
        ? theme
        : "light";

    if (persist) {
      try {
        localStorage.setItem(
          "kizomba-atlas-map-theme",
          state.mapTheme
        );
      } catch (error) {
        console.warn(error);
      }
    }

    const mapElement =
      document.getElementById(
        "map"
      );

    if (mapElement) {
      mapElement.dataset.mapTheme =
        effectiveMapTheme(
          state.mapTheme
        );
    }

    if (state.map) {
      setBaseMap(
        state.mapTheme
      );
    }

    updateMapThemeControl();
  }

  function cycleMapTheme() {
    const order = [
      "light",
      "dark",
      "auto"
    ];

    const index =
      order.indexOf(
        state.mapTheme
      );

    const next =
      order[
        (index + 1) %
          order.length
      ];

    applyMapTheme(next);
  }

  function updateMapThemeControl() {
    const icon =
      document.getElementById(
        "mapThemeIcon"
      );

    const label =
      document.getElementById(
        "mapThemeLabel"
      );

    if (
      !icon ||
      !label
    ) {
      return;
    }

    const settings = {
      light: {
        icon: "☀",
        key: "mapLight"
      },

      dark: {
        icon: "☾",
        key: "mapDark"
      },

      auto: {
        icon: "◐",
        key: "mapAuto"
      }
    };

    const selected =
      settings[
        state.mapTheme
      ] ||
      settings.light;

    icon.textContent =
      selected.icon;

    label.textContent =
      t(selected.key);
  }

  function shortCategory(category) {
    const labels = {
      "party":
        "KIZ",

      "kizomba":
        "KIZ",

      "urban-kiz":
        "UK",

      "bachata":
        "BACH",

      "sbk":
        "SBK",

      "semba":
        "SEM",

      "tarraxo":
        "TRX",

      "festival":
        "FEST",

      "workshop":
        "WK"
    };

    return (
      labels[category] ||
      "KIZ"
    );
  }

  function formatDate(value) {
    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "";
    }

    const language =
      window
        .KizombaAtlasLanguage
        ?.current ||
      "fr";

    return new Intl.DateTimeFormat(
      language === "fr"
        ? "fr-FR"
        : "en-GB",

      {
        weekday:
          "short",

        day:
          "numeric",

        month:
          "short",

        hour:
          "2-digit",

        minute:
          "2-digit"
      }
    ).format(date);
  }

  function formatDateRange(
    startValue,
    endValue
  ) {
    const start =
      formatDate(
        startValue
      );

    if (!endValue) {
      return start;
    }

    const end =
      formatDate(
        endValue
      );

    return `${start} → ${end}`;
  }

  function googleMapsUrl(event) {
    return (
      "https://www.google.com/maps/dir/?api=1&destination=" +
      encodeURIComponent(
        `${event.latitude},${event.longitude}`
      )
    );
  }

  function wazeUrl(event) {
    return (
      "https://www.waze.com/ul?ll=" +
      encodeURIComponent(
        `${event.latitude},${event.longitude}`
      ) +
      "&navigate=yes"
    );
  }

  async function shareEvent(event) {
    const data = {
      title:
        localText(
          event,
          "title"
        ),

      text:
        `${t("shareText")} — ${
          event.venue_name ||
          event.city ||
          ""
        }`,

      url:
        googleMapsUrl(
          event
        )
    };

    try {
      if (navigator.share) {
        await navigator.share(
          data
        );
      } else {
        await navigator.clipboard.writeText(
          `${data.title}\n${data.text}\n${data.url}`
        );

        showMapStatus(
          "Lien copié"
        );
      }
    } catch (error) {
      if (
        error?.name !==
        "AbortError"
      ) {
        console.error(error);
      }
    }
  }

  function initInstallPrompt() {
    const button =
      document.getElementById(
        "installButton"
      );

    if (!button) {
      return;
    }

    window.addEventListener(
      "beforeinstallprompt",
      (event) => {
        event.preventDefault();

        state.deferredInstallPrompt =
          event;

        button.classList.remove(
          "is-hidden"
        );
      }
    );

    button.addEventListener(
      "click",
      async () => {
        if (
          !state.deferredInstallPrompt
        ) {
          return;
        }

        state.deferredInstallPrompt.prompt();

        await state
          .deferredInstallPrompt
          .userChoice;

        state.deferredInstallPrompt =
          null;

        button.classList.add(
          "is-hidden"
        );
      }
    );
  }

  function registerServiceWorker() {
    if (
      "serviceWorker" in
      navigator
    ) {
      navigator.serviceWorker
        .register(
          `./sw.js?v=${APP_VERSION}`
        )
        .catch((error) => {
          console.warn(
            "SW:",
            error
          );
        });
    }
  }

  function isSafeHttpUrl(value) {
    if (!value) {
      return false;
    }

    try {
      const url =
        new URL(value);

      return (
        url.protocol ===
          "https:" ||
        url.protocol ===
          "http:"
      );
    } catch {
      return false;
    }
  }

  function escapeHTML(value) {
    return String(
      value ?? ""
    )
      .replaceAll(
        "&",
        "&amp;"
      )

      .replaceAll(
        "<",
        "&lt;"
      )

      .replaceAll(
        ">",
        "&gt;"
      )

      .replaceAll(
        '"',
        "&quot;"
      )

      .replaceAll(
        "'",
        "&#039;"
      );
  }

  function escapeAttribute(value) {
    return escapeHTML(
      value
    ).replaceAll(
      "`",
      "&#096;"
    );
  }
})();
