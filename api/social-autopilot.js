function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
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
      )}&select=id,title_fr,city,starts_at,image_url&order=starts_at.asc&limit=20`
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

  let created = 0;

  for (
    let i = 0;
    i < selected.length;
    i += 1
  ) {
    const event =
      selected[i];

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
                scheduledDates[i],

              status:
                "queued"
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
              await queue()
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
