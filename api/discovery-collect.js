/* =========================================================
   KIZOMBA ATLAS — DISCOVERY COLLECTOR
   Version 1.3 — EuroKizomba événements individuels
========================================================= */

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function clean(value, maxLength) {
  const max = maxLength || 5000;

  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .trim()
    .slice(0, max);
}

function validUrl(value, baseUrl) {
  const raw = clean(value, 3000);

  if (!raw) {
    return "";
  }

  try {
    const url = baseUrl
      ? new URL(raw, baseUrl)
      : new URL(raw);

    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      return "";
    }

    return url.toString();
  } catch (error) {
    return "";
  }
}

function decodeEntities(value) {
  return clean(value, 50000)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToText(html) {
  return decodeEntities(
    clean(html, 150000)
      .replace(
        /<script[^>]*>[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style[^>]*>[\s\S]*?<\/style>/gi,
        " "
      )
      .replace(
        /<svg[^>]*>[\s\S]*?<\/svg>/gi,
        " "
      )
      .replace(/<[^>]+>/g, " ")
  );
}

/* =========================================================
   AUTH COLLECTOR
========================================================= */

function getCollectorSecret(req) {
  const headerSecret =
    req.headers &&
    req.headers["x-collector-secret"]
      ? String(
          req.headers["x-collector-secret"]
        ).trim()
      : "";

  const authHeader =
    req.headers &&
    req.headers.authorization
      ? String(
          req.headers.authorization
        ).trim()
      : "";

  let bearerSecret = "";

  if (authHeader.indexOf("Bearer ") === 0) {
    bearerSecret =
      authHeader.substring(7).trim();
  }

  const bodySecret =
    req.body &&
    req.body.collector_secret
      ? String(
          req.body.collector_secret
        ).trim()
      : "";

  return (
    headerSecret ||
    bearerSecret ||
    bodySecret
  );
}

function authorize(req) {
  const expected =
    process.env.DISCOVERY_COLLECT_SECRET
      ? String(
          process.env.DISCOVERY_COLLECT_SECRET
        ).trim()
      : "";

  if (!expected) {
    return {
      ok: false,
      status: 500,
      error:
        "DISCOVERY_COLLECT_SECRET non configuré."
    };
  }

  const provided =
    getCollectorSecret(req);

  if (!provided) {
    return {
      ok: false,
      status: 401,
      error:
        "Clé collector absente."
    };
  }

  if (provided !== expected) {
    return {
      ok: false,
      status: 401,
      error:
        "Clé collector incorrecte."
    };
  }

  return {
    ok: true
  };
}

/* =========================================================
   SOURCES
========================================================= */

function getSources() {
  const raw =
    process.env.DISCOVERY_FEEDS_JSON;

  if (!raw) {
    throw new Error(
      "DISCOVERY_FEEDS_JSON non configuré."
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      "DISCOVERY_FEEDS_JSON invalide."
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      "DISCOVERY_FEEDS_JSON doit être un tableau."
    );
  }

  return parsed
    .map(function (source) {
      return {
        name:
          clean(source.name, 200),

        url:
          validUrl(source.url),

        type:
          clean(
            source.type || "html",
            50
          ).toLowerCase(),

        platform:
          clean(
            source.platform || "web",
            50
          ),

        enabled:
          source.enabled !== false
      };
    })
    .filter(function (source) {
      return (
        source.enabled &&
        source.url
      );
    });
}

/* =========================================================
   FETCH
========================================================= */

async function fetchText(url) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(function () {
      controller.abort();
    }, 12000);

  try {
    const response =
      await fetch(url, {
        method: "GET",

        headers: {
          "User-Agent":
            "KizombaAtlasDiscovery/1.3",

          Accept:
            "text/html,application/xhtml+xml,*/*"
        },

        signal:
          controller.signal
      });

    if (!response.ok) {
      throw new Error(
        "HTTP " +
        response.status +
        " sur " +
        url
      );
    }

    return await response.text();

  } finally {
    clearTimeout(timeout);
  }
}

/* =========================================================
   EUROKIZOMBA — LIENS D'ÉVÉNEMENTS
========================================================= */

function extractEuroKizombaLinks(
  html,
  baseUrl
) {
  const links = [];
  const seen = new Set();

  const regex =
    /href\s*=\s*["']([^"']*\/evenement\/[^"'?#]+)["']/gi;

  let match;

  while (
    (match = regex.exec(html)) !== null
  ) {
    const url =
      validUrl(
        match[1],
        baseUrl
      );

    if (
      url &&
      !seen.has(url)
    ) {
      seen.add(url);
      links.push(url);
    }
  }

  return links;
}

/* =========================================================
   META HTML
========================================================= */

function metaContent(
  html,
  attribute,
  name
) {
  const regex1 =
    new RegExp(
      "<meta[^>]+" +
      attribute +
      "=[\"']" +
      name +
      "[\"'][^>]+content=[\"']([^\"']*)[\"'][^>]*>",
      "i"
    );

  const regex2 =
    new RegExp(
      "<meta[^>]+content=[\"']([^\"']*)[\"'][^>]+" +
      attribute +
      "=[\"']" +
      name +
      "[\"'][^>]*>",
      "i"
    );

  const match1 =
    html.match(regex1);

  if (
    match1 &&
    match1[1]
  ) {
    return decodeEntities(
      match1[1]
    );
  }

  const match2 =
    html.match(regex2);

  if (
    match2 &&
    match2[1]
  ) {
    return decodeEntities(
      match2[1]
    );
  }

  return "";
}

function extractTitle(html) {
  const ogTitle =
    metaContent(
      html,
      "property",
      "og:title"
    );

  if (ogTitle) {
    return ogTitle
      .replace(
        /\s*[-–—|]\s*EuroKizomba.*$/i,
        ""
      )
      .trim();
  }

  const h1 =
    html.match(
      /<h1[^>]*>([\s\S]*?)<\/h1>/i
    );

  if (
    h1 &&
    h1[1]
  ) {
    return htmlToText(
      h1[1]
    );
  }

  const title =
    html.match(
      /<title[^>]*>([\s\S]*?)<\/title>/i
    );

  if (
    title &&
    title[1]
  ) {
    return htmlToText(
      title[1]
    )
      .replace(
        /\s*[-–—|]\s*EuroKizomba.*$/i,
        ""
      )
      .trim();
  }

  return "";
}

/* =========================================================
   EXTRACTION À PARTIR DU TEXTE
========================================================= */

function extractAfterLabel(
  text,
  label,
  stopLabels
) {
  const stops =
    stopLabels.join("|");

  const regex =
    new RegExp(
      label +
      "\\s+(.+?)(?=\\s+(?:" +
      stops +
      ")\\s+|$)",
      "i"
    );

  const match =
    text.match(regex);

  return match && match[1]
    ? clean(match[1], 500)
    : "";
}

function detectStyles(text) {
  const value =
    clean(text, 30000)
      .toLowerCase();

  const styles = [];

  if (
    value.includes("kizomba")
  ) {
    styles.push("kizomba");
  }

  if (
    value.includes("urban kiz") ||
    value.includes("urbankiz") ||
    value.includes("urban-kiz")
  ) {
    styles.push("urban-kiz");
  }

  if (
    value.includes("semba")
  ) {
    styles.push("semba");
  }

  if (
    value.includes("tarraxo") ||
    value.includes("tarraxa")
  ) {
    styles.push("tarraxo");
  }

  if (
    value.includes("bachata")
  ) {
    styles.push("bachata");
  }

  if (
    value.includes("salsa")
  ) {
    styles.push("salsa");
  }

  if (
    value.includes("sbk")
  ) {
    styles.push("sbk");
  }

  if (
    value.includes("kompa")
  ) {
    styles.push("kompa");
  }

  return Array.from(
    new Set(styles)
  );
}

function detectEventType(text) {
  const value =
    clean(text, 20000)
      .toLowerCase();

  if (
    value.includes("festival")
  ) {
    return "festival";
  }

  if (
    value.includes("workshop") ||
    value.includes("stage")
  ) {
    return "workshop";
  }

  if (
    value.includes("cours réguliers") ||
    value.includes("cours regulier") ||
    value.includes("cours + soirée") ||
    value.includes("cours + soiree") ||
    value.includes("cours")
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
   EVENT DETAILS
========================================================= */

function parseEuroKizombaEvent(
  html,
  eventUrl
) {
  const text =
    htmlToText(html);

  const title =
    extractTitle(html);

  const description =
    metaContent(
      html,
      "property",
      "og:description"
    );

  const imageUrl =
    validUrl(
      metaContent(
        html,
        "property",
        "og:image"
      ),
      eventUrl
    );

  const stopLabels = [
    "Location",
    "Venue",
    "Organizer",
    "Type",
    "Phone",
    "Email",
    "Tickets",
    "Description",
    "Add to Calendar",
    "View on Facebook"
  ];

  const dateText =
    extractAfterLabel(
      text,
      "Date",
      stopLabels
    );

  const location =
    extractAfterLabel(
      text,
      "Location",
      [
        "Venue",
        "Organizer",
        "Type",
        "Phone",
        "Email",
        "Tickets",
        "Description",
        "Add to Calendar",
        "View on Facebook"
      ]
    );

  const venue =
    extractAfterLabel(
      text,
      "Venue",
      [
        "Organizer",
        "Type",
        "Phone",
        "Email",
        "Tickets",
        "Description",
        "Add to Calendar",
        "View on Facebook"
      ]
    );

  const organizer =
    extractAfterLabel(
      text,
      "Organizer",
      [
        "Type",
        "Phone",
        "Email",
        "Tickets",
        "Description",
        "Add to Calendar",
        "View on Facebook"
      ]
    );

  const locationParts =
    location
      .split(",")
      .map(function (part) {
        return part.trim();
      })
      .filter(Boolean);

  const city =
    locationParts.length
      ? locationParts[0]
      : "";

  const country =
    locationParts.length >= 2
      ? locationParts[
          locationParts.length - 1
        ]
      : "";

  const combinedText =
    [
      title,
      description,
      text.slice(0, 15000)
    ].join(" ");

  return {
    title:
      title ||
      "Événement EuroKizomba",

    description:
      description ||
      "",

    source_url:
      eventUrl,

    source_image_url:
      imageUrl || null,

    organizer_name:
      organizer,

    venue_name:
      venue,

    city,

    country,

    date_text:
      dateText,

    styles:
      detectStyles(
        combinedText
      ),

    event_type:
      detectEventType(
        combinedText
      ),

    source_text:
      combinedText.slice(
        0,
        10000
      )
  };
}

/* =========================================================
   INGEST
========================================================= */

async function sendToIngest(
  payload
) {
  const ingestSecret =
    process.env.DISCOVERY_INGEST_SECRET
      ? String(
          process.env.DISCOVERY_INGEST_SECRET
        ).trim()
      : "";

  if (!ingestSecret) {
    throw new Error(
      "DISCOVERY_INGEST_SECRET non configuré."
    );
  }

  const baseUrl =
    process.env.KIZOMBA_ATLAS_BASE_URL ||
    "https://kizomba-atlas.vercel.app";

  const endpoint =
    String(baseUrl)
      .replace(/\/$/, "") +
    "/api/discovery-ingest";

  const response =
    await fetch(endpoint, {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

        "x-discovery-secret":
          ingestSecret
      },

      body:
        JSON.stringify(
          payload
        )
    });

  const text =
    await response.text();

  let result = {};

  try {
    result =
      JSON.parse(text);
  } catch (error) {
    result = {
      raw:
        text
    };
  }

  if (!response.ok) {
    throw new Error(
      "Ingest HTTP " +
      response.status +
      " : " +
      (
        result.error ||
        result.raw ||
        "erreur inconnue"
      )
    );
  }

  return result;
}

/* =========================================================
   EUROKIZOMBA
========================================================= */

async function processEuroKizomba(
  source,
  report
) {
  const homeHtml =
    await fetchText(
      source.url
    );

  const links =
    extractEuroKizombaLinks(
      homeHtml,
      source.url
    );

  /*
   * On limite volontairement le premier test.
   */

  const maxEvents =
    Math.max(
      1,
      Math.min(
        Number(
          process.env
            .DISCOVERY_MAX_ITEMS_PER_FEED ||
          5
        ),
        10
      )
    );

  const selectedLinks =
    links.slice(
      0,
      maxEvents
    );

  report.event_links_found =
    links.length;

  report.events_selected =
    selectedLinks.length;

  for (
    const eventUrl
    of selectedLinks
  ) {
    try {
      const html =
        await fetchText(
          eventUrl
        );

      const event =
        parseEuroKizombaEvent(
          html,
          eventUrl
        );

      const payload = {
        source_platform:
          source.platform ||
          "eurokizomba",

        source_url:
          event.source_url,

        source_name:
          source.name,

        source_text:
          event.source_text,

        source_image_url:
          event.source_image_url,

        event_name:
          event.title,

        organizer_name:
          event.organizer_name,

        event_type:
          event.event_type,

        styles:
          event.styles,

        starts_at:
          null,

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
            ? "EuroKizomba — date affichée : " +
              event.date_text +
              ". Vérification manuelle obligatoire avant publication."
            : "EuroKizomba — vérifier date, lieu et informations avant publication."
      };

      await sendToIngest(
        payload
      );

      report.items_sent += 1;

    } catch (error) {
      report.errors.push({
        event_url:
          eventUrl,

        error:
          error.message
      });
    }
  }
}

/* =========================================================
   HANDLER
========================================================= */

module.exports =
  async function handler(
    req,
    res
  ) {
    if (req.method === "GET") {
      return sendJson(
        res,
        200,
        {
          ok: true,
          service:
            "Kizomba Atlas Discovery Collector",
          version:
            "1.3",
          message:
            "Collector événements individuels opérationnel"
        }
      );
    }

    if (req.method !== "POST") {
      return sendJson(
        res,
        405,
        {
          ok: false,
          error:
            "Méthode non autorisée"
        }
      );
    }

    const auth =
      authorize(req);

    if (!auth.ok) {
      return sendJson(
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
      const sources =
        getSources();

      const report = {
        ok: true,
        version:
          "1.3",
        sources_configured:
          sources.length,
        sources_processed:
          0,
        event_links_found:
          0,
        events_selected:
          0,
        items_sent:
          0,
        errors:
          []
      };

      for (
        const source
        of sources
      ) {
        try {
          if (
            source.platform ===
              "eurokizomba" ||
            source.name
              .toLowerCase()
              .includes(
                "eurokizomba"
              )
          ) {
            await processEuroKizomba(
              source,
              report
            );

            report.sources_processed +=
              1;
          }

        } catch (error) {
          report.errors.push({
            source:
              source.name,

            error:
              error.message
          });
        }
      }

      return sendJson(
        res,
        200,
        report
      );

    } catch (error) {
      return sendJson(
        res,
        500,
        {
          ok: false,
          version:
            "1.3",
          error:
            error.message
        }
      );
    }
  };
