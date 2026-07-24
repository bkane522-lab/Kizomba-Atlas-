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
    filter: "pending",
    search: "",
    channel: null,
    deferredInstallPrompt: null
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindUI();
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
    byId("geocodeButton").addEventListener("click", geocodeAddress);
    byId("eventImageFile").addEventListener("change", previewPoster);
    byId("eventLogoFile").addEventListener("change", previewLogo);

    byId("eventRecurrence")?.addEventListener("change", toggleRecurrenceEnd);

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
    await loadEvents();
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

  function subscribeRealtime() {
    unsubscribeRealtime();
    state.channel = state.supabase
      .channel("kizomba-atlas-admin-events")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, loadEvents)
      .subscribe();
  }

  function unsubscribeRealtime() {
    if (state.channel && state.supabase) {
      state.supabase.removeChannel(state.channel);
      state.channel = null;
    }
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
