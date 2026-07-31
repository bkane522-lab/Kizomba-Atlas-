// api/flyer.js
// Kizomba Atlas â€” Flyer vers Ã‰vÃ©nement (version Groq, gratuite)
// ReÃ§oit une photo de flyer OU un texte copiÃ©-collÃ©,
// en extrait une fiche Ã©vÃ©nement et l'insÃ¨re dans public.events en status 'draft'.
// Aucune dÃ©pendance : tout passe par fetch.
//
// Variables d'environnement sur Vercel :
//   GROQ_API_KEY               (console.groq.com > API Keys) --- Ã€ AJOUTER
//   ATLAS_ADMIN_SECRET         (un mot de passe que tu inventes) --- Ã€ AJOUTER
//   SUPABASE_URL               --- DÃ‰JÃ€ PRÃ‰SENTE
//   SUPABASE_SERVICE_ROLE_KEY  --- DÃ‰JÃ€ PRÃ‰SENTE
//   MODELE_IA                  (facultatif : pour changer de modÃ¨le sans toucher au code)

const MODELE_DEFAUT = "meta-llama/llama-4-scout-17b-16e-instruct";

const CATEGORIES = ["soiree", "festival", "stage", "cours", "concert", "autre"];
const STYLES = ["kizomba", "urban_kiz", "semba", "tarraxo", "tarraxinha", "ghetto_zouk", "bachata", "sbk", "salsa", "zouk"];

function nouvelId() {
  return "evt_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function consigne() {
  return `Tu extrais les informations d'un flyer d'Ã©vÃ©nement de danse afro-latine (Kizomba, Urban Kiz, Bachata, SBK...).

RÃ©ponds STRICTEMENT en JSON, sans texte autour, sans balises markdown, selon ce schÃ©ma exact :

{
  "title_fr": "titre de l'Ã©vÃ©nement en franÃ§ais",
  "title_en": "le mÃªme titre en anglais",
  "description_fr": "2 Ã  4 phrases en franÃ§ais, factuelles, tirÃ©es du flyer uniquement",
  "description_en": "la mÃªme description en anglais",
  "organizer_name": "nom de l'organisateur ou du collectif",
  "category": "une valeur parmi : ${CATEGORIES.join(", ")}",
  "styles": ["valeurs parmi : ${STYLES.join(", ")}"],
  "starts_at": "date et heure de dÃ©but au format ISO 8601 avec dÃ©calage, ex 2026-09-12T22:00:00+02:00",
  "ends_at": "date et heure de fin au mÃªme format, ou null",
  "venue_name": "nom du lieu",
  "address": "adresse postale telle qu'Ã©crite",
  "city": "ville",
  "country": "pays en toutes lettres",
  "ticket_url": "URL de billetterie, ou null",
  "price_text_fr": "tarifs en franÃ§ais tels qu'annoncÃ©s",
  "price_text_en": "les mÃªmes tarifs en anglais",
  "contact_name": "nom de contact, ou null",
  "contact_email": "email, ou null",
  "contact_profile": "lien rÃ©seau social de l'organisateur, ou null",
  "recurrence": "hebdomadaire, mensuelle, ou null si Ã©vÃ©nement unique",
  "moderation_note": "ce dont tu n'es pas certain, et ce qui manque"
}

RÃ¨gles absolues :
- N'INVENTE RIEN. Toute information absente du flyer vaut null.
- Si l'annÃ©e n'est pas Ã©crite, dÃ©duis la prochaine occurrence Ã  venir et signale-le dans moderation_note.
- Si l'heure n'est pas Ã©crite, mets 21:00 pour une soirÃ©e et signale-le dans moderation_note.
- Fuseau par dÃ©faut : Europe/Paris.
- Ne devine ni coordonnÃ©es GPS, ni adresse non Ã©crite.
- styles doit Ãªtre un tableau, mÃªme avec un seul Ã©lÃ©ment.
- Si le document n'est pas un flyer d'Ã©vÃ©nement, renvoie {"erreur": "ce document n'est pas un flyer d'Ã©vÃ©nement"}.`;
}

async function extraire(contenuUtilisateur) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.MODELE_IA || MODELE_DEFAUT,
      temperature: 0.2,
      max_completion_tokens: 2000,
      messages: [
        { role: "system", content: consigne() },
        { role: "user", content: contenuUtilisateur }
      ]
    })
  });

  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`Groq ${r.status} : ${detail.slice(0, 300)}`);
  }

  const data = await r.json();
  let brut = data.choices?.[0]?.message?.content || "";
  brut = brut.replace(/```json|```/g, "").trim();

  // Filet de sÃ©curitÃ© : on ne garde que le bloc JSON s'il reste du texte autour
  const debut = brut.indexOf("{");
  const fin = brut.lastIndexOf("}");
  if (debut > 0 || fin < brut.length - 1) brut = brut.slice(debut, fin + 1);

  return JSON.parse(brut);
}

async function insererDansSupabase(fiche) {
  const ligne = {
    id: nouvelId(),
    title_fr: fiche.title_fr || null,
    title_en: fiche.title_en || null,
    description_fr: fiche.description_fr || null,
    description_en: fiche.description_en || null,
    organizer_name: fiche.organizer_name || null,
    category: CATEGORIES.includes(fiche.category) ? fiche.category : "autre",
    styles: Array.isArray(fiche.styles) ? fiche.styles.filter((s) => STYLES.includes(s)) : [],
    starts_at: fiche.starts_at || null,
    ends_at: fiche.ends_at || null,
    venue_name: fiche.venue_name || null,
    address: fiche.address || null,
    city: fiche.city || null,
    country: fiche.country || null,
    ticket_url: fiche.ticket_url || null,
    price_text_fr: fiche.price_text_fr || null,
    price_text_en: fiche.price_text_en || null,
    contact_name: fiche.contact_name || null,
    contact_email: fiche.contact_email || null,
    contact_profile: fiche.contact_profile || null,
    recurrence: fiche.recurrence || null,
    moderation_note: fiche.moderation_note || null,
    // Verrous : jamais dÃ©cidÃ©s par le modÃ¨le
    status: "draft",
    source: "flyer_ia",
    is_featured: false,
    latitude: null,
    longitude: null
  };

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

  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`Supabase ${r.status} : ${detail.slice(0, 300)}`);
  }

  const [insere] = await r.json();
  return insere;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-atlas-secret");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ erreur: "MÃ©thode non autorisÃ©e" });

  if (req.headers["x-atlas-secret"] !== process.env.ATLAS_ADMIN_SECRET) {
    return res.status(401).json({ erreur: "Non autorisÃ©" });
  }

  const { texte, image_base64, media_type } = req.body || {};

  let contenu;
  if (image_base64) {
    // Format Groq : image en data URL
    contenu = [
      { type: "text", text: "Extrais la fiche Ã©vÃ©nement de ce flyer." },
      {
        type: "image_url",
        image_url: { url: `data:${media_type || "image/jpeg"};base64,${image_base64}` }
      }
    ];
  } else if (texte && texte.trim().length > 15) {
    contenu = `Extrais la fiche Ã©vÃ©nement de cette annonce :\n\n${texte}`;
  } else {
    return res.status(400).json({ erreur: "Envoie soit image_base64, soit texte" });
  }

  try {
    const fiche = await extraire(contenu);

    if (fiche.erreur) {
      return res.status(422).json({ erreur: fiche.erreur });
    }

    const insere = await insererDansSupabase(fiche);

    return res.status(200).json({
      ok: true,
      message: "Ã‰vÃ©nement crÃ©Ã© en brouillon, Ã  valider dans l'espace admin",
      evenement: insere,
      a_verifier: fiche.moderation_note || null
    });
  } catch (e) {
    return res.status(502).json({ erreur: "Extraction impossible", detail: String(e.message || e) });
  }
};
