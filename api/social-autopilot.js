function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

/* =========================================================
   Génération automatique de contenu — légende, hashtags, visuel
   ========================================================= */

const STYLE_LABELS = {
  "kizomba": "Kizomba",
  "urban-kiz": "Urban Kiz",
  "bachata": "Bachata",
  "sbk": "SBK",
  "semba": "Semba",
  "tarraxo": "Tarraxo"
};

const CATEGORY_LABELS = {
  "party": "Soirée",
  "festival": "Festival",
  "workshop": "Workshop"
};

function eventStyles(event) {
  const raw = event.styles;
  const list = Array.isArray(raw)
    ? raw
    : (typeof raw === "string"
        ? raw.replace(/[{}]/g, "").split(",").map((item) => item.trim().replace(/^"|"$/g, ""))
        : []);
  return list.filter(Boolean).map((style) => STYLE_LABELS[style] || style);
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

function slugTag(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildAutopilotHashtags(event) {
  const tags = ["kizombaatlas"];

  eventStyles(event).forEach((style) => {
    const tag = slugTag(style);
    if (tag) tags.push(tag);
  });

  const categoryTag = slugTag(CATEGORY_LABELS[event.category] || "");
  if (categoryTag) tags.push(categoryTag);

  const cityTag = slugTag(event.city);
  if (cityTag) tags.push(cityTag);

  // Complète jusqu'à 5 avec des tags génériques pertinents si besoin.
  const filler = ["afrolatin", "danceevent", "kizombadance", "kizombafestival", "afrodance"];
  let i = 0;
  while (tags.length < 5 && i < filler.length) {
    if (!tags.includes(filler[i])) tags.push(filler[i]);
    i += 1;
  }

  // Dédoublonnage et plafond à 10.
  return [...new Set(tags)].slice(0, 10);
}

function formatLongDateFr(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

function formatShortDateFr(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(date).replace(".", "");
}

function buildAutopilotCaption(event, hashtags) {
  const title = event.title_fr || event.title_en || "Événement Kizomba";
  const city = event.city || "";
  const date = formatLongDateFr(event.starts_at);
  const styles = eventStyles(event);

  const line1 = [title, city].filter(Boolean).join(" — ");
  const line2 = date ? `📅 ${date}` : "";
  const line3 = styles.length
    ? `${CATEGORY_LABELS[event.category] || "Soirée"} ${styles.join(" · ")}`
    : (CATEGORY_LABELS[event.category] || "");
  const line4 = "👉 Retrouve la date sur Kizomba Atlas";
  const line5 = hashtags.map((tag) => `#${tag}`).join(" ");

  return [line1, line2, line3, line4, line5].filter(Boolean).join("\n");
}

function buildAutopilotCaptionEn(event, hashtags) {
  const title = event.title_en || event.title_fr || "Kizomba event";
  const city = event.city || "";
  const date = event.starts_at
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(new Date(event.starts_at))
    : "";
  const styles = eventStyles(event);

  const line1 = [title, city].filter(Boolean).join(" — ");
  const line2 = date ? `📅 ${date}` : "";
  const line3 = styles.length ? styles.join(" · ") : "";
  const line4 = "👉 Find this date on Kizomba Atlas";
  const line5 = hashtags.map((tag) => `#${tag}`).join(" ");

  return [line1, line2, line3, line4, line5].filter(Boolean).join("\n");
}

function generateAutopilotVisualData(event) {
  const hasPoster = isSafeUrl(event.image_url);
  const styles = eventStyles(event);

  return {
    visual_title: event.title_fr || event.title_en || "Événement Kizomba",
    visual_subtitle: styles.length ? styles.join(" · ") : (CATEGORY_LABELS[event.category] || ""),
    visual_date: formatShortDateFr(event.starts_at),
    visual_location: [event.venue_name, event.city].filter(Boolean).join(" — ") || event.city || "",
    visual_cta: "Kizomba Atlas",
    generated_visual_mode: hasPoster ? "poster" : "template",
    image_url: hasPoster ? event.image_url : null,
    social_preview_image: hasPoster ? event.image_url : null
  };
}

const crypto = require("crypto");

/* =========================================================
   Compte Instagram connecté — lecture/déchiffrement du token
   ========================================================= */

function encryptionKey() {
  const hex = process.env.META_TOKEN_ENCRYPTION_KEY;
  if (!hex) throw new Error("META_TOKEN_ENCRYPTION_KEY manquant dans Vercel.");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("META_TOKEN_ENCRYPTION_KEY invalide (attendu : openssl rand -hex 32).");
  return key;
}

function decryptToken(row) {
  const key = encryptionKey();
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

async function connectedInstagramAccount() {
  const rows = await sb(
    "social_accounts?platform=eq.instagram&status=eq.connected&select=id,ig_user_id,ig_username,token_expires_at,connected_at&order=updated_at.desc&limit=1"
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function connectedInstagramAccountWithToken() {
  const rows = await sb(
    "social_accounts?platform=eq.instagram&status=eq.connected&select=*&order=updated_at.desc&limit=1"
  );
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!row) return null;
  return { ...row, access_token: decryptToken(row) };
}

async function logPublishAttempt(queueItemId, status, message) {
  try {
    await sb("autopilot_publish_log", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ queue_item_id: queueItemId, status, message: message || null })
    });
  } catch (error) {
    console.error("Kizomba Atlas autopilot_publish_log:", error);
  }
}

/* Publie un item de la file sur Instagram (ou simule si SCHEDULER_DRY_RUN=true). */
async function publishQueueItem(item) {
  const dryRun = String(process.env.SCHEDULER_DRY_RUN || "").toLowerCase() === "true";
  const graphVersion = process.env.META_GRAPH_API_VERSION || "v21.0";

  if (!isSafeUrl(item.image_url)) {
    const message = "Aucune image disponible pour cette publication (l’Instagram Graph API exige un média).";
    await logPublishAttempt(item.id, "error", message);
    throw new Error(message);
  }

  const account = await connectedInstagramAccountWithToken();
  if (!account) {
    const message = "Aucun compte Instagram connecté.";
    await logPublishAttempt(item.id, "error", message);
    throw new Error(message);
  }

  const caption = item.caption_fr || item.caption || "";

  if (dryRun) {
    await logPublishAttempt(item.id, "dry_run", `DRY RUN — aurait publié pour @${account.ig_username || account.ig_user_id}.`);
    await sb(`social_autopilot_queue?id=eq.${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "dry_run", updated_at: new Date().toISOString() })
    });
    return { dryRun: true };
  }

  // 1) Créer le conteneur média.
  const containerResponse = await fetch(
    `https://graph.instagram.com/${graphVersion}/${account.ig_user_id}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        image_url: item.image_url,
        caption,
        access_token: account.access_token
      }).toString()
    }
  );
  const containerData = await containerResponse.json();
  if (!containerResponse.ok || !containerData.id) {
    const message = containerData?.error?.message || "Échec de la création du conteneur média.";
    await logPublishAttempt(item.id, "error", message);
    throw new Error(message);
  }

  // 2) Publier le conteneur.
  const publishResponse = await fetch(
    `https://graph.instagram.com/${graphVersion}/${account.ig_user_id}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: containerData.id,
        access_token: account.access_token
      }).toString()
    }
  );
  const publishData = await publishResponse.json();
  if (!publishResponse.ok || !publishData.id) {
    const message = publishData?.error?.message || "Échec de la publication.";
    await logPublishAttempt(item.id, "error", message);
    throw new Error(message);
  }

  await logPublishAttempt(item.id, "success", `Publié — media id ${publishData.id}`);
  await sb(`social_autopilot_queue?id=eq.${encodeURIComponent(item.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "published",
      published_media_id: publishData.id,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  });

  return { dryRun: false, mediaId: publishData.id };
}

function env() {
  const url = process.env.SUPABASE_URL;

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!url) {
    throw new Error(
      "SUPABASE_URL manquant dans Vercel."
    );
  }

  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY manquant dans Vercel."
    );
  }

  return {
    url: url.replace(/\/$/, ""),
    serviceKey
  };
}

function bearer(req) {
  const raw =
    String(
      req.headers.authorization || ""
    ).trim();

  return raw.startsWith("Bearer ")
    ? raw.slice(7).trim()
    : "";
}

async function verifyAdmin(req) {
  const token =
    bearer(req);

  if (!token) {
    return {
      ok: false,
      status: 401,
      error:
        "Session administrateur absente."
    };
  }

  const {
    url,
    serviceKey
  } = env();

  const response =
    await fetch(
      `${url}/rest/v1/rpc/is_admin`,
      {
        method: "POST",

        headers: {
          apikey:
            serviceKey,

          Authorization:
            `Bearer ${token}`,

          "Content-Type":
            "application/json"
        },

        body: "{}"
      }
    );

  const text =
    await response.text();

  let value = null;

  try {
    value =
      JSON.parse(text);
  } catch {
    value =
      text;
  }

  if (
    response.ok &&
    value === true
  ) {
    return {
      ok: true
    };
  }

  return {
    ok: false,
    status: 403,
    error:
      "Accès administrateur refusé."
  };
}

async function sb(
  path,
  options = {}
) {
  const {
    url,
    serviceKey
  } = env();

  const response =
    await fetch(
      `${url}/rest/v1/${path}`,
      {
        ...options,

        headers: {
          apikey:
            serviceKey,

          Authorization:
            `Bearer ${serviceKey}`,

          "Content-Type":
            "application/json",

          ...(options.headers || {})
        }
      }
    );

  const text =
    await response.text();

  let data = null;

  try {
    data =
      text
        ? JSON.parse(text)
        : null;
  } catch {
    data =
      text;
  }

  if (!response.ok) {
    throw new Error(
      `Supabase ${response.status}: ${
        typeof data === "string"
          ? data
          : JSON.stringify(data)
      }`
    );
  }

  return data;
}

async function settings() {
  const rows =
    await sb(
      "social_autopilot_settings?id=eq.1&select=*"
    );

  return (
    Array.isArray(rows) &&
    rows[0]
      ? rows[0]
      : null
  );
}

async function queue() {
  const rows =
    await sb(
      "social_autopilot_queue?status=in.(queued,ready)&select=*&order=scheduled_for.asc.nullslast,created_at.asc&limit=20"
    );

  return Array.isArray(rows)
    ? rows
    : [];
}

function caption(event) {
  const title =
    event.title_fr ||
    "Événement Kizomba";

  const city =
    event.city || "";

  const date =
    event.starts_at
      ? new Intl.DateTimeFormat(
          "fr-FR",
          {
            dateStyle: "long"
          }
        ).format(
          new Date(
            event.starts_at
          )
        )
      : "";

  return `${[
    title,
    date,
    city
  ]
    .filter(Boolean)
    .join(" · ")}

Retrouvez les informations et l’itinéraire sur Kizomba Atlas.

#kizomba #urbankiz #kizombaatlas`;
}

function slots(
  count,
  cadence
) {
  const now =
    new Date();

  const result = [];

  for (
    let i = 0;
    i < count;
    i += 1
  ) {
    const date =
      new Date(now);

    if (
      cadence === "daily"
    ) {
      date.setDate(
        date.getDate() +
        i +
        1
      );
    } else {
      date.setDate(
        date.getDate() +
        Math.max(
          1,
          Math.round(
            ((i + 1) * 7) /
            (count + 1)
          )
        )
      );
    }

    date.setHours(
      18,
      45,
      0,
      0
    );

    result.push(
      date.toISOString()
    );
  }

  return result;
}

async function prepare(
  currentSettings
) {
  const quota =
    Math.max(
      2,
      Math.min(
        Number(
          currentSettings.quota ||
          2
        ),
        3
      )
    );

  const events =
    await sb(
      `events?status=eq.published&starts_at=gte.${encodeURIComponent(
        new Date().toISOString()
      )}&select=id,title_fr,title_en,city,venue_name,country,category,styles,starts_at,image_url&order=starts_at.asc&limit=20`
    );

  const currentQueue =
    await queue();

  const queuedIds =
    new Set(
      currentQueue
        .map(
          (item) =>
            item.event_id
        )
        .filter(Boolean)
    );

  const selected =
    (
      Array.isArray(events)
        ? events
        : []
    )
      .filter(
        (event) =>
          !queuedIds.has(
            event.id
          )
      )
      // Infos minimales requises : titre, ville et date valide. Évite les fiches trop pauvres.
      .filter(
        (event) =>
          Boolean(event.title_fr || event.title_en) &&
          Boolean(event.city) &&
          !Number.isNaN(new Date(event.starts_at).getTime())
      )
      .slice(
        0,
        quota
      );

  const scheduledDates =
    slots(
      selected.length,
      currentSettings.cadence ||
      "weekly"
    );

  const platforms = [
    currentSettings.instagram !== false ? "instagram" : null,
    currentSettings.facebook !== false ? "facebook" : null
  ].filter(Boolean);

  let created = 0;

  for (
    let i = 0;
    i < selected.length;
    i += 1
  ) {
    const event =
      selected[i];

    const hashtags = buildAutopilotHashtags(event);
    const visual = generateAutopilotVisualData(event);

    await sb(
      "social_autopilot_queue",
      {
        method:
          "POST",

        headers: {
          Prefer:
            "return=minimal"
        },

        body:
          JSON.stringify(
            {
              event_id:
                event.id,

              event_title:
                event.title_fr ||
                "Événement Kizomba",

              // Nouveaux champs de contenu social complet.
              title: event.title_fr || event.title_en || "Événement Kizomba",
              status: "queued",
              platforms,
              post_type: "post",
              caption_fr: buildAutopilotCaption(event, hashtags),
              caption_en: buildAutopilotCaptionEn(event, hashtags),
              hashtags,
              visual_title: visual.visual_title,
              visual_subtitle: visual.visual_subtitle,
              visual_date: visual.visual_date,
              visual_location: visual.visual_location,
              visual_cta: visual.visual_cta,
              image_url: visual.image_url,
              generated_visual_mode: visual.generated_visual_mode,
              social_preview_image: visual.social_preview_image,

              // Champs historiques conservés pour compatibilité avec le code existant.
              caption:
                caption(event),

              media_url:
                event.image_url ||
                null,

              instagram:
                currentSettings.instagram !==
                false,

              facebook:
                currentSettings.facebook !==
                false,

              scheduled_for:
                scheduledDates[i]
            }
          )
      }
    );

    created += 1;
  }

  return created;
}

module.exports =
  async function handler(
    req,
    res
  ) {
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, OPTIONS"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );

    if (
      req.method ===
      "OPTIONS"
    ) {
      res.statusCode = 204;
      return res.end();
    }

    try {
      const admin =
        await verifyAdmin(req);

      if (!admin.ok) {
        return json(
          res,
          admin.status,
          {
            ok: false,
            error:
              admin.error
          }
        );
      }

      if (
        req.method ===
        "GET"
      ) {
        return json(
          res,
          200,
          {
            ok: true,

            settings:
              await settings(),

            queue:
              await queue(),

            instagram_account:
              await connectedInstagramAccount()
          }
        );
      }

      const body =
        req.body || {};

      if (
        req.method ===
          "PATCH" &&
        body.action ===
          "settings"
      ) {
        await sb(
          "social_autopilot_settings?on_conflict=id",
          {
            method:
              "POST",

            headers: {
              Prefer:
                "resolution=merge-duplicates,return=minimal"
            },

            body:
              JSON.stringify(
                {
                  id: 1,

                  enabled:
                    Boolean(
                      body.enabled
                    ),

                  quota:
                    Math.max(
                      2,
                      Math.min(
                        Number(
                          body.quota ||
                          2
                        ),
                        3
                      )
                    ),

                  cadence:
                    body.cadence ===
                    "daily"
                      ? "daily"
                      : "weekly",

                  instagram:
                    Boolean(
                      body.instagram
                    ),

                  facebook:
                    Boolean(
                      body.facebook
                    ),

                  updated_at:
                    new Date()
                      .toISOString()
                }
              )
          }
        );

        return json(
          res,
          200,
          {
            ok: true,

            settings:
              await settings()
          }
        );
      }

      if (
        req.method ===
          "PATCH" &&
        body.action ===
          "remove"
      ) {
        await sb(
          `social_autopilot_queue?id=eq.${encodeURIComponent(
            String(
              body.id || ""
            )
          )}`,
          {
            method:
              "PATCH",

            headers: {
              Prefer:
                "return=minimal"
            },

            body:
              JSON.stringify(
                {
                  status:
                    "cancelled",

                  updated_at:
                    new Date()
                      .toISOString()
                }
              )
          }
        );

        return json(
          res,
          200,
          {
            ok: true,

            queue:
              await queue()
          }
        );
      }

      if (
        req.method === "PATCH" &&
        body.action === "publish"
      ) {
        const id = String(body.id || "").trim();
        if (!id) return json(res, 400, { ok: false, error: "Identifiant de publication manquant." });

        const items = await sb(`social_autopilot_queue?id=eq.${encodeURIComponent(id)}&select=*`);
        const item = Array.isArray(items) && items[0] ? items[0] : null;
        if (!item) return json(res, 404, { ok: false, error: "Publication introuvable." });

        try {
          const result = await publishQueueItem(item);
          return json(res, 200, {
            ok: true,
            dry_run: result.dryRun,
            queue: await queue()
          });
        } catch (publishError) {
          return json(res, 502, { ok: false, error: publishError.message });
        }
      }

      if (
        req.method === "PATCH" &&
        body.action === "disconnect_instagram"
      ) {
        await sb("social_accounts?platform=eq.instagram", {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: "disconnected", updated_at: new Date().toISOString() })
        });
        return json(res, 200, { ok: true, instagram_account: null });
      }

      if (
        req.method === "PATCH" &&
        body.action === "update"
      ) {
        const id = String(body.id || "").trim();
        if (!id) {
          return json(res, 400, { ok: false, error: "Identifiant de publication manquant." });
        }

        // Édition manuelle : uniquement les champs de contenu, jamais le statut ni l'événement lié.
        const patch = { updated_at: new Date().toISOString() };

        if (typeof body.caption_fr === "string") patch.caption_fr = body.caption_fr;
        if (typeof body.caption_en === "string") patch.caption_en = body.caption_en;
        if (Array.isArray(body.hashtags)) patch.hashtags = body.hashtags.slice(0, 10);
        if (typeof body.visual_title === "string") patch.visual_title = body.visual_title;
        if (typeof body.visual_subtitle === "string") patch.visual_subtitle = body.visual_subtitle;
        if (typeof body.visual_date === "string") patch.visual_date = body.visual_date;
        if (typeof body.visual_location === "string") patch.visual_location = body.visual_location;
        if (typeof body.visual_cta === "string") patch.visual_cta = body.visual_cta;
        if (["post", "story", "reel"].includes(body.post_type)) patch.post_type = body.post_type;
        if (typeof body.scheduled_for === "string" && body.scheduled_for) {
          const parsed = new Date(body.scheduled_for);
          if (!Number.isNaN(parsed.getTime())) patch.scheduled_for = parsed.toISOString();
        }

        await sb(
          `social_autopilot_queue?id=eq.${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(patch)
          }
        );

        return json(res, 200, { ok: true, queue: await queue() });
      }

      if (
        req.method ===
          "POST" &&
        body.action ===
          "prepare"
      ) {
        const currentSettings =
          await settings();

        if (!currentSettings) {
          return json(
            res,
            409,
            {
              ok: false,
              error:
                "Réglages Autopilote absents."
            }
          );
        }

        const created =
          await prepare(
            currentSettings
          );

        return json(
          res,
          200,
          {
            ok: true,

            created,

            settings:
              currentSettings,

            queue:
              await queue()
          }
        );
      }

      return json(
        res,
        400,
        {
          ok: false,
          error:
            "Action Autopilote inconnue."
        }
      );

    } catch (error) {
      return json(
        res,
        500,
        {
          ok: false,

          error:
            error.message ||
            "Erreur serveur"
        }
      );
    }
  };
