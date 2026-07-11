(() => {
  "use strict";

  const t = (key) => window.KizombaAtlasLanguage.t(key);
  const state = {
    supabase: null,
    session: null,
    profile: null,
    events: [],
    proRequest: null,
    monthlyCount: 0,
    map: null,
    marker: null,
    previewLogoUrl: ""
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindUI();
    initMap();

    if (!window.isSupabaseConfigured()) {
      document.getElementById("organizerSetupNotice").classList.remove("is-hidden");
      document.getElementById("organizerAuthPanel").classList.add("is-hidden");
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
    document.getElementById("organizerLanguageButton").addEventListener("click", () => window.KizombaAtlasLanguage.toggle());

    window.addEventListener("kizomba-atlas:languagechange", () => {
      renderDashboard();
      renderEvents();
      updateSubmitButton();
    });

    document.querySelectorAll(".auth-tab").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".auth-tab").forEach((tab) => tab.classList.remove("is-active"));
        document.querySelectorAll(".auth-view").forEach((form) => form.classList.remove("is-active"));
        button.classList.add("is-active");
        document.getElementById(button.dataset.authView).classList.add("is-active");
      });
    });

    document.getElementById("signInForm").addEventListener("submit", signIn);
    document.getElementById("signUpForm").addEventListener("submit", signUp);
    document.getElementById("organizerLogoutButton").addEventListener("click", signOut);

    document.querySelectorAll(".organizer-tabs .admin-tab").forEach((button) => {
      button.addEventListener("click", () => switchPanel(button.dataset.organizerPanel, button));
    });

    document.getElementById("organizerEventForm").addEventListener("submit", saveEvent);
    document.getElementById("resetOrganizerEventButton").addEventListener("click", resetEventForm);
    document.getElementById("organizerGeocodeButton").addEventListener("click", geocodeAddress);
    document.getElementById("organizerImageFile").addEventListener("change", previewSelectedImage);
    document.getElementById("organizerLogoFile").addEventListener("change", previewSelectedLogo);
    document.getElementById("organizerMapStyle").addEventListener("change", updateOrganizerMarkerPreview);
    document.getElementById("organizerCategory").addEventListener("change", updateOrganizerMarkerPreview);
    document.getElementById("requestProButton").addEventListener("click", requestPro);
  }

  function initMap() {
    state.map = L.map("organizerMap").setView(
      window.KIZOMBA_ATLAS_CONFIG.DEFAULT_MAP_CENTER,
      window.KIZOMBA_ATLAS_CONFIG.DEFAULT_MAP_ZOOM
    );
    state.map.attributionControl.setPrefix(false);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap"
    }).addTo(state.map);

    state.map.on("click", (event) => setPosition(event.latlng.lat, event.latlng.lng, true));
  }

  async function updateAuthUI() {
    const authPanel = document.getElementById("organizerAuthPanel");
    const dashboard = document.getElementById("organizerDashboard");

    if (!state.session) {
      authPanel.classList.remove("is-hidden");
      dashboard.classList.add("is-hidden");
      return;
    }

    authPanel.classList.add("is-hidden");
    dashboard.classList.remove("is-hidden");
    await ensureProfile();
    await loadDashboardData();
    setTimeout(() => state.map.invalidateSize(), 100);
  }

  async function signIn(event) {
    event.preventDefault();
    setMessage("organizerLoginMessage", t("loading"));

    const { error } = await state.supabase.auth.signInWithPassword({
      email: value("organizerLoginEmail"),
      password: document.getElementById("organizerLoginPassword").value
    });

    if (error) {
      console.error(error);
      setMessage("organizerLoginMessage", t("loginFailed"), "error");
      return;
    }
    setMessage("organizerLoginMessage", "");
  }

  async function signUp(event) {
    event.preventDefault();
    setMessage("organizerSignupMessage", t("loading"));

    const { data, error } = await state.supabase.auth.signUp({
      email: value("signupEmail"),
      password: document.getElementById("signupPassword").value,
      options: {
        data: {
          display_name: value("signupName"),
          organization_name: value("signupOrganization")
        }
      }
    });

    if (error) {
      console.error(error);
      setMessage("organizerSignupMessage", t("signupFailed"), "error");
      return;
    }

    setMessage("organizerSignupMessage", data.session ? t("accountCreated") : t("checkYourEmail"), "success");
  }

  async function signOut() {
    await state.supabase.auth.signOut();
  }

  async function ensureProfile() {
    const user = state.session.user;
    const { data, error } = await state.supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (error) console.error(error);
    if (data) {
      state.profile = data;
      return;
    }

    const metadata = user.user_metadata || {};
    const { data: created, error: createError } = await state.supabase.from("profiles").insert({
      user_id: user.id,
      display_name: metadata.display_name || "",
      organization_name: metadata.organization_name || metadata.display_name || ""
    }).select().single();

    if (createError) {
      console.error(createError);
      return;
    }
    state.profile = created;
  }

  async function loadDashboardData() {
    const userId = state.session.user.id;
    const [profileResult, eventResult, countResult, requestResult] = await Promise.all([
      state.supabase.from("profiles").select("*").eq("user_id", userId).single(),
      state.supabase.from("events").select("*").eq("owner_id", userId).order("created_at", { ascending: false }),
      state.supabase.rpc("monthly_submission_count"),
      state.supabase.from("pro_requests").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle()
    ]);

    if (profileResult.error) console.error(profileResult.error);
    if (eventResult.error) console.error(eventResult.error);
    if (countResult.error) console.error(countResult.error);
    if (requestResult.error) console.error(requestResult.error);

    state.profile = profileResult.data || state.profile;
    state.events = eventResult.data || [];
    state.monthlyCount = Number(countResult.data || 0);
    state.proRequest = requestResult.data || null;
    renderDashboard();
    renderEvents();
  }

  function renderDashboard() {
    if (!state.profile) return;
    const isPro = state.profile.plan === "pro";

    document.getElementById("organizationHeading").textContent =
      state.profile.organization_name || state.profile.display_name || "Kizomba Atlas";

    const planBadge = document.getElementById("planBadge");
    planBadge.textContent = isPro ? "Atlas Pro" : t("atlasFree");
    planBadge.className = `status-badge ${isPro ? "status-plan-pro" : "status-plan-free"}`;
    document.getElementById("verifiedBadge").classList.toggle("is-hidden", !state.profile.verified);

    const usageValue = document.getElementById("usageValue");
    const usageBar = document.getElementById("usageBar");
    const usageHint = document.getElementById("usageHint");

    if (isPro) {
      usageValue.textContent = `${state.monthlyCount} / ∞`;
      usageBar.style.width = "100%";
      usageHint.textContent = t("unlimitedSubmissions");
    } else {
      usageValue.textContent = `${state.monthlyCount} / 2`;
      usageBar.style.width = `${Math.min(100, (state.monthlyCount / 2) * 100)}%`;
      usageHint.textContent = t("freeMonthlyLimit");
    }

    document.getElementById("publishedCount").textContent = String(state.events.filter((item) => item.status === "published").length);
    document.getElementById("pendingCount").textContent = String(state.events.filter((item) => item.status === "pending").length);

    if (!value("organizerPublicName")) setValue("organizerPublicName", state.profile.organization_name || "");

    const requestButton = document.getElementById("requestProButton");
    const requestMessage = document.getElementById("proRequestMessage");
    if (isPro) {
      requestButton.disabled = true;
      requestButton.textContent = "Atlas Pro";
      requestMessage.textContent = t("alreadyPro");
    } else if (state.proRequest?.status === "pending") {
      requestButton.disabled = true;
      requestMessage.textContent = t("proRequestPending");
    } else {
      requestButton.disabled = false;
      requestButton.textContent = t("requestPro");
      requestMessage.textContent = "";
    }
    updateSubmitButton();
  }

  function renderEvents() {
    const container = document.getElementById("organizerEventList");
    if (!container) return;
    if (!state.events.length) {
      container.innerHTML = `<div class="empty-state">${escapeHTML(t("noOrganizerEvents"))}</div>`;
      return;
    }

    container.innerHTML = "";
    state.events.forEach((event) => {
      const item = document.createElement("article");
      item.className = "admin-list-item organizer-event-item";

      const top = document.createElement("div");
      top.className = "item-title-row";
      const title = document.createElement("h3");
      title.textContent = localText(event, "title") || event.title_fr || "Kizomba Atlas";
      const status = document.createElement("span");
      status.className = `status-badge status-${event.status}`;
      status.textContent = statusLabel(event.status);
      top.append(title, status);

      const date = document.createElement("p");
      date.textContent = `${formatDate(event.starts_at)} — ${event.venue_name || ""}`;
      const address = document.createElement("p");
      address.textContent = [event.address, event.city, event.country].filter(Boolean).join(", ");
      item.append(top, date, address);

      const tags = createTextStyleTags(event);
      if (tags) item.appendChild(tags);

      if (event.moderation_note) {
        const note = document.createElement("div");
        note.className = "moderation-note";
        note.innerHTML = `<strong>${escapeHTML(t("moderationComment"))}</strong><p>${escapeHTML(event.moderation_note)}</p>`;
        item.appendChild(note);
      }

      const actions = document.createElement("div");
      actions.className = "admin-item-actions";
      if (!["cancelled", "expired"].includes(event.status)) {
        actions.appendChild(button(t("edit"), "secondary-button", () => editEvent(event)));
        actions.appendChild(button(t("cancelEvent"), "danger-button", () => cancelEvent(event)));
      }
      item.appendChild(actions);
      container.appendChild(item);
    });
  }

  async function saveEvent(event) {
    event.preventDefault();
    if (!state.session || !state.profile) return setMessage("organizerEventMessage", t("authRequired"), "error");

    const id = value("organizerEventId");
    const isEditing = Boolean(id);
    if (!isEditing && state.profile.plan !== "pro" && state.monthlyCount >= 2) {
      return setMessage("organizerEventMessage", t("monthlyLimitReached"), "error");
    }

    const latitude = Number(value("organizerLatitude"));
    const longitude = Number(value("organizerLongitude"));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return setMessage("organizerEventMessage", t("addressNotFound"), "error");
    }

    const imageFile = document.getElementById("organizerImageFile").files[0];
    let imageUrl = value("organizerExistingImage") || null;
    if (imageFile) {
      if (!isValidImage(imageFile)) return setMessage("organizerEventMessage", t("invalidImage"), "error");
      setMessage("organizerEventMessage", t("uploadInProgress"));
      imageUrl = await uploadImage(imageFile);
      if (!imageUrl) return;
    }

    const logoFile = document.getElementById("organizerLogoFile").files[0];
    let logoUrl = value("organizerExistingLogo") || null;
    if (logoFile) {
      if (!isValidLogo(logoFile)) return setMessage("organizerEventMessage", t("invalidImage"), "error");
      setMessage("organizerEventMessage", t("uploadInProgress"));
      logoUrl = await uploadImage(logoFile, "logos");
      if (!logoUrl) return;
    }

    const styles = checkedValues("organizerStyle");
    if (!styles.length) {
      return setMessage("organizerEventMessage", t("selectAtLeastOneStyle"), "error");
    }

    const payload = {
      owner_id: state.session.user.id,
      title_fr: value("organizerTitleFr"),
      title_en: value("organizerTitleEn"),
      description_fr: value("organizerDescriptionFr"),
      description_en: value("organizerDescriptionEn"),
      category: value("organizerCategory"),
      styles,
      map_style: value("organizerMapStyle"),
      starts_at: toIsoOrNull(value("organizerStart")),
      ends_at: toIsoOrNull(value("organizerEnd")),
      venue_name: value("organizerVenue"),
      address: value("organizerAddress"),
      city: value("organizerCity"),
      country: value("organizerCountry"),
      latitude,
      longitude,
      image_url: imageUrl,
      logo_url: logoUrl,
      ticket_url: value("organizerTicketUrl") || null,
      organizer_name: value("organizerPublicName"),
      price_text_fr: value("organizerPriceFr"),
      price_text_en: value("organizerPriceEn"),
      status: "pending"
    };

    const query = isEditing
      ? state.supabase.from("events").update(payload).eq("id", id).eq("owner_id", state.session.user.id)
      : state.supabase.from("events").insert(payload);

    const { error } = await query;
    if (error) {
      console.error(error);
      const message = /monthly|limit|can_submit_event/i.test(error.message) ? t("monthlyLimitReached") : error.message;
      setMessage("organizerEventMessage", message, "error");
      return;
    }

    setMessage("organizerEventMessage", isEditing ? t("eventUpdated") : t("proposalSent"), "success");
    resetEventForm();
    await loadDashboardData();
    switchPanel("myEventsPanel", document.querySelector('[data-organizer-panel="myEventsPanel"]'));
  }

  async function uploadImage(file, folder = "posters") {
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${state.session.user.id}/${folder}/${crypto.randomUUID()}.${extension}`;
    const { error } = await state.supabase.storage.from("event-images").upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) {
      console.error(error);
      setMessage("organizerEventMessage", error.message, "error");
      return null;
    }
    const { data } = state.supabase.storage.from("event-images").getPublicUrl(path);
    return data.publicUrl;
  }

  function isValidImage(file) {
    return ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 5 * 1024 * 1024;
  }

  function isValidLogo(file) {
    return ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 2 * 1024 * 1024;
  }

  function previewSelectedLogo() {
    const file = document.getElementById("organizerLogoFile").files[0];
    const preview = document.getElementById("organizerLogoPreview");

    if (!file) {
      const existing = value("organizerExistingLogo");
      state.previewLogoUrl = existing || "";
      preview.innerHTML = existing
        ? `<img src="${escapeAttribute(existing)}" alt="" />`
        : `<span>${escapeHTML(t("noLogoSelected"))}</span>`;
      updateOrganizerMarkerPreview();
      return;
    }

    if (!isValidLogo(file)) {
      preview.innerHTML = `<span>${escapeHTML(t("invalidImage"))}</span>`;
      return;
    }

    const url = URL.createObjectURL(file);
    state.previewLogoUrl = url;
    preview.innerHTML = `<img src="${escapeAttribute(url)}" alt="" />`;
    updateOrganizerMarkerPreview();
  }

  function previewSelectedImage() {
    const file = document.getElementById("organizerImageFile").files[0];
    const preview = document.getElementById("organizerImagePreview");
    if (!file) {
      const existing = value("organizerExistingImage");
      preview.innerHTML = existing ? `<img src="${escapeAttribute(existing)}" alt="" />` : `<span>${escapeHTML(t("noImageSelected"))}</span>`;
      return;
    }
    if (!isValidImage(file)) {
      preview.innerHTML = `<span>${escapeHTML(t("invalidImage"))}</span>`;
      return;
    }
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${escapeAttribute(url)}" alt="" />`;
  }

  function editEvent(event) {
    setValue("organizerEventId", event.id);
    setValue("organizerExistingImage", event.image_url || "");
    setValue("organizerExistingLogo", event.logo_url || "");
    setValue("organizerTitleFr", event.title_fr);
    setValue("organizerTitleEn", event.title_en);
    setValue("organizerDescriptionFr", event.description_fr);
    setValue("organizerDescriptionEn", event.description_en);
    setValue("organizerCategory", normalizeEventType(event.category));
    setCheckedValues("organizerStyle", normalizedStyles(event));
    setValue("organizerMapStyle", event.map_style || preferredMapStyle(event));
    setValue("organizerStart", toLocalInput(event.starts_at));
    setValue("organizerEnd", toLocalInput(event.ends_at));
    setValue("organizerVenue", event.venue_name);
    setValue("organizerAddress", event.address);
    setValue("organizerCity", event.city);
    setValue("organizerCountry", event.country);
    setValue("organizerTicketUrl", event.ticket_url);
    setValue("organizerPublicName", event.organizer_name || state.profile.organization_name);
    setValue("organizerPriceFr", event.price_text_fr);
    setValue("organizerPriceEn", event.price_text_en);
    setPosition(Number(event.latitude), Number(event.longitude), true);
    document.getElementById("organizerEventFormTitle").textContent = t("editEvent");
    previewSelectedImage();
    previewSelectedLogo();
    updateSubmitButton();
    switchPanel("submitPanel", document.querySelector('[data-organizer-panel="submitPanel"]'));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function cancelEvent(event) {
    if (!window.confirm(t("confirmCancel"))) return;
    const { error } = await state.supabase.from("events").update({ status: "cancelled" }).eq("id", event.id).eq("owner_id", state.session.user.id);
    if (error) return console.error(error);
    await loadDashboardData();
  }

  function resetEventForm() {
    document.getElementById("organizerEventForm").reset();
    setValue("organizerEventId", "");
    setValue("organizerExistingImage", "");
    setValue("organizerExistingLogo", "");
    state.previewLogoUrl = "";
    setValue("organizerCountry", "France");
    setCheckedValues("organizerStyle", ["kizomba"]);
    setValue("organizerMapStyle", "kizomba");
    setValue("organizerLatitude", "");
    setValue("organizerLongitude", "");
    setValue("organizerPublicName", state.profile?.organization_name || "");
    if (state.marker) {
      state.marker.remove();
      state.marker = null;
    }
    state.map.setView(window.KIZOMBA_ATLAS_CONFIG.DEFAULT_MAP_CENTER, window.KIZOMBA_ATLAS_CONFIG.DEFAULT_MAP_ZOOM);
    document.getElementById("organizerEventFormTitle").textContent = t("proposeEvent");
    document.getElementById("organizerImagePreview").innerHTML = `<span>${escapeHTML(t("noImageSelected"))}</span>`;
    document.getElementById("organizerLogoPreview").innerHTML = `<span>${escapeHTML(t("noLogoSelected"))}</span>`;
    setMessage("organizerEventMessage", "");
    updateSubmitButton();
  }

  function updateSubmitButton() {
    const submitButton = document.getElementById("organizerSubmitButton");
    if (!submitButton) return;
    const isEditing = Boolean(value("organizerEventId"));
    submitButton.textContent = t(isEditing ? "updateAndResubmit" : "sendForReview");
    submitButton.disabled = !isEditing && state.profile?.plan !== "pro" && state.monthlyCount >= 2;
  }

  async function geocodeAddress() {
    const query = [value("organizerVenue"), value("organizerAddress"), value("organizerCity"), value("organizerCountry")].filter(Boolean).join(", ");
    if (!query) return;
    setMessage("organizerEventMessage", t("loading"));
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      url.searchParams.set("q", query);
      const response = await fetch(url, { headers: { "Accept-Language": window.KizombaAtlasLanguage.current } });
      if (!response.ok) throw new Error("Geocoding failed");
      const results = await response.json();
      if (!results.length) return setMessage("organizerEventMessage", t("addressNotFound"), "error");
      setPosition(Number(results[0].lat), Number(results[0].lon), true);
      setMessage("organizerEventMessage", "");
    } catch (error) {
      console.error(error);
      setMessage("organizerEventMessage", t("addressNotFound"), "error");
    }
  }

  function setPosition(lat, lng, centerMap) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setValue("organizerLatitude", lat.toFixed(7));
    setValue("organizerLongitude", lng.toFixed(7));
    if (!state.marker) {
      state.marker = L.marker([lat, lng], {
        draggable: true,
        title: "Exact position",
        icon: buildOrganizerPreviewIcon()
      }).addTo(state.map);
      state.marker.on("dragend", () => {
        const pos = state.marker.getLatLng();
        setPosition(pos.lat, pos.lng, false);
      });
    } else {
      state.marker.setLatLng([lat, lng]);
      updateOrganizerMarkerPreview();
    }
    if (centerMap) state.map.setView([lat, lng], 17);
  }

  function updateOrganizerMarkerPreview() {
    if (!state.marker) return;
    state.marker.setIcon(buildOrganizerPreviewIcon());
  }

  function buildOrganizerPreviewIcon() {
    const style = value("organizerMapStyle") || "kizomba";
    const category = value("organizerCategory") || "party";
    const logoUrl = state.previewLogoUrl || value("organizerExistingLogo");
    const hasLogo = Boolean(logoUrl);
    const label = category === "festival" ? "FEST" : category === "workshop" ? "WK" : "KIZ";
    const face = hasLogo
      ? `<img src="${escapeAttribute(logoUrl)}" alt="" />`
      : `<span>${label}</span>`;
    const badge = hasLogo && category !== "party"
      ? `<b>${category === "festival" ? "F" : "W"}</b>`
      : "";

    return L.divIcon({
      className: "",
      html: `<div class="kiz-marker${hasLogo ? " has-logo" : ""}" data-style="${escapeAttribute(style)}" data-type="${escapeAttribute(category)}"><div class="marker-face">${face}</div>${badge}</div>`,
      iconSize: [48, 52],
      iconAnchor: [24, 47]
    });
  }

  async function requestPro() {
    if (!state.session || state.profile?.plan === "pro") return;
    const { error } = await state.supabase.from("pro_requests").insert({ user_id: state.session.user.id, status: "pending" });
    if (error && error.code !== "23505") {
      console.error(error);
      setMessage("proRequestMessage", error.message, "error");
      return;
    }
    setMessage("proRequestMessage", t("proRequestSent"), "success");
    await loadDashboardData();
  }

  function switchPanel(panelId, activeButton) {
    document.querySelectorAll(".organizer-panel").forEach((panel) => panel.classList.remove("is-active"));
    document.querySelectorAll(".organizer-tabs .admin-tab").forEach((button) => button.classList.remove("is-active"));
    document.getElementById(panelId).classList.add("is-active");
    activeButton?.classList.add("is-active");
    if (panelId === "submitPanel") setTimeout(() => state.map.invalidateSize(), 80);
  }

  function statusLabel(status) {
    const key = {
      draft: "statusDraft", pending: "statusPending", published: "statusPublished",
      changes_requested: "statusChangesRequested", rejected: "statusRejected",
      cancelled: "statusCancelled", expired: "statusExpired"
    }[status] || "statusPending";
    return t(key);
  }

  function normalizedStyles(event) {
    if (Array.isArray(event.styles)) return event.styles.filter(Boolean);
    if (typeof event.styles === "string") {
      return event.styles.replace(/[{}]/g, "").split(",").map((item) => item.trim().replace(/^"|"$/g, "")).filter(Boolean);
    }
    if (["kizomba", "urban-kiz", "bachata", "sbk", "semba", "tarraxo"].includes(event.category)) return [event.category];
    return [];
  }

  function preferredMapStyle(event) {
    const allowed = ["kizomba", "urban-kiz", "bachata", "sbk", "semba", "tarraxo"];
    const styles = normalizedStyles(event);
    if (styles.includes("sbk") && styles.length > 1) return "sbk";
    return styles.find((style) => allowed.includes(style)) || "kizomba";
  }

  function normalizeEventType(category) {
    return ["festival", "workshop", "party"].includes(category) ? category : "party";
  }

  function checkedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
  }

  function setCheckedValues(name, values) {
    const selected = new Set(values || []);
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.checked = selected.has(input.value);
    });
  }

  function createTextStyleTags(event) {
    const styles = normalizedStyles(event);
    if (!styles.length) return null;
    const container = document.createElement("div");
    container.className = "event-style-tags";
    styles.forEach((style) => {
      const tag = document.createElement("span");
      tag.textContent = {"kizomba":"Kizomba","urban-kiz":"Urban Kiz","bachata":"Bachata","sbk":"SBK","semba":"Semba","tarraxo":"Tarraxo"}[style] || style;
      container.appendChild(tag);
    });
    return container;
  }

  function button(label, className, handler) {
    const el = document.createElement("button");
    el.className = className;
    el.type = "button";
    el.textContent = label;
    el.addEventListener("click", handler);
    return el;
  }

  function value(id) { return document.getElementById(id)?.value.trim() || ""; }
  function setValue(id, val) { const el = document.getElementById(id); if (el) el.value = val ?? ""; }
  function setMessage(id, text, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || "";
    el.classList.remove("is-error", "is-success");
    if (type === "error") el.classList.add("is-error");
    if (type === "success") el.classList.add("is-success");
  }

  function toIsoOrNull(val) {
    if (!val) return null;
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  function toLocalInput(val) {
    if (!val) return "";
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return "";
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function localText(item, field) {
    const lang = window.KizombaAtlasLanguage.current;
    return item[`${field}_${lang}`] || item[`${field}_fr`] || item[`${field}_en`] || "";
  }

  function formatDate(val) {
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(window.KizombaAtlasLanguage.current === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(d);
  }

  function escapeHTML(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
  function escapeAttribute(value) { return escapeHTML(value).replaceAll("`", "&#096;"); }
})();
