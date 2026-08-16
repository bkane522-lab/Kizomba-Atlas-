/* =========================================================
   KIZOMBA ATLAS — DISCOVERY COLLECTOR
   Version 1.5
   EuroKizomba : Date / Ville / Pays / Lieu / Organisateur
========================================================= */

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.end(JSON.stringify(data));
}

function clean(value, maxLength = 5000) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function decodeEntities(value) {
  return clean(value, 150000)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToText(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function validUrl(value, baseUrl = "") {
  const raw = clean(value, 3000);

  if (!raw) return "";

  try {
    const url = baseUrl
      ? new URL(raw, baseUrl)
      : new URL(raw);

    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

/* =========================================================
   AUTHENTIFICATION
========================================================= */

function getCollectorSecret(req) {
  const headers = req.headers || {};

  const headerSecret = headers["x-collector-secret"]
    ? String(headers["x-collector-secret"]).trim()
    : "";

  const authorization = headers.authorization
    ? String(headers.authorization).trim()
    : "";

  const bearer = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  const bodySecret =
    req.body && req.body.collector_secret
      ? String(req.body.collector_secret).trim()
      : "";

  return headerSecret || bearer || bodySecret;
}

function authorize(req) {
  const expected = process.env.DISCOVERY_COLLECT_SECRET
    ? String(process.env.DISCOVERY_COLLECT_SECRET).trim()
    : "";

  if (!expected) {
    return {
      ok: false,
      status: 500,
      error: "DISCOVERY_COLLECT_SECRET non configuré."
    };
  }

  const provided = getCollectorSecret(req);

  if (!provided) {
    return {
      ok: false,
      status: 401,
      error: "Clé collector absente."
    };
  }

  if (provided !== expected) {
    return {
      ok: false,
      status: 401,
      error: "Clé collector incorrecte."
    };
  }

  return { ok: true };
}

/* =========================================================
   SOURCES VERCEL
========================================================= */

function getSources() {
  const raw = process.env.DISCOVERY_FEEDS_JSON;

  if (!raw) {
    throw new Error("DISCOVERY_FEEDS_JSON non configuré.");
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("DISCOVERY_FEEDS_JSON invalide.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("DISCOVERY_FEEDS_JSON doit être un tableau.");
  }

  return parsed
    .map((source) => ({
      name: clean(source.name, 200),
      url: validUrl(source.url),
      platform: clean(source.platform || "web", 50),
      type: clean(source.type || "html", 50).toLowerCase(),
      enabled: source.enabled !== false
    }))
    .filter((source) => source.enabled && source.url);
}

/* =========================================================
   HTTP
========================================================= */

async function fetchText(url) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 12000);

  try {
    const response = await fetch(url, {
      method: "GET",

      headers: {
        "User-Agent": "KizombaAtlasDiscovery/1.5",
        Accept: "text/html,application/xhtml+xml,*/*"
      },

      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} sur ${url}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

/* =========================================================
   LIENS ÉVÉNEMENTS EUROKIZOMBA
========================================================= */

function extractEuroKizombaLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();

  const regex =
    /href\s*=\s*["']([^"']*\/(?:en\/)?evenement\/[^"'?#]+)["']/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    const url = validUrl(match[1], baseUrl);

    if (url && !seen.has(url)) {
      seen.add(url);
      links.push(url);
    }
  }

  return links;
}

/* =========================================================
   META HTML
========================================================= */

function getMeta(html, property) {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    ),

    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["'][^>]*>`,
      "i"
    )
  ];

  for (const regex of patterns) {
    const match = html.match(regex);

    if (match && match[1]) {
      return decodeEntities(match[1]);
    }
  }

  return "";
}

function getTitle(html) {
  let title = getMeta(html, "og:title");

  if (!title) {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

    if (h1 && h1[1]) {
      title = htmlToText(h1[1]);
    }
  }

  if (!title) {
    const pageTitle =
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

    if (pageTitle && pageTitle[1]) {
      title = htmlToText(pageTitle[1]);
    }
  }

  return clean(
    title.replace(/\s*[-–—|]\s*EuroKizomba.*$/i, ""),
    300
  );
}

/* =========================================================
   EXTRACTION PAR MARQUEURS EUROKIZOMBA

   📅 Date
   📍 Location
   🏠 Venue
   👤 Organizer
   🏷️ Type
========================================================= */

function betweenMarkers(text, startRegex, endRegex) {
  const start = text.search(startRegex);

  if (start === -1) return "";

  const afterStart = text.slice(start);

  const startMatch = afterStart.match(startRegex);

  if (!startMatch) return "";

  const contentStart = start + startMatch[0].length;

  const rest = text.slice(contentStart);

  const end = rest.search(endRegex);

  const value =
    end === -1
      ? rest
      : rest.slice(0, end);

  return clean(value, 3000);
}

function extractInformation(text) {
  /*
   * On utilise les emojis comme séparateurs réels.
   * C'est ce qui manquait dans la v1.4.
   */

  const dateText = betweenMarkers(
    text,
    /📅\s*Date\s*:?\s*/i,
    /📍\s*Location\s*:?\s*/i
  );

  const location = betweenMarkers(
    text,
    /📍\s*Location\s*:?\s*/i,
    /(?:🏠\s*Venue|👤\s*Organizer|🏷️?\s*Type)\s*:?\s*/i
  );

  const venue = betweenMarkers(
    text,
    /🏠\s*Venue\s*:?\s*/i,
    /(?:👤\s*Organizer|🏷️?\s*Type|📞\s*Phone|✉️?\s*Email)\s*:?\s*/i
  );

  const organizer = betweenMarkers(
    text,
    /👤\s*Organizer\s*:?\s*/i,
    /(?:🏷️?\s*Type|📞\s*Phone|✉️?\s*Email|View on Facebook|Tickets|Add to Calendar)\s*:?\s*/i
  );

  const type = betweenMarkers(
    text,
    /🏷️?\s*Type\s*:?\s*/i,
    /(?:📞\s*Phone|✉️?\s*Email|View on Facebook|Tickets|Add to Calendar)\s*:?\s*/i
  );

  return {
    dateText,
    location,
    venue,
    organizer,
    type
  };
}

/* =========================================================
   VILLE / RÉGION / PAYS
========================================================= */

function parseLocation(location) {
  const parts = clean(location, 1500)
    .split(",")
    .map((part) => clean(part, 300))
    .filter(Boolean);

  if (!parts.length) {
    return {
      city: "",
      region: "",
      country: ""
    };
  }

  if (parts.length === 1) {
    return {
      city: parts[0],
      region: "",
      country: ""
    };
  }

  if (parts.length === 2) {
    return {
      city: parts[0],
      region: "",
      country: parts[1]
    };
  }

  return {
    city: parts[0],
    region: parts.slice(1, -1).join(", "),
    country: parts[parts.length - 1]
  };
}

/* =========================================================
   DATE
========================================================= */

const MONTHS = {
  january: 1,
  jan: 1,
  janvier: 1,

  february: 2,
  feb: 2,
  february: 2,
  février: 2,
  fevrier: 2,

  march: 3,
  mar: 3,
  mars: 3,

  april: 4,
  apr: 4,
  avril: 4,

  may: 5,
  mai: 5,

  june: 6,
  jun: 6,
  juin: 6,

  july: 7,
  jul: 7,
  juillet: 7,

  august: 8,
  aug: 8,
  août: 8,
  aout: 8,

  september: 9,
  sep: 9,
  sept: 9,
  septembre: 9,

  october: 10,
  oct: 10,
  octobre: 10,

  november: 11,
  nov: 11,
  novembre: 11,

  december: 12,
  dec: 12,
  décembre: 12,
  decembre: 12
};

function normalizeMonth(value) {
  return clean(value, 30)
    .toLowerCase()
    .replace(/\./g, "");
}

function buildIsoDate(
  year,
  month,
  day,
  hour = 12,
  minute = 0,
  timezone = ""
) {
  year = Number(year);
  month = Number(month);
  day = Number(day);
  hour = Number(hour);
  minute = Number(minute);

  if (
    !year ||
    !month ||
    !day ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  /*
   * Gestion simple CET / CEST.
   */

  let offsetHours = 0;

  if (timezone === "CEST") {
    offsetHours = 2;
  }

  if (timezone === "CET") {
    offsetHours = 1;
  }

  const utcHour = hour - offsetHours;

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      utcHour,
      minute,
      0
    )
  ).toISOString();
}

function findYear(text, fallbackText) {
  const direct =
    clean(text, 2000).match(/\b(20\d{2})\b/);

  if (direct) {
    return Number(direct[1]);
  }

  const fallback =
    clean(fallbackText, 30000).match(/\b(20\d{2})\b/);

  if (fallback) {
    return Number(fallback[1]);
  }

  /*
   * Le calendrier traité ici est actuellement 2026.
   * On ne l'utilise qu'en dernier recours.
   */

  return new Date().getFullYear();
}

function convert12Hour(hour, ampm) {
  let h = Number(hour);

  const marker =
    clean(ampm, 10).toUpperCase();

  if (marker === "PM" && h < 12) {
    h += 12;
  }

  if (marker === "AM" && h === 12) {
    h = 0;
  }

  return h;
}

function parseStartDate(dateText, fullText) {
  if (!dateText) return null;

  const original =
    clean(dateText, 2000);

  const value =
    original
      .toLowerCase()
      .replace(/,/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const year =
    findYear(original, fullText);

  let match;

  /*
   * 30 juillet - 3 août 2026
   * 17-24 Sept 2026
   * 12th to 16th November 2026
   */

  match = value.match(
    /(\d{1,2})(?:st|nd|rd|th)?\s*(?:-|–|—|to|au)?\s*(?:\d{1,2}(?:st|nd|rd|th)?\s*)?([a-zà-ÿ]+)\s+(20\d{2})/
  );

  if (match) {
    const day =
      Number(match[1]);

    const month =
      MONTHS[
        normalizeMonth(match[2])
      ];

    if (month) {
      return buildIsoDate(
        Number(match[3]),
        month,
        day
      );
    }
  }

  /*
   * Du 06 au 09 Août 2026
   */

  match = value.match(
    /(?:du\s+)?(\d{1,2})\s+au\s+\d{1,2}\s+([a-zà-ÿ]+)\s+(20\d{2})/
  );

  if (match) {
    const month =
      MONTHS[
        normalizeMonth(match[2])
      ];

    if (month) {
      return buildIsoDate(
        Number(match[3]),
        month,
        Number(match[1])
      );
    }
  }

  /*
   * 03.08 - 10.08 2026
   * 03.08 – 10.08 2026
   */

  match = value.match(
    /(\d{1,2})[./](\d{1,2})\s*(?:-|–|—|to|au)\s*\d{1,2}[./]\d{1,2}\s*(20\d{2})/
  );

  if (match) {
    return buildIsoDate(
      Number(match[3]),
      Number(match[2]),
      Number(match[1])
    );
  }

  /*
   * Samedi 8 août 2026
   * 8 août 2026
   */

  match = value.match(
    /(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\s*(\d{1,2})\s+([a-zà-ÿ]+)\s+(20\d{2})/
  );

  if (match) {
    const month =
      MONTHS[
        normalizeMonth(match[2])
      ];

    if (month) {
      return buildIsoDate(
        Number(match[3]),
        month,
        Number(match[1])
      );
    }
  }

  /*
   * 31 Jul at 19:00
   * Jul 31 at 19:00
   */

  match = value.match(
    /(\d{1,2})\s+([a-zà-ÿ]+)\s+at\s+(\d{1,2}):(\d{2})/
  );

  if (match) {
    const month =
      MONTHS[
        normalizeMonth(match[2])
      ];

    const timezone =
      /\bCEST\b/i.test(original)
        ? "CEST"
        : /\bCET\b/i.test(original)
        ? "CET"
        : "";

    if (month) {
      return buildIsoDate(
        year,
        month,
        Number(match[1]),
        Number(match[3]),
        Number(match[4]),
        timezone
      );
    }
  }

  /*
   * Sep 10 at 10:00 PM
   * Aug 6 at 7:00 PM
   */

  match = value.match(
    /([a-zà-ÿ]+)\s+(\d{1,2})\s+at\s+(\d{1,2}):(\d{2})\s*(am|pm)?/
  );

  if (match) {
    const month =
      MONTHS[
        normalizeMonth(match[1])
      ];

    let hour =
      Number(match[3]);

    if (match[5]) {
      hour =
        convert12Hour(
          hour,
          match[5]
        );
    }

    const timezone =
      /\bCEST\b/i.test(original)
        ? "CEST"
        : /\bCET\b/i.test(original)
        ? "CET"
        : "";

    if (month) {
      return buildIsoDate(
        year,
        month,
        Number(match[2]),
        hour,
        Number(match[4]),
        timezone
      );
    }
  }

  return null;
}

/* =========================================================
   STYLES
========================================================= */

function detectStyles(text) {
  const value =
    clean(text, 30000).toLowerCase();

  const styles = [];

  if (value.includes("kizomba")) {
    styles.push("kizomba");
  }

  if (
    value.includes("urban kiz") ||
    value.includes("urbankiz") ||
    value.includes("urban-kiz")
  ) {
    styles.push("urban-kiz");
  }

  if (value.includes("semba")) {
    styles.push("semba");
  }

  if (
    value.includes("tarraxo") ||
    value.includes("tarraxa")
  ) {
    styles.push("tarraxo");
  }

  if (value.includes("bachata")) {
    styles.push("bachata");
  }

  if (value.includes("salsa")) {
    styles.push("salsa");
  }

  if (value.includes("sbk")) {
    styles.push("sbk");
  }

  if (value.includes("kompa")) {
    styles.push("kompa");
  }

  return [...new Set(styles)];
}

function detectEventType(text) {
  const value =
    clean(text, 20000).toLowerCase();

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
   PARSING D'UNE FICHE EUROKIZOMBA
========================================================= */

function parseEuroKizombaEvent(
  html,
  eventUrl
) {
  const text =
    htmlToText(html);

  const title =
    getTitle(html);

  const description =
    getMeta(
      html,
      "og:description"
    );

  const image =
    validUrl(
      getMeta(
        html,
        "og:image"
      ),
      eventUrl
    );

  const info =
    extractInformation(text);

  const location =
    parseLocation(
      info.location
    );

  const combinedText =
    [
      title,
      description,
      info.type,
      text.slice(0, 12000)
    ].join(" ");

  const startsAt =
    parseStartDate(
      info.dateText,
      combinedText
    );

  return {
    title:
      title ||
      "Événement EuroKizomba",

    source_url:
      eventUrl,

    source_image_url:
      image || null,

    description:
      description || "",

    date_text:
      info.dateText,

    starts_at:
      startsAt,

    location:
      info.location,

    city:
      location.city,

    region:
      location.region,

    country:
      location.country,

    venue_name:
      info.venue,

    organizer_name:
      info.organizer,

    event_type:
      info.type
        ? detectEventType(
            info.type +
            " " +
            title
          )
        : detectEventType(
            combinedText
          ),

    styles:
      detectStyles(
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
   ENVOI VERS DISCOVERY-INGEST
========================================================= */

async function sendToIngest(payload) {
  const secret =
    process.env.DISCOVERY_INGEST_SECRET
      ? String(
          process.env.DISCOVERY_INGEST_SECRET
        ).trim()
      : "";

  if (!secret) {
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
          secret
      },

      body:
        JSON.stringify(payload)
    });

  const text =
    await response.text();

  let result = {};

  try {
    result = JSON.parse(text);
  } catch {
    result = {
      raw: text
    };
  }

  if (!response.ok) {
    throw new Error(
      `Ingest HTTP ${response.status}: ${
        result.error ||
        result.raw ||
        "erreur inconnue"
      }`
    );
  }

  return result;
}

/* =========================================================
   TRAITEMENT EUROKIZOMBA
========================================================= */

async function processEuroKizomba(
  source,
  report
) {
  const homepage =
    await fetchText(
      source.url
    );

  const links =
    extractEuroKizombaLinks(
      homepage,
      source.url
    );

  report.event_links_found =
    links.length;

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

  const selected =
    links.slice(
      0,
      maxEvents
    );

  report.events_selected =
    selected.length;

  for (const eventUrl of selected) {
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

      const confidence =
        event.starts_at &&
        event.city &&
        event.country
          ? 0.85
          : event.city
          ? 0.7
          : 0.55;

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
          event.location,

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

        confidence,

        verification_notes:
          "EuroKizomba — date source : " +
          (
            event.date_text ||
            "non extraite"
          ) +
          ". Vérification manuelle obligatoire avant publication."
      };

      await sendToIngest(
        payload
      );

      report.items_sent += 1;

      report.preview.push({
        event_name:
          event.title,

        date_text:
          event.date_text,

        starts_at:
          event.starts_at,

        city:
          event.city,

        region:
          event.region,

        country:
          event.country,

        venue:
          event.venue_name,

        organizer:
          event.organizer_name,

        event_type:
          event.event_type,

        styles:
          event.styles
      });

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
   HANDLER VERCEL
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
            "1.5",

          message:
            "Collector EuroKizomba v1.5 opérationnel"
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
          "1.5",

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

        preview:
          [],

        errors:
          []
      };

      for (const source of sources) {
        try {
          const isEuroKizomba =
            source.platform ===
              "eurokizomba" ||
            source.name
              .toLowerCase()
              .includes(
                "eurokizomba"
              );

          if (isEuroKizomba) {
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
            "1.5",

          error:
            error.message ||
            "Erreur inconnue"
        }
      );
    }
  };
