const crypto = require("crypto");

function json(res, status, payload) {
  res.status(status).json(payload);
}

function clean(value, max = 4000) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

function cleanUrl(value) {
  const url = clean(value, 2000);

  if (!url) return "";

  try {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

function cleanStyles(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => clean(item, 50).toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}

function validEventType(value) {
  const allowed = [
    "party",
    "festival",
    "workshop",
    "class",
    "other"
  ];

  const cleaned = clean(value, 30).toLowerCase();

  return allowed.includes(cleaned)
    ? cleaned
    : "other";
}

function validDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function createFingerprint(data) {
  const base = [
    data.source_platform,
    data.source_url,
    data.source_post_id,
    data.event_name,
    data.starts_at,
    data.city
  ].join("|");

  return crypto
    .createHash("sha256")
    .update(base)
    .digest("hex");
}

async function insertCandidate(candidate) {
  const supabaseUrl =
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "SUPABASE_URL manquant dans Vercel."
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SERVICE_KEY manquant dans Vercel."
    );
  }

  const endpoint =
    `${supabaseUrl.replace(/\/$/, "")}` +
    "/rest/v1/discovery_candidates?on_conflict=fingerprint";

  const response = await fetch(endpoint, {
    method: "POST",

    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer:
        "resolution=ignore-duplicates,return=representation"
    },

    body: JSON.stringify(candidate)
  });

  const text = await response.text();

  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new Error(
      `Supabase ${response.status}: ${
        typeof payload === "string"
          ? payload
          : JSON.stringify(payload)
      }`
    );
  }

  return payload;
}

module.exports = async function handler(req, res) {
  /*
  ============================================================
  CORS
  ============================================================
  */

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-discovery-secret, x-kizomba-secret, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  /*
  ============================================================
  TEST GET
  ============================================================
  */

  if (req.method === "GET") {
    return json(res, 200, {
      ok: true,
      service:
        "Kizomba Atlas Discovery Ingest",
      message:
        "Endpoint opérationnel"
    });
  }

  if (req.method !== "POST") {
    res.setHeader(
      "Allow",
      "GET, POST, OPTIONS"
    );

    return json(res, 405, {
      ok: false,
      error:
        "Méthode non autorisée"
    });
  }

  /*
  ============================================================
  SÉCURITÉ
  ============================================================
  */

  const expectedSecret =
    process.env.DISCOVERY_INGEST_SECRET;

  if (!expectedSecret) {
    return json(res, 500, {
      ok: false,
      error:
        "DISCOVERY_INGEST_SECRET non configuré sur Vercel"
    });
  }

  const rawHeader =
    req.headers["x-discovery-secret"] ||
    req.headers["x-kizomba-secret"] ||
    "";

  const authHeader =
    req.headers.authorization ||
    "";

  const headerSecret =
    Array.isArray(rawHeader)
      ? rawHeader[0]
      : String(rawHeader);

  const bearerSecret =
    authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

  const bodySecret =
    req.body &&
    req.body.discovery_secret
      ? String(
          req.body.discovery_secret
        )
      : "";

  const expected =
    String(
      expectedSecret
    ).trim();

  const candidates = [
    headerSecret,
    bearerSecret,
    bodySecret
  ]
    .map((value) =>
      String(value || "").trim()
    )
    .filter(Boolean);

  const authorized =
    candidates.some(
      (value) =>
        value === expected
    );

  if (!authorized) {
    return json(res, 401, {
      ok: false,
      error: "Accès refusé",

      diagnostic: {
        secret_configured:
          Boolean(expected),

        x_discovery_header_received:
          Boolean(headerSecret),

        authorization_header_received:
          Boolean(bearerSecret),

        body_secret_received:
          Boolean(bodySecret)
      }
    });
  }

  /*
  ============================================================
  VALIDATION DU BODY
  ============================================================
  */

  try {
    const body =
      req.body || {};

    const sourceUrl =
      cleanUrl(
        body.source_url
      );

    if (!sourceUrl) {
      return json(res, 400, {
        ok: false,
        error:
          "source_url obligatoire et doit être une URL HTTP/HTTPS valide"
      });
    }

    const candidate = {
      source_platform:
        clean(
          body.source_platform ||
            "web",
          50
        ),

      source_url:
        sourceUrl,

      source_name:
        clean(
          body.source_name,
          200
        ),

      source_post_id:
        clean(
          body.source_post_id,
          200
        ) || null,

      source_text:
        clean(
          body.source_text,
          10000
        ),

      source_image_url:
        cleanUrl(
          body.source_image_url
        ) || null,

      source_published_at:
        validDate(
          body.source_published_at
        ),

      event_name:
        clean(
          body.event_name,
          300
        ),

      organizer_name:
        clean(
          body.organizer_name,
          300
        ),

      event_type:
        validEventType(
          body.event_type
        ),

      styles:
        cleanStyles(
          body.styles
        ),

      starts_at:
        validDate(
          body.starts_at
        ),

      ends_at:
        validDate(
          body.ends_at
        ),

      venue_name:
        clean(
          body.venue_name,
          300
        ),

      address:
        clean(
          body.address,
          500
        ),

      city:
        clean(
          body.city,
          200
        ),

      country:
        clean(
          body.country ||
            "France",
          100
        ),

      ticket_url:
        cleanUrl(
          body.ticket_url
        ) || null,

      price_text:
        clean(
          body.price_text,
          300
        ),

      description:
        clean(
          body.description,
          5000
        ),

      confidence:
        Math.max(
          0,
          Math.min(
            Number(
              body.confidence ||
                0
            ),
            1
          )
        ),

      verification_notes:
        clean(
          body.verification_notes,
          2000
        ),

      status:
        "new"
    };

    candidate.fingerprint =
      createFingerprint(
        candidate
      );

    const result =
      await insertCandidate(
        candidate
      );

    return json(res, 200, {
      ok: true,

      message:
        "Événement ajouté à la file de vérification Kizomba Atlas.",

      candidate:
        Array.isArray(result) &&
        result.length
          ? result[0]
          : null
    });

  } catch (error) {
    console.error(
      "Kizomba Atlas discovery-ingest:",
      error
    );

    return json(res, 500, {
      ok: false,
      error:
        error.message ||
        "Erreur serveur"
    });
  }
};
