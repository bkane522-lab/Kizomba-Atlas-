const crypto = require("crypto");

/* =========================================================
   OUTILS DE BASE
========================================================= */

function json(res, status, payload) {
  res.status(status).json(payload);
}

function clean(value, max = 5000) {
  if (value === null || value === undefined) return "";

  return String(value)
    .trim()
    .slice(0, max);
}

function decodeEntities(value) {
  return clean(value, 50000)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/");
}

function stripHtml(value) {
  return decodeEntities(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validUrl(value, base = "") {
  const raw = clean(value, 3000);

  if (!raw) {
    return "";
  }

  try {
    const parsed = base
      ? new URL(raw, base)
      : new URL(raw);

    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:"
    ) {
      return "";
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

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

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match && match[1]) {
      return stripHtml(match[1]);
    }
  }

  return "";
}

/* =========================================================
   DÉTECTION KIZOMBA / URBAN KIZ / SBK
========================================================= */

function detectStyles(text) {
  const value = clean(text, 30000)
    .toLowerCase();

  const styles = [];

  if (/\bkizomba\b/i.test(value)) {
    styles.push("kizomba");
  }

  if (
    /urban[\s-]?kiz/i.test(value) ||
    /\burban kiz\b/i.test(value)
  ) {
    styles.push("urban-kiz");
  }

  if (/\bsemba\b/i.test(value)) {
    styles.push("semba");
  }

  if (
    /\btarrax(?:o|a|inha)?\b/i.test(value)
  ) {
    styles.push("tarraxo");
  }

  if (/\bbachata\b/i.test(value)) {
    styles.push("bachata");
  }

  if (/\bsalsa\b/i.test(value)) {
    styles.push("salsa");
  }

  if (/\bsbk\b/i.test(value)) {
    styles.push("sbk");
  }

  if (/\bkompa\b/i.test(value)) {
    styles.push("kompa");
  }

  return [...new Set(styles)];
}

function looksRelevant(text) {
  const styles = detectStyles(text);

  if (styles.length > 0) {
    return true;
  }

  const value = clean(text, 30000)
    .toLowerCase();

  const extraKeywords = [
    "kiz festival",
    "kiz weekend",
    "kiz social",
    "kiz party"
  ];

  return extraKeywords.some((keyword) =>
    value.includes(keyword)
  );
}

function detectEventType(text) {
  const value = clean(text, 20000)
    .toLowerCase();

  if (value.includes("festival")) {
    return "festival";
  }

  if (
    value.includes("workshop") ||
    value.includes("stage")
  ) {
    return "workshop";
  }

  if (
    value.includes("cours") ||
    value.includes("class")
  ) {
    return "class";
  }

  if (
    value.includes("soirée") ||
    value.includes("soiree") ||
    value.includes("party") ||
    value.includes("social")
  ) {
    return "party";
  }

  return "other";
}

/* =========================================================
   RSS / ATOM
========================================================= */

function parseRssItems(xml) {
  const blocks = [];

  const rssMatches =
    xml.match(
      /<item\b[\s\S]*?<\/item>/gi
    ) || [];

  for (const raw of rssMatches) {
    blocks.push({
      format: "rss",
      raw
    });
  }

  const atomMatches =
    xml.match(
      /<entry\b[\s\S]*?<\/entry>/gi
    ) || [];

  for (const raw of atomMatches) {
    blocks.push({
      format: "atom",
      raw
    });
  }

  return blocks.map(
    ({ format, raw }) => {
      let link = "";

      if (format === "atom") {
        const href = raw.match(
          /<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i
        );

        if (href && href[1]) {
          link = href[1];
        }
      }

      if (!link) {
        link = firstMatch(raw, [
          /<link[^>]*>([\s\S]*?)<\/link>/i,
          /<guid[^>]*>([\s\S]*?)<\/guid>/i
        ]);
      }

      const title =
        firstMatch(raw, [
          /<title[^>]*>([\s\S]*?)<\/title>/i
        ]);

      const description =
        firstMatch(raw, [
          /<description[^>]*>([\s\S]*?)<\/description>/i,
          /<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i,
          /<content[^>]*>([\s\S]*?)<\/content>/i,
          /<summary[^>]*>([\s\S]*?)<\/summary>/i
        ]);

      const published =
        firstMatch(raw, [
          /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i,
          /<published[^>]*>([\s\S]*?)<\/published>/i,
          /<updated[^>]*>([\s\S]*?)<\/updated>/i
        ]);

      const guid =
        firstMatch(raw, [
          /<guid[^>]*>([\s\S]*?)<\/guid>/i,
          /<id[^>]*>([\s\S]*?)<\/id>/i
        ]);

      return {
        title,
        description,
        link: validUrl(link),
        guid,
        published_at:
          normalizeDate(published)
      };
    }
  );
}

/* =========================================================
   EUROKIZOMBA — EXTRACTION HTML
========================================================= */

function extractEuroKizombaLinks(
  html,
  baseUrl
) {
  const found = new Set();

  const regex =
    /href=["']([^"']*\/(?:en\/)?evenement\/[^"'?#]+)["']/gi;

  let match;

  while (
    (match = regex.exec(html)) !== null
  ) {
    const url = validUrl(
      match[1],
      baseUrl
    );

    if (url) {
      found.add(url);
    }
  }

  return [...found];
}

function extractMetaContent(
  html,
  property
) {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    ),

    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["'][^>]*>`,
      "i"
    ),

    new RegExp(
      `<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    )
  ];

  for (const regex of patterns) {
    const match = html.match(regex);

    if (match && match[1]) {
      return decodeEntities(
        match[1]
      );
    }
  }

  return "";
}

function extractEuroKizombaEvent(
  html,
  url
) {
  const pageText =
    stripHtml(html);

  let title =
    extractMetaContent(
      html,
      "og:title"
    );

  if (!title) {
    title = firstMatch(html, [
      /<h1[^>]*>([\s\S]*?)<\/h1>/i,
      /<title[^>]*>([\s\S]*?)<\/title>/i
    ]);
  }

  title = title
    .replace(
      /\s*[—|-]\s*EuroKizomba.*$/i,
      ""
    )
    .trim();

  let description =
    extractMetaContent(
      html,
      "og:description"
    );

  if (!description) {
    description =
      firstMatch(html, [
        /<h2[^>]*>\s*Description\s*<\/h2>([\s\S]*?)(?:<h2|<h3|<\/section>)/i
      ]);
  }

  const location =
    firstMatch(pageText, [
      /Location\s+(.+?)\s+(?:Venue|Organizer|Type|Phone|Email|View on Facebook|Tickets)/i
    ]);

  const venue =
    firstMatch(pageText, [
      /Venue\s+(.+?)\s+(?:Organizer|Type|Phone|Email|View on Facebook|Tickets)/i
    ]);

  const organizer =
    firstMatch(pageText, [
      /Organizer\s+(.+?)\s+(?:Type|Phone|Email|View on Facebook|Tickets)/i
    ]);

  const typeText =
    firstMatch(pageText, [
      /Type\s+(.+?)\s+(?:Phone|Email|View on Facebook|Tickets|Add to Calendar)/i
    ]);

  const dateText =
    firstMatch(pageText, [
      /Date\s+(.+?)\s+(?:Location|Venue|Organizer|Type)/i
    ]);

  const locationParts =
    location
      .split(",")
      .map((part) =>
        part.trim()
      )
      .filter(Boolean);

  const city =
    locationParts[0] || "";

  const country =
    locationParts.length > 1
      ? locationParts[
          locationParts.length - 1
        ]
          .replace(
            /[^\p{L}\s'-]/gu,
            ""
          )
          .trim()
      : "";

  const combined = [
    title,
    description,
    pageText.slice(0, 15000)
  ].join(" ");

  const styles =
    detectStyles(combined);

  let eventType =
    detectEventType(
      `${typeText} ${title} ${description}`
    );

  if (
    typeText &&
    /festival/i.test(typeText)
  ) {
    eventType =
      "festival";
  }

  const imageUrl =
    validUrl(
      extractMetaContent(
        html,
        "og:image"
      ),
      url
    );

  return {
    title,

    description:
      description ||
      pageText.slice(
        0,
        4000
      ),

    source_url:
      url,

    source_image_url:
      imageUrl || null,

    organizer_name:
      organizer,

    venue_name:
      venue,

    city,

    country:
      country || "France",

    date_text:
      dateText,

    starts_at:
      null,

    event_type:
      eventType,

    styles
  };
}

/* =========================================================
   CONFIGURATION DES SOURCES
========================================================= */

function getConfiguredSources() {
  const raw =
    process.env
      .DISCOVERY_FEEDS_JSON;

  if (!raw) {
    throw new Error(
      "DISCOVERY_FEEDS_JSON n'est pas configuré dans Vercel."
    );
  }

  let parsed;

  try {
    parsed =
      JSON.parse(raw);
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
    .map((source) => ({
      name:
        clean(
          source.name,
          200
        ),

      url:
        validUrl(
          source.url
        ),

      platform:
        clean(
          source.platform ||
            "web",
          50
        ),

      type:
        clean(
          source.type ||
            "rss",
          50
        ).toLowerCase(),

      enabled:
        source.enabled !== false
    }))
    .filter(
      (source) =>
        source.enabled &&
        source.url
    );
}

/* =========================================================
   FETCH HTTP
========================================================= */

async function fetchText(url) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      12000
    );

  try {
    const response =
      await fetch(url, {
        method:
          "GET",

        headers: {
          "User-Agent":
            "KizombaAtlasDiscovery/1.1",

          Accept:
            "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml,text/xml,*/*"
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

/* =========================================================
   ENVOI VERS DISCOVERY-INGEST
========================================================= */

async function sendToIngest(
  payload
) {
  const secret =
    process.env
      .DISCOVERY_INGEST_SECRET;

  if (!secret) {
    throw new Error(
      "DISCOVERY_INGEST_SECRET manquant."
    );
  }

  const baseUrl =
    process.env
      .KIZOMBA_ATLAS_BASE_URL ||
    "https://kizomba-atlas.vercel.app";

  const endpoint =
    `${baseUrl.replace(
      /\/$/,
      ""
    )}/api/discovery-ingest`;

  const response =
    await fetch(endpoint, {
      method:
        "POST",

      headers: {
        "Content-Type":
          "application/json",

        "x-discovery-secret":
          secret
      },

      body:
        JSON.stringify(
          payload
        )
    });

  const text =
    await response.text();

  let result;

  try {
    result =
      JSON.parse(text);
  } catch {
    result = {
      raw: text
    };
  }

  if (!response.ok) {
    throw new Error(
      `Ingest ${
        response.status
      }: ${
        result.error ||
        result.raw ||
        "Erreur inconnue"
      }`
    );
  }

  return result;
}

/* =========================================================
   AUTHENTIFICATION COLLECTOR
========================================================= */

function checkCollectorSecret(
  req
) {
  const expected =
    clean(
      process.env
        .DISCOVERY_COLLECT_SECRET,
      2000
    );

  if (!expected) {
    return {
      ok: false,
      status: 500,
      error:
        "DISCOVERY_COLLECT_SECRET non configuré."
    };
  }

  const header =
    clean(
      req.headers[
        "x-collector-secret"
      ],
      2000
    );

  const auth =
    clean(
      req.headers.authorization,
      3000
    );

  const bearer =
    auth.startsWith(
      "Bearer "
    )
      ? auth
          .slice(7)
          .trim()
      : "";

  const bodySecret =
    clean(
      req.body &&
      req.body.collector_secret,
      2000
    );

  const candidates = [
    header,
    bearer,
    bodySecret
  ].filter(Boolean);

  const authorized =
    candidates.some(
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

/* =========================================================
   TRAITEMENT RSS
========================================================= */

async function processRssSource(
  source,
  maxItems,
  report
) {
  const xml =
    await fetchText(
      source.url
    );

  const items =
    parseRssItems(xml)
      .slice(
        0,
        maxItems
      );

  report.items_seen +=
    items.length;

  for (const item of items) {
    const combined =
      `${item.title} ${item.description}`;

    if (
      !looksRelevant(
        combined
      )
    ) {
      continue;
    }

    report.items_relevant +=
      1;

    const styles =
      detectStyles(
        combined
      );

    const payload = {
      source_platform:
        source.platform,

      source_url:
        item.link ||
        source.url,

      source_name:
        source.name,

      source_post_id:
        item.guid ||
        hash(
          `${source.url}|${item.title}|${item.published_at}`
        ),

      source_text:
        combined,

      source_published_at:
        item.published_at,

      event_name:
        item.title,

      organizer_name:
        "",

      event_type:
        detectEventType(
          combined
        ),

      styles,

      starts_at:
        null,

      ends_at:
        null,

      venue_name:
        "",

      address:
        "",

      city:
        "",

      country:
        "",

      ticket_url:
        null,

      price_text:
        "",

      description:
        item.description,

      confidence:
        0.3,

      verification_notes:
        "Détection automatique RSS/Atom. Vérifier toutes les informations et la source officielle avant publication."
    };

    await sendToIngest(
      payload
    );

    report.items_sent +=
      1;
  }
}

/* =========================================================
   TRAITEMENT EUROKIZOMBA
========================================================= */

async function processEuroKizomba(
  source,
  maxItems,
  report
) {
  const indexHtml =
    await fetchText(
      source.url
    );

  const links =
    extractEuroKizombaLinks(
      indexHtml,
      source.url
    )
      .slice(
        0,
        maxItems
      );

  report.items_seen +=
    links.length;

  for (const eventUrl of links) {
    try {
      const eventHtml =
        await fetchText(
          eventUrl
        );

      const event =
        extractEuroKizombaEvent(
          eventHtml,
          eventUrl
        );

      const combined =
        `${event.title} ${event.description}`;

      if (
        !looksRelevant(
          combined
        )
      ) {
        continue;
      }

      report.items_relevant +=
        1;

      const sourceId =
        hash(eventUrl);

      const payload = {
        source_platform:
          source.platform ||
          "eurokizomba",

        source_url:
          event.source_url,

        source_name:
          source.name,

        source_post_id:
          sourceId,

        source_text:
          combined,

        source_image_url:
          event.source_image_url,

        source_published_at:
          null,

        event_name:
          event.title,

        organizer_name:
          event.organizer_name,

        event_type:
          event.event_type,

        styles:
          event.styles,

        starts_at:
          event.starts_at,

        ends_at:
          null,

        venue_name:
          event.venue_name,

        address:
          "",

        city:
          event.city,

        country:
          event.country,

        ticket_url:
          null,

        price_text:
          "",

        description:
          event.description,

        confidence:
          0.55,

        verification_notes:
          event.date_text
            ? `Détection automatique EuroKizomba. Date affichée par la source : ${event.date_text}. Vérifier la date, l'adresse, la billetterie et la source officielle avant publication.`
            : "Détection automatique EuroKizomba. Vérifier la date, l'adresse, la billetterie et la source officielle avant publication."
      };

      await sendToIngest(
        payload
      );

      report.items_sent +=
        1;

    } catch (error) {
      report.errors.push({
        source:
          source.name,

        event_url:
          eventUrl,

        error:
          error.message
      });
    }
  }
}

/* =========================================================
   HANDLER VERCEL
========================================================= */

module.exports =
  async function handler(
    req,
    res
  ) {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
    );

    res.setHeader(
      "Pragma",
      "no-cache"
    );

    /*
     * TEST SIMPLE
     * Ouvrir :
     * /api/discovery-collect
     */

    if (req.method === "GET") {
      return json(
        res,
        200,
        {
          ok: true,

          service:
            "Kizomba Atlas Discovery Collector",

          version:
            "1.1",

          message:
            "Collector RSS + HTML opérationnel"
        }
      );
    }

    /*
     * Le lancement réel de la collecte
     * doit se faire en POST.
     */

    if (req.method !== "POST") {
      res.setHeader(
        "Allow",
        "GET, POST"
      );

      return json(
        res,
        405,
        {
          ok: false,
          error:
            "Méthode non autorisée"
        }
      );
    }

    /*
     * Vérification de la clé du collector
     */

    const auth =
      checkCollectorSecret(
        req
      );

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
      /*
       * Chargement des sources définies
       * dans DISCOVERY_FEEDS_JSON
       */

      const sources =
        getConfiguredSources();

      /*
       * Nombre maximum d'événements
       * traités par source à chaque passage.
       */

      const maxItems =
        Math.max(
          1,
          Math.min(
            Number(
              process.env
                .DISCOVERY_MAX_ITEMS_PER_FEED ||
              10
 
