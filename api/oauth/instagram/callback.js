const crypto = require("crypto");

function env() {
  const appId = process.env.INSTAGRAM_LOGIN_APP_ID;
  const appSecret = process.env.INSTAGRAM_LOGIN_APP_SECRET;
  const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  const signingKey = process.env.META_TOKEN_ENCRYPTION_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!appId) throw new Error("INSTAGRAM_LOGIN_APP_ID manquant dans Vercel.");
  if (!appSecret) throw new Error("INSTAGRAM_LOGIN_APP_SECRET manquant dans Vercel.");
  if (!siteUrl) throw new Error("SITE_URL manquant dans Vercel.");
  if (!signingKey) throw new Error("META_TOKEN_ENCRYPTION_KEY manquant dans Vercel.");
  if (!supabaseUrl) throw new Error("SUPABASE_URL manquant dans Vercel.");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant dans Vercel.");

  return {
    appId,
    appSecret,
    siteUrl: siteUrl.replace(/\/$/, ""),
    signingKey,
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
    serviceKey
  };
}

function verifyState(state, signingKey) {
  const [payload, signature] = String(state || "").split(".");
  if (!payload || !signature) return false;

  const expected = crypto.createHmac("sha256", signingKey).update(payload).digest("hex");
  const valid =
    expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));

  if (!valid) return false;

  // Le lien d'autorisation expire après 15 minutes, pour limiter le rejeu.
  const issuedAt = Number(payload);
  if (!Number.isFinite(issuedAt)) return false;
  return Date.now() - issuedAt < 15 * 60 * 1000;
}

function encryptToken(plainText, hexKey) {
  const key = Buffer.from(hexKey, "hex");
  if (key.length !== 32) throw new Error("META_TOKEN_ENCRYPTION_KEY doit faire 32 octets (openssl rand -hex 32).");

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64")
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

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.end();
}

module.exports = async (req, res) => {
  let cfg;
  try {
    cfg = env();
  } catch (error) {
    console.error("Kizomba Atlas oauth/instagram/callback (config):", error);
    res.statusCode = 500;
    res.end("Configuration serveur incomplète.");
    return;
  }

  const adminUrl = `${cfg.siteUrl}/admin.html`;

  try {
    const url = new URL(req.url, cfg.siteUrl);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorReason = url.searchParams.get("error_reason") || url.searchParams.get("error");

    if (errorReason) {
      return redirect(res, `${adminUrl}?instagram=error&reason=${encodeURIComponent(errorReason)}`);
    }

    if (!code || !verifyState(state, cfg.signingKey)) {
      return redirect(res, `${adminUrl}?instagram=error&reason=state_invalide`);
    }

    const redirectUri = `${cfg.siteUrl}/api/oauth/instagram/callback`;

    // 1) Échange du code contre un token courte durée.
    const shortForm = new URLSearchParams({
      client_id: cfg.appId,
      client_secret: cfg.appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code
    });

    const shortResponse = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: shortForm.toString()
    });

    const shortData = await shortResponse.json();
    if (!shortResponse.ok || !shortData.access_token) {
      console.error("Kizomba Atlas Instagram token court:", shortData);
      return redirect(res, `${adminUrl}?instagram=error&reason=echange_token`);
    }

    // 2) Passage en token longue durée (~60 jours).
    const longUrl =
      "https://graph.instagram.com/access_token" +
      `?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(cfg.appSecret)}` +
      `&access_token=${encodeURIComponent(shortData.access_token)}`;

    const longResponse = await fetch(longUrl);
    const longData = await longResponse.json();
    if (!longResponse.ok || !longData.access_token) {
      console.error("Kizomba Atlas Instagram token long:", longData);
      return redirect(res, `${adminUrl}?instagram=error&reason=token_longue_duree`);
    }

    // 3) Identité du compte connecté.
    const meUrl =
      `https://graph.instagram.com/me?fields=user_id,username&access_token=${encodeURIComponent(longData.access_token)}`;
    const meResponse = await fetch(meUrl);
    const meData = await meResponse.json();
    if (!meResponse.ok || !meData.user_id) {
      console.error("Kizomba Atlas Instagram profil:", meData);
      return redirect(res, `${adminUrl}?instagram=error&reason=profil_introuvable`);
    }

    // 4) Chiffrement et stockage — jamais de token en clair en base.
    const { encrypted, iv, tag } = encryptToken(longData.access_token, cfg.signingKey);
    const expiresAt = new Date(Date.now() + (Number(longData.expires_in) || 5184000) * 1000).toISOString();

    await sb(cfg, "social_accounts?on_conflict=platform,ig_user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        platform: "instagram",
        ig_user_id: String(meData.user_id),
        ig_username: meData.username || null,
        access_token_encrypted: encrypted,
        token_iv: iv,
        token_tag: tag,
        token_expires_at: expiresAt,
        status: "connected",
        updated_at: new Date().toISOString()
      })
    });

    return redirect(res, `${adminUrl}?instagram=connected`);
  } catch (error) {
    console.error("Kizomba Atlas oauth/instagram/callback:", error);
    return redirect(res, `${adminUrl}?instagram=error&reason=serveur`);
  }
};
