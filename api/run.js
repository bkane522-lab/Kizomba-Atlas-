const crypto = require("crypto");

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function env() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const schedulerSecret = process.env.SCHEDULER_SECRET;

  if (!url) throw new Error("SUPABASE_URL manquant dans Vercel.");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant dans Vercel.");
  if (!schedulerSecret) throw new Error("SCHEDULER_SECRET manquant dans Vercel.");

  return { url: url.replace(/\/$/, ""), serviceKey, schedulerSecret };
}

async function sb(cfg, path, options = {}) {
  const response = await fetch(`${cfg.url}/rest/v1/${path}`, {
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

function isSafeUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function decryptToken(row) {
  const hex = process.env.META_TOKEN_ENCRYPTION_KEY;
  if (!hex) throw new Error("META_TOKEN_ENCRYPTION_KEY manquant dans Vercel.");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("META_TOKEN_ENCRYPTION_KEY invalide.");

  const iv = Buffer.from(row.token_iv, "base64");
  const tag = Buffer.from(row.token_tag, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(row.access_token_encrypted, "base64")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

async function logAttempt(cfg, queueItemId, status, message) {
  try {
    await sb(cfg, "autopilot_publish_log", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ queue_item_id: queueItemId, status, message: message || null })
    });
  } catch (error) {
    console.error("Kizomba Atlas scheduler log:", error);
  }
}

async function publishItem(cfg, item, account) {
  const dryRun = String(process.env.SCHEDULER_DRY_RUN || "").toLowerCase() === "true";
  const graphVersion = process.env.META_GRAPH_API_VERSION || "v21.0";
  const caption = item.caption_fr || item.caption || "";

  if (dryRun) {
    await logAttempt(cfg, item.id, "dry_run", `DRY RUN (scheduler) — aurait publié pour @${account.ig_username || account.ig_user_id}.`);
    return;
  }

  const token = decryptToken(account);

  const containerResponse = await fetch(
    `https://graph.instagram.com/${graphVersion}/${account.ig_user_id}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ image_url: item.image_url, caption, access_token: token }).toString()
    }
  );
  const containerData = await containerResponse.json();
  if (!containerResponse.ok || !containerData.id) {
    throw new Error(containerData?.error?.message || "Échec de la création du conteneur média.");
  }

  const publishResponse = await fetch(
    `https://graph.instagram.com/${graphVersion}/${account.ig_user_id}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: containerData.id, access_token: token }).toString()
    }
  );
  const publishData = await publishResponse.json();
  if (!publishResponse.ok || !publishData.id) {
    throw new Error(publishData?.error?.message || "Échec de la publication.");
  }

  await logAttempt(cfg, item.id, "success", `Publié (scheduler) — media id ${publishData.id}`);
  await sb(cfg, `social_autopilot_queue?id=eq.${encodeURIComponent(item.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "published",
      published_media_id: publishData.id,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  });
}

/* =========================================================
   Endpoint appelé par pg_cron (voir SUPABASE_META_CONNECTION.sql
   et la documentation de mise en place du scheduler).
   Sécurisé par le header x-scheduler-secret, jamais par un compte admin
   puisqu'il est appelé automatiquement, sans navigateur.
   ========================================================= */
module.exports = async (req, res) => {
  let cfg;
  try {
    cfg = env();
  } catch (error) {
    console.error("Kizomba Atlas scheduler/run (config):", error);
    return json(res, 500, { ok: false, error: error.message });
  }

  const providedSecret = String(req.headers["x-scheduler-secret"] || "").trim();
  const valid =
    providedSecret.length === cfg.schedulerSecret.length &&
    crypto.timingSafeEqual(Buffer.from(providedSecret), Buffer.from(cfg.schedulerSecret));

  if (!valid) {
    return json(res, 401, { ok: false, error: "Secret du scheduler invalide." });
  }

  try {
    const dueItems = await sb(
      cfg,
      `social_autopilot_queue?status=eq.queued&scheduled_for=lte.${encodeURIComponent(
        new Date().toISOString()
      )}&select=*&order=scheduled_for.asc&limit=5`
    );

    const accounts = await sb(
      cfg,
      "social_accounts?platform=eq.instagram&status=eq.connected&select=*&order=updated_at.desc&limit=1"
    );
    const account = Array.isArray(accounts) && accounts[0] ? accounts[0] : null;

    let processed = 0;
    let failed = 0;

    for (const item of Array.isArray(dueItems) ? dueItems : []) {
      if (!isSafeUrl(item.image_url)) {
        await logAttempt(cfg, item.id, "error", "Aucune image disponible pour cette publication.");
        failed += 1;
        continue;
      }
      if (!account) {
        await logAttempt(cfg, item.id, "error", "Aucun compte Instagram connecté.");
        failed += 1;
        continue;
      }

      try {
        await publishItem(cfg, item, account);
        processed += 1;
      } catch (error) {
        console.error("Kizomba Atlas scheduler publish:", error);
        await logAttempt(cfg, item.id, "error", error.message);
        failed += 1;
      }
    }

    return json(res, 200, { ok: true, processed, failed, checked: (dueItems || []).length });
  } catch (error) {
    console.error("Kizomba Atlas scheduler/run:", error);
    return json(res, 500, { ok: false, error: error.message || "Erreur serveur." });
  }
};
