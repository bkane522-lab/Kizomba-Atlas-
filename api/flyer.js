// api/flyer.js
// Kizomba Atlas — Flyer vers Événement
// Texte collé  -> MODELE_IA (llama-3.3-70b-versatile)
// Photo        -> MODELE_VISION (qwen/qwen3.6-27b) en mode direct + JSON forcé
//                 + dépôt de l'affiche dans le Storage Supabase
// Aucune dépendance : tout passe par fetch.
//
// Variables d'environnement : GROQ_API_KEY, ATLAS_ADMIN_SECRET, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, BUCKET_AFFICHES, MODELE_IA, MODELE_VISION

const MODELE_TEXTE_DEFAUT = "llama-3.3-70b-versatile";
const MODELE_VISION_DEFAUT = "qwen/qwen3.6-27b";

const CATEGORIES = ["party", "workshop", "festival", "class", "concert"];
const CATEGORIES_SURES = ["party", "workshop"];
const STYLES = ["kizomba", "urban-kiz", "semba", "tarraxo", "tarraxinha", "ghetto-zouk", "bachata", "sbk", "salsa", "zouk"];
const STYLES_SURS = ["kizomba", "urban-kiz", "semba"];
const RECURRENCES = ["none", "weekly", "monthly"];

function repondre(res, code, corps) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(code).send(JSON.stringify(corps));
}

function consigne() {
  return `Tu extrais les informations d'un flyer d'événement de danse afro-latine (Kizomba, Urban Kiz, Bachata, SBK...).

Réponds uniquement par un objet JSON respectant ce schéma :

{
  "title_fr": "titre en français",
  "title_en": "le même titre en anglais",
  "description_fr": "2 à 4 phrases en français, tirées du flyer uniquement",
  "description_en": "la même description en anglais",
  "organizer_name": "organisateur ou collectif, ou null",
  "category": "une seule valeur parmi : ${CATEGORIES.join(", ")}",
  "styles": ["valeurs parmi : ${STYLES.join(", ")}"],
  "starts_at": "début au format ISO 8601 avec décalage, ex 2026-09-15T19:45:00+02:00",
  "ends_at": "fin au même format, ou null",
  "venue_name": "nom du lieu, ou null",
  "address": "adresse postale telle qu'écrite, ou null",
  "city": "ville",
  "country": "pays en toutes lettres",
  "ticket_url": "URL d'inscription ou de billetterie, ou null",
  "price_text_fr": "tarifs en français tels qu'annoncés, ou null",
  "price_text_en": "les mêmes tarifs en anglais, ou null",
  "contact_name": "nom de contact, ou null",
  "contact_email": "email, ou null",
  "contact_profile": "lien réseau social, ou null",
  "recurrence": "une valeur parmi : ${RECURRENCES.join(", ")}",
  "moderation_note": "ce dont tu n'es pas certain, et ce qui manque"
}

Règles absolues :
- N'INVENTE RIEN. Toute information absente vaut null.
- Les styles s'écrivent avec un tiret : urban-kiz, ghetto-zouk.
- category vaut "party" pour une soirée, "workshop" pour un stage, "class" pour un cours régulier.
- recurrence vaut "none" pour un événement unique, "weekly" pour un cours hebdomadaire.
- Si une saison est annoncée (ex : de septembre à juin), starts_at est la PREMIÈRE date.
- Si l'année n'est pas écrite, déduis la prochaine occurrence à venir et signale-le dans moderation_note.
- Si l'heure n'est pas écrite, mets 21:00 pour une soirée et signale-le dans moderation_note.
- Fuseau par défaut : Europe/Paris.
- Ne devine jamais de coordonnées GPS.
- Sur une affiche, lis aussi les petits caractères : adresse, tarifs, email, téléphone.
- Si ce n'est pas un flyer d'événement, réponds {"erreur": "ce document n'est pas un flyer d'événement"}.`;
}

async function extraire(contenuUtilisateur, avecImage) {
  const modele = avecImage
    ? process.env.MODELE_VISION || MODELE_VISION_DEFAUT
    : process.env.MODELE_IA || MODELE_TEXTE_DEFAUT;

  const corps = {
    model: modele,
    temperature: 0.3,
    max_completion_tokens: 3000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: consigne() },
      { role: "user", content: contenuUtilisateur }
    ]
  };

  // Qwen réfléchit par défaut, et son raisonnement remplace la réponse.
  // On coupe la réflexion et on masque les jetons de raisonnement.
  if (avecImage) {
    corps.reasoning_effort = "none";
    corps.reasoning_format = "hidden";
    corps.top_p = 0.8;
  }

  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(corps)
  });

  if (!r.ok) throw new Error(`Groq ${r.status} (modèle ${modele}) : ${(await r.text()).slice(0, 300)}`);

  const data = await r.json();
  const message = data.choices?.[0]?.message || {};
  let brut = (message.content || message.reasoning || "").replace(/```json|```/g, "").trim();

  const debut = brut.indexOf("{");
  const fin = brut.lastIndexOf("}");
  if (debut === -1 || fin === -1) {
    // On remonte ce que le modèle a réellement dit, pour pouvoir diagnostiquer
    throw new Error(`Pas de JSON dans la réponse de ${modele}. Reçu : "${brut.slice(0, 200) || "(vide)"}"`);
  }

  return JSON.parse(brut.slice(debut, fin + 1));
}

// Dépôt de l'affiche dans le Storage Supabase. Renvoie l'URL publique, ou null.
async function deposerAffiche(base64, mediaType) {
  const bucket = process.env.BUCKET_AFFICHES;
  if (!bucket) return null;

  const extension = (mediaType || "image/jpeg").split("/")[1].replace("jpeg", "jpg");
  const nom = `import/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${bucket}/${nom}`, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": mediaType || "image/jpeg",
        "cache-control": "3600"
      },
      body: Buffer.from(base64, "base64")
    });
    if (!r.ok) return null;
    return `${process.env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${nom}`;
  } catch (e) {
    return null;
  }
}

async function geocoder(adresse, ville, pays) {
  const essais = [
    [adresse, ville, pays].filter(Boolean).join(", "),
    [ville, pays].filter(Boolean).join(", ")
  ].filter((s) => s.length > 2);

  for (const requete of essais) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(requete)}`;
      const r = await fetch(url, {
        headers: {
          "User-Agent": "KizombaAtlas/1.0 (kizombaatlas.contact@gmail.com)",
          "Accept-Language": "fr"
        }
      });
      if (!r.ok) continue;
      const resultats = await r.json();
      if (resultats[0]) {
        return {
          latitude: parseFloat(resultats[0].lat),
          longitude: parseFloat(resultats[0].lon),
          precis: requete === essais[0]
        };
      }
    } catch (e) {
      // essai suivant
    }
  }
  return null;
}

function construireLigne(fiche, position, urlAffiche, mode) {
  const sur = mode === "sur";
  const notes = [];
  if (fiche.moderation_note) notes.push(fiche.moderation_note);

  const ligne = {
    title_fr: fiche.title_fr || "Événement sans titre",
    starts_at: fiche.starts_at,
    venue_name: fiche.venue_name || fiche.city || "Lieu à préciser",
    address: fiche.address || fiche.city || "Adresse à préciser",
    city: fiche.city,
    latitude: position ? position.latitude : 0,
    longitude: position ? position.longitude : 0,
    status: "draft",
    is_featured: false
  };

  if (urlAffiche) ligne.image_url = urlAffiche;

  if (fiche.title_en) ligne.title_en = fiche.title_en;
  if (fiche.description_fr) ligne.description_fr = fiche.description_fr;
  if (fiche.description_en) ligne.description_en = fiche.description_en;
  if (fiche.organizer_name) ligne.organizer_name = fiche.organizer_name;
  if (fiche.country) ligne.country = fiche.country;
  if (fiche.ends_at) ligne.ends_at = fiche.ends_at;
  if (fiche.ticket_url) ligne.ticket_url = fiche.ticket_url;
  if (fiche.price_text_fr) ligne.price_text_fr = fiche.price_text_fr;
  if (fiche.price_text_en) ligne.price_text_en = fiche.price_text_en;
  if (fiche.contact_name) ligne.contact_name = fiche.contact_name;
  if (fiche.contact_email) ligne.contact_email = fiche.contact_email;
  if (fiche.contact_profile) ligne.contact_profile = fiche.contact_profile;

  const catsOk = sur ? CATEGORIES_SURES : CATEGORIES;
  const stylesOk = sur ? STYLES_SURS : STYLES;

  if (catsOk.includes(fiche.category)) ligne.category = fiche.category;
  const styles = Array.isArray(fiche.styles) ? fiche.styles.filter((s) => stylesOk.includes(s)) : [];
  if (styles.length) {
    ligne.styles = styles;
    ligne.map_style = STYLES_SURS.includes(styles[0]) ? styles[0] : "kizomba";
  }
  if (RECURRENCES.includes(fiche.recurrence)) ligne.recurrence = fiche.recurrence;

  if (!position) notes.push("COORDONNÉES INTROUVABLES : à corriger à la main avant publication.");
  else if (!position.precis) notes.push("Coordonnées approximatives (centre de la ville) : à affiner.");
  if (sur) notes.push("Certaines valeurs ont été simplifiées, catégorie et styles à revérifier.");
  notes.push("Fiche créée par import express.");

  ligne.moderation_note = notes.join(" — ");
  return ligne;
}

async function envoyer(ligne) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/events`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(ligne)
  });
  return { ok: r.ok, statut: r.status, texte: await r.text() };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-atlas-secret");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return repondre(res, 405, { erreur: "Méthode non autorisée" });

  if (req.headers["x-atlas-secret"] !== process.env.ATLAS_ADMIN_SECRET) {
    return repondre(res, 401, { erreur: "Non autorisé" });
  }

  const { texte, image_base64, media_type } = req.body || {};
  const avecImage = Boolean(image_base64);
  let contenu;

  if (avecImage) {
    contenu = [
      { type: "text", text: "Extrais la fiche événement de cette affiche et réponds en JSON." },
      { type: "image_url", image_url: { url: `data:${media_type || "image/jpeg"};base64,${image_base64}` } }
    ];
  } else if (texte && texte.trim().length > 15) {
    contenu = `Extrais la fiche événement de cette annonce :\n\n${texte}`;
  } else {
    return repondre(res, 400, { erreur: "Envoie soit une photo, soit un texte" });
  }

  try {
    const fiche = await extraire(contenu, avecImage);
    if (fiche.erreur) return repondre(res, 422, { erreur: fiche.erreur });

    if (!fiche.starts_at) {
      return repondre(res, 422, { erreur: "Aucune date trouvée. Complète l'annonce puis relance." });
    }
    if (!fiche.city) {
      return repondre(res, 422, { erreur: "Aucune ville trouvée. Complète l'annonce puis relance." });
    }

    const position = await geocoder(fiche.address, fiche.city, fiche.country);
    const urlAffiche = avecImage ? await deposerAffiche(image_base64, media_type) : null;

    let resultat = await envoyer(construireLigne(fiche, position, urlAffiche, "complet"));

    let repli = false;
    if (!resultat.ok && resultat.statut === 400) {
      repli = true;
      resultat = await envoyer(construireLigne(fiche, position, urlAffiche, "sur"));
    }

    if (!resultat.ok) {
      return repondre(res, 502, {
        erreur: "Insertion refusée par la base",
        detail: resultat.texte.slice(0, 400)
      });
    }

    const [insere] = JSON.parse(resultat.texte);

    return repondre(res, 200, {
      ok: true,
      message: "Événement créé en brouillon, à valider dans l'espace admin",
      evenement: insere,
      a_verifier: insere.moderation_note,
      geocodage: position ? (position.precis ? "adresse exacte" : "centre-ville") : "échec",
      affiche: avecImage ? (urlAffiche ? "conservée" : "non conservée") : "aucune",
      repli
    });
  } catch (e) {
    return repondre(res, 502, { erreur: "Extraction impossible", detail: String(e.message || e) });
  }
};
