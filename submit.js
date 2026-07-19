(() => {
  "use strict";

  // Module de soumission publique d'un Ã©vÃ©nement (statut "pending").
  // S'appuie sur le mÃªme client Supabase et la mÃªme config que l'app.

  const SUBMIT_COOLDOWN_MS = 60 * 1000;         // 1 min entre deux envois
  const SUBMIT_DAILY_LIMIT = 5;                  // max 5 envois / 24 h (cÃ´tÃ© client)
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
    byId("submitForm")?.addEventListener("submit", handleSubmit);
    byId("submitGeocode")?.addEventListener("click", geocode);
    byId("submitPosterFile")?.addEventListener("change", () => preview("submitPosterFile", "submitPosterPreview", "Aucune affiche"));
    byId("submitLogoFile")?.addEventListener("change", () => preview("submitLogoFile", "submitLogoPreview", "Aucun logo"));

    // Client Supabase (partagÃ© avec la config dÃ©jÃ  chargÃ©e par supabase-config.js)
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
    window.setTimeout(initMap, 60);
  }

  function closeModal() {
    byId("submitBackdrop").hidden = true;
    byId("submitModal").hidden = true;
    document.body.style.overflow = "";
  }

  function initMap() {
    if (state.map) {
      state.map.invalidateSize();
      return;
    }
    const center = window.KIZOMBA_ATLAS_CONFIG?.DEFAULT_MAP_CENTER || [47.2, 3.0];
    const zoom = window.KIZOMBA_ATLAS_CONFIG?.DEFAULT_MAP_ZOOM || 6;

    state.map = L.map("submitMap").setView(center, zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "Â© OpenStreetMap"
    }).addTo(state.map);

    state.map.on("click", (event) => setPosition(event.latlng.lat, event.latlng.lng, false));
    window.setTimeout(() => state.map.invalidateSize(), 120);
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
  }

  async function geocode() {
    const query = [
      value("submitVenue"),
      value("submitAddress"),
      value("submitCity"),
      value("submitCountry")
    ].filter(Boolean).join(", ");

    if (!query) {
      setMessage("Renseignez dâ€™abord le lieu et lâ€™adresse.", "error");
      return;
    }
    setMessage("Recherche de lâ€™adresseâ€¦");

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
      setMessage("Position trouvÃ©e. Ajustez le point si besoin.", "success");
    } catch (error) {
      setMessage(error.message || "Adresse introuvable.", "error");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (state.busy) return;

    // --- Anti-spam 1 : honeypot (champ cachÃ© que seuls les bots remplissent) ---
    if (value("submitWebsite")) {
      // On fait semblant de rÃ©ussir, sans rien envoyer.
      setMessage("Merci ! Votre Ã©vÃ©nement a Ã©tÃ© transmis.", "success");
      byId("submitForm").reset();
      return;
    }

    // --- Anti-spam 2 : limite de frÃ©quence cÃ´tÃ© client ---
    const guard = rateLimitCheck();
    if (!guard.ok) {
      setMessage(guard.reason, "error");
      return;
    }

    if (!state.supabase) {
      setMessage("Service momentanÃ©ment indisponible. RÃ©essayez plus tard.", "error");
      return;
    }

    const styles = checkedValues("submitStyle");
    if (!styles.length) {
      setMessage("SÃ©lectionnez au moins un style de danse.", "error");
      return;
    }
    if (!Number.isFinite(state.latitude) || !Number.isFinite(state.longitude)) {
      setMessage("Localisez lâ€™Ã©vÃ©nement sur la carte (bouton Â« Trouver lâ€™adresse Â» ou touchez la carte).", "error");
      return;
    }

    setBusy(true, "Envoi en coursâ€¦");

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
      setMessage("Merci ! Votre Ã©vÃ©nement a Ã©tÃ© transmis. Il apparaÃ®tra aprÃ¨s validation par lâ€™Ã©quipe Kizomba Atlas.", "success");
      byId("submitForm").reset();
      resetMap();
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Une erreur est survenue. RÃ©essayez.", "error");
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
    if (!allowed.includes(file.type)) throw new Error("Format dâ€™image non acceptÃ© (JPG, PNG, WebP).");
    if (file.size > maxMb * 1024 * 1024) throw new Error(`Image trop lourde : ${maxMb} Mo maximum.`);
  }

  // ---- Anti-spam : limite de frÃ©quence stockÃ©e localement ----
  function rateLimitCheck() {
    const now = Date.now();
    let log = [];
    try { log = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { log = []; }
    log = log.filter((ts) => now - ts < 24 * 60 * 60 * 1000);

    if (log.length && now - log[log.length - 1] < SUBMIT_COOLDOWN_MS) {
      return { ok: false, reason: "Merci de patienter une minute avant un nouvel envoi." };
    }
    if (log.length >= SUBMIT_DAILY_LIMIT) {
      return { ok: false, reason: "Limite dâ€™envois atteinte pour aujourdâ€™hui. RÃ©essayez demain." };
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
