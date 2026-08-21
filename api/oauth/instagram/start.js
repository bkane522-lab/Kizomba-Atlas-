const crypto = require("crypto");

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function env() {
  const appId = process.env.INSTAGRAM_LOGIN_APP_ID;
  const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  const signingKey = process.env.META_TOKEN_ENCRYPTION_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!appId) throw new Error("INSTAGRAM_LOGIN_APP_ID manquant dans Vercel.");
  if (!siteUrl) throw new Error("SITE_URL manquant dans Vercel (ex: https://kizomba-atlas.vercel.app).");
  if (!signingKey) throw new Error("META_TOKEN_ENCRYPTION_KEY manquant dans Vercel.");
  if (!supabaseUrl) throw new Error("SUPABASE_URL manquant dans Vercel.");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant dans Vercel.");

  return {
    appId,
    siteUrl: siteUrl.replace(/\/$/, ""),
    signingKey,
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
    serviceKey
  };
}

function bearer(req) {
  const raw = String(req.headers.authorization || "").trim();
  return raw.startsWith("Bearer ") ? raw.slice(7).trim() : "";
}

async function verifyAdmin(req, cfg) {
  const token = bearer(req);
  if (!token) return { ok: false, status: 401, error: "Session administrateur absente." };

  const response = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: {
      apikey: cfg.serviceKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });

  const text = await response.text();
  let value = null;
  try { value = JSON.parse(text); } catch { value = text; }

  if (response.ok && value === true) return { ok: true };
  return { ok: false, status: 403, error: "Accès administrateur refusé." };
}

/* state anti-CSRF : horodatage + signature, sans stockage en base.
   Vérifié au retour dans callback.js avec la même clé. */
function buildState(signingKey) {
  const payload = String(Date.now());
  const signature = crypto.createHmac("sha256", signingKey).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

module.exports = async (req, res) => {
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "Méthode non supportée." });

  try {
    const cfg = env();

    const admin = await verifyAdmin(req, cfg);
    if (!admin.ok) return json(res, admin.status, { ok: false, error: admin.error });

    const redirectUri = `${cfg.siteUrl}/api/oauth/instagram/callback`;
    const state = buildState(cfg.signingKey);

    // Permissions demandées : lecture basique + publication de contenu uniquement.
    const scope = ["instagram_business_basic", "instagram_business_content_publish"].join(",");

    const authorizeUrl =
      "https://www.instagram.com/oauth/authorize" +
      `?force_reauth=true` +
      `&client_id=${encodeURIComponent(cfg.appId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`;

    return json(res, 200, { ok: true, authorize_url: authorizeUrl });
  } catch (error) {
    console.error("Kizomba Atlas oauth/instagram/start:", error);
    return json(res, 500, { ok: false, error: error.message || "Erreur serveur." });
  }
};
