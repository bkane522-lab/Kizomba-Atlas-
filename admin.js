(() => {
  "use strict";

  const t = (key) => window.KizombaAtlasLanguage.t(key);

  const state = {
    supabase: null,
    session: null,
    map: null,
    positionMarker: null,
    events: [],
    news: [],
    profiles: [],
    proRequests: []
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindUI();
    initAdminMap();

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

    updateAuthUI();
  }

  function bindUI() {
    document.getElementById("adminLanguageButton").addEventListener("click", () => {
      window.KizombaAtlasLanguage.toggle();
    });

    window.addEventListener("kizomba-atlas:languagechange", () => {
      updateFormButtonLabels();
      renderAdminEvents();
      renderAdminNews();
      renderValidations();
      renderOrganizers();
      renderProRequests();
    });

    document.getElementById("loginForm").addEventListener("submit", login);
    document.getElementById("logoutButton").addEventListener("click", logout);

    document.querySelectorAll(".admin-tab").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".admin-tab").forEach((item) => item.classList.remove("is-active"));
        document.querySelectorAll(".admin-panel").forEach((panel) => panel.classList.remove("is-active"));
        button.classList.add("is-active");
        document.getElementById(button.dataset.adminPanel).classList.add("is-active");
        if (button.dataset.adminPanel === "eventsPanel") {
          setTimeout(() => state.map.invalidateSize(), 80);
        }
      });
    });

    document.getElementById("eventForm").addEventListener("submit", saveEvent);
    document.getElementById("resetEventButton").addEventListener("click", resetEventForm);
    document.getElementById("geocodeButton").addEventListener("click", geocodeAddress);

    document.getElementById("newsForm").addEventListener("submit", saveNews);
    document.getElementById("resetNewsButton").addEventListener("click", resetNewsForm);
  }

  function initAdminMap() {
    state.map = L.map("adminMap").setView(
      window.KIZOMBA_ATLAS_CONFIG.DEFAULT_MAP_CENTER,
      window.KIZOMBA_ATLAS_CONFIG.DEFAULT_MAP_ZOOM
    );

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(state.map);

    state.map.on("click", (event) => setPosition(event.latlng.lat, event.latlng.lng, true));
  }

  async function updateAuthUI() {
    const loginPanel = document.getElementById("loginPanel");
    const dashboardPanel = document.getElementById("dashboardPanel");

    if (!state.session) {
      loginPanel.classList.remove("is-hidden");
      dashboardPanel.classList.add("is-hidden");
      return;
    }

    const isAdmin = await checkAdminAccess();
    if (!isAdmin) {
      await state.supabase.auth.signOut();
      setMessage("loginMessage", t("loginFailed"), "error");
      return;
    }

    loginPanel.classList.add("is-hidden");
    dashboardPanel.classList.remove("is-hidden");
    setTimeout(() => state.map.invalidateSize(), 80);
    await Promise.all([loadAdminEvents(), loadAdminNews(), loadProfiles(), loadProRequests()]);
  }

  async function checkAdminAccess() {
    const { data, error } = await state.supabase.rpc("is_admin");
    if (error) {
      console.error("Admin check:", error);
      return false;
    }
    return data === true;
  }

  async function login(event) {
    event.preventDefault();
    setMessage("loginMessage", t("loading"));

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    const { error } = await state.supabase.auth.signInWithPassword({ email, password });

    if (error) {
      console.error(error);
      setMessage("loginMessage", t("loginFailed"), "error");
      return;
    }

    setMessage("loginMessage", "");
  }

  async function logout() {
    await state.supabase.auth.signOut();
  }

  async function loadAdminEvents() {
    const { data, error } = await state.supabase
      .from("events")
      .select("*")
      .order("starts_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    state.events = data || [];
    renderAdminEvents();
    renderValidations();
  }

  async function loadAdminNews() {
    const { data, error } = await state.supabase
      .from("live_news")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    state.news = data || [];
    renderAdminNews();
  }

  async function saveEvent(event) {
    event.preventDefault();
    if (!state.session) return setMessage("eventFormMessage", t("authRequired"), "error");

    const payload = {
      title_fr: value("eventTitleFr"),
      title_en: value("eventTitleEn"),
      description_fr: value("eventDescriptionFr"),
      description_en: value("eventDescriptionEn"),
      category: value("eventCategory"),
      starts_at: toIsoOrNull(value("eventStart")),
      ends_at: toIsoOrNull(value("eventEnd")),
      venue_name: value("eventVenue"),
      address: value("eventAddress"),
      city: value("eventCity"),
      country: value("eventCountry"),
      latitude: Number(value("eventLatitude")),
      longitude: Number(value("eventLongitude")),
      image_url: value("eventImageUrl") || null,
      ticket_url: value("eventTicketUrl") || null,
      price_text_fr: value("eventPriceFr"),
      price_text_en: value("eventPriceEn"),
      status: "published"
    };

    if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) {
      return setMessage("eventFormMessage", t("addressNotFound"), "error");
    }

    const id = value("eventId");
    const query = id
      ? state.supabase.from("events").update(payload).eq("id", id)
      : state.supabase.from("events").insert(payload);

    const { error } = await query;

    if (error) {
      console.error(error);
      setMessage("eventFormMessage", error.message, "error");
      return;
    }

    setMessage("eventFormMessage", t("savedSuccessfully"), "success");
    resetEventForm();
    await loadAdminEvents();
  }

  async function saveNews(event) {
    event.preventDefault();
    if (!state.session) return setMessage("newsFormMessage", t("authRequired"), "error");

    const payload = {
      text_fr: value("newsTextFr"),
      text_en: value("newsTextEn"),
      type: value("newsType"),
      priority: Number(value("newsPriority") || 0),
      active: document.getElementById("newsActive").checked,
      starts_at: toIsoOrNull(value("newsStart")),
      ends_at: toIsoOrNull(value("newsEnd"))
    };

    const id = value("newsId");
    const query = id
      ? state.supabase.from("live_news").update(payload).eq("id", id)
      : state.supabase.from("live_news").insert(payload);

    const { error } = await query;

    if (error) {
      console.error(error);
      setMessage("newsFormMessage", error.message, "error");
      return;
    }

    setMessage("newsFormMessage", t("savedSuccessfully"), "success");
    resetNewsForm();
    await loadAdminNews();
  }

  function renderAdminEvents() {
    const container = document.getElementById("adminEventList");
    if (!container) return;

    if (!state.events.length) {
      container.innerHTML = `<div class="empty-state">${escapeHTML(t("noData"))}</div>`;
      return;
    }

    container.innerHTML = "";
    state.events.forEach((event) => {
      const item = document.createElement("article");
      item.className = "admin-list-item";

      const title = document.createElement("h3");
      title.textContent = localText(event, "title") || event.title_fr || "Kizomba Atlas Event";

      const date = document.createElement("p");
      date.textContent = `${formatDate(event.starts_at)} — ${event.venue_name || ""}`;

      const address = document.createElement("p");
      address.textContent = [event.address, event.city, event.country].filter(Boolean).join(", ");

      const actions = document.createElement("div");
      actions.className = "admin-item-actions";

      const editButton = button(t("edit"), "secondary-button", () => editEvent(event));
      const deleteButton = button(t("delete"), "danger-button", () => deleteEvent(event.id));

      actions.append(editButton, deleteButton);
      item.append(title, date, address, actions);
      container.appendChild(item);
    });
  }

  function renderAdminNews() {
    const container = document.getElementById("adminNewsList");
    if (!container) return;

    if (!state.news.length) {
      container.innerHTML = `<div class="empty-state">${escapeHTML(t("noData"))}</div>`;
      return;
    }

    container.innerHTML = "";
    state.news.forEach((news) => {
      const item = document.createElement("article");
      item.className = "admin-list-item";

      const title = document.createElement("h3");
      title.textContent = window.KizombaAtlasLanguage.current === "fr"
        ? news.text_fr
        : news.text_en;

      const meta = document.createElement("p");
      meta.textContent = `${news.type || "info"} · priorité ${news.priority ?? 0} · ${news.active ? "active" : "inactive"}`;

      const actions = document.createElement("div");
      actions.className = "admin-item-actions";
      actions.append(
        button(t("edit"), "secondary-button", () => editNews(news)),
        button(t("delete"), "danger-button", () => deleteNews(news.id))
      );

      item.append(title, meta, actions);
      container.appendChild(item);
    });
  }

  function editEvent(event) {
    setValue("eventId", event.id);
    setValue("eventTitleFr", event.title_fr);
    setValue("eventTitleEn", event.title_en);
    setValue("eventDescriptionFr", event.description_fr);
    setValue("eventDescriptionEn", event.description_en);
    setValue("eventCategory", event.category);
    setValue("eventStart", toLocalInput(event.starts_at));
    setValue("eventEnd", toLocalInput(event.ends_at));
    setValue("eventVenue", event.venue_name);
    setValue("eventAddress", event.address);
    setValue("eventCity", event.city);
    setValue("eventCountry", event.country);
    setValue("eventImageUrl", event.image_url);
    setValue("eventTicketUrl", event.ticket_url);
    setValue("eventPriceFr", event.price_text_fr);
    setValue("eventPriceEn", event.price_text_en);
    setPosition(Number(event.latitude), Number(event.longitude), true);

    document.getElementById("eventFormTitle").textContent = t("editEvent");
    updateFormButtonLabels();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function editNews(news) {
    setValue("newsId", news.id);
    setValue("newsTextFr", news.text_fr);
    setValue("newsTextEn", news.text_en);
    setValue("newsType", news.type);
    setValue("newsPriority", news.priority);
    document.getElementById("newsActive").checked = Boolean(news.active);
    setValue("newsStart", toLocalInput(news.starts_at));
    setValue("newsEnd", toLocalInput(news.ends_at));

    document.getElementById("newsFormTitle").textContent = t("editLiveNews");
    updateFormButtonLabels();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteEvent(id) {
    if (!window.confirm(t("confirmDelete"))) return;
    const { error } = await state.supabase.from("events").delete().eq("id", id);
    if (error) return console.error(error);
    await loadAdminEvents();
  }

  async function deleteNews(id) {
    if (!window.confirm(t("confirmDelete"))) return;
    const { error } = await state.supabase.from("live_news").delete().eq("id", id);
    if (error) return console.error(error);
    await loadAdminNews();
  }

  function resetEventForm() {
    document.getElementById("eventForm").reset();
    setValue("eventId", "");
    setValue("eventCountry", "France");
    setValue("eventLatitude", "");
    setValue("eventLongitude", "");
    if (state.positionMarker) {
      state.positionMarker.remove();
      state.positionMarker = null;
    }
    state.map.setView(window.KIZOMBA_ATLAS_CONFIG.DEFAULT_MAP_CENTER, window.KIZOMBA_ATLAS_CONFIG.DEFAULT_MAP_ZOOM);
    document.getElementById("eventFormTitle").textContent = t("addEvent");
    setMessage("eventFormMessage", "");
    updateFormButtonLabels();
  }

  function resetNewsForm() {
    document.getElementById("newsForm").reset();
    setValue("newsId", "");
    setValue("newsPriority", "10");
    document.getElementById("newsActive").checked = true;
    document.getElementById("newsFormTitle").textContent = t("addLiveNews");
    setMessage("newsFormMessage", "");
    updateFormButtonLabels();
  }

  function updateFormButtonLabels() {
    const eventEditing = Boolean(value("eventId"));
    const newsEditing = Boolean(value("newsId"));

    document.querySelector("#eventForm .primary-button").textContent = t(eventEditing ? "updateEvent" : "publishEvent");
    document.querySelector("#newsForm .primary-button").textContent = t(newsEditing ? "updateNews" : "publishNews");
  }

  async function geocodeAddress() {
    const query = [
      value("eventVenue"),
      value("eventAddress"),
      value("eventCity"),
      value("eventCountry")
    ].filter(Boolean).join(", ");

    if (!query) return;

    setMessage("eventFormMessage", t("loading"));

    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      url.searchParams.set("q", query);

      const response = await fetch(url, {
        headers: { "Accept-Language": window.KizombaAtlasLanguage.current }
      });

      if (!response.ok) throw new Error("Geocoding failed");
      const results = await response.json();

      if (!results.length) {
        setMessage("eventFormMessage", t("addressNotFound"), "error");
        return;
      }

      setPosition(Number(results[0].lat), Number(results[0].lon), true);
      setMessage("eventFormMessage", "");
    } catch (error) {
      console.error(error);
      setMessage("eventFormMessage", t("addressNotFound"), "error");
    }
  }

  function setPosition(lat, lng, centerMap) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    setValue("eventLatitude", lat.toFixed(7));
    setValue("eventLongitude", lng.toFixed(7));

    if (!state.positionMarker) {
      state.positionMarker = L.marker([lat, lng], {
        draggable: true,
        title: "Exact position"
      }).addTo(state.map);

      state.positionMarker.on("dragend", () => {
        const position = state.positionMarker.getLatLng();
        setPosition(position.lat, position.lng, false);
      });
    } else {
      state.positionMarker.setLatLng([lat, lng]);
    }

    if (centerMap) state.map.setView([lat, lng], 17);
  }

  function button(label, className, handler) {
    const element = document.createElement("button");
    element.className = className;
    element.type = "button";
    element.textContent = label;
    element.addEventListener("click", handler);
    return element;
  }

  function value(id) {
    return document.getElementById(id).value.trim();
  }

  function setValue(id, value) {
    document.getElementById(id).value = value ?? "";
  }

  function setMessage(id, text, type) {
    const element = document.getElementById(id);
    element.textContent = text || "";
    element.classList.remove("is-error", "is-success");
    if (type === "error") element.classList.add("is-error");
    if (type === "success") element.classList.add("is-success");
  }

  function toIsoOrNull(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function toLocalInput(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  }

  function localText(item, field) {
    const language = window.KizombaAtlasLanguage.current;
    return item[`${field}_${language}`] || item[`${field}_fr`] || item[`${field}_en`] || "";
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(window.KizombaAtlasLanguage.current === "fr" ? "fr-FR" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function loadProfiles() {
    const { data, error } = await state.supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    state.profiles = data || [];
    renderOrganizers();
  }

  async function loadProRequests() {
    const { data, error } = await state.supabase
      .from("pro_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    state.proRequests = data || [];
    renderProRequests();
  }

  function renderValidations() {
    const container = document.getElementById("validationList");
    if (!container) return;
    const pending = state.events.filter((event) => event.status === "pending");
    if (!pending.length) {
      container.innerHTML = `<div class="empty-state">${escapeHTML(t("noData"))}</div>`;
      return;
    }
    container.innerHTML = "";
    pending.forEach((event) => {
      const item = document.createElement("article");
      item.className = "validation-card";
      const profile = state.profiles.find((p) => p.user_id === event.owner_id);
      const organizer = profile?.organization_name || event.organizer_name || "Organisateur";
      item.innerHTML = `
        <div class="item-title-row">
          <div><span class="eyebrow">${escapeHTML(organizer)}</span><h3>${escapeHTML(localText(event, "title") || event.title_fr)}</h3></div>
          <span class="status-badge status-pending">${escapeHTML(t("statusPending"))}</span>
        </div>
        <p>${escapeHTML(formatDate(event.starts_at))}</p>
        <p>${escapeHTML([event.venue_name, event.address, event.city, event.country].filter(Boolean).join(" — "))}</p>
        <p>${escapeHTML(localText(event, "description") || "")}</p>`;
      const actions = document.createElement("div");
      actions.className = "validation-actions";
      actions.append(
        button(t("approve"), "primary-button", () => moderateEvent(event.id, "published")),
        button(t("requestChanges"), "secondary-button", () => moderateEvent(event.id, "changes_requested", true)),
        button(t("reject"), "danger-button", () => moderateEvent(event.id, "rejected", true))
      );
      const mapLink = document.createElement("a");
      mapLink.className = "ghost-button";
      mapLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.latitude},${event.longitude}`)}`;
      mapLink.target = "_blank";
      mapLink.rel = "noopener noreferrer";
      mapLink.textContent = t("openMap");
      mapLink.style.display = "grid";
      mapLink.style.placeItems = "center";
      actions.appendChild(mapLink);
      item.appendChild(actions);
      container.appendChild(item);
    });
  }

  async function moderateEvent(id, status, askNote = false) {
    let note = null;
    if (askNote) {
      note = window.prompt(t("moderationNotePrompt"), "");
      if (note === null) return;
    }
    const { error } = await state.supabase
      .from("events")
      .update({ status, moderation_note: note || null })
      .eq("id", id);
    if (error) {
      console.error(error);
      return;
    }
    await loadAdminEvents();
  }

  function renderOrganizers() {
    const container = document.getElementById("organizerAdminList");
    if (!container) return;
    if (!state.profiles.length) {
      container.innerHTML = `<div class="empty-state">${escapeHTML(t("noData"))}</div>`;
      return;
    }
    container.innerHTML = "";
    state.profiles.forEach((profile) => {
      const item = document.createElement("article");
      item.className = "admin-list-item";
      const row = document.createElement("div");
      row.className = "item-title-row";
      const title = document.createElement("h3");
      title.textContent = profile.organization_name || profile.display_name || "Organisateur";
      const plan = document.createElement("span");
      plan.className = `status-badge ${profile.plan === "pro" ? "status-plan-pro" : "status-plan-free"}`;
      plan.textContent = profile.plan === "pro" ? "Atlas Pro" : t("atlasFree");
      row.append(title, plan);
      const meta = document.createElement("p");
      meta.textContent = profile.verified ? t("verifiedOrganizer") : (profile.display_name || "");
      const actions = document.createElement("div");
      actions.className = "admin-item-actions";
      actions.append(
        button(profile.plan === "pro" ? t("setFree") : t("activatePro"), "secondary-button", () => setPlan(profile, profile.plan === "pro" ? "free" : "pro")),
        button(profile.verified ? t("removeVerification") : t("verify"), "secondary-button", () => setVerified(profile, !profile.verified))
      );
      item.append(row, meta, actions);
      container.appendChild(item);
    });
  }

  function renderProRequests() {
    const container = document.getElementById("proRequestAdminList");
    if (!container) return;
    const pending = state.proRequests.filter((request) => request.status === "pending");
    if (!pending.length) {
      container.innerHTML = `<div class="empty-state">${escapeHTML(t("noData"))}</div>`;
      return;
    }
    container.innerHTML = "";
    pending.forEach((request) => {
      const profile = state.profiles.find((p) => p.user_id === request.user_id);
      const item = document.createElement("article");
      item.className = "admin-list-item";
      const title = document.createElement("h3");
      title.textContent = profile?.organization_name || profile?.display_name || "Organisateur";
      const meta = document.createElement("p");
      meta.textContent = formatDate(request.created_at);
      const actions = document.createElement("div");
      actions.className = "admin-item-actions";
      actions.append(
        button(t("approveRequest"), "primary-button", () => resolveProRequest(request, true)),
        button(t("declineRequest"), "danger-button", () => resolveProRequest(request, false))
      );
      item.append(title, meta, actions);
      container.appendChild(item);
    });
  }

  async function setPlan(profile, plan) {
    const { error } = await state.supabase.from("profiles").update({ plan }).eq("user_id", profile.user_id);
    if (error) return console.error(error);
    await Promise.all([loadProfiles(), loadProRequests()]);
  }

  async function setVerified(profile, verified) {
    const { error } = await state.supabase.from("profiles").update({ verified }).eq("user_id", profile.user_id);
    if (error) return console.error(error);
    await loadProfiles();
  }

  async function resolveProRequest(request, approved) {
    const operations = [
      state.supabase.from("pro_requests").update({
        status: approved ? "approved" : "declined",
        resolved_at: new Date().toISOString()
      }).eq("id", request.id)
    ];
    if (approved) operations.push(state.supabase.from("profiles").update({ plan: "pro" }).eq("user_id", request.user_id));
    const results = await Promise.all(operations);
    results.forEach((result) => { if (result.error) console.error(result.error); });
    await Promise.all([loadProfiles(), loadProRequests()]);
  }

})();
