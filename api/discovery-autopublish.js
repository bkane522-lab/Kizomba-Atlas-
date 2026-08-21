/* =========================================================
   KIZOMBA ATLAS — DISCOVERY AUTOPUBLISH
   Publie automatiquement sur la carte les candidats Discovery
   à haute confiance, sans intervention humaine.

   SÉCURITÉ / GARDE-FOUS :
   - Désactivé par défaut. Ne fait RIEN tant que la variable
     Vercel DISCOVERY_AUTOPUBLISH_ENABLED n'est pas exactement "true".
   - Seuil de confiance minimum configurable
     (DISCOVERY_AUTOPUBLISH_MIN_CONFIDENCE, défaut 0.85).
   - Vérifie aussi les informations minimales requises
     (nom, ville, adresse ou lieu, date) : un score de confiance
     élevé ne suffit pas si des champs essentiels manquent.
   - Anti-doublon avant toute création.
   - Appelé uniquement par pg_cron via le même secret que
     l'Autopilote (header x-scheduler-secret).

   GÉOCODAGE :
   - Photon (Komoot) en priorité — fonctionne depuis les IP cloud.
   - Nominatim (OpenStreetMap) en repli si Photon échoue.
   ========================================================= */

const crypto = require("crypto");

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function env() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const schedulerSecret = process.env.SCHEDULER_SECRET;

  if (!supabaseUrl) throw new Error("SUPABASE_URL manquant dans Vercel.");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant dans Vercel.");
  if (!schedulerSecret) throw new Error("SCHEDULER_SECRET manquant dans Vercel.");

  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
    serviceKey,
    schedulerSecret,
    enabled: String(process.env.DISCOVERY_AUTOPUBLISH_ENABLED || "").toLowerCase() === "true",
    minConfidence: Math.max(0, Math.min(1, Number(process.env.DISCOVERY_AUTOPUBLISH_MIN_CONFIDENCE || 0.85))),
    maxPerRun: Math.max(1, Math.min(20, Number(process.env.DISCOVERY_AUTOPUBLISH_MAX_PER_RUN || 3)))
  };
}

async function sb(cfg, path, options = {}) {
  const response = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: cfg.serviceKey,
      Authorization: `Bearer ${cfg.serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!response.ok) {
    throw new Error(`Supabase ${response.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function hasMinimumInfo(candidate) {
  return Boolean(candidate.event_name)
    && Boolean(candidate.city)
    && Boolean(candidate.address || candidate.venue_name)
    && Boolean(candidate.starts_at);
}

function categoryFromEventType(eventType) {
  if (eventType === "festival") return "festival";
  if (eventType === "workshop") return "workshop";
  return "party";
}

function mapStyleFromStyles(styles) {
  const allowed = ["kizomba", "urban-kiz", "bachata", "sbk", "semba", "tarraxo"];
  const found = (Array.isArray(styles) ? styles : []).find((style) => allowed.includes(style));
  return found || "kizomba";
}

async function findDuplicate(cfg, candidate) {
  if (!candidate.city) return null;

  const rows = await sb(
    cfg,
    `events?city=ilike.${encodeURIComponent(candidate.city)}&select=id,title_fr,title_en,starts_at,ticket_url&limit=50`
  );

  if (!Array.isArray(rows)) return null;

  const targetTitle = normalize(candidate.event_name);
  const targetDay = candidate.starts_at ? String(candidate.starts_at).slice(0, 10) : "";

  return rows.find((existing) => {
    if (candidate.ticket_url && existing.ticket_url && existing.ticket_url === candidate.ticket_url) {
      return true;
    }
    const existingTitle = normalize(existing.title_fr || existing.title_en);
    const existingDay = existing.starts_at ? String(existing.starts_at).slice(0, 10) : "";
    return Boolean(existingTitle) && existingTitle === targetTitle && existingDay === targetDay;
  }) || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeQuery(value) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

async function photonSearch(query) {
  const cleaned = sanitizeQuery(query);
  if (!cleaned) return { position: null, diagnostic: "requete_vide" };

  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", cleaned);
  url.searchParams.set("limit", "1");

  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    return { position: null, diagnostic: `fetch_echoue_photon:${error.message}` };
  }

  if (!response.ok) {
    return { position: null, diagnostic: `http_photon_${response.status}:${cleaned.slice(0, 60)}` };
  }

  const data = await response.json();
  const feature = data && Array.isArray(data.features) ? data.features[0] : null;
  const coords = feature && feature.geometry && feature.geometry.coordinates;

  if (!coords || coords.length < 2) {
    return { position: null, diagnostic: "0_resultat_photon" };
  }

  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { position: null, diagnostic: "coordonnees_invalides_photon" };
  }

  return { position: { lat, lng }, diagnostic: null };
}

async function nominatimSearch(query) {
  const cleaned = sanitizeQuery(query);
  if (!cleaned) return { position: null, diagnostic: "requete_vide" };

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", cleaned);

  let response;
  try {
    response = await fetch(url, {
      headers: {
        "Accept-Language": "fr",
        "User-Agent": "KizombaAtlasDiscoveryAutopublish/1.0 (contact: kizombaatlas.contact@gmail.com)"
      }
    });
  } catch (error) {
    return { position: null, diagnostic: `fetch_echoue_nominatim:${error.message}` };
  }

  if (!response.ok) {
    return { position: null, diagnostic: `http_nominatim_${response.status}:${cleaned.slice(0, 60)}` };
  }

  const results = await response.json();
  if (!results.length) return { position: null, diagnostic: "0_resultat_nominatim" };

  const lat = Number(results[0].lat);
  const lng = Number(results[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { position: null, diagnostic: "coordonnees_invalides_nominatim" };
  }

  return { position: { lat, lng }, diagnostic: null };
}

async function geocodeSearch(query) {
  // Photon d'abord (fiable depuis les IP cloud Vercel).
  const photon = await photonSearch(query);
  if (photon.position) return photon;

  // Repli Nominatim (respecte sa limite de 1 requête/seconde).
  await sleep(1100);
  const nominatim = await nominatimSearch(query);
  if (nominatim.position) return nominatim;

  return { position: null, diagnostic: `${photon.diagnostic}|${nominatim.diagnostic}` };
}

async function geocode(candidate) {
  // 1ʳᵉ tentative : adresse complète (lieu + adresse + ville + pays).
  const fullQuery = [candidate.venue_name, candidate.address, candidate.city, candidate.country]
    .filter(Boolean)
    .join(", ");

  const full = await geocodeSearch(fullQuery);
  if (full.position) return full;

  // Repli : la donnée scrapée est parfois bruitée (typo, texte mal découpé) —
  // une recherche plus large sur juste ville + pays réussit souvent là où
  // l'adresse précise échoue.
  if (candidate.city) {
    await sleep(1100);
    const cityQuery = [candidate.city, candidate.country].filter(Boolean).join(", ");
    const cityResult = await geocodeSearch(cityQuery);
    return { position: cityResult.position, diagnostic: `${full.diagnostic}|${cityResult.diagnostic}` };
  }

  return full;
}

async function publishCandidate(cfg, candidate) {
  if (!hasMinimumInfo(candidate)) {
    return { id: candidate.id, skipped: true, reason: "infos_incompletes" };
  }

  if (Number(candidate.confidence) < cfg.minConfidence) {
    return { id: candidate.id, skipped: true, reason: "confiance_insuffisante" };
  }

  const duplicate = await findDuplicate(cfg, candidate);
  if (duplicate) {
    await sb(cfg, `discovery_candidates?id=eq.${encodeURIComponent(candidate.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        verification_notes: `Doublon détecté automatiquement (événement existant #${duplicate.id}).`,
        updated_at: new Date().toISOString()
      })
    });
    return { id: candidate.id, skipped: true, reason: "doublon_detecte", duplicate_id: duplicate.id };
  }

  const geocodeResult = await geocode(candidate);
  if (!geocodeResult.position) {
    await sb(cfg, `discovery_candidates?id=eq.${encodeURIComponent(candidate.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        verification_notes: `Géocodage automatique impossible (${geocodeResult.diagnostic || "raison inconnue"}).`,
        updated_at: new Date().toISOString()
      })
    });
    return { id: candidate.id, skipped: true, reason: "geocodage_impossible", diagnostic: geocodeResult.diagnostic };
  }
  const position = geocodeResult.position;

  const payload = {
    title_fr: candidate.event_name,
    title_en: candidate.event_name,
    description_fr: candidate.description || "",
    description_en: "",
    category: categoryFromEventType(candidate.event_type),
    styles: Array.isArray(candidate.styles) ? candidate.styles : [],
    map_style: mapStyleFromStyles(candidate.styles),
    starts_at: candidate.starts_at,
    ends_at: candidate.ends_at || null,
    venue_name: candidate.venue_name || candidate.address,
    address: candidate.address || candidate.venue_name,
    city: candidate.city,
    country: candidate.country || "France",
    latitude: position.lat,
    longitude: position.lng,
    organizer_name: candidate.organizer_name || candidate.source_name || "",
    ticket_url: candidate.ticket_url || null,
    price_text_fr: candidate.price_text || "",
    price_text_en: "",
    image_url: candidate.source_image_url || null,
    status: "published",
    source: "discovery-autopilot",
    moderation_note:
      `Importé automatiquement (confiance ${candidate.confidence}) — source : ${candidate.source_name || candidate.source_platform}.`
        + (candidate.verification_notes ? ` ${candidate.verification_notes}` : "")
  };

  const inserted = await sb(cfg, "events", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });

  const eventId = Array.isArray(inserted) && inserted[0] ? inserted[0].id : null;

  await sb(cfg, `discovery_candidates?id=eq.${encodeURIComponent(candidate.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "imported", updated_at: new Date().toISOString() })
  });

  return { id: candidate.id, skipped: false, event_id: eventId };
}

module.exports = async (req, res) => {
  let cfg;
  try {
    cfg = env();
  } catch (error) {
    console.error("Kizomba Atlas discovery-autopublish (config):", error);
    return json(res, 500, { ok: false, error: error.message });
  }

  const providedSecret = String(req.headers["x-scheduler-secret"] || "").trim();
  const valid =
    providedSecret.length === cfg.schedulerSecret.length &&
    crypto.timingSafeEqual(Buffer.from(providedSecret), Buffer.from(cfg.schedulerSecret));

  if (!valid) {
    return json(res, 401, { ok: false, error: "Secret invalide." });
  }

  if (!cfg.enabled) {
    return json(res, 200, {
      ok: true,
      enabled: false,
      message: "Auto-publication Discovery désactivée (DISCOVERY_AUTOPUBLISH_ENABLED n'est pas \"true\")."
    });
  }

  try {
    const candidates = await sb(
      cfg,
      `discovery_candidates?status=eq.new&select=*&order=updated_at.asc.nullsfirst,confidence.desc&limit=${cfg.maxPerRun}`
    );

    const results = [];
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      try {
        results.push(await publishCandidate(cfg, candidate));
      } catch (error) {
        console.error("Kizomba Atlas discovery-autopublish (candidat):", error);
        results.push({ id: candidate.id, skipped: true, reason: "erreur", error: error.message });
      }
      await sleep(1100);
    }

    return json(res, 200, {
      ok: true,
      enabled: true,
      checked: (candidates || []).length,
      published: results.filter((r) => !r.skipped).length,
      skipped: results.filter((r) => r.skipped).length,
      results
    });
  } catch (error) {
    console.error("Kizomba Atlas discovery-autopublish:", error);
    return json(res, 500, { ok: false, error: error.message || "Erreur serveur." });
  }
};

// Cette fonction enchaîne plusieurs appels externes (Supabase + Photon/Nominatim)
// par candidat : la durée par défaut (10s) est trop courte.
// Étendue au maximum autorisé par le plan Vercel.
module.exports.config = { maxDuration: 60 };
