/* =========================================================
   KIZOMBA ATLAS — Réception des demandes publiques
   Fichier : api/submit.js

   Cette fonction tourne sur le serveur Vercel. Elle seule
   détient la clé secrète Supabase, qui n'est donc jamais
   exposée dans le navigateur du visiteur.

   Circuit : contact.html  →  /api/submit  →  table events
                                              statut "pending"
   ========================================================= */

const ALLOWED_CATEGORIES = ["party", "festival", "workshop"];

const ALLOWED_COURSE_TAGS = [
  "kizomba-traditionnelle",
  "urban-kiz",
  "tango-kiz",
  "kiz-fusion",
  "semba",
  "musicalite",
  "men-styling",
  "lady-styling",
  "cours-individuel",
  "cours-couple",
  "cours-collectif"
];

const ALLOWED_STYLES = [
  "kizomba",
  "urban-kiz",
  "bachata",
  "sbk",
  "semba",
  "tarraxo"
];

/* Limite de fréquence en mémoire.
   Sur Vercel, cette mémoire est remise à zéro régulièrement,
   ce n'est donc qu'un premier filtre contre les envois répétés.
   La protection principale reste la validation des champs. */
const recentSubmissions = new Map();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 3;

module.exports = async (request, response) => {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "POST") {
    return response.status(405).json({ error: "Méthode non autorisée." });
  }

  /* Adresse du projet, écrite en dur volontairement.
     Une variable d'environnement héritée pointant vers un autre projet
     avait provoqué des refus « Clé API invalide » impossibles à diagnostiquer. */
  const supabaseUrl = "https://kiqavtasdwqkfmuqbagk.supabase.co";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    console.error("SUPABASE_SERVICE_ROLE_KEY absente des variables Vercel.");
    return response.status(500).json({
      error: "Service momentanément indisponible."
    });
  }

  let payload;
  try {
    payload = typeof request.body === "string"
      ? JSON.parse(request.body)
      : (request.body || {});
  } catch (error) {
    return response.status(400).json({ error: "Demande illisible." });
  }

  /* --- Piège à robots : champ caché que seuls les automates remplissent --- */
  if (text(payload.website)) {
    // On répond comme si tout s'était bien passé, sans rien enregistrer.
    return response.status(200).json({ ok: true });
  }

  /* --- Limite de fréquence par adresse --- */
  const visitor = clientAddress(request);
  if (isRateLimited(visitor)) {
    return response.status(429).json({
      error: "Trop d’envois récents. Réessayez dans quelques minutes."
    });
  }

  /* --- Validation --- */
  const errors = [];

  const titleFr = text(payload.title_fr, 160);
  if (!titleFr) errors.push("le nom de l’événement");

  const venueName = text(payload.venue_name, 160);
  if (!venueName) errors.push("le nom du lieu");

  const address = text(payload.address, 260);
  if (!address) errors.push("l’adresse");

  const city = text(payload.city, 120);
  if (!city) errors.push("la ville");

  const contactEmail = text(payload.contact_email, 180);
  if (!contactEmail || !contactEmail.includes("@")) errors.push("une adresse e-mail valide");

  const startsAt = isoOrNull(payload.starts_at);
  if (!startsAt) errors.push("la date de début");

  const styles = Array.isArray(payload.styles)
    ? payload.styles.filter((style) => ALLOWED_STYLES.includes(style))
    : [];
  if (!styles.length) errors.push("au moins un style dansé");

  if (errors.length) {
    return response.status(400).json({
      error: `Merci de renseigner : ${errors.join(", ")}.`
    });
  }

  /* --- La fin doit suivre le début --- */
  const endsAt = isoOrNull(payload.ends_at);
  if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
    return response.status(400).json({
      error: "La date de fin doit être postérieure à la date de début. Pour une soirée qui se termine après minuit, indiquez le lendemain."
    });
  }

  const category = ALLOWED_CATEGORIES.includes(payload.category)
    ? payload.category
    : "party";

  const descriptionFr = text(payload.description_fr, 1600);

  const record = {
    title_fr: titleFr,
    title_en: text(payload.title_en, 160) || titleFr,
    description_fr: descriptionFr,
    description_en: text(payload.description_en, 1600) || descriptionFr,
    organizer_name: text(payload.organizer_name, 140),
    category,
    styles,
    map_style: styles[0],
    starts_at: startsAt,
    ends_at: endsAt,
    venue_name: venueName,
    address,
    city,
    country: text(payload.country, 120) || "France",
    latitude: null,
    longitude: null,
    image_url: safeUrl(payload.image_url),
    logo_url: null,
    ticket_url: safeUrl(payload.ticket_url),
    price_text_fr: text(payload.price_text_fr, 100),
    price_text_en: text(payload.price_text_fr, 100),
    contact_name: text(payload.contact_name, 100),
    contact_email: contactEmail,
    contact_profile: safeUrl(payload.contact_profile),
    course_tags: Array.isArray(payload.course_tags)
      ? payload.course_tags.filter((tag) => ALLOWED_COURSE_TAGS.includes(tag))
      : [],
    status: "pending",
    source: "public",
    is_featured: false
  };

  /* Une demande de mise en avant est signalée dans la note de modération.
     La bascule reste manuelle : rien n'est mis en avant automatiquement. */
  if (payload.request_type === "featured") {
    record.moderation_note = "Demande de mise en avant reçue via le formulaire public.";
  } else if (payload.request_type === "pro") {
    record.moderation_note = "Demande de renseignements Atlas Pro.";
  }

  /* --- La position exacte reste à ta charge lors de la validation.
         Si le formulaire en fournit une, on la conserve. --- */
  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    record.latitude = Number(latitude.toFixed(7));
    record.longitude = Number(longitude.toFixed(7));
  }

  /* La table exige une position. Tant que la demande n'est pas
     localisée, on place un point neutre au centre de la France ;
     tu l'ajusteras au doigt au moment de valider. */
  if (record.latitude === null || record.longitude === null) {
    record.latitude = 46.6034;
    record.longitude = 1.8883;
  }

  try {
    const result = await fetch(`${supabaseUrl}/rest/v1/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(record)
    });

    if (!result.ok) {
      const detail = await result.text();
      // Le motif exact reste dans les journaux Vercel, jamais exposé au visiteur.
      console.error("Insertion refusée :", result.status, detail);

      return response.status(502).json({
        error: "L\u2019enregistrement a échoué. Réessayez dans un instant."
      });
    }

    recordSubmission(visitor);

    return response.status(200).json({ ok: true });
  } catch (error) {
    console.error("Erreur serveur :", error);
    return response.status(500).json({
      error: "Service momentanément indisponible."
    });
  }
};

/* =========================================================
   Utilitaires
   ========================================================= */

function text(value, maxLength = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function safeUrl(value) {
  const candidate = text(value, 300);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? candidate : null;
  } catch (error) {
    return null;
  }
}

function isoOrNull(value) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function clientAddress(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return "inconnu";
}

function isRateLimited(visitor) {
  const now = Date.now();
  const history = (recentSubmissions.get(visitor) || [])
    .filter((moment) => now - moment < RATE_LIMIT_WINDOW_MS);

  recentSubmissions.set(visitor, history);
  return history.length >= RATE_LIMIT_MAX;
}

function recordSubmission(visitor) {
  const now = Date.now();
  const history = (recentSubmissions.get(visitor) || [])
    .filter((moment) => now - moment < RATE_LIMIT_WINDOW_MS);

  history.push(now);
  recentSubmissions.set(visitor, history);

  /* Nettoyage pour éviter que la mémoire enfle indéfiniment. */
  if (recentSubmissions.size > 500) {
    for (const [key, moments] of recentSubmissions) {
      if (!moments.length || now - moments[moments.length - 1] > RATE_LIMIT_WINDOW_MS) {
        recentSubmissions.delete(key);
      }
    }
  }
}
