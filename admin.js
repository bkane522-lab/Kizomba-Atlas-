(() => {
  "use strict";

  let ADMIN_EMAIL = "kizombaatlas.contact@gmail.com";

  /* Tags secondaires. Jamais des filtres publics. */
  const COURSE_TAGS = {
    "kizomba-traditionnelle": "Kizomba traditionnelle",
    "urban-kiz": "Urban Kiz",
    "tango-kiz": "Tango Kiz",
    "kiz-fusion": "Kiz Fusion",
    "semba": "Semba",
    "musicalite": "Musicalité",
    "men-styling": "Men Styling",
    "lady-styling": "Lady Styling",
    "cours-individuel": "Cours individuel",
    "cours-couple": "Cours en couple",
    "cours-collectif": "Cours collectif"
  };

  const state = {
    supabase: null,
    session: null,
    map: null,
    marker: null,
    events: [],
    news: [],
    discoveryCandidates: [],
    discoveryFilter: "new",
    autopilotQueue: [],
    autopilotSettings: null,
    autopilotEditingId: null,
    instagramAccount: null,
    filter: "pending",
    search: "",
    channel: null,
    deferredInstallPrompt: null
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindUI();
    handleInstagramOAuthReturn();
    initMap();
    initAdminInstall();
    registerAdminServiceWorker();

    if (typeof window.loadKizombaAtlasConfig === "function") {
      await window.loadKizombaAtlasConfig();
    }

    ADMIN_EMAIL = window.KIZOMBA_ATLAS_CONFIG?.ADMIN_EMAIL || ADMIN_EMAIL;
    byId("loginEmail").value = ADMIN_EMAIL;

    if (!window.isSupabaseConfigured()) {
      byId("setupNotice").classList.remove("is-hidden");
      byId("loginPanel").classList.add("is-hidden");
      return;
    }

    state.supabase = window.supabase.createClient(
      window.KIZOMBA_ATLAS_CONFIG.SUPABASE_URL,
      window.KIZOMBA_ATLAS_CONFIG.SUPABASE_ANON_KEY
    );

    const { data } = await state.supabase.auth.getSession();
    state.session = data.session;

    state.supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      updateAuthUI();
    });

    await updateAuthUI();
  }

  function bindUI() {
    byId("loginForm").addEventListener("submit", login);
    byId("logoutButton").addEventListener("click", logout);
    byId("eventForm").addEventListener("submit", saveEvent);
    byId("resetEventButton").addEventListener("click", resetEventForm);
    byId("refreshEventsButton").addEventListener("click", loadEvents);
    byId("refreshDiscoveryButton")?.addEventListener("click", loadDiscoveryCandidates);

    document.querySelectorAll(".admin-discovery-filter").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".admin-discovery-filter").forEach((item) => item.classList.remove("is-active"));
        button.classList.add("is-active");
        state.discoveryFilter = button.dataset.discoveryFilter || "new";
        loadDiscoveryCandidates();
      });
    });
    byId("geocodeButton").addEventListener("click", geocodeAddress);
    byId("eventImageFile").addEventListener("change", previewPoster);
    byId("eventLogoFile").addEventListener("change", previewLogo);

    byId("eventRecurrence")?.addEventListener("change", toggleRecurrenceEnd);

    byId("newsForm")?.addEventListener("submit", saveNews);
    byId("resetNewsButton")?.addEventListener("click", resetNewsForm);
    byId("refreshNewsButton")?.addEventListener("click", loadNews);

    byId("copySocialButton")?.addEventListener("click", copySocialCaption);
    byId("shareSocialButton")?.addEventListener("click", shareSocialPost);
    byId("openInstagramButton")?.addEventListener("click", () => window.open("https://www.instagram.com/", "_blank", "noopener"));
    byId("markSocialPublishedButton")?.addEventListener("click", toggleSocialPublished);
    byId("socialCaption")?.addEventListener("input", saveSocialDraft);
    byId("generateSocialFromMapButton")?.addEventListener("click", generateSocialFromMap);
    byId("saveAutopilotButton")?.addEventListener("click", saveAutopilotSettings);
    byId("prepareAutopilotQueueButton")?.addEventListener("click", prepareAutopilotQueue);
    byId("refreshAutopilotButton")?.addEventListener("click", loadAutopilot);
    byId("instagramConnectButton")?.addEventListener("click", connectInstagram);
    byId("instagramDisconnectButton")?.addEventListener("click", disconnectInstagram);
    byId("autopilotEditSaveButton")?.addEventListener("click", saveAutopilotItem);
    byId("autopilotEditCancelButton")?.addEventListener("click", closeAutopilotEditor);

    byId("adminEventSearch")?.addEventListener("input", (event) => {
      state.search = event.target.value
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .trim().toLowerCase();
      renderEvents();
    });

    document.querySelectorAll("[data-admin-target]").forEach((button) => {
      button.addEventListener("click", () => {
        byId(button.dataset.adminTarget)?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      });
    });

    byId("adminMobileLogout")?.addEventListener("click", logout);

    /* Les compteurs du haut pilotent la liste. */
    document.querySelectorAll("[data-stat-filter]").forEach((card) => {
      card.setAttribute("role", "button");
      card.tabIndex = 0;

      const activate = () => selectFilter(card.dataset.statFilter);
      card.addEventListener("click", activate);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      });
    });

    document.querySelectorAll(".admin-event-filter").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".admin-event-filter")
          .forEach((item) => item.classList.remove("is-active"));
        button.classList.add("is-active");
        state.filter = button.dataset.eventFilter;
        renderEvents();
      });
    });
  }

  function toggleRecurrenceEnd() {
    const isWeekly = value("eventRecurrence") === "weekly";
    const wrapper = byId("recurrenceEndWrapper");
    if (wrapper) wrapper.classList.toggle("is-hidden", !isWeekly);
  }

  /* Point d'entrée unique : compteurs et onglets passent par ici. */
  function selectFilter(filter) {
    if (!filter) return;

    state.filter = filter;

    document.querySelectorAll(".admin-event-filter").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.eventFilter === filter);
    });

    document.querySelectorAll("[data-stat-filter]").forEach((card) => {
      card.classList.toggle("is-selected", card.dataset.statFilter === filter);
    });

    renderEvents();

    byId("adminEventsSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function initMap() {
    state.map = L.map("adminMap").setView(
      window.KIZOMBA_ATLAS_CONFIG.DEFAULT_MAP_CENTER,
      window.KIZOMBA_ATLAS_CONFIG.DEFAULT_MAP_ZOOM
    );

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 20,
      subdomains: "abcd",
      attribution: "© OpenStreetMap · © CARTO"
    }).addTo(state.map);

    state.map.on("click", (event) => setPosition(event.latlng.lat, event.latlng.lng, true));
  }

  async function updateAuthUI() {
    const loginPanel = byId("loginPanel");
    const dashboard = byId("dashboardPanel");

    if (!state.session) {
      loginPanel.classList.remove("is-hidden");
      dashboard.classList.add("is-hidden");
      byId("adminMobileNav")?.classList.add("is-hidden");
      unsubscribeRealtime();
      return;
    }

    const { data: isAdmin, error } = await state.supabase.rpc("is_admin");
    if (error || isAdmin !== true) {
      await state.supabase.auth.signOut();
      setMessage("loginMessage", "Accès refusé : ce compte n’est pas autorisé.", "error");
      return;
    }

    loginPanel.classList.add("is-hidden");
    dashboard.classList.remove("is-hidden");
    byId("adminMobileNav")?.classList.remove("is-hidden");
    window.setTimeout(() => state.map.invalidateSize(), 100);
    await Promise.all([loadEvents(), loadNews(), loadDiscoveryCandidates(), loadAutopilot()]);
    initSocialPilot();
    subscribeRealtime();
  }

  async function login(event) {
    event.preventDefault();
    setMessage("loginMessage", "Connexion…");

    const email = value("loginEmail").toLowerCase();
    const password = byId("loginPassword").value;

    if (email !== ADMIN_EMAIL) {
      setMessage("loginMessage", "Utilisez le compte officiel Kizomba Atlas.", "error");
      return;
    }

    const { error } = await state.supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Le motif réel est affiché : identifiants, compte non confirmé, trop de tentatives…
      setMessage("loginMessage", `Connexion refusée — ${error.message}`, "error");
      return;
    }

    setMessage("loginMessage", "");
  }

  async function logout() {
    await state.supabase.auth.signOut();
  }

  async function loadEvents() {
    if (!state.supabase || !state.session) return;

    setListMessage("Chargement…");

    const { data, error } = await state.supabase
      .from("events")
      .select("*")
      .order("starts_at", { ascending: true });

    if (error) {
      console.error(error);
      setListMessage(`Erreur : ${error.message}`);
      return;
    }

    state.events = data || [];
    updateStats();
    selectFilter(state.filter);
  }

  async function discoveryApi(path = "", options = {}) {
    if (!state.session?.access_token) {
      throw new Error("Session administrateur absente.");
    }

    const response = await fetch(`/api/discovery-admin${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.session.access_token}`,
        ...(options.headers || {})
      }
    });

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

    if (!response.ok) {
      throw new Error(data?.error || data?.raw || `Erreur HTTP ${response.status}`);
    }

    return data;
  }

  async function loadDiscoveryCandidates() {
    if (!state.session) return;

    const container = byId("adminDiscoveryList");
    if (container) container.innerHTML = '<p class="admin-empty">Chargement…</p>';
    setMessage("discoveryMessage", "");

    try {
      const filter = encodeURIComponent(state.discoveryFilter || "new");
      const data = await discoveryApi(`?status=${filter}&limit=60`);
      state.discoveryCandidates = data?.candidates || [];
      setText("discoveryCount", state.discoveryCandidates.length);
      renderDiscoveryCandidates();
    } catch (error) {
      console.error("Kizomba Atlas Discovery admin:", error);
      if (container) {
        container.innerHTML = `<p class="admin-empty">Impossible de charger Discovery : ${escapeHTML(error.message)}</p>`;
      }
      setMessage("discoveryMessage", error.message, "error");
    }
  }

  function renderDiscoveryCandidates() {
    const container = byId("adminDiscoveryList");
    if (!container) return;

    container.innerHTML = "";

    if (!state.discoveryCandidates.length) {
      container.innerHTML = '<p class="admin-empty">Aucun candidat dans cette vue.</p>';
      return;
    }

    state.discoveryCandidates.forEach((candidate) => {
      const card = document.createElement("article");
      card.className = "admin-list-item discovery-candidate-card";

      const visual = isSafeUrl(candidate.source_image_url)
        ? `<img class="discovery-candidate-thumb" src="${escapeAttribute(candidate.source_image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'" />`
        : '<div class="discovery-candidate-thumb discovery-candidate-thumb-empty">◎</div>';

      const source = candidate.source_name || candidate.source_platform || "Source web";
      const location = [candidate.venue_name, candidate.city, candidate.country].filter(Boolean).join(" — ");
      const confidence = Number.isFinite(Number(candidate.confidence))
        ? `${Math.round(Number(candidate.confidence) * 100)} %`
        : "—";
      const styles = Array.isArray(candidate.styles) ? candidate.styles.join(" · ") : (candidate.styles || "");
      const sourceLink = isSafeUrl(candidate.source_url)
        ? `<a class="discovery-source-link" href="${escapeAttribute(candidate.source_url)}" target="_blank" rel="noopener noreferrer">Voir la source ↗</a>`
        : "";

      card.innerHTML = `
        <div class="discovery-candidate-top">
          ${visual}
          <div class="discovery-candidate-copy">
            <div class="discovery-candidate-meta">
              <span class="admin-news-badge" data-type="new">${escapeHTML(source)}</span>
              <span class="discovery-confidence">Confiance ${escapeHTML(confidence)}</span>
            </div>
            <h3>${escapeHTML(candidate.event_name || "Événement détecté")}</h3>
            <p><strong>${escapeHTML(formatDate(candidate.starts_at))}</strong></p>
            <p>${escapeHTML(location || candidate.address || "Lieu à vérifier")}</p>
            ${styles ? `<p class="admin-style-line">${escapeHTML(styles)}</p>` : ""}
            ${candidate.organizer_name ? `<p>Organisateur : ${escapeHTML(candidate.organizer_name)}</p>` : ""}
            ${sourceLink}
          </div>
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "admin-item-actions discovery-candidate-actions";

      if (candidate.status === "rejected") {
        actions.append(
          makeButton("Restaurer", "secondary-button", () => updateDiscoveryStatus(candidate, "restore")),
          makeButton("Examiner", "ghost-button", () => importDiscoveryCandidate(candidate))
        );
      } else {
        actions.append(
          makeButton("Corriger / préparer", "secondary-button", () => importDiscoveryCandidate(candidate)),
          makeButton("Valider dans l’éditeur", "primary-button", () => importDiscoveryCandidate(candidate)),
          makeButton("Refuser", "danger-button", () => updateDiscoveryStatus(candidate, "reject"))
        );
      }

      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  function importDiscoveryCandidate(candidate) {
    resetEventForm(false);

    setValue("eventTitleFr", candidate.event_name || "");
    setValue("eventTitleEn", candidate.event_name || "");
    setValue("eventDescriptionFr", candidate.description || candidate.source_text || "");
    setValue("eventDescriptionEn", candidate.description || "");
    setValue("eventOrganizer", candidate.organizer_name || "");
    setValue("eventCategory", normalizeEventType(candidate.event_type));

    const supportedStyles = toArray(candidate.styles)
      .map((item) => String(item).toLowerCase())
      .filter((item) => ["kizomba", "urban-kiz", "bachata", "sbk", "semba", "tarraxo"].includes(item));

    setCheckedValues("eventStyle", supportedStyles.length ? supportedStyles : ["kizomba"]);
    setValue("eventMapStyle", preferredMapStyle({ styles: supportedStyles }));
    setValue("eventStart", toLocalInput(candidate.starts_at));
    setValue("eventEnd", toLocalInput(candidate.ends_at));
    setValue("eventVenue", candidate.venue_name || "");
    setValue("eventAddress", candidate.address || "");
    setValue("eventCity", candidate.city || "");
    setValue("eventCountry", candidate.country || "France");
    setValue("eventTicketUrl", candidate.ticket_url || "");
    setValue("eventPriceFr", candidate.price_text || "");
    setValue("eventImageUrlFallback", candidate.source_image_url || "");
    renderPreview("eventImagePreview", candidate.source_image_url || "", "Aucune affiche");

    setValue("eventLatitude", "");
    setValue("eventLongitude", "");
    if (state.marker) {
      state.marker.remove();
      state.marker = null;
    }

    byId("eventFormTitle").textContent = "Vérifier un événement Discovery";
    setMessage(
      "eventFormMessage",
      `Source ${candidate.source_name || candidate.source_platform || "web"}. Vérifiez les informations puis cliquez sur « Trouver l’adresse » avant d’enregistrer ou publier.`,
      "success"
    );

    byId("adminEditorSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function updateDiscoveryStatus(candidate, action) {
    const label = action === "reject" ? "Refuser ce candidat Discovery ?" : "Restaurer ce candidat ?";
    if (!window.confirm(label)) return;

    try {
      await discoveryApi("", {
        method: "PATCH",
        body: JSON.stringify({ id: candidate.id, action })
      });
      setMessage("discoveryMessage", action === "reject" ? "Candidat refusé." : "Candidat restauré.", "success");
      await loadDiscoveryCandidates();
    } catch (error) {
      console.error(error);
      setMessage("discoveryMessage", error.message, "error");
    }
  }

  function subscribeRealtime() {
    unsubscribeRealtime();
    state.channel = state.supabase
      .channel("kizomba-atlas-admin-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, loadEvents)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_news" }, loadNews)
      .subscribe();
  }

  function unsubscribeRealtime() {
    if (state.channel && state.supabase) {
      state.supabase.removeChannel(state.channel);
      state.channel = null;
    }
  }

  async function loadNews() {
    if (!state.supabase || !state.session) return;

    const container = byId("adminNewsList");
    if (container) container.innerHTML = '<p class="admin-empty">Chargement…</p>';

    const { data, error } = await state.supabase
      .from("live_news")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Kizomba Atlas live_news:", error);
      if (container) {
        container.innerHTML = '<p class="admin-empty">Le module Bandeau doit encore être activé dans Supabase. Exécutez le fichier SUPABASE_LIVE_NEWS.sql une seule fois.</p>';
      }
      return;
    }

    state.news = data || [];
    renderNews();
  }

  async function saveNews(event) {
    event.preventDefault();
    if (!state.session) {
      setMessage("newsFormMessage", "Connexion requise.", "error");
      return;
    }

    const textFr = value("newsTextFr");
    if (!textFr) {
      setMessage("newsFormMessage", "Écrivez le message à publier.", "error");
      return;
    }

    const startsAt = toIsoOrNull(value("newsStart"));
    const endsAt = toIsoOrNull(value("newsEnd"));
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      setMessage("newsFormMessage", "La date de fin doit être après la date de début.", "error");
      return;
    }

    const button = byId("saveNewsButton");
    if (button) { button.disabled = true; button.textContent = "Publication…"; }

    const payload = {
      text_fr: textFr,
      text_en: value("newsTextEn") || textFr,
      type: value("newsType") || "info",
      priority: 100,
      active: Boolean(byId("newsActive")?.checked),
      starts_at: startsAt,
      ends_at: endsAt,
      updated_at: new Date().toISOString()
    };

    const id = value("newsId");
    const query = id
      ? state.supabase.from("live_news").update(payload).eq("id", id)
      : state.supabase.from("live_news").insert(payload);

    const { error } = await query;
    if (button) { button.disabled = false; button.textContent = id ? "Enregistrer les modifications" : "Publier l’information"; }

    if (error) {
      console.error(error);
      setMessage("newsFormMessage", `Publication impossible — ${error.message}`, "error");
      return;
    }

    setMessage("newsFormMessage", id ? "Information mise à jour." : "Information publiée dans le bandeau.", "success");
    resetNewsForm(false);
    await loadNews();
  }

  function renderNews() {
    const container = byId("adminNewsList");
    if (!container) return;

    if (!state.news.length) {
      container.innerHTML = '<p class="admin-empty">Aucune info manuelle pour le moment.</p>';
      return;
    }

    container.innerHTML = "";
    state.news.forEach((item) => {
      const row = document.createElement("article");
      row.className = "admin-news-item";

      const now = Date.now();
      const start = item.starts_at ? new Date(item.starts_at).getTime() : null;
      const end = item.ends_at ? new Date(item.ends_at).getTime() : null;
      const visibleNow = item.active !== false && (!start || start <= now) && (!end || end >= now);

      row.innerHTML = `
        <div class="admin-news-item-main">
          <span class="admin-news-badge" data-type="${escapeAttribute(item.type || "info")}">${escapeHTML(newsTypeLabel(item.type))}</span>
          <p>${escapeHTML(item.text_fr || "")}</p>
          <small>${visibleNow ? "Visible maintenant" : item.active === false ? "Masquée" : "Programmée / expirée"}</small>
        </div>
        <div class="admin-news-item-actions"></div>`;

      const actions = row.querySelector(".admin-news-item-actions");
      actions.appendChild(makeButton("Modifier", "secondary-button", () => editNews(item)));
      actions.appendChild(makeButton(item.active === false ? "Afficher" : "Masquer", "ghost-button", () => toggleNews(item)));
      actions.appendChild(makeButton("Supprimer", "ghost-button danger-button", () => deleteNews(item)));
      container.appendChild(row);
    });
  }

  function editNews(item) {
    setValue("newsId", item.id || "");
    setValue("newsTextFr", item.text_fr || "");
    setValue("newsTextEn", item.text_en || "");
    setValue("newsType", item.type || "info");
    setValue("newsStart", toLocalInput(item.starts_at));
    setValue("newsEnd", toLocalInput(item.ends_at));
    if (byId("newsActive")) byId("newsActive").checked = item.active !== false;
    if (byId("saveNewsButton")) byId("saveNewsButton").textContent = "Enregistrer les modifications";
    setMessage("newsFormMessage", "Modification de l’information sélectionnée.");
    byId("adminNewsSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function toggleNews(item) {
    const { error } = await state.supabase
      .from("live_news")
      .update({ active: item.active === false, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) {
      setMessage("newsFormMessage", error.message, "error");
      return;
    }
    await loadNews();
  }

  async function deleteNews(item) {
    if (!window.confirm("Supprimer définitivement cette information du bandeau ?")) return;
    const { error } = await state.supabase.from("live_news").delete().eq("id", item.id);
    if (error) {
      setMessage("newsFormMessage", error.message, "error");
      return;
    }
    if (value("newsId") === String(item.id)) resetNewsForm();
    await loadNews();
  }

  function resetNewsForm(clearMessage = true) {
    setValue("newsId", "");
    setValue("newsTextFr", "");
    setValue("newsTextEn", "");
    setValue("newsType", "info");
    setValue("newsStart", "");
    setValue("newsEnd", "");
    if (byId("newsActive")) byId("newsActive").checked = true;
    if (byId("saveNewsButton")) byId("saveNewsButton").textContent = "Publier l’information";
    if (clearMessage) setMessage("newsFormMessage", "");
  }

  function newsTypeLabel(type) {
    return ({ info: "Info", new: "Nouveau", important: "Important", urgent: "Urgent" })[type] || "Info";
  }

  async function saveEvent(event) {
    event.preventDefault();

    const status = event.submitter?.dataset?.saveStatus === "published"
      ? "published"
      : "draft";

    if (!state.session) {
      setMessage("eventFormMessage", "Connexion requise.", "error");
      return;
    }

    const styles = checkedValues("eventStyle");
    if (!styles.length) {
      setMessage("eventFormMessage", "Sélectionnez au moins un style.", "error");
      return;
    }

    const latitude = Number(value("eventLatitude"));
    const longitude = Number(value("eventLongitude"));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setMessage("eventFormMessage", "Localisez d’abord l’adresse sur la carte.", "error");
      return;
    }

    const startsAt = toIsoOrNull(value("eventStart"));
    const endsAt = toIsoOrNull(value("eventEnd"));

    if (endsAt && startsAt && new Date(endsAt) <= new Date(startsAt)) {
      setMessage(
        "eventFormMessage",
        "La fin doit être postérieure au début. Après minuit, indiquez le lendemain.",
        "error"
      );
      return;
    }

    setFormBusy(true, status === "published" ? "Publication…" : "Enregistrement…");

    try {
      const posterFile = byId("eventImageFile").files[0];
      const logoFile = byId("eventLogoFile").files[0];

      let imageUrl = value("eventExistingImageUrl") || value("eventImageUrlFallback") || null;
      let logoUrl = value("eventExistingLogoUrl") || null;

      if (posterFile) {
        validateFile(posterFile, 5);
        imageUrl = await uploadImage(posterFile, "posters");
      }

      if (logoFile) {
        validateFile(logoFile, 2);
        logoUrl = await uploadImage(logoFile, "logos");
      }

      const titleFr = value("eventTitleFr");
      const descriptionFr = value("eventDescriptionFr");
      const priceFr = value("eventPriceFr");

      const payload = {
        title_fr: titleFr,
        title_en: value("eventTitleEn") || titleFr,
        description_fr: descriptionFr,
        description_en: value("eventDescriptionEn") || descriptionFr,
        organizer_name: value("eventOrganizer"),
        category: value("eventCategory"),
        styles,
        map_style: value("eventMapStyle"),
        starts_at: startsAt,
        ends_at: endsAt,
        venue_name: value("eventVenue"),
        address: value("eventAddress"),
        city: value("eventCity"),
        country: value("eventCountry"),
        latitude,
        longitude,
        image_url: imageUrl,
        logo_url: logoUrl,
        ticket_url: value("eventTicketUrl") || null,
        price_text_fr: priceFr,
        price_text_en: priceFr,
        course_tags: checkedValues("courseTag"),
        recurrence: value("eventRecurrence") || "none",
        recurrence_end: toIsoOrNull(value("eventRecurrenceEnd")),
        status
      };

      const id = value("eventId");
      const query = id
        ? state.supabase.from("events").update(payload).eq("id", id)
        : state.supabase.from("events").insert(payload);

      const { error } = await query;
      if (error) throw error;

      setMessage(
        "eventFormMessage",
        status === "published"
          ? "Événement publié dans l’application."
          : "Brouillon enregistré. Il reste invisible au public.",
        "success"
      );

      resetEventForm(false);
      await loadEvents();
    } catch (error) {
      console.error(error);
      setMessage("eventFormMessage", error.message || "Une erreur est survenue.", "error");
    } finally {
      setFormBusy(false);
    }
  }

  async function uploadImage(file, folder) {
    const extension = (file.name.split(".").pop() || "jpg")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    const path = `${state.session.user.id}/${folder}/${crypto.randomUUID()}.${extension}`;

    const { error } = await state.supabase
      .storage
      .from("event-images")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type
      });

    if (error) throw error;

    const { data } = state.supabase.storage.from("event-images").getPublicUrl(path);
    return data.publicUrl;
  }

  function validateFile(file, maxMegabytes) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      throw new Error("Format d’image non accepté.");
    }
    if (file.size > maxMegabytes * 1024 * 1024) {
      throw new Error(`Image trop lourde : maximum ${maxMegabytes} Mo.`);
    }
  }

  function renderEvents() {
    const container = byId("adminEventList");

    const now = Date.now();

    const filtered = state.events.filter((event) => {
      let matchesStatus;

      if (state.filter === "all") {
        matchesStatus = true;
      } else if (state.filter === "upcoming") {
        // Dates futures déjà publiées.
        const reference = new Date(event.ends_at || event.starts_at).getTime();
        matchesStatus = event.status === "published"
          && Number.isFinite(reference)
          && reference >= now;
      } else {
        matchesStatus = event.status === state.filter;
      }

      const haystack = [
        event.title_fr,
        event.title_en,
        event.organizer_name,
        event.venue_name,
        event.city,
        event.country,
        event.contact_name,
        event.contact_email,
        courseTagSummary(event)
      ].filter(Boolean).join(" ")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      const matchesSearch = !state.search || haystack.includes(state.search);
      return matchesStatus && matchesSearch;
    });

    filtered.sort((a, b) => {
      const dateA = new Date(a.starts_at).getTime() || 0;
      const dateB = new Date(b.starts_at).getTime() || 0;
      return state.filter === "upcoming" ? dateA - dateB : dateB - dateA;
    });

    if (!filtered.length) {
      container.innerHTML = state.filter === "pending"
        ? '<div class="empty-state">Aucune demande en attente pour le moment.</div>'
        : state.filter === "upcoming"
          ? '<div class="empty-state">Aucune date future publiée.</div>'
          : '<div class="empty-state">Aucun événement dans cette catégorie.</div>';
      return;
    }

    container.innerHTML = "";

    filtered.forEach((event) => {
      const item = document.createElement("article");
      item.className = "admin-list-item admin-event-item";
      if (event.status === "pending") item.classList.add("is-pending");

      // Une adresse morte retombe sur le pictogramme doré, jamais sur une icône cassée.
      const visual = isSafeUrl(event.image_url)
        ? event.image_url
        : (isSafeUrl(event.logo_url) ? event.logo_url : null);

      const poster = visual
        ? `<img class="admin-event-thumb" src="${escapeAttribute(visual)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='&lt;div class=&quot;admin-event-thumb admin-event-thumb-placeholder&quot;&gt;⌖&lt;/div&gt;'" />`
        : `<div class="admin-event-thumb admin-event-thumb-placeholder">⌖</div>`;

      const badges = [
        `<span class="status-badge ${statusClass(event.status)}">${statusLabel(event.status)}</span>`
      ];

      if (event.source === "public") {
        badges.push('<span class="status-badge status-source-public">Demande reçue</span>');
      }

      if (event.is_featured) {
        badges.push('<span class="status-badge status-featured">★ Mise en avant</span>');
      }

      const contactLine = event.contact_email
        ? `<p class="admin-contact-line">✉ ${escapeHTML(event.contact_name || "")} — ${escapeHTML(event.contact_email)}</p>`
        : "";

      const noteLine = event.moderation_note
        ? `<div class="moderation-note"><strong>Note interne</strong><p>${escapeHTML(event.moderation_note)}</p></div>`
        : "";

      const locatedWarning = needsLocation(event)
        ? '<p class="admin-locate-warning">⚠ Position à préciser avant publication.</p>'
        : "";

      item.innerHTML = `
        <div class="admin-event-item-top">
          ${poster}
          <div class="admin-event-item-copy">
            <div class="item-title-row">
              <h3>${escapeHTML(event.title_fr || "Événement")}</h3>
            </div>
            <div class="profile-badges">${badges.join("")}</div>
            <p>${escapeHTML(formatDate(event.starts_at))}</p>
            <p>${escapeHTML([event.venue_name, event.city, event.country].filter(Boolean).join(" — "))}</p>
            <p class="admin-style-line">${escapeHTML(styleSummary(event))}</p>
            ${courseTagSummary(event) ? `<p class="admin-course-line">${escapeHTML(courseTagSummary(event))}</p>` : ""}
            ${contactLine}
            ${locatedWarning}
          </div>
        </div>
        ${noteLine}
      `;

      const actions = document.createElement("div");
      actions.className = "admin-item-actions admin-event-actions";

      if (event.status === "pending") {
        actions.append(
          makeButton("Examiner et localiser", "secondary-button", () => editEvent(event)),
          makeButton("Valider et publier", "primary-button", () => approveEvent(event)),
          makeButton("Refuser", "danger-button", () => rejectEvent(event)),
          makeButton("Supprimer", "ghost-button", () => deleteEvent(event))
        );
      } else {
        actions.append(
          makeButton("Modifier", "secondary-button", () => editEvent(event)),
          makeButton("Dupliquer", "ghost-button", () => duplicateEvent(event)),
          makeButton(
            event.status === "published" ? "Retirer de la carte" : "Publier",
            event.status === "published" ? "secondary-button" : "primary-button",
            () => toggleStatus(event)
          ),
          makeButton(
            event.is_featured ? "★ Retirer la mise en avant" : "☆ Mettre en avant",
            "ghost-button",
            () => toggleFeatured(event)
          ),
          makeButton("Supprimer", "danger-button", () => deleteEvent(event))
        );
      }

      item.appendChild(actions);
      container.appendChild(item);
    });
  }

  function needsLocation(event) {
    // Point neutre déposé par la fonction serveur quand la demande n'est pas localisée.
    const lat = Number(event.latitude);
    const lng = Number(event.longitude);
    return Math.abs(lat - 46.6034) < 0.0002 && Math.abs(lng - 1.8883) < 0.0002;
  }

  function statusLabel(status) {
    return {
      "published": "Publié",
      "draft": "Brouillon",
      "pending": "En attente",
      "rejected": "Refusé"
    }[status] || status;
  }

  function statusClass(status) {
    return {
      "published": "status-published",
      "draft": "status-draft",
      "pending": "status-pending",
      "rejected": "status-rejected"
    }[status] || "status-draft";
  }

  function updateStats() {
    const now = Date.now();
    const published = state.events.filter((event) => event.status === "published");
    const drafts = state.events.filter((event) => event.status === "draft");
    const pending = state.events.filter((event) => event.status === "pending");
    const upcoming = published.filter((event) => new Date(event.starts_at).getTime() >= now);

    setText("publishedCount", published.length);
    setText("draftCount", drafts.length);
    setText("upcomingCount", upcoming.length);
    setText("pendingCount", pending.length);

    // Pastille de rappel sur l'onglet des demandes.
    const tab = document.querySelector('.admin-event-filter[data-event-filter="pending"]');
    if (tab) {
      tab.dataset.count = pending.length ? String(pending.length) : "";
      tab.classList.toggle("has-pending", pending.length > 0);
    }
  }

  /* ---------------------------------------------------------
     Validation des demandes reçues
     --------------------------------------------------------- */
  async function approveEvent(event) {
    if (needsLocation(event)) {
      window.alert(
        "Cette demande n’est pas encore localisée.\n\n" +
        "Appuyez sur « Examiner et localiser », placez le point exact, " +
        "puis publiez depuis le formulaire."
      );
      editEvent(event);
      return;
    }

    if (!window.confirm(`Publier « ${event.title_fr} » sur la carte ?`)) return;

    const { error } = await state.supabase
      .from("events")
      .update({ status: "published" })
      .eq("id", event.id);

    if (error) {
      window.alert(error.message);
      return;
    }

    await loadEvents();
  }

  async function rejectEvent(event) {
    const note = window.prompt(
      "Motif du refus (note interne, non envoyée à l’organisateur) :",
      ""
    );

    if (note === null) return;

    const { error } = await state.supabase
      .from("events")
      .update({ status: "rejected", moderation_note: note || null })
      .eq("id", event.id);

    if (error) {
      window.alert(error.message);
      return;
    }

    await loadEvents();
  }

  async function toggleFeatured(event) {
    const next = !event.is_featured;

    const label = next
      ? "Mettre cet événement en avant sur la carte ?"
      : "Retirer la mise en avant ?";

    if (!window.confirm(label)) return;

    const { error } = await state.supabase
      .from("events")
      .update({ is_featured: next })
      .eq("id", event.id);

    if (error) {
      window.alert(error.message);
      return;
    }

    await loadEvents();
  }

  function editEvent(event) {
    setValue("eventId", event.id);
    setValue("eventTitleFr", event.title_fr);
    setValue("eventTitleEn", event.title_en);
    setValue("eventDescriptionFr", event.description_fr);
    setValue("eventDescriptionEn", event.description_en);
    setValue("eventOrganizer", event.organizer_name);
    setValue("eventCategory", normalizeEventType(event.category));
    setCheckedValues("eventStyle", normalizedStyles(event));
    setValue("eventMapStyle", event.map_style || preferredMapStyle(event));
    setValue("eventStart", toLocalInput(event.starts_at));
    setValue("eventEnd", toLocalInput(event.ends_at));
    setValue("eventVenue", event.venue_name);
    setValue("eventAddress", event.address);
    setValue("eventCity", event.city);
    setValue("eventCountry", event.country || "France");
    setValue("eventTicketUrl", event.ticket_url);
    setValue("eventPriceFr", event.price_text_fr);
    setCheckedValues("courseTag", toArray(event.course_tags));
    setValue("eventRecurrence", event.recurrence || "none");
    setValue("eventRecurrenceEnd", toLocalInput(event.recurrence_end));
    toggleRecurrenceEnd();
    setValue("eventExistingImageUrl", event.image_url);
    setValue("eventExistingLogoUrl", event.logo_url);
    setValue("eventImageUrlFallback", event.image_url);

    if (needsLocation(event)) {
      // Demande non localisée : on laisse le champ vide pour forcer le géocodage.
      setValue("eventLatitude", "");
      setValue("eventLongitude", "");
      if (state.marker) {
        state.marker.remove();
        state.marker = null;
      }
      state.map.setView(
        window.KIZOMBA_ATLAS_CONFIG.DEFAULT_MAP_CENTER,
        window.KIZOMBA_ATLAS_CONFIG.DEFAULT_MAP_ZOOM
      );
      setMessage(
        "eventFormMessage",
        "Demande reçue. Appuyez sur « Trouver l’adresse » puis ajustez le point.",
        "success"
      );
    } else {
      setPosition(Number(event.latitude), Number(event.longitude), true);
      setMessage("eventFormMessage", "");
    }

    byId("eventFormTitle").textContent = event.status === "pending"
      ? "Examiner la demande"
      : "Modifier l’événement";

    byId("eventImageFile").value = "";
    byId("eventLogoFile").value = "";
    renderPreview("eventImagePreview", event.image_url, "Aucune affiche");
    renderPreview("eventLogoPreview", event.logo_url, "Aucun logo");

    document.querySelector(".admin-event-editor")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function duplicateEvent(event) {
    editEvent({ ...event, id: "", status: "draft" });
    setValue("eventId", "");
    setValue("eventTitleFr", `${event.title_fr || "Événement"} — copie`);
    byId("eventFormTitle").textContent = "Dupliquer l’événement";
    setMessage("eventFormMessage", "La copie sera enregistrée comme nouvelle date.", "success");
  }

  async function toggleStatus(event) {
    const nextStatus = event.status === "published" ? "draft" : "published";
    const label = nextStatus === "published"
      ? "Publier cet événement dans l’application ?"
      : "Retirer cet événement de la carte publique ?";

    if (!window.confirm(label)) return;

    const { error } = await state.supabase
      .from("events")
      .update({ status: nextStatus })
      .eq("id", event.id);

    if (error) {
      window.alert(error.message);
      return;
    }

    await loadEvents();
  }

  async function deleteEvent(event) {
    if (!window.confirm(`Supprimer définitivement « ${event.title_fr} » ?`)) return;

    const { error } = await state.supabase
      .from("events")
      .delete()
      .eq("id", event.id);

    if (error) {
      window.alert(error.message);
      return;
    }

    await loadEvents();
  }

  function resetEventForm(clearMessage = true) {
    byId("eventForm").reset();
    setValue("eventId", "");
    setValue("eventExistingImageUrl", "");
    setValue("eventExistingLogoUrl", "");
    setValue("eventCountry", "France");
    setValue("eventMapStyle", "kizomba");
    setValue("eventLatitude", "");
    setValue("eventLongitude", "");
    setCheckedValues("eventStyle", ["kizomba"]);
    setCheckedValues("courseTag", []);
    setValue("eventRecurrence", "none");
    setValue("eventRecurrenceEnd", "");
    toggleRecurrenceEnd();
    byId("eventImageFile").value = "";
    byId("eventLogoFile").value = "";
    renderPreview("eventImagePreview", "", "Aucune affiche");
    renderPreview("eventLogoPreview", "", "Aucun logo");
    byId("eventFormTitle").textContent = "Ajouter un événement";

    if (state.marker) {
      state.marker.remove();
      state.marker = null;
    }

    state.map.setView(
      window.KIZOMBA_ATLAS_CONFIG.DEFAULT_MAP_CENTER,
      window.KIZOMBA_ATLAS_CONFIG.DEFAULT_MAP_ZOOM
    );

    if (clearMessage) setMessage("eventFormMessage", "");
  }

  async function geocodeAddress() {
    const query = [
      value("eventVenue"),
      value("eventAddress"),
      value("eventCity"),
      value("eventCountry")
    ].filter(Boolean).join(", ");

    if (!query) {
      setMessage("eventFormMessage", "Renseignez d’abord le lieu et l’adresse.", "error");
      return;
    }

    setMessage("eventFormMessage", "Recherche de l’adresse…");

    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      url.searchParams.set("q", query);

      const response = await fetch(url, { headers: { "Accept-Language": "fr" } });

      if (!response.ok) throw new Error("Recherche impossible.");
      const results = await response.json();
      if (!results.length) throw new Error("Adresse introuvable.");

      setPosition(Number(results[0].lat), Number(results[0].lon), true);
      setMessage("eventFormMessage", "Position trouvée. Ajustez le point si besoin.", "success");
    } catch (error) {
      setMessage("eventFormMessage", error.message || "Adresse introuvable.", "error");
    }
  }

  function setPosition(lat, lng, centerMap) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    setValue("eventLatitude", lat.toFixed(7));
    setValue("eventLongitude", lng.toFixed(7));

    if (!state.marker) {
      state.marker = L.marker([lat, lng], { draggable: true }).addTo(state.map);
      state.marker.on("dragend", () => {
        const point = state.marker.getLatLng();
        setPosition(point.lat, point.lng, false);
      });
    } else {
      state.marker.setLatLng([lat, lng]);
    }

    if (centerMap) state.map.setView([lat, lng], 17);
  }

  function previewPoster() {
    const file = byId("eventImageFile").files[0];
    if (!file) {
      renderPreview("eventImagePreview", value("eventExistingImageUrl"), "Aucune affiche");
      return;
    }
    renderPreview("eventImagePreview", URL.createObjectURL(file), "Aucune affiche");
  }

  function previewLogo() {
    const file = byId("eventLogoFile").files[0];
    if (!file) {
      renderPreview("eventLogoPreview", value("eventExistingLogoUrl"), "Aucun logo");
      return;
    }
    renderPreview("eventLogoPreview", URL.createObjectURL(file), "Aucun logo");
  }

  function renderPreview(id, url, emptyText) {
    const preview = byId(id);
    if (!preview) return;
    preview.innerHTML = isSafeUrl(url) || String(url).startsWith("blob:")
      ? `<img src="${escapeAttribute(url)}" alt="" />`
      : `<span>${escapeHTML(emptyText)}</span>`;
  }

  function setFormBusy(busy, label = "") {
    document.querySelectorAll(".admin-publish-actions button").forEach((button) => {
      button.disabled = busy;
    });
    if (busy && label) setMessage("eventFormMessage", label);
  }

  function setListMessage(message) {
    byId("adminEventList").innerHTML = `<div class="empty-state">${escapeHTML(message)}</div>`;
  }

  function checkedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)]
      .map((input) => input.value);
  }

  function setCheckedValues(name, values) {
    const selected = new Set(values || []);
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.checked = selected.has(input.value);
    });
  }

  function toArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === "string") {
      return value
        .replace(/[{}]/g, "")
        .split(",")
        .map((item) => item.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
    }
    return [];
  }

  function normalizedStyles(event) {
    return toArray(event.styles);
  }

  function courseTagSummary(event) {
    const tags = toArray(event.course_tags);
    if (!tags.length) return "";
    return tags.map((tag) => COURSE_TAGS[tag] || tag).join(" · ");
  }

  function preferredMapStyle(event) {
    const allowed = ["kizomba", "urban-kiz", "bachata", "sbk", "semba", "tarraxo"];
    return normalizedStyles(event).find((style) => allowed.includes(style)) || "kizomba";
  }

  function normalizeEventType(category) {
    return ["party", "festival", "workshop"].includes(category) ? category : "party";
  }

  function styleSummary(event) {
    const labels = {
      "kizomba": "Kizomba",
      "urban-kiz": "Urban Kiz",
      "bachata": "Bachata",
      "sbk": "SBK",
      "semba": "Semba",
      "tarraxo": "Tarraxo"
    };
    return normalizedStyles(event).map((style) => labels[style] || style).join(" · ");
  }



  /* =========================================================
     Assistant Réseaux — campagne Kizomba Atlas 30 jours (V1)
     Suivi local, aucune clé Meta côté navigateur.
     ========================================================= */
  async function autopilotApi(options = {}) {
    if (!state.session?.access_token) throw new Error("Session administrateur absente.");
    const response = await fetch("/api/social-autopilot", { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.session.access_token}`, ...(options.headers || {}) } });
    const text = await response.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!response.ok) throw new Error(data?.error || data?.raw || `Erreur HTTP ${response.status}`);
    return data;
  }

  async function loadAutopilot() {
    if (!state.session || !byId("adminAutopilotSection")) return;
    try { const data = await autopilotApi(); state.autopilotSettings = data?.settings || null; state.autopilotQueue = data?.queue || []; state.instagramAccount = data?.instagram_account || null; renderAutopilot(); }
    catch (error) { setMessage("autopilotMessage", error.message, "error"); const root = byId("autopilotQueueList"); if (root) root.innerHTML = '<p class="admin-empty">Autopilote non initialisé. Exécutez le SQL fourni dans Supabase.</p>'; }
  }

  async function connectInstagram() {
    try {
      const response = await fetch("/api/oauth/instagram/start", {
        headers: { Authorization: `Bearer ${state.session.access_token}` }
      });
      const data = await response.json();
      if (!response.ok || !data.authorize_url) throw new Error(data.error || "Impossible de démarrer la connexion.");
      window.location.href = data.authorize_url;
    } catch (error) {
      setMessage("autopilotMessage", error.message, "error");
    }
  }

  async function disconnectInstagram() {
    if (!window.confirm("Déconnecter le compte Instagram ? L’Autopilote ne pourra plus publier tant qu’un compte n’est pas reconnecté.")) return;
    try {
      await autopilotApi({ method: "PATCH", body: JSON.stringify({ action: "disconnect_instagram" }) });
      state.instagramAccount = null;
      renderAutopilot();
    } catch (error) {
      setMessage("autopilotMessage", error.message, "error");
    }
  }

  /* Retour depuis Meta après connexion (?instagram=connected|error). */
  function handleInstagramOAuthReturn() {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("instagram");
    if (!status) return;

    if (status === "connected") setMessage("autopilotMessage", "Compte Instagram connecté ✓", "success");
    else setMessage("autopilotMessage", `Connexion Instagram impossible (${params.get("reason") || "erreur inconnue"}).`, "error");

    params.delete("instagram");
    params.delete("reason");
    const query = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : ""));
  }

  async function publishAutopilotItem(item) {
    const dryRunHint = "Le mode test (DRY RUN) est actif tant que la variable Vercel SCHEDULER_DRY_RUN=true.";
    if (!window.confirm(`Publier maintenant « ${item.title || item.event_title || ""} » sur Instagram ?\n\n${dryRunHint}`)) return;

    try {
      const data = await autopilotApi({ method: "PATCH", body: JSON.stringify({ action: "publish", id: item.id }) });
      setMessage("autopilotMessage", data.dry_run ? "DRY RUN effectué — rien n’a été publié réellement ✓" : "Publié sur Instagram ✓", "success");
      state.autopilotQueue = data.queue || state.autopilotQueue;
      renderAutopilot();
    } catch (error) {
      setMessage("autopilotMessage", error.message, "error");
    }
  }

  function renderAutopilot() {
    const settings = state.autopilotSettings || { enabled:false, quota:2, cadence:"weekly", instagram:true, facebook:true, meta_connected:false };
    setValue("autopilotEnabled", settings.enabled ? "true" : "false"); setValue("autopilotQuota", String(settings.quota || 2)); setValue("autopilotCadence", settings.cadence || "weekly");
    if (byId("autopilotInstagram")) byId("autopilotInstagram").checked = settings.instagram !== false; if (byId("autopilotFacebook")) byId("autopilotFacebook").checked = settings.facebook !== false;
    const badge=byId("autopilotStatusBadge"); if (badge) { badge.textContent=settings.enabled?"ON":"OFF"; badge.classList.toggle("is-off",!settings.enabled); badge.classList.toggle("is-on",settings.enabled); }

    const account = state.instagramAccount;
    setText("autopilotMetaStatus", account ? `Connecté — @${account.ig_username || account.ig_user_id}` : "Instagram non connecté — préparation uniquement");
    const connectButton = byId("instagramConnectButton"); if (connectButton) connectButton.hidden = Boolean(account);
    const disconnectButton = byId("instagramDisconnectButton"); if (disconnectButton) disconnectButton.hidden = !account;

    setText("autopilotQueueCount", state.autopilotQueue.length);
    const root=byId("autopilotQueueList"); if(!root)return; root.innerHTML=""; if(!state.autopilotQueue.length){root.innerHTML='<p class="admin-empty">Aucune publication préparée.</p>';return;}

    const POST_TYPE_LABELS = { post: "Post", story: "Story", reel: "Reel" };

    state.autopilotQueue.forEach(item => {
      const card = document.createElement("article");
      card.className = "autopilot-queue-item";

      const when = item.scheduled_for ? formatDate(item.scheduled_for) : "À programmer";
      const platforms = Array.isArray(item.platforms) && item.platforms.length
        ? item.platforms.map(p => p === "instagram" ? "Instagram" : p === "facebook" ? "Facebook" : p).join(" + ")
        : [item.instagram ? "Instagram" : "", item.facebook ? "Facebook" : ""].filter(Boolean).join(" + ");
      const postType = POST_TYPE_LABELS[item.post_type] || "Post";
      const title = item.title || item.event_title || "Publication Kizomba Atlas";
      const captionExcerpt = String(item.caption_fr || item.caption || "").split("\n")[0];
      const thumbSrc = isSafeUrl(item.image_url) ? item.image_url : (isSafeUrl(item.social_preview_image) ? item.social_preview_image : "");

      const thumb = thumbSrc
        ? `<img class="autopilot-queue-thumb" src="${escapeAttribute(thumbSrc)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'" />`
        : `<div class="autopilot-queue-thumb autopilot-queue-thumb-empty">◎</div>`;

      card.innerHTML = `
        ${thumb}
        <div class="autopilot-queue-copy">
          <span class="autopilot-queue-state">${escapeHTML(item.status || "queued")}</span>
          <strong>${escapeHTML(title)}</strong>
          <small>${escapeHTML(when)} · ${escapeHTML(platforms)} · ${escapeHTML(postType)}</small>
          ${captionExcerpt ? `<p class="autopilot-queue-excerpt">${escapeHTML(captionExcerpt)}</p>` : ""}
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "admin-item-actions autopilot-queue-actions";
      actions.append(
        makeButton("Voir", "ghost-button", () => openAutopilotEditor(item, true)),
        makeButton("Modifier", "secondary-button", () => openAutopilotEditor(item, false)),
        makeButton("Publier maintenant", "primary-button", () => publishAutopilotItem(item)),
        makeButton("Retirer", "danger-button", () => removeAutopilotItem(item))
      );

      card.appendChild(actions);
      root.appendChild(card);
    });
  }

  async function removeAutopilotItem(item) {
    if (!window.confirm("Retirer cette publication de la file ?")) return;
    try {
      await autopilotApi({ method: "PATCH", body: JSON.stringify({ action: "remove", id: item.id }) });
      await loadAutopilot();
    } catch (error) {
      setMessage("autopilotMessage", error.message, "error");
    }
  }

  /* =========================================================
     Aperçu visuel simple (HTML/CSS, sans appel externe) + édition manuelle
     ========================================================= */
  function renderAutopilotCard(item) {
    const hasPoster = item.generated_visual_mode === "poster" && isSafeUrl(item.image_url);
    const background = hasPoster
      ? `background-image:url('${escapeAttribute(item.image_url)}');`
      : "";

    return `
      <div class="autopilot-visual-card${hasPoster ? " has-poster" : ""}" style="${background}">
        <span class="autopilot-visual-badge">Kizomba Atlas</span>
        <div class="autopilot-visual-text">
          <strong>${escapeHTML(item.visual_title || item.title || item.event_title || "")}</strong>
          ${item.visual_subtitle ? `<span>${escapeHTML(item.visual_subtitle)}</span>` : ""}
          <div class="autopilot-visual-meta">
            ${item.visual_date ? `<span>📅 ${escapeHTML(item.visual_date)}</span>` : ""}
            ${item.visual_location ? `<span>⌖ ${escapeHTML(item.visual_location)}</span>` : ""}
          </div>
          <em>${escapeHTML(item.visual_cta || "Kizomba Atlas")}</em>
        </div>
      </div>
    `;
  }

  function openAutopilotEditor(item, readOnly) {
    state.autopilotEditingId = item.id;
    const panel = byId("autopilotEditPanel");
    if (!panel) return;

    byId("autopilotEditPreview").innerHTML = renderAutopilotCard(item);
    setValue("autopilotEditCaption", item.caption_fr || item.caption || "");
    setValue("autopilotEditHashtags", Array.isArray(item.hashtags) ? item.hashtags.join(", ") : "");
    setValue("autopilotEditVisualTitle", item.visual_title || "");
    setValue("autopilotEditVisualSubtitle", item.visual_subtitle || "");
    setValue("autopilotEditVisualDate", item.visual_date || "");
    setValue("autopilotEditCta", item.visual_cta || "Kizomba Atlas");
    setValue("autopilotEditPostType", item.post_type || "post");
    setValue("autopilotEditSchedule", toLocalInput(item.scheduled_for));

    panel.querySelectorAll("input, textarea, select").forEach((field) => { field.disabled = Boolean(readOnly); });
    byId("autopilotEditSaveButton").hidden = Boolean(readOnly);
    byId("autopilotEditTitle").textContent = readOnly ? "Aperçu de la publication" : "Modifier la publication";

    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeAutopilotEditor() {
    state.autopilotEditingId = null;
    const panel = byId("autopilotEditPanel");
    if (panel) panel.hidden = true;
  }

  async function saveAutopilotItem() {
    const id = state.autopilotEditingId;
    if (!id) return;

    const hashtags = value("autopilotEditHashtags")
      .split(",")
      .map((tag) => tag.trim().replace(/^#/, ""))
      .filter(Boolean)
      .slice(0, 10);

    try {
      await autopilotApi({
        method: "PATCH",
        body: JSON.stringify({
          action: "update",
          id,
          caption_fr: value("autopilotEditCaption"),
          hashtags,
          visual_title: value("autopilotEditVisualTitle"),
          visual_subtitle: value("autopilotEditVisualSubtitle"),
          visual_date: value("autopilotEditVisualDate"),
          visual_cta: value("autopilotEditCta"),
          post_type: value("autopilotEditPostType"),
          scheduled_for: toIsoOrNull(value("autopilotEditSchedule"))
        })
      });
      setMessage("autopilotMessage", "Publication mise à jour ✓", "success");
      closeAutopilotEditor();
      await loadAutopilot();
    } catch (error) {
      setMessage("autopilotMessage", error.message, "error");
    }
  }

  async function saveAutopilotSettings() {
    try { const data=await autopilotApi({method:"PATCH",body:JSON.stringify({action:"settings",enabled:value("autopilotEnabled")==="true",quota:Number(value("autopilotQuota")||2),cadence:value("autopilotCadence")||"weekly",instagram:Boolean(byId("autopilotInstagram")?.checked),facebook:Boolean(byId("autopilotFacebook")?.checked)})}); state.autopilotSettings=data.settings; renderAutopilot(); setMessage("autopilotMessage","Réglages Autopilote enregistrés ✓","success"); } catch(error){setMessage("autopilotMessage",error.message,"error");}
  }

  async function prepareAutopilotQueue() {
    const button=byId("prepareAutopilotQueueButton"); if(button){button.disabled=true;button.textContent="Préparation…";}
    try { const data=await autopilotApi({method:"POST",body:JSON.stringify({action:"prepare"})}); state.autopilotQueue=data.queue||[]; state.autopilotSettings=data.settings||state.autopilotSettings; renderAutopilot(); setMessage("autopilotMessage",`${data.created||0} publication(s) préparée(s). Meta n’est pas encore connecté.`,"success"); } catch(error){setMessage("autopilotMessage",error.message,"error");} finally {if(button){button.disabled=false;button.textContent="Préparer la file maintenant";}}
  }

  const SOCIAL_CAMPAIGN_START = "2026-08-10";
  const SOCIAL_STORAGE_KEY = "kizomba-atlas-social-v1";

  const SOCIAL_WEEK = {
    0: { format: "Story", time: "19:00", title: "Récap de la semaine", instruction: "Montre les nouveautés de la carte et termine par un rappel doux pour proposer une date.", caption: "🗺️ La semaine se termine sur Kizomba Atlas.\n\nDe nouvelles dates rejoignent progressivement la carte. Une soirée, un cours ou un festival en tête ? Proposez-la gratuitement :\n👉 kizomba-atlas.vercel.app/contact.html\n\n#kizomba #urbankiz #bachata #kizombafrance" },
    1: { format: "Story", time: "19:00", title: "Question à la communauté", instruction: "Poll rapide Kizomba / Urban Kiz + repartage d’un organisateur si une story pertinente est disponible.", caption: "Ce soir, tu choisis quoi ? 👀\nKIZOMBA ou URBAN KIZ ?\n\n🗺️ Retrouve les dates sur Kizomba Atlas\nkizomba-atlas.vercel.app" },
    2: { format: "Carrousel", time: "19:00", title: "Coup de projecteur", instruction: "Mets en avant un événement ou un organisateur réel de la carte. Invite au partage ou à la collaboration quand c’est pertinent.", caption: "📍 Coup de projecteur Kizomba Atlas\n\nUne date à découvrir sur la carte — adresse, horaires et itinéraire au même endroit.\n\n👉 kizomba-atlas.vercel.app\n\nTu connais quelqu’un que ça peut intéresser ? Envoie-lui ce post 👇\n\n#kizomba #urbankiz #kizombafrance #soireekizomba" },
    3: { format: "Reel", time: "19:00", title: "Dans la carte — 15 secondes", instruction: "Filme : ouverture de Kizomba Atlas → carte → formulaire → validation. Texte écran : Une date en tête ? → Propose-la → Je vérifie → Elle apparaît sur la carte.", caption: "Une date Kizomba en tête ? 📍\n\nPropose-la sur Kizomba Atlas. Je vérifie les informations avant publication, puis elle peut rejoindre la carte.\n\n👉 kizomba-atlas.vercel.app\n\n#kizomba #urbankiz #bachata #kizombafrance #agendaKizomba" },
    4: { format: "Story", time: "18:00", title: "Ce soir sur la carte", instruction: "S’il y a un événement réel ce soir, affiche-le avec tag organisateur + sticker lien. Sinon, publie un rappel pour proposer une date.", caption: "🔥 Ce soir, regarde ce qui se passe autour de toi sur Kizomba Atlas.\n\n📍 Adresse + itinéraire sur la carte\nkizomba-atlas.vercel.app" },
    5: { format: "Carrousel", time: "11:30", title: "Où danser ce week-end ?", instruction: "Sélectionne 3 à 5 événements réels à venir depuis la carte. Ne cite aucune date non vérifiée.", caption: "🌍 Où danser ce week-end ?\n\nRetrouve les événements vérifiés actuellement présents sur Kizomba Atlas : adresse, horaire et itinéraire en un clic.\n\n👉 kizomba-atlas.vercel.app\n\nEnregistre ce post pour le week-end et envoie-le à ton/ta partenaire de danse.\n\n#kizomba #urbankiz #bachata #ousortircesoir #kizombafrance" },
    6: { format: "Story", time: "19:00", title: "La communauté danse", instruction: "Repartage une soirée en cours si tu disposes d’une story officielle, sinon pose une question ouverte à la communauté.", caption: "📍 Où est-ce que tu danses ce soir ?\n\nRéponds en story 👇\nEt retrouve les dates sur Kizomba Atlas." }
  };

  function getSocialStore() {
    try { return JSON.parse(localStorage.getItem(SOCIAL_STORAGE_KEY) || "{}"); }
    catch { return {}; }
  }

  function setSocialStore(store) {
    try { localStorage.setItem(SOCIAL_STORAGE_KEY, JSON.stringify(store)); } catch {}
  }

  function campaignDate(index) {
    const d = new Date(`${SOCIAL_CAMPAIGN_START}T12:00:00`);
    d.setDate(d.getDate() + index);
    return d;
  }

  function campaignIndexForToday() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(`${SOCIAL_CAMPAIGN_START}T00:00:00`);
    return Math.max(0, Math.min(29, Math.floor((today - start) / 86400000)));
  }

  function socialItem(index) {
    const date = campaignDate(index);
    const base = SOCIAL_WEEK[date.getDay()];
    return { ...base, index, date, key: date.toISOString().slice(0,10) };
  }

  function initSocialPilot() {
    if (!byId("adminSocialSection")) return;
    renderSocialToday();
    renderSocialCampaign();
  }

  function publishedUpcomingEvents() {
    const now = Date.now();
    return (state.events || [])
      .filter((event) => event.status === "published")
      .filter((event) => {
        const reference = new Date(event.ends_at || event.starts_at).getTime();
        return Number.isFinite(reference) && reference >= now;
      })
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }

  function sameLocalDay(dateValue, reference = new Date()) {
    const d = new Date(dateValue);
    return Number.isFinite(d.getTime())
      && d.getFullYear() === reference.getFullYear()
      && d.getMonth() === reference.getMonth()
      && d.getDate() === reference.getDate();
  }

  function isThisWeekend(dateValue, reference = new Date()) {
    const d = new Date(dateValue);
    if (!Number.isFinite(d.getTime())) return false;
    const day = reference.getDay();
    const fridayOffset = (5 - day + 7) % 7;
    const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + fridayOffset, 0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 3);
    return d >= start && d < end;
  }

  function socialEventLabel(event) {
    if (!event) return "Aucun événement sélectionné";
    return [event.title_fr || event.title_en || "Événement", event.city].filter(Boolean).join(" — ");
  }

  function socialEventDetail(event) {
    if (!event) return "Aucune date publiée compatible pour ce contenu.";
    const date = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(event.starts_at));
    return [date, event.venue_name, event.organizer_name].filter(Boolean).join(" · ");
  }

  function relevantSocialEvents(item) {
    const upcoming = publishedUpcomingEvents();
    const weekday = item.date.getDay();
    if (weekday === 4) return upcoming.filter((e) => sameLocalDay(e.starts_at)).slice(0, 1);
    if (weekday === 5) {
      const weekend = upcoming.filter((e) => isThisWeekend(e.starts_at)).slice(0, 5);
      return weekend.length ? weekend : upcoming.slice(0, 5);
    }
    if (weekday === 2) return upcoming.slice(0, 1);
    return upcoming.slice(0, 1);
  }

  function hashtagForStyles(events) {
    const all = new Set(events.flatMap((e) => normalizedStyles(e)));
    const tags = ["#kizomba"];
    if (all.has("urban-kiz")) tags.push("#urbankiz");
    if (all.has("bachata")) tags.push("#bachata");
    if (all.has("semba")) tags.push("#semba");
    tags.push("#kizombafrance", "#kizombaatlas");
    return [...new Set(tags)].join(" ");
  }

  function eventCaption(event) {
    const title = event.title_fr || event.title_en || "Événement Kizomba";
    const date = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(event.starts_at));
    const place = [event.venue_name, event.city, event.country].filter(Boolean).join(" — ");
    const organizer = event.organizer_name ? `\nOrganisé par ${event.organizer_name}.` : "";
    const styles = styleSummary(event);
    return `📍 Coup de projecteur — ${title}\n\n📅 ${date}${place ? `\n📌 ${place}` : ""}${styles ? `\n🎶 ${styles}` : ""}${organizer}\n\nAdresse, horaires et itinéraire directement sur Kizomba Atlas :\n👉 kizomba-atlas.vercel.app\n\nTu connais quelqu’un que ça peut intéresser ? Envoie-lui ce post 👇\n\n${hashtagForStyles([event])}`;
  }

  function tonightCaption(event) {
    const title = event.title_fr || event.title_en || "Événement Kizomba";
    const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(event.starts_at));
    const place = [event.city, event.venue_name].filter(Boolean).join(" — ");
    return `🔥 Ce soir sur Kizomba Atlas : ${title}\n\n⏰ ${time}${place ? `\n📍 ${place}` : ""}\n\nAdresse et itinéraire sur la carte :\n👉 kizomba-atlas.vercel.app\n\n${hashtagForStyles([event])}`;
  }

  function weekendCaption(events) {
    const lines = events.map((event, index) => {
      const title = event.title_fr || event.title_en || "Événement";
      const when = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(new Date(event.starts_at));
      const city = event.city || event.country || "";
      return `${index + 1}. ${title} — ${when}${city ? ` · ${city}` : ""}`;
    });
    return `🌍 Où danser ce week-end ?\n\n${lines.join("\n")}\n\nToutes les informations vérifiées, adresses et itinéraires sont sur la carte :\n👉 kizomba-atlas.vercel.app\n\nEnregistre ce post et envoie-le à la personne avec qui tu irais danser.\n\n${hashtagForStyles(events)} #ousortircesoir`;
  }

  function captionFromMap(item, events) {
    const weekday = item.date.getDay();
    if (!events.length) return null;
    if (weekday === 2) return eventCaption(events[0]);
    if (weekday === 4) return tonightCaption(events[0]);
    if (weekday === 5) return weekendCaption(events);
    return null;
  }

  function updateSocialSource(item) {
    const events = relevantSocialEvents(item);
    const label = byId("socialEventSource");
    const detail = byId("socialEventSourceDetail");
    if (!label || !detail) return;
    if (!events.length) {
      label.textContent = "Aucun événement réel compatible aujourd’hui";
      detail.textContent = "L’assistant conservera le texte générique et n’inventera aucune date.";
      return;
    }
    label.textContent = events.length === 1 ? socialEventLabel(events[0]) : `${events.length} événements publiés sélectionnés`;
    detail.textContent = events.length === 1 ? socialEventDetail(events[0]) : events.map((e) => socialEventLabel(e)).join(" · ");
  }

  function generateSocialFromMap() {
    const item = socialItem(campaignIndexForToday());
    const events = relevantSocialEvents(item);
    const generated = captionFromMap(item, events);
    updateSocialSource(item);
    if (!generated) {
      setMessage("socialMessage", events.length ? "Aujourd’hui, le contenu ne nécessite pas de remplacer la légende par un événement. Le texte de campagne reste prêt." : "Aucun événement publié compatible trouvé. Rien n’a été inventé.", events.length ? "success" : "error");
      return;
    }
    byId("socialCaption").value = generated;
    const store = getSocialStore();
    store[item.key] = { ...(store[item.key] || {}), caption: generated, generatedFromMap: true, updatedAt: new Date().toISOString() };
    setSocialStore(store);
    setMessage("socialMessage", `Légende générée avec ${events.length === 1 ? "un événement réel de la carte" : `${events.length} événements réels de la carte`} ✓`, "success");
  }

  function renderSocialToday() {
    const item = socialItem(campaignIndexForToday());
    const store = getSocialStore();
    const saved = store[item.key] || {};
    setText("socialDayBadge", `J${item.index + 1}/30`);
    setText("socialFormat", item.format);
    setText("socialTime", `⏰ ${item.time}`);
    setText("socialTitle", item.title);
    setText("socialInstruction", item.instruction);
    updateSocialSource(item);
    const mapCaption = captionFromMap(item, relevantSocialEvents(item));
    byId("socialCaption").value = saved.caption ?? mapCaption ?? item.caption;
    const published = saved.published === true;
    setText("socialStatus", published ? "Publiée ✓" : "À publier");
    byId("socialStatus")?.classList.toggle("is-published", published);
    setText("markSocialPublishedButton", published ? "↶ Marquer non publiée" : "✓ Marquer publiée");
  }

  function saveSocialDraft() {
    const item = socialItem(campaignIndexForToday());
    const store = getSocialStore();
    store[item.key] = { ...(store[item.key] || {}), caption: byId("socialCaption").value };
    setSocialStore(store);
  }

  async function copySocialCaption() {
    const text = byId("socialCaption")?.value || "";
    try {
      await navigator.clipboard.writeText(text);
      setMessage("socialMessage", "Texte copié. Tu peux le coller dans Instagram.", "success");
    } catch {
      byId("socialCaption")?.select();
      setMessage("socialMessage", "Sélectionne puis copie le texte.");
    }
  }

  async function shareSocialPost() {
    const text = byId("socialCaption")?.value || "";
    if (navigator.share) {
      try { await navigator.share({ title: "Kizomba Atlas", text }); return; } catch (e) { if (e?.name === "AbortError") return; }
    }
    await copySocialCaption();
  }

  function toggleSocialPublished() {
    const item = socialItem(campaignIndexForToday());
    const store = getSocialStore();
    const current = store[item.key] || {};
    store[item.key] = { ...current, caption: byId("socialCaption").value, published: !current.published, updatedAt: new Date().toISOString() };
    setSocialStore(store);
    renderSocialToday();
    renderSocialCampaign();
    setMessage("socialMessage", store[item.key].published ? "Publication marquée comme faite ✓" : "Publication remise à faire.", "success");
  }

  function renderSocialCampaign() {
    const root = byId("socialCampaignList");
    if (!root) return;
    const store = getSocialStore();
    const todayIndex = campaignIndexForToday();
    root.innerHTML = "";
    for (let i=0;i<30;i++) {
      const item = socialItem(i);
      const row = document.createElement("div");
      row.className = `social-campaign-row${i === todayIndex ? " is-today" : ""}${store[item.key]?.published ? " is-done" : ""}`;
      const dateLabel = new Intl.DateTimeFormat("fr-FR", { weekday:"short", day:"2-digit", month:"2-digit" }).format(item.date);
      row.innerHTML = `<span class="social-campaign-day">J${i+1}</span><span><strong>${escapeHTML(dateLabel)} · ${escapeHTML(item.format)}</strong><small>${escapeHTML(item.title)} · ${escapeHTML(item.time)}</small></span><span class="social-campaign-check">${store[item.key]?.published ? "✓" : ""}</span>`;
      root.appendChild(row);
    }
  }

  function makeButton(label, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function value(id) {
    return byId(id)?.value?.trim() || "";
  }

  function setValue(id, newValue) {
    const element = byId(id);
    if (element) element.value = newValue ?? "";
  }

  function setText(id, newValue) {
    const element = byId(id);
    if (element) element.textContent = String(newValue);
  }

  function initAdminInstall() {
    const button = byId("adminInstallButton");
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

    window.addEventListener("appinstalled", () => {
      state.deferredInstallPrompt = null;
      button.classList.add("is-hidden");
    });
  }

  function registerAdminServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.info("Service worker admin non installé :", error);
      });
    });
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function setMessage(id, message, type = "") {
    const element = byId(id);
    if (!element) return;
    element.textContent = message || "";
    element.classList.remove("is-error", "is-success");
    if (type === "error") element.classList.add("is-error");
    if (type === "success") element.classList.add("is-success");
  }

  function toIsoOrNull(input) {
    if (!input) return null;
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function toLocalInput(input) {
    if (!input) return "";
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function formatDate(input) {
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function isSafeUrl(input) {
    if (!input) return false;
    try {
      const url = new URL(input);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }

  function escapeHTML(input) {
    return String(input ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(input) {
    return escapeHTML(input).replaceAll("`", "&#096;");
  }
})();
