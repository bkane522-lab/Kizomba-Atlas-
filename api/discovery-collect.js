/* =========================================================
   KIZOMBA ATLAS — DISCOVERY COLLECTOR
   v2.2 — EuroKizomba + DanceFestivalEvents / Mezink + Kizomba-World
========================================================= */

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function clean(value, max = 5000) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
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
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>/gi, " ")
      .replace(/<\/div>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function validUrl(value, base = "") {
  const raw = clean(value, 3000);
  if (!raw) return "";

  try {
    const url = base ? new URL(raw, base) : new URL(raw);

    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

function getAttr(tag, attr) {
  const escaped = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const regex = new RegExp(
    `${escaped}\\s*=\\s*["']([^"']+)["']`,
    "i"
  );

  const match = String(tag || "").match(regex);

  return match && match[1]
    ? decodeEntities(match[1])
    : "";
}

/* =========================================================
   AUTH
========================================================= */

function getCollectorSecret(req) {
  const headers = req.headers || {};

  const h = headers["x-collector-secret"]
    ? String(headers["x-collector-secret"]).trim()
    : "";

  const auth = headers.authorization
    ? String(headers.authorization).trim()
    : "";

  const bearer = auth.startsWith("Bearer ")
    ? auth.slice(7).trim()
    : "";

  const body =
    req.body && req.body.collector_secret
      ? String(req.body.collector_secret).trim()
      : "";

  return h || bearer || body;
}

function authorize(req) {
  const expected = clean(
    process.env.DISCOVERY_COLLECT_SECRET
  );

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
   SOURCES
========================================================= */

function getSources() {
  const raw = process.env.DISCOVERY_FEEDS_JSON;

  if (!raw) {
    throw new Error(
      "DISCOVERY_FEEDS_JSON non configuré."
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch {
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
    .map((source) => ({
      name: clean(source.name, 200),
      url: validUrl(source.url),
      platform: clean(
        source.platform || "web",
        50
      ).toLowerCase(),
      enabled: source.enabled !== false
    }))
    .filter(
      (source) =>
        source.enabled &&
        source.url
    );
}

/* =========================================================
   FETCH
========================================================= */

async function fetchText(url) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    12000
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "KizombaAtlasDiscovery/2.2",
        Accept:
          "text/html,application/xhtml+xml,*/*"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} sur ${url}`
      );
    }

    return await response.text();

  } finally {
    clearTimeout(timeout);
  }
}

/* =========================================================
   TEXT HELPERS
========================================================= */

function normalizeText(value) {
  return clean(value, 10000)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      (values || [])
        .map((v) => clean(v, 200))
        .filter(Boolean)
    )
  );
}

function normalizeCountry(value) {
  const raw = clean(value, 200);

  if (!raw) return "";

  const t = normalizeText(raw);

  const map = {
    france: "France",
    "france 🇫🇷": "France",
    belgium: "Belgique",
    belgique: "Belgique",
    belgian: "Belgique",
    spain: "Espagne",
    espagne: "Espagne",
    portugal: "Portugal",
    italy: "Italie",
    italie: "Italie",
    germany: "Allemagne",
    allemagne: "Allemagne",
    switzerland: "Suisse",
    suisse: "Suisse",
    netherlands: "Pays-Bas",
    "pays-bas": "Pays-Bas",
    holland: "Pays-Bas",
    luxembourg: "Luxembourg",
    uk: "Royaume-Uni",
    england: "Royaume-Uni",
    "united kingdom": "Royaume-Uni",
    ireland: "Irlande",
    poland: "Pologne",
    pologne: "Pologne",
    croatia: "Croatie",
    croatie: "Croatie",
    albania: "Albanie",
    albanie: "Albanie",
    austria: "Autriche",
    autriche: "Autriche",
    czechia: "Tchéquie",
    "czech republic": "Tchéquie",
    romania: "Roumanie",
    roumanie: "Roumanie",
    hungary: "Hongrie",
    hongrie: "Hongrie",
    greece: "Grèce",
    grece: "Grèce",
    turkey: "Turquie",
    turquie: "Turquie",
    morocco: "Maroc",
    maroc: "Maroc"
  };

  return map[t] || raw;
}

/* =========================================================
   DETECTION
========================================================= */

function detectStyles(text) {
  const value = normalizeText(text);

  const styles = [];

  if (
    /\bkizomba\b/.test(value)
  ) {
    styles.push("Kizomba");
  }

  if (
    /\burban\s*kiz\b|\burbankiz\b/.test(value)
  ) {
    styles.push("Urban Kiz");
  }

  if (
    /\bsemba\b/.test(value)
  ) {
    styles.push("Semba");
  }

  if (
    /\btarrax(?:o|xo|inha)\b/.test(value)
  ) {
    styles.push("Tarraxo");
  }

  if (
    /\bkompa\b|\bcompas\b/.test(value)
  ) {
    styles.push("Kompa");
  }

  if (
    /\bbachata\b/.test(value)
  ) {
    styles.push("Bachata");
  }

  if (
    /\bsalsa\b/.test(value)
  ) {
    styles.push("Salsa");
  }

  if (
    /\bsbk\b/.test(value)
  ) {
    styles.push("SBK");
  }

  return uniqueStrings(styles);
}

function detectEventType(text) {
  const value = normalizeText(text);

  if (
    /\bfestival\b|\bcongress\b|\bcongres\b/.test(value)
  ) {
    return "festival";
  }

  if (
    /\bworkshop\b|\bstage\b|\bmasterclass\b/.test(value)
  ) {
    return "workshop";
  }

  if (
    /\bclass\b|\bcours\b|\blesson\b/.test(value)
  ) {
    return "class";
  }

  if (
    /\bparty\b|\bsoiree\b|\bsocial\b|\bafterwork\b/.test(value)
  ) {
    return "party";
  }

  return "event";
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
  fevrier: 2,
  février: 2,

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
  aout: 8,
  août: 8,

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
  decembre: 12,
  décembre: 12
};

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toIsoDate(
  year,
  month,
  day,
  hour = 20,
  minute = 0
) {
  if (
    !year ||
    !month ||
    !day
  ) {
    return null;
  }

  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute)
    )
  );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date.toISOString();
}

function parseStartDate(value) {
  const raw = clean(value, 500);

  if (!raw) return null;

  const normalized =
    normalizeText(raw);

  let match =
    normalized.match(
      /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/
    );

  if (match) {
    return toIsoDate(
      match[3],
      match[2],
      match[1]
    );
  }

  match =
    normalized.match(
      /\b(\d{1,2})\s+([a-z]+)\s+(20\d{2})\b/
    );

  if (
    match &&
    MONTHS[match[2]]
  ) {
    return toIsoDate(
      match[3],
      MONTHS[match[2]],
      match[1]
    );
  }

  match =
    normalized.match(
      /\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/
    );

  if (
    match &&
    MONTHS[match[1]]
  ) {
    return toIsoDate(
      match[3],
      MONTHS[match[1]],
      match[2]
    );
  }

  return null;
}

/* =========================================================
   LOCATION
========================================================= */

function parseLocation(value) {
  const raw = clean(value, 500);

  if (!raw) {
    return {
      city: "",
      region: "",
      country: ""
    };
  }

  const parts =
    raw
      .split(",")
      .map((item) =>
        clean(item, 200)
      )
      .filter(Boolean);

  if (
    parts.length >= 3
  ) {
    return {
      city:
        parts[0],

      region:
        parts
          .slice(1, -1)
          .join(", "),

      country:
        normalizeCountry(
          parts[
            parts.length - 1
          ]
        )
    };
  }

  if (
    parts.length === 2
  ) {
    return {
      city:
        parts[0],

      region:
        "",

      country:
        normalizeCountry(
          parts[1]
        )
    };
  }

  return {
    city:
      raw,

    region:
      "",

    country:
      ""
  };
}

/* =========================================================
   JSON-LD
========================================================= */

function extractJsonLd(html) {
  const blocks = [];

  const regex =
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;

  while (
    (
      match =
        regex.exec(
          String(
            html || ""
          )
        )
    ) !== null
  ) {
    const raw =
      clean(
        match[1],
        100000
      );

    if (!raw) continue;

    try {
      blocks.push(
        JSON.parse(
          raw
        )
      );
    } catch {
      // ignorer JSON-LD invalide
    }
  }

  return blocks;
}

function flattenJsonLd(value) {
  const results = [];

  function walk(item) {
    if (!item) return;

    if (
      Array.isArray(item)
    ) {
      item.forEach(
        walk
      );

      return;
    }

    if (
      typeof item !==
      "object"
    ) {
      return;
    }

    results.push(item);

    if (
      Array.isArray(
        item["@graph"]
      )
    ) {
      item["@graph"].forEach(
        walk
      );
    }
  }

  walk(value);

  return results;
}

function findEventJsonLd(html) {
  const blocks =
    extractJsonLd(html);

  for (
    const block
    of blocks
  ) {
    const items =
      flattenJsonLd(
        block
      );

    for (
      const item
      of items
    ) {
      const type =
        item &&
        item["@type"];

      const values =
        Array.isArray(type)
          ? type
          : [type];

      if (
        values.some(
          (v) =>
            /event/i.test(
              String(v || "")
            )
        )
      ) {
        return item;
      }
    }
  }

  return null;
}

/* =========================================================
   EUROKIZOMBA LINKS
========================================================= */

function extractEventLinks(
  html,
  baseUrl
) {
  const links = [];
  const seen = new Set();

  const regex =
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;

  let match;

  while (
    (
      match =
        regex.exec(
          html
        )
    ) !== null
  ) {
    const url =
      validUrl(
        match[1],
        baseUrl
      );

    if (!url) continue;

    const lower =
      url.toLowerCase();

    const looksEvent =
      /event|festival|congress|weekend|workshop|kizomba/.test(
        lower
      );

    if (
      !looksEvent
    ) {
      continue;
    }

    if (
      seen.has(
        url
      )
    ) {
      continue;
    }

    seen.add(url);
    links.push(url);
  }

  return links;
}

/* =========================================================
   EUROKIZOMBA PARSER
========================================================= */

function parseEuroKizombaEvent(
  html,
  eventUrl
) {
  const eventJson =
    findEventJsonLd(
      html
    );

  const text =
    htmlToText(html);

  let eventName = "";
  let startsAt = null;
  let venueName = "";
  let address = "";
  let city = "";
  let region = "";
  let country = "";
  let organizerName = "";
  let description = "";
  let sourceImageUrl = "";
  let ticketUrl = "";

  if (
    eventJson
  ) {
    eventName =
      clean(
        eventJson.name,
        300
      );

    startsAt =
      eventJson.startDate
        ? new Date(
            eventJson.startDate
          ).toISOString()
        : null;

    description =
      clean(
        eventJson.description,
        3000
      );

    if (
      typeof eventJson.image ===
      "string"
    ) {
      sourceImageUrl =
        validUrl(
          eventJson.image,
          eventUrl
        );
    } else if (
      Array.isArray(
        eventJson.image
      )
    ) {
      sourceImageUrl =
        validUrl(
          eventJson.image[0],
          eventUrl
        );
    } else if (
      eventJson.image &&
      eventJson.image.url
    ) {
      sourceImageUrl =
        validUrl(
          eventJson.image.url,
          eventUrl
        );
    }

    const location =
      eventJson.location || {};

    venueName =
      clean(
        location.name,
        300
      );

    const addr =
      location.address || {};

    if (
      typeof addr ===
      "string"
    ) {
      address =
        clean(
          addr,
          500
        );
    } else {
      const addressParts =
        [
          addr.streetAddress,
          addr.postalCode,
          addr.addressLocality,
          addr.addressRegion,
          addr.addressCountry
        ]
          .map(
            (v) =>
              clean(v, 200)
          )
          .filter(Boolean);

      address =
        addressParts.join(
          ", "
        );

      city =
        clean(
          addr.addressLocality,
          200
        );

      region =
        clean(
          addr.addressRegion,
          200
        );

      country =
        normalizeCountry(
          addr.addressCountry
        );
    }

    const organizer =
      eventJson.organizer ||
      eventJson.performer ||
      {};

    organizerName =
      clean(
        typeof organizer ===
        "string"
          ? organizer
          : organizer.name,
        300
      );

    if (
      eventJson.url
    ) {
      ticketUrl =
        validUrl(
          eventJson.url,
          eventUrl
        );
    }
  }

  if (
    !eventName
  ) {
    const title =
      String(html)
        .match(
          /<title[^>]*>([\s\S]*?)<\/title>/i
        );

    eventName =
      title
        ? clean(
            htmlToText(
              title[1]
            ),
            300
          )
        : "Événement Kizomba";
  }

  if (
    !startsAt
  ) {
    startsAt =
      parseStartDate(
        text
      );
  }

  if (
    !description
  ) {
    description =
      clean(
        text,
        3000
      );
  }

  if (
    !sourceImageUrl
  ) {
    const imageMatch =
      String(html).match(
        /<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i
      ) ||
      String(html).match(
        /<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["'][^>]*>/i
      );

    if (
      imageMatch &&
      imageMatch[1]
    ) {
      sourceImageUrl =
        validUrl(
          imageMatch[1],
          eventUrl
        );
    }
  }

  if (
    !city ||
    !country
  ) {
    const locationGuess =
      text.match(
        /\b([A-ZÀ-Ÿ][A-Za-zÀ-ÿ' -]{2,50})\s*,\s*(France|Belgique|Belgium|Espagne|Spain|Portugal|Italie|Italy|Germany|Allemagne|Suisse|Switzerland)\b/i
      );

    if (
      locationGuess
    ) {
      city =
        city ||
        clean(
          locationGuess[1],
          200
        );

      country =
        country ||
        normalizeCountry(
          locationGuess[2]
        );
    }
  }

  return {
    event_name:
      eventName,

    source_url:
      eventUrl,

    source_image_url:
      sourceImageUrl || null,

    description:
      description,

    date_text:
      startsAt || "",

    starts_at:
      startsAt,

    city:
      city,

    region:
      region,

    country:
      country,

    address:
      address,

    venue_name:
      venueName,

    organizer_name:
      organizerName,

    event_type:
      detectEventType(
        `${eventName} ${description}`
      ),

    styles:
      detectStyles(
        `${eventName} ${description}`
      ),

    ticket_url:
      ticketUrl || null,

    source_text:
      clean(
        text,
        10000
      )
  };
}

/* =========================================================
   MEZINK HELPERS
========================================================= */

function extractLinksWithLabels(
  html,
  baseUrl
) {
  const items = [];
  const regex =
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

  let match;

  while (
    (
      match =
        regex.exec(
          html
        )
    ) !== null
  ) {
    const attrs =
      match[1] || "";

    const body =
      match[2] || "";

    const href =
      validUrl(
        getAttr(
          `<a ${attrs}>`,
          "href"
        ),
        baseUrl
      );

    const label =
      clean(
        htmlToText(
          body
        ),
        500
      );

    if (
      !href
    ) {
      continue;
    }

    items.push({
      href,
      label,
      raw:
        match[0]
    });
  }

  return items;
}

function parseMezinkDate(
  value
) {
  return parseStartDate(
    value
  );
}

function extractMezinkInfo(
  text
) {
  const raw =
    clean(
      text,
      5000
    );

  const datePatterns = [
    /\b\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+20\d{2}\b/i,
    /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+20\d{2}\b/i,
    /\b\d{1,2}[\/.-]\d{1,2}[\/.-]20\d{2}\b/
  ];

  let dateText = "";

  for (
    const pattern
    of datePatterns
  ) {
    const match =
      raw.match(
        pattern
      );

    if (
      match &&
      match[0]
    ) {
      dateText =
        clean(
          match[0],
          100
        );

      break;
    }
  }

  let eventName =
    raw;

  if (
    dateText
  ) {
    const index =
      raw.indexOf(
        dateText
      );

    if (
      index > 0
    ) {
      eventName =
        clean(
          raw.slice(
            0,
            index
          ),
          500
        );
    }
  }

  eventName =
    eventName
      .replace(
        /^(event|festival|weekend|wk)\s*[:\-–—]?\s*/i,
        ""
      )
      .trim();

  const locationMatch =
    raw.match(
      /\b([A-ZÀ-Ÿ][A-Za-zÀ-ÿ'’ .-]{2,60})\s*,\s*(France|Belgique|Belgium|Espagne|Spain|Portugal|Italie|Italy|Allemagne|Germany|Suisse|Switzerland|Pays-Bas|Netherlands|Luxembourg)\b/i
    );

  const locationText =
    locationMatch
      ? `${locationMatch[1]}, ${locationMatch[2]}`
      : "";

  return {
    eventName:
      clean(
        eventName,
        300
      ),

    dateText:
      dateText,

    locationText:
      clean(
        locationText,
        500
      )
  };
}

/* =========================================================
   MEZINK PARSER
========================================================= */

function extractMezinkEvents(
  html,
  source
) {
  const events = [];
  const seen = new Set();

  const links =
    extractLinksWithLabels(
      html,
      source.url
    );

  const cardRegex =
    /<(?:article|section|div)\b([^>]*)>([\s\S]{0,12000}?)<\/(?:article|section|div)>/gi;

  let match;

  while (
    (
      match =
        cardRegex.exec(
          html
        )
    ) !== null
  ) {
    const attrs =
      match[1] || "";

    const body =
      match[2] || "";

    const rawText =
      clean(
        htmlToText(
          body
        ),
        10000
      );

    if (
      rawText.length < 20
    ) {
      continue;
    }

    const relevanceText =
      `${attrs} ${rawText}`;

    if (
      !/(kizomba|urban\s*kiz|urbankiz|tarraxo|semba|bachata|salsa|sbk|festival)/i.test(
        relevanceText
      )
    ) {
      continue;
    }

    const info =
      extractMezinkInfo(
        rawText
      );

    if (
      !info.eventName ||
      info.eventName.length < 3
    ) {
      continue;
    }

    const cardLinks =
      extractLinksWithLabels(
        body,
        source.url
      );

    const eventLink =
      cardLinks.find(
        (item) =>
          /event|festival|ticket|billet|facebook|instagram/i.test(
            `${item.href} ${item.label}`
          )
      );

    const ticketLink =
      cardLinks.find(
        (item) =>
          /ticket|billet|shotgun|eventbrite|weezevent/i.test(
            `${item.href} ${item.label}`
          )
      );

    const imgMatch =
      body.match(
        /<img\b([^>]*)>/i
      );

    const imgAttrs =
      imgMatch
        ? imgMatch[1]
        : "";

    const image =
      validUrl(
        getAttr(
          `<img ${imgAttrs}>`,
          "src"
        ),
        source.url
      );

    const location =
      parseLocation(
        info.locationText
      );

    const startsAt =
      parseMezinkDate(
        info.dateText
      );

    const sourceUrl =
      (
        eventLink &&
        eventLink.href
      ) ||
      `${source.url}#${encodeURIComponent(
        clean(
          `${info.eventName}-${info.dateText}`
            .toLowerCase()
            .replace(
              /[^a-z0-9à-ÿ]+/gi,
              "-"
            )
            .replace(
              /^-+|-+$/g,
              ""
            ),
          180
        )
      )}`;

    const signature =
      clean(
        `${info.eventName}|${info.dateText}|${info.locationText}`.toLowerCase(),
        1000
      );

    if (
      seen.has(
        signature
      )
    ) {
      continue;
    }

    seen.add(signature);

    const styles =
      detectStyles(
        relevanceText
      );

    events.push({
      event_name:
        info.eventName,

      source_url:
        sourceUrl,

      source_image_url:
        image || null,

      description:
        rawText,

      date_text:
        info.dateText,

      starts_at:
        startsAt,

      city:
        location.city,

      region:
        location.region,

      country:
        location.country,

      address:
        info.locationText,

      venue_name:
        "",

      organizer_name:
        "",

      event_type:
        detectEventType(
          info.eventName
        ),

      styles,

      ticket_url:
        ticketLink
          ? ticketLink.href
          : null,

      source_text:
        clean(
          rawText,
          10000
        )
    });
  }

  return events;
}

/* =========================================================
   KIZOMBA WORLD — LINKS / PARSER
========================================================= */

function extractKizombaWorldEventLinks(html, baseUrl) {
  const results = [];
  const seen = new Set();

  const regex =
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    const href = validUrl(match[1], baseUrl);
    const label = clean(htmlToText(match[2]), 300);

    if (!href || !label) continue;

    let pathname = "";

    try {
      pathname = new URL(href).pathname.toLowerCase();
    } catch {
      continue;
    }

    const isEvent =
      /^\/(?:fr\/)?(?:event|evenement)\//i.test(pathname) ||
      /\/(?:event|evenement)\/[^/]+\/?$/i.test(pathname);

    if (!isEvent) continue;
    if (seen.has(href)) continue;

    seen.add(href);

    results.push({
      href,
      label
    });
  }

  return results;
}

function parseKizombaWorldLocation(value) {
  const parts = clean(value, 500)
    .split(",")
    .map((item) => clean(item, 200))
    .filter(Boolean);

  if (!parts.length) {
    return {
      city: "",
      region: "",
      country: ""
    };
  }

  if (parts.length === 2) {
    return {
      city: parts[1],
      region: "",
      country: normalizeCountry(parts[0])
    };
  }

  if (parts.length >= 3) {
    return {
      city: parts[parts.length - 1],
      region: parts.slice(1, -1).join(", "),
      country: normalizeCountry(parts[0])
    };
  }

  return {
    city: parts[0],
    region: "",
    country: ""
  };
}

function extractKizombaWorldDate(text) {
  const value = clean(text, 3000);

  const months =
    "january|jan|janvier|february|feb|février|fevrier|march|mar|mars|april|apr|avril|may|mai|june|jun|juin|july|jul|juillet|august|aug|août|aout|september|sep|sept|septembre|october|oct|octobre|november|nov|novembre|december|dec|décembre|decembre";

  const patterns = [
    new RegExp(
      `\\b\\d{1,2}\\s+(?:${months})\\s+20\\d{2}\\b`,
      "i"
    ),
    new RegExp(
      `\\b(?:${months})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,)?\\s+20\\d{2}\\b`,
      "i"
    ),
    /\b\d{1,2}[\/.-]\d{1,2}[\/.-]20\d{2}\b/i
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);

    if (match && match[0]) {
      return clean(match[0], 100);
    }
  }

  return "";
}

function findKizombaWorldLocationNearDate(text, dateText) {
  const value = clean(text, 5000);

  if (!value || !dateText) return "";

  const dateIndex =
    value.toLowerCase().indexOf(dateText.toLowerCase());

  const before =
    dateIndex >= 0
      ? value.slice(
          Math.max(0, dateIndex - 260),
          dateIndex
        )
      : value;

  const candidates =
    before.match(
      /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’ .-]{1,60}\s*,\s*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’ .-]{1,60}/g
    ) || [];

  if (!candidates.length) return "";

  return clean(
    candidates[candidates.length - 1],
    300
  )
    .replace(
      /^(?:Festivals?\s*\/\s*(?:WK|Week-?end)\s*)/i,
      ""
    )
    .trim();
}

function extractKizombaWorldStyles(text) {
  const styles = detectStyles(text);
  const t = clean(text, 5000).toLowerCase();

  if (
    /\burban\s*kiz\b|\burbankiz\b/i.test(t) &&
    !styles.some((s) => /urban/i.test(s))
  ) {
    styles.push("Urban Kiz");
  }

  if (
    /\btarrax(?:o|xo|xinha)\b/i.test(t) &&
    !styles.some((s) => /tarrax/i.test(s))
  ) {
    styles.push("Tarraxo");
  }

  return styles;
}

function extractKizombaWorldEvents(html, source) {
  const events = [];
  const seen = new Set();

  const links =
    extractKizombaWorldEventLinks(
      html,
      source.url
    );

  for (const link of links) {
    let index = html.indexOf(link.href);

    let relativeNeedle = "";

    try {
      relativeNeedle =
        new URL(link.href).pathname;
    } catch {}

    if (
      index < 0 &&
      relativeNeedle
    ) {
      index =
        html.indexOf(relativeNeedle);
    }

    if (index < 0) {
      index = 0;
    }

    const start =
      Math.max(0, index - 5000);

    const end =
      Math.min(
        html.length,
        index + 5000
      );

    const chunkHtml =
      html.slice(start, end);

    const chunkText =
      clean(
        htmlToText(chunkHtml),
        10000
      );

    const dateText =
      extractKizombaWorldDate(
        chunkText
      );

    if (!dateText) continue;

    const locationText =
      findKizombaWorldLocationNearDate(
        chunkText,
        dateText
      );

    const location =
      parseKizombaWorldLocation(
        locationText
      );

    const relevanceText =
      `${link.label} ${chunkText}`;

    if (
      !/(kizomba|kiz\b|urban\s*kiz|urbankiz|tarraxo|tarraxxo|semba|kompa|sbk)/i.test(
        relevanceText
      )
    ) {
      continue;
    }

    const startsAt =
      parseStartDate(dateText);

    const styles =
      extractKizombaWorldStyles(
        relevanceText
      );

    const imgMatch =
      chunkHtml.match(
        /<img\b[^>]*(?:src|data-src)\s*=\s*["']([^"']+)["'][^>]*>/i
      );

    const image =
      imgMatch
        ? validUrl(
            imgMatch[1],
            source.url
          )
        : "";

    const signature =
      clean(
        `${link.label}|${dateText}|${locationText}`.toLowerCase(),
        1000
      );

    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);

    events.push({
      event_name:
        clean(link.label, 300),

      source_url:
        link.href,

      source_image_url:
        image || null,

      description:
        clean(chunkText, 3000),

      date_text:
        dateText,

      starts_at:
        startsAt,

      city:
        location.city,

      region:
        location.region,

      country:
        location.country,

      address:
        locationText,

      venue_name:
        "",

      organizer_name:
        "",

      event_type:
        detectEventType(
          link.label
        ),

      styles,

      ticket_url:
        null,

      source_text:
        clean(
          chunkText,
          10000
        )
    });
  }

  return events;
}

/* =========================================================
   INGEST
========================================================= */

async function sendToIngest(payload) {
  const secret =
    clean(
      process.env
        .DISCOVERY_INGEST_SECRET
    );

  if (!secret) {
    throw new Error(
      "DISCOVERY_INGEST_SECRET non configuré."
    );
  }

  const base =
    process.env
      .KIZOMBA_ATLAS_BASE_URL ||
    "https://kizomba-atlas.vercel.app";

  const endpoint =
    base.replace(
      /\/$/,
      ""
    ) +
    "/api/discovery-ingest";

  const response =
    await fetch(
      endpoint,
      {
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
      }
    );

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
        "erreur inconnue"
      }`
    );
  }

  return result;
}

/* =========================================================
   PAYLOAD COMMUN
========================================================= */

function buildPayload(
  source,
  event,
  verificationNotes
) {
  const complete =
    Boolean(
      event.starts_at
    ) &&
    Boolean(
      event.city
    ) &&
    Boolean(
      event.country
    );

  return {
    source_platform:
      source.platform,

    source_url:
      event.source_url,

    source_name:
      source.name,

    source_text:
      event.source_text,

    source_image_url:
      event.source_image_url,

    event_name:
      event.event_name,

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
      event.address,

    city:
      event.city,

    country:
      event.country,

    ticket_url:
      event.ticket_url,

    price_text:
      "",

    description:
      event.description,

    confidence:
      complete
        ? 0.9
        : 0.65,

    verification_notes:
      verificationNotes
  };
}

function addPreview(
  report,
  source,
  event
) {
  report.preview.push({
    source:
      source.platform,

    event_name:
      event.event_name,

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
      event.styles,

    ticket_url:
      event.ticket_url
  });
}

/* =========================================================
   PROCESS EUROKIZOMBA
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
    extractEventLinks(
      homepage,
      source.url
    );

  report.event_links_found +=
    links.length;

  const maxItems =
    Math.max(
      1,
      Math.min(
        Number(
          process.env
            .DISCOVERY_MAX_ITEMS_PER_FEED ||
          5
        ),
        20
      )
    );

  const selected =
    links.slice(
      0,
      maxItems
    );

  report.events_selected +=
    selected.length;

  const sourceReport = {
    source:
      source.name,

    platform:
      source.platform,

    found:
      links.length,

    selected:
      selected.length,

    sent:
      0,

    errors:
      0
  };

  await Promise.all(
    selected.map(
      async (
        eventUrl
      ) => {
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

          const payload =
            buildPayload(
              source,
              event,
              "EuroKizomba — contrôle manuel obligatoire avant publication."
            );

          await sendToIngest(
            payload
          );

          report.items_sent +=
            1;

          sourceReport.sent +=
            1;

          addPreview(
            report,
            source,
            event
          );

        } catch (
          error
        ) {
          sourceReport.errors +=
            1;

          report.errors.push({
            source:
              source.platform,

            event_url:
              eventUrl,

            error:
              error.message
          });
        }
      }
    )
  );

  report.source_reports.push(
    sourceReport
  );
}

/* =========================================================
   PROCESS MEZINK
========================================================= */

async function processMezink(
  source,
  report
) {
  const html =
    await fetchText(
      source.url
    );

  const events =
    extractMezinkEvents(
      html,
      source
    );

  report.event_links_found +=
    events.length;

  const maxItems =
    Math.max(
      1,
      Math.min(
        Number(
          process.env
            .DISCOVERY_MAX_ITEMS_PER_FEED ||
          5
        ),
        20
      )
    );

  const selected =
    events.slice(
      0,
      maxItems
    );

  report.events_selected +=
    selected.length;

  const sourceReport = {
    source:
      source.name,

    platform:
      source.platform,

    found:
      events.length,

    selected:
      selected.length,

    sent:
      0,

    errors:
      0
  };

  await Promise.all(
    selected.map(
      async (
        event
      ) => {
        try {
          const payload =
            buildPayload(
              source,
              event,
              "DanceFestivalEvents / Mezink — contrôle manuel obligatoire avant publication."
            );

          await sendToIngest(
            payload
          );

          report.items_sent +=
            1;

          sourceReport.sent +=
            1;

          addPreview(
            report,
            source,
            event
          );

        } catch (
          error
        ) {
          sourceReport.errors +=
            1;

          report.errors.push({
            source:
              source.platform,

            event_url:
              event.source_url,

            event_name:
              event.event_name,

            error:
              error.message
          });
        }
      }
    )
  );

  report.source_reports.push(
    sourceReport
  );
}

/* =========================================================
   PROCESS KIZOMBA WORLD
========================================================= */

async function processKizombaWorld(
  source,
  report
) {
  const html =
    await fetchText(
      source.url
    );

  const events =
    extractKizombaWorldEvents(
      html,
      source
    );

  report.event_links_found +=
    events.length;

  const maxItems =
    Math.max(
      1,
      Math.min(
        Number(
          process.env
            .DISCOVERY_MAX_ITEMS_PER_FEED ||
          5
        ),
        20
      )
    );

  const selected =
    events.slice(
      0,
      maxItems
    );

  report.events_selected +=
    selected.length;

  const sourceReport = {
    source:
      source.name,

    platform:
      source.platform,

    found:
      events.length,

    selected:
      selected.length,

    sent:
      0,

    errors:
      0
  };

  await Promise.all(
    selected.map(
      async (event) => {
        try {
          const payload =
            buildPayload(
              source,
              event,
              "Kizomba-World — source découverte automatique; vérifier les détails avant publication si données incomplètes."
            );

          await sendToIngest(
            payload
          );

          report.items_sent += 1;
          sourceReport.sent += 1;

          addPreview(
            report,
            source,
            event
          );

        } catch (error) {
          sourceReport.errors += 1;

          report.errors.push({
            source:
              source.platform,

            event_url:
              event.source_url,

            event_name:
              event.event_name,

            error:
              error.message
          });
        }
      }
    )
  );

  report.source_reports.push(
    sourceReport
  );
}

/* =========================================================
   HANDLER
========================================================= */

module.exports =
  async function handler(
    req,
    res
  ) {
    if (
      req.method === "GET"
    ) {
      return sendJson(
        res,
        200,
        {
          ok:
            true,

          service:
            "Kizomba Atlas Discovery Collector",

          version:
            "2.2-KIZOMBA-WORLD",

          sources_supported:
            [
              "eurokizomba",
              "mezink",
              "kizomba-world"
            ],

          message:
            "Collector opérationnel"
        }
      );
    }

    if (
      req.method !== "POST"
    ) {
      return sendJson(
        res,
        405,
        {
          ok:
            false,

          error:
            "Méthode non autorisée"
        }
      );
    }

    const auth =
      authorize(req);

    if (
      !auth.ok
    ) {
      return sendJson(
        res,
        auth.status,
        {
          ok:
            false,

          error:
            auth.error
        }
      );
    }

    try {
      const sources =
        getSources();

      const report = {
        ok:
          true,

        version:
          "2.2-KIZOMBA-WORLD",

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

        source_reports:
          [],

        preview:
          [],

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

            continue;
          }

          if (
            source.platform ===
              "mezink" ||
            source.name
              .toLowerCase()
              .includes(
                "dancefestivalevents"
              ) ||
            source.url
              .toLowerCase()
              .includes(
                "mez.ink/dancefestivalevents"
              )
          ) {
            await processMezink(
              source,
              report
            );

            report.sources_processed +=
              1;

            continue;
          }

          if (
            source.platform ===
              "kizomba-world" ||
            source.name
              .toLowerCase()
              .includes(
                "kizomba world"
              ) ||
            source.url
              .toLowerCase()
              .includes(
                "kizomba-world.com"
              )
          ) {
            await processKizombaWorld(
              source,
              report
            );

            report.sources_processed +=
              1;

            continue;
          }

          report.errors.push({
            source:
              source.platform,

            source_url:
              source.url,

            error:
              "Source configurée mais parser non pris en charge."
          });

        } catch (
          error
        ) {
          report.errors.push({
            source:
              source.platform,

            source_url:
              source.url,

            error:
              error.message
          });
        }
      }

      report.ok =
        report.errors.length ===
        0;

      return sendJson(
        res,
        200,
        report
      );

    } catch (
      error
    ) {
      return sendJson(
        res,
        500,
        {
          ok:
            false,

          error:
            error.message
        }
      );
    }
  };
