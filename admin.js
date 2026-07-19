(() => {
  "use strict";

  const ADMIN_EMAIL = "kizombaatlas.contact@gmail.com";
  const state = {
    supabase: null,
    session: null,
    map: null,
    marker: null,
    events: [],
    filter: "all",
    channel: null
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindUI();
    initMap();

    if (!window.isSupabaseConfigured()) {
      document.getElementById("setupNotice").classList.remove("is-hidden");
      document.getElementById("loginPanel").classList.add("is-hidden");
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

    document.querySelectorAll(".admin-event-filter").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".admin-event-filter").forEach((item) => item.classList.remove("is-active"));
        button.classList.add("is-active");
        state.filter = button.dataset.eventFilter;
        renderEvents();
      });
    });
  }

  function initMap() {
    state.map = L.map("adminMap").setView(
      window.KIZOMBA_ATLAS_CONFIG.DEFAULT_MAP_CENTER,
      window.KIZOMBA_ATLAS_CONFIG.DEFAULT_MAP_ZOOM
    );

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap"
    }).addTo(state.map);

    state.map.on("click", (event) => setPosition(event.latlng.lat, event.latlng.lng, true));
  }

  async function updateAuthUI() {
    const loginPanel = byId("loginPanel");
    const dashboard = byId("dashboardPanel");

    if (!state.session) {
      loginPanel.classList.remove("is-hidden");
      dashboard.classList.add("is-hidden");
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
      setMessage("loginMessage", "E-mail ou mot de passe incorrect.", "error");
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
      .order("starts_at", { ascending: false });

    if (error) {
      console.error(error);
      setListMessage(`Erreur : ${error.message}`);
      return;
    }

    state.events = data || [];
    updateStats();
    renderEvents();
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
        starts_at: toIsoOrNull(value("eventStart")),
        ends_at: toIsoOrNull(value("eventEnd")),
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
    const filtered = state.events.filter((event) => {
      return state.filter === "all" || event.status === state.filter;
    });

    if (!filtered.length) {
      container.innerHTML = '<div class="empty-state">Aucun événement dans cette catégorie.</div>';
      return;
    }

    container.innerHTML = "";

    filtered.forEach((event) => {
      const item = document.createElement("article");
      item.className = "admin-list-item admin-event-item";

      const poster = isSafeUrl(event.image_url)
        ? `<img class="admin-event-thumb" src="${escapeAttribute(event.image_url)}" alt="" loading="lazy" />`
        : `<div class="admin-event-thumb admin-event-thumb-placeholder">⌖</div>`;

      const statusLabel = event.status === "published" ? "Publié" : "Brouillon";
      const statusClass = event.status === "published" ? "status-published" : "status-draft";

      item.innerHTML = `
        <div class="admin-event-item-top">
          ${poster}
          <div class="admin-event-item-copy">
            <div class="item-title-row">
              <h3>${escapeHTML(event.title_fr || "Événement")}</h3>
              <span class="status-badge ${statusClass}">${statusLabel}</span>
            </div>
            <p>${escapeHTML(formatDate(event.starts_at))}</p>
            <p>${escapeHTML([event.venue_name, event.city, event.country].filter(Boolean).join(" — "))}</p>
            <p class="admin-style-line">${escapeHTML(styleSummary(event))}</p>
          </div>
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "admin-item-actions admin-event-actions";

      actions.append(
        makeButton("Modifier", "secondary-button", () => editEvent(event)),
        makeButton("Dupliquer", "ghost-button", () => duplicateEvent(event)),
        makeButton(
          event.status === "published" ? "Retirer de la carte" : "Publier",
          event.status === "published" ? "secondary-button" : "primary-button",
          () => toggleStatus(event)
        ),
        makeButton("Supprimer", "danger-button", () => deleteEvent(event))
      );

      item.appendChild(actions);
      container.appendChild(item);
    });
  }

  function updateStats() {
    const now = Date.now();
    const published = state.events.filter((event) => event.status === "published");
    const drafts = state.events.filter((event) => event.status === "draft");
    const upcoming = published.filter((event) => new Date(event.starts_at).getTime() >= now);

    byId("publishedCount").textContent = String(published.length);
    byId("draftCount").textContent = String(drafts.length);
    byId("upcomingCount").textContent = String(upcoming.length);
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
    setValue("eventExistingImageUrl", event.image_url);
    setValue("eventExistingLogoUrl", event.logo_url);
    setValue("eventImageUrlFallback", event.image_url);
    setPosition(Number(event.latitude), Number(event.longitude), true);

    byId("eventFormTitle").textContent = "Modifier l’événement";
    byId("eventImageFile").value = "";
    byId("eventLogoFile").value = "";
    renderPreview("eventImagePreview", event.image_url, "Aucune affiche");
    renderPreview("eventLogoPreview", event.logo_url, "Aucun logo");
    setMessage("eventFormMessage", "");

    document.querySelector(".admin-event-editor").scrollIntoView({ behavior: "smooth", block: "start" });
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

      const response = await fetch(url, {
        headers: { "Accept-Language": "fr" }
      });

      if (!response.ok) throw new Error("Recherche impossible.");
      const results = await response.json();
      if (!results.length) throw new Error("Adresse introuvable.");

      setPosition(Number(results[0].lat), Number(results[0].lon), true);
      setMessage("eventFormMessage", "Position trouvée.", "success");
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

  function normalizedStyles(event) {
    if (Array.isArray(event.styles)) return event.styles.filter(Boolean);
    if (typeof event.styles === "string") {
      return event.styles.replace(/[{}]/g, "").split(",").map((item) => item.trim().replace(/^"|"$/g, "")).filter(Boolean);
    }
    return [];
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

  function setValue(id, value) {
    const element = byId(id);
    if (element) element.value = value ?? "";
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
