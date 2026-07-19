(() => {
  "use strict";

  // Module de soumission publique d'un événement (statut "pending").
  // S'appuie sur le même client Supabase et la même config que l'app.

  const SUBMIT_COOLDOWN_MS = 60 * 1000;         // 1 min entre deux envois
  const SUBMIT_DAILY_LIMIT = 5;                  // max 5 envois / 24 h (côté client)
  const STORAGE_KEY = "kizomba-atlas-submissions-log";

  const state = {
    supabase: null,
    map: null,
    marker: null,
    latitude: null,
    longitude: null,
    busy: false,
    posterUrl: null,
    logoUrl: null
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    const openButton = byId("proposeButton");
    if (!openButton) return; // le bouton n'est pas sur cette page

    openButton.addEventListener("click", openModal);
    byId("submitClose")?.addEventListener("click", closeModal);
    byId("submitBackdrop")?.addEventListener("click", closeModal);
    byId("submitSuccessClose")?.addEventListener("click", closeModal);
    byId("submitAnother")?.addEventListener("click", resetToForm);
    byId("submitForm")?.addEventListener("submit", handleSubmit);
    byId("submitGeocode")?.addEventListener("click", geocode);
    byId("submitMyPosition")?.addEventListener("click", useMyPosition);
    byId("submitPosterFile")?.addEventListener("change", () => preview("submitPosterFile", "submitPosterPreview", "Aucune affiche"));
    byId("submitLogoFile")?.addEventListener("change", () => preview("submitLogoFile", "submitLogoPreview", "Aucun logo"));

    // Client Supabase (partagé avec la config déjà chargée par supabase-config.js)
    if (typeof window.loadKizombaAtlasConfig === "function") {
      await window.loadKizombaAtlasConfig();
    }
    if (window.isSupabaseConfigured && window.isSupabaseConfigured()) {
      state.supabase = window.supabase.createClient(
        window.KIZOMBA_ATLAS_CONFIG.SUPABASE_URL,
        window.KIZOMBA_ATLAS_CONFIG.SUPABASE_ANON_KEY
      );
    }
  }

  function openModal() {
    byId("submitBackdrop").hidden = false;
    byId("submitModal").hidden = false;
    document.body.style.overflow = "hidden";
    updateGpsStatus();
    window.setTimeout(initMap, 60);
  }

  function closeModal() {
    byId("submitBackdrop").hidden = true;
    byId("submitModal").hidden = true;
    document.body.style.overflow = "";
    resetToForm();
  }

  function initMap() {
    if (state.map) {
      window.setTimeout(() => state.map.invalidateSize(), 120);
      return;
    }
    const center = window.KIZOMBA_ATLAS_CONFIG?.DEFAULT_MAP_CENTER || [47.2, 3.0];
    const zoom = window.KIZOMBA_ATLAS_CONFIG?.DEFAULT_MAP_ZOOM || 6;

    state.map = L.map("submitMap", { zoomControl: true }).setView(center, zoom);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 20,
      subdomains: "abcd",
      attribution: "\u00a9 OpenStreetMap \u00a9 CARTO"
    }).addTo(state.map);

    state.map.on("click", (event) => setPosition(event.latlng.lat, event.latlng.lng, false));
    window.setTimeout(() => state.map.invalidateSize(), 120);
  }

  function updateGpsStatus() {
    const el = byId("submitGpsStatus");
    if (!el) return;
    const set = Number.isFinite(state.latitude) && Number.isFinite(state.longitude);
    el.classList.toggle("is-set", set);
    el.innerHTML = set
      ? '<span class="gps-dot"></span> Position d\u00e9finie \u2713'
      : '<span class="gps-dot"></span> Position non d\u00e9finie';
  }

  function useMyPosition() {
    if (!navigator.geolocation) {
      setMessage("La g\u00e9olocalisation n\u2019est pas disponible sur cet appareil.", "error");
      return;
    }
    setMessage("Recherche de votre position\u2026");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition(pos.coords.latitude, pos.coords.longitude, true);
        setMessage("Position trouv\u00e9e. Ajustez le point si besoin.", "success");
      },
      () => setMessage("Impossible d\u2019obtenir votre position.", "error"),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  function setPosition(lat, lng, center) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    state.latitude = Number(lat.toFixed(7));
    state.longitude = Number(lng.toFixed(7));
    byId("submitLat").value = state.latitude;
    byId("submitLng").value = state.longitude;

    if (!state.marker) {
      state.marker = L.marker([lat, lng], { draggable: true }).addTo(state.map);
      state.marker.on("dragend", () => {
        const p = state.marker.getLatLng();
        setPosition(p.lat, p.lng, false);
      });
    } else {
      state.marker.setLatLng([lat, lng]);
    }
    if (center) state.map.setView([lat, lng], 15);
    updateGpsStatus();
  }

  async function geocode() {
    const query = [
      value("submitVenue"),
      value("submitAddress"),
      value("submitCity"),
      value("submitCountry")
    ].filter(Boolean).join(", ");

    if (!query) {
      setMessage("Renseignez d’abord le lieu et l’adresse.", "error");
      return;
    }
    setMessage("Recherche de l’adresse…");

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
      setMessage("Position trouvée. Ajustez le point si besoin.", "success");
    } catch (error) {
      setMessage(error.message || "Adresse introuvable.", "error");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (state.busy) return;

    // --- Anti-spam 1 : honeypot (champ caché que seuls les bots remplissent) ---
    if (value("submitWebsite")) {
      // On fait semblant de réussir, sans rien envoyer.
      setMessage("Merci ! Votre événement a été transmis.", "success");
      byId("submitForm").reset();
      return;
    }

    // --- Anti-spam 2 : limite de fréquence côté client ---
    const guard = rateLimitCheck();
    if (!guard.ok) {
      setMessage(guard.reason, "error");
      return;
    }

    if (!state.supabase) {
      setMessage("Service momentanément indisponible. Réessayez plus tard.", "error");
      return;
    }

    const styles = checkedValues("submitStyle");
    if (!styles.length) {
      setMessage("Sélectionnez au moins un style de danse.", "error");
      return;
    }
    if (!Number.isFinite(state.latitude) || !Number.isFinite(state.longitude)) {
      setMessage("Localisez l’événement sur la carte (bouton « Trouver l’adresse » ou touchez la carte).", "error");
      return;
    }

    setBusy(true, "Envoi en cours…");

    try {
      const posterFile = byId("submitPosterFile").files[0];
      const logoFile = byId("submitLogoFile").files[0];
      let imageUrl = value("submitImageUrl") || null;
      let logoUrl = null;

      if (posterFile) {
        validateFile(posterFile, 5);
        imageUrl = await uploadImage(posterFile, "poster");
      }
      if (logoFile) {
        validateFile(logoFile, 2);
        logoUrl = await uploadImage(logoFile, "logo");
      }

      const titleFr = value("submitTitleFr");
      const descriptionFr = value("submitDescriptionFr");
      const priceFr = value("submitPrice");

      const payload = {
        title_fr: titleFr,
        title_en: value("submitTitleEn") || titleFr,
        description_fr: descriptionFr,
        description_en: value("submitDescriptionEn") || descriptionFr,
        organizer_name: value("submitOrganizer"),
        category: value("submitCategory") || "party",
        styles,
        map_style: styles[0],
        starts_at: toIsoOrNull(value("submitStart")),
        ends_at: toIsoOrNull(value("submitEnd")),
        venue_name: value("submitVenue"),
        address: value("submitAddress"),
        city: value("submitCity"),
        country: value("submitCountry") || "France",
        latitude: state.latitude,
        longitude: state.longitude,
        image_url: imageUrl,
        logo_url: logoUrl,
        ticket_url: value("submitTicketUrl") || null,
        price_text_fr: priceFr,
        price_text_en: priceFr,
        status: "pending",
        source: "public"
      };

      const { error } = await state.supabase.from("events").insert(payload);
      if (error) throw error;

      rateLimitRecord();
      byId("submitForm").reset();
      resetMap();
      showSuccessScreen();
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Une erreur est survenue. Réessayez.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(file, kind) {
    const extension = (file.name.split(".").pop() || "jpg")
      .toLowerCase().replace(/[^a-z0-9]/g, "");
    const rand = (crypto?.randomUUID && crypto.randomUUID()) || String(Date.now());
    const path = `submissions/${kind}/${rand}.${extension}`;

    const { error } = await state.supabase.storage
      .from("event-images")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (error) throw error;

    const { data } = state.supabase.storage.from("event-images").getPublicUrl(path);
    return data.publicUrl;
  }

  function validateFile(file, maxMb) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) throw new Error("Format d’image non accepté (JPG, PNG, WebP).");
    if (file.size > maxMb * 1024 * 1024) throw new Error(`Image trop lourde : ${maxMb} Mo maximum.`);
  }

  // ---- Anti-spam : limite de fréquence stockée localement ----
  function rateLimitCheck() {
    const now = Date.now();
    let log = [];
    try { log = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { log = []; }
    log = log.filter((ts) => now - ts < 24 * 60 * 60 * 1000);

    if (log.length && now - log[log.length - 1] < SUBMIT_COOLDOWN_MS) {
      return { ok: false, reason: "Merci de patienter une minute avant un nouvel envoi." };
    }
    if (log.length >= SUBMIT_DAILY_LIMIT) {
      return { ok: false, reason: "Limite d’envois atteinte pour aujourd’hui. Réessayez demain." };
    }
    return { ok: true };
  }

  function rateLimitRecord() {
    const now = Date.now();
    let log = [];
    try { log = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { log = []; }
    log = log.filter((ts) => now - ts < 24 * 60 * 60 * 1000);
    log.push(now);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  }

  function resetMap() {
    state.latitude = null;
    state.longitude = null;
    byId("submitLat").value = "";
    byId("submitLng").value = "";
    if (state.marker) { state.marker.remove(); state.marker = null; }
    updateGpsStatus();
    preview("submitPosterFile", "submitPosterPreview", "Aucune affiche");
    preview("submitLogoFile", "submitLogoPreview", "Aucun logo");
  }

  function preview(fileId, previewId, emptyText) {
    const file = byId(fileId)?.files[0];
    const box = byId(previewId);
    if (!box) return;
    if (!file) { box.innerHTML = `<span>${escapeHTML(emptyText)}</span>`; return; }
    box.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="" />`;
  }

  function setBusy(busy, label = "") {
    state.busy = busy;
    byId("submitSend").disabled = busy;
    if (busy && label) setMessage(label);
  }

  function setMessage(message, type = "") {
    const el = byId("submitMessage");
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("is-error", "is-success");
    if (type === "error") el.classList.add("is-error");
    if (type === "success") el.classList.add("is-success");
  }

  function showSuccessScreen() {
    byId("submitForm")?.classList.add("is-hidden");
    byId("submitSuccess")?.classList.remove("is-hidden");
    byId("submitModal")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetToForm() {
    byId("submitForm")?.classList.remove("is-hidden");
    byId("submitSuccess")?.classList.add("is-hidden");
    setMessage("");
  }

  // ---- Helpers ----
  function byId(id) { return document.getElementById(id); }
  function value(id) { return byId(id)?.value?.trim() || ""; }
  function checkedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
  }
  function toIsoOrNull(input) {
    if (!input) return null;
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  function escapeHTML(input) {
    return String(input ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
})();
