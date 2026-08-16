const crypto = require("crypto");

function json(res, status, payload) {
  res.status(status).json(payload);
}

function clean(value, max = 5000) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

function decodeEntities(value) {
  return clean(value, 20000)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function stripHtml(value) {
  return decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match && match[1]) {
      return decodeEntities(match[1]).trim();
    }
  }

  return "";
}

function validUrl(value) {
  const raw = clean(value, 2000);

  if (!raw) return "";

  try {
    const parsed = new URL(raw);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest("hex");
}

function parseRssItems(xml) {
  const blocks = [];

  const rssMatches =
    xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];

  rssMatches.forEach((block) => {
    blocks.push({
      format: "rss",
      raw: block
    });
  });

  const atomMatches =
    xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];

  atomMatches.forEach((block) => {
    blocks.push({
      format: "atom",
      raw: block
    });
  });

  return blocks.map(({ format, raw }) => {
    let link = "";

    if (format === "rss") {
      link = firstMatch(raw, [
        /<link[^>]*>([\s\S]*?)<\/link>/i,
        /<guid[^>]*>([\s\S]*?)<\/guid>/i
      ]);
    } else {
      const href =
        raw.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);

      if (href && href[1]) {
        link = href[1];
      } else {
        link = firstMatch(raw, [
          /<link[^>]*>([\s\S]*?)<\/link>/i
        ]);
      }
    }

    const title = firstMatch(raw, [
      /<title[^>]*>([\s\S]*?)<\/title>/i
    ]);

    const description = firstMatch(raw, [
      /<description[^>]*>([\s\S]*?)<\/description>/i,
      /<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i,
      /<content[^>]*>([\s\S]*?)<\/content>/i,
      /<summary[^>]*>([\s\S]*?)<\/summary>/i
    ]);

    const published = firstMatch(raw, [
      /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i,
      /<published[^>]*>([\s\S]*?)<\/published>/i,
      /<updated[^>]*>([\s\S]*?)<\/updated>/i,
      /<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i
    ]);

    const guid = firstMatch(raw, [
      /<guid[^>]*>([\s\S]*?)<\/guid>/i,
      /<id[^>]*>([\s\S]*?)<\/id>/i
    ]);

    return {
      title: stripHtml(title),
      description: stripHtml(description),
      link: validUrl(link),
      guid: clean(guid, 1000),
      published_at: normalizeDate(published)
    };
  });
}

function getConfiguredFeeds() {
  const raw = process.env.DISCOVERY_FEEDS_JSON;

  if (!raw) {
    throw new Error(
      "DISCOVERY_FEEDS_JSON n'est pas configuré dans Vercel."
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "DISCOVERY_FEEDS_JSON n'est pas un JSON valide."
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      "DISCOVERY_FEEDS_JSON doit contenir un tableau."
    );
  }

  return parsed
    .map((feed) => ({
      name: clean(feed.name, 200),
      url: validUrl(feed.url),
      platform: clean(feed.platform || "rss", 50),
      enabled: feed.enabled !== false
    }))
    .filter((feed) => feed.enabled && feed.url);
}

function looksRelevant(text) {
  const value = clean(text, 20000).toLowerCase();

  const keywords = [
    "kizomba",
    "urban kiz",
    "urbankiz",
    "urban-kiz",
    "semba",
    "tarraxo",
    "bachata",
    "sbk",
    "salsa",
    "kompa",
    "workshop",
    "festival",
    "social dance",
    "soirée",
    "soiree",
    "cours de danse",
    "stage de danse"
  ];

  return keywords.some((keyword) =>
    value.includes(keyword)
  );
}

async function fetchFeed(feed) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      10000
    );

  try {
    const response =
      await fetch(feed.url, {
        method: "GET",

        headers: {
          "User-Agent":
            "KizombaAtlasDiscovery/1.0",

          Accept:
            "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"
        },

        signal:
          controller.signal
      });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    return await response.text();

  } finally {
    clearTimeout(timeout);
  }
}

async function sendToIngest(payload) {
  const secret =
    process.env.DISCOVERY_INGEST_SECRET;

  if (!secret) {
    throw new Error(
      "DISCOVERY_INGEST_SECRET manquant dans Vercel."
    );
  }

  const baseUrl =
    process.env.KIZOMBA_ATLAS_BASE_URL ||
    "https://kizomba-atlas.vercel.app";

  const endpoint =
    `${baseUrl.replace(/\/$/, "")}` +
    "/api/discovery-ingest";

  const response =
    await fetch(endpoint, {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

        "x-discovery-secret":
          secret
      },

      body:
        JSON.stringify(payload)
    });

  const text =
    await response.text();

  let result;

  try {
    result =
      JSON.parse(text);
  } catch {
    result = {
      raw:
        text
    };
  }

  if (!response.ok) {
    throw new Error(
      `Ingest ${response.status}: ${
        result.error ||
        result.raw ||
        "Erreur inconnue"
      }`
    );
  }

  return result;
}

function checkCollectorSecret(req) {
  const expected =
    clean(
      process.env.DISCOVERY_COLLECT_SECRET,
      1000
    );

  if (!expected) {
    return {
      ok: false,
      status: 500,
      error:
        "DISCOVERY_COLLECT_SECRET non configuré dans Vercel."
    };
  }

  const header =
    clean(
      req.headers["x-collector-secret"],
      1000
    );

  const auth =
    clean(
      req.headers.authorization,
      2000
    );

  const bearer =
    auth.startsWith("Bearer ")
      ? auth.slice(7).trim()
      : "";

  const bodySecret =
    clean(
      req.body?.collector_secret,
      1000
    );

  const provided = [
    header,
    bearer,
    bodySecret
  ].filter(Boolean);

  const authorized =
    provided.some(
      (value) =>
        value === expected
    );

  if (!authorized) {
    return {
      ok: false,
      status: 401,
      error:
        "Accès refusé"
    };
  }

  return {
    ok: true
  };
}

module.exports =
  async function handler(req, res) {

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    if (req.method === "GET") {
      return json(res, 200, {
        ok: true,
        service:
          "Kizomba Atlas Discovery Collector",
        message:
          "Collector opérationnel"
      });
    }

    if (req.method !== "POST") {
      res.setHeader(
        "Allow",
        "GET, POST"
      );

      return json(res, 405, {
        ok: false,
        error:
          "Méthode non autorisée"
      });
    }

    const auth =
      checkCollectorSecret(req);

    if (!auth.ok) {
      return json(
        res,
        auth.status,
        {
          ok: false,
          error:
            auth.error
        }
      );
    }

    try {
      const feeds =
        getConfiguredFeeds();

      const maxPerFeed =
        Math.max(
          1,
          Math.min(
            Number(
              process.env
                .DISCOVERY_MAX_ITEMS_PER_FEED ||
              10
            ),
            30
          )
        );

      const report = {
        ok: true,
        feeds_configured:
          feeds.length,

        feeds_processed:
          0,

        items_seen:
          0,

        items_relevant:
          0,

        items_sent:
          0,

        errors: []
      };

      for (const feed of feeds) {
        try {
          const xml =
            await fetchFeed(feed);

          const items =
            parseRssItems(xml)
              .slice(
                0,
                maxPerFeed
              );

          report.feeds_processed +=
            1;

          report.items_seen +=
            items.length;

          for (const item of items) {
            const combinedText =
              `${item.title} ${item.description}`;

            if (
              !looksRelevant(
                combinedText
              )
            ) {
              continue;
            }

            report.items_relevant +=
              1;

            const sourceUrl =
              item.link ||
              feed.url;

            const sourcePostId =
              item.guid ||
              hash(
                [
                  feed.url,
                  item.title,
                  item.published_at,
                  sourceUrl
                ].join("|")
              );

            const payload = {
              source_platform:
                feed.platform,

              source_url:
                sourceUrl,

              source_name:
                feed.name,

              source_post_id:
                sourcePostId,

              source_text:
                combinedText,

              source_published_at:
                item.published_at,

              event_name:
                item.title,

              event_type:
                "other",

              styles:
                [],

              country:
                "France",

              description:
                item.description,

              confidence:
                0.25,

              verification_notes:
                "Détection automatique depuis un flux public. Informations à vérifier manuellement avant toute publication."
            };

            try {
              await sendToIngest(
                payload
              );

              report.items_sent +=
                1;

            } catch (error) {
              report.errors.push({
                feed:
                  feed.name,

                item:
                  item.title,

                error:
                  error.message
              });
            }
          }

        } catch (error) {
          report.errors.push({
            feed:
              feed.name,

            error:
              error.message
          });
        }
      }

      return json(
        res,
        200,
        report
      );

    } catch (error) {
      console.error(
        "Kizomba Atlas discovery-collect:",
        error
      );

      return json(res, 500, {
        ok: false,
        error:
          error.message ||
          "Erreur collector"
      });
    }
  };
