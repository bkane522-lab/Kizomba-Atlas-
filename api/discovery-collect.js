/* =========================================================
   KIZOMBA ATLAS — DISCOVERY COLLECTOR
   v2.1 — EuroKizomba + DanceFestivalEvents / Mezink
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
   FETCH
========================================================= */

async function fetchText(url) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      12000
    );

  try {
    const response =
      await fetch(url, {
        method: "GET",

        headers: {
          "User-Agent":
            "KizombaAtlasDiscovery/2.1",

          Accept:
            "text/html,application/xhtml+xml,*/*"
        },

        signal:
          controller.signal
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
   META
========================================================= */

function getMeta(html, property) {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`,
      "i"
    ),

    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`,
      "i"
    )
  ];

  for (const regex of patterns) {
    const match = html.match(regex);

    if (
      match &&
      match[1]
    ) {
      return decodeEntities(
        match[1]
      );
    }
  }

  return "";
}

function getTitle(html) {
  let value =
    getMeta(
      html,
      "og:title"
    );

  if (!value) {
    const h1 =
      html.match(
        /<h1[^>]*>([\s\S]*?)<\/h1>/i
      );

    if (
      h1 &&
      h1[1]
    ) {
      value =
        htmlToText(
          h1[1]
        );
    }
  }

  return clean(
    value.replace(
      /\s*[-–—|]\s*EuroKizomba.*$/i,
      ""
    ),
    300
  );
}

/* =========================================================
   EUROKIZOMBA — EVENT LINKS
========================================================= */

function extractEventLinks(
  html,
  baseUrl
) {
  const results = [];
  const seen = new Set();

  const regex =
    /href\s*=\s*["']([^"']*\/(?:en\/)?evenement\/[^"'?#]+)["']/gi;

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
      results.push(url);
    }
  }

  return results;
}

/* =========================================================
   EUROKIZOMBA — EXTRACTION
========================================================= */

function indexOfAny(
  text,
  patterns,
  start = 0
) {
  let best = -1;
  let length = 0;

  for (
    const pattern
    of patterns
  ) {
    pattern.lastIndex = 0;

    const part =
      text.slice(start);

    const match =
      pattern.exec(part);

    if (!match) continue;

    const absolute =
      start +
      match.index;

    if (
      best === -1 ||
      absolute < best
    ) {
      best = absolute;
      length =
        match[0].length;
    }
  }

  return {
    index: best,
    length
  };
}

function extractBlock(
  text,
  startPatterns,
  endPatterns
) {
  const start =
    indexOfAny(
      text,
      startPatterns
    );

  if (
    start.index === -1
  ) {
    return "";
  }

  const contentStart =
    start.index +
    start.length;

  const end =
    indexOfAny(
      text,
      endPatterns,
      contentStart
    );

  const value =
    end.index === -1
      ? text.slice(
          contentStart
        )
      : text.slice(
          contentStart,
          end.index
        );

  return clean(
    value,
    3000
  );
}

function extractInfo(text) {
  const DATE = [
    /📅\s*(?:Date)?\s*:?\s*/i,
    /\bDate\s*:?\s*/i
  ];

  const LOCATION = [
    /📍\s*(?:Location|Lieu)?\s*:?\s*/i,
    /\b(?:Location|Lieu)\s*:?\s*/i
  ];

  const VENUE = [
    /🏠\s*(?:Venue|Salle)?\s*:?\s*/i,
    /\b(?:Venue|Salle)\s*:?\s*/i
  ];

  const ORGANIZER = [
    /👤\s*(?:Organizer|Organisateur)?\s*:?\s*/i,
    /\b(?:Organizer|Organisateur)\s*:?\s*/i
  ];

  const TYPE = [
    /🏷️?\s*(?:Type)?\s*:?\s*/i,
    /\bType\s*:?\s*/i
  ];

  const PHONE = [
    /☎️?\s*(?:Phone|Téléphone|Telephone)?\s*:?\s*/i,
    /\b(?:Phone|Téléphone|Telephone)\s*:?\s*/i
  ];

  const EMAIL = [
    /✉️?\s*(?:Email|E-mail)?\s*:?\s*/i,
    /\b(?:Email|E-mail)\s*:?\s*/i
  ];

  const TRAILING = [
    /View on Facebook/i,
    /Voir sur Facebook/i,
    /Tickets/i,
    /Billetterie/i,
    /Add to Calendar/i,
    /Ajouter au calendrier/i,
    /Inscription à la newsletter/i
  ];

  const dateText =
    extractBlock(
      text,
      DATE,
      [
        ...LOCATION,
        ...VENUE,
        ...ORGANIZER,
        ...TYPE
      ]
    );

  const location =
    extractBlock(
      text,
      LOCATION,
      [
        ...VENUE,
        ...ORGANIZER,
        ...TYPE,
        ...PHONE,
        ...EMAIL,
        ...TRAILING
      ]
    );

  const venue =
    extractBlock(
      text,
      VENUE,
      [
        ...ORGANIZER,
        ...TYPE,
        ...PHONE,
        ...EMAIL,
        ...TRAILING
      ]
    );

  const organizer =
    extractBlock(
      text,
      ORGANIZER,
      [
        ...TYPE,
        ...PHONE,
        ...EMAIL,
        ...TRAILING
      ]
    );

  const type =
    extractBlock(
      text,
      TYPE,
      [
        ...PHONE,
        ...EMAIL,
        ...TRAILING
      ]
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
   LOCATION
========================================================= */

function normalizeCountry(value) {
  const country =
    clean(
      value,
      200
    );

  const map = {
    "the netherlands":
      "Pays-Bas",

    netherlands:
      "Pays-Bas",

    holland:
      "Pays-Bas",

    nederland:
      "Pays-Bas",

    spain:
      "Espagne",

    españa:
      "Espagne",

    france:
      "France",

    poland:
      "Pologne",

    polska:
      "Pologne",

    croatia:
      "Croatie",

    germany:
      "Allemagne",

    deutschland:
      "Allemagne",

    italy:
      "Italie",

    portugal:
      "Portugal",

    sweden:
      "Suède",

    romania:
      "Roumanie",

    ireland:
      "Irlande",

    switzerland:
      "Suisse",

    schweiz:
      "Suisse",

    denmark:
      "Danemark",

    hungary:
      "Hongrie",

    austria:
      "Autriche",

    slovenia:
      "Slovénie",

    serbia:
      "Serbie",

    albania:
      "Albanie",

    turkey:
      "Turquie",

    türkiye:
      "Turquie",

    egypt:
      "Égypte",

    indonesia:
      "Indonésie",

    "united kingdom":
      "Royaume-Uni",

    uk:
      "Royaume-Uni",

    england:
      "Royaume-Uni",

    belgium:
      "Belgique",

    belgique:
      "Belgique",

    czechia:
      "Tchéquie",

    "czech republic":
      "Tchéquie"
  };

  const key =
    country
      .toLowerCase()
      .replace(/\.$/, "");

  return (
    map[key] ||
    country.replace(
      /\.$/,
      ""
    )
  );
}

function parseLocation(value) {
  const parts =
    clean(
      value,
      1500
    )
      .split(",")
      .map(
        (item) =>
          clean(
            item,
            300
          )
      )
      .filter(Boolean);

  if (!parts.length) {
    return {
      city: "",
      region: "",
      country: ""
    };
  }

  if (
    parts.length === 1
  ) {
    return {
      city:
        parts[0],

      region:
        "",

      country:
        ""
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
      parts[0],

    region:
      parts
        .slice(
          1,
          -1
        )
        .join(", "),

    country:
      normalizeCountry(
        parts[
          parts.length - 1
        ]
      )
  };
}

/* =========================================================
   DATES
========================================================= */

const MONTHS = {
  january: 1,
  jan: 1,
  janvier: 1,

  february: 2,
  feb: 2,
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

function monthNumber(value) {
  return (
    MONTHS[
      clean(
        value,
        40
      )
        .toLowerCase()
        .replace(
          /\./g,
          ""
        )
    ] || null
  );
}

function makeIso(
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
    !day
  ) {
    return null;
  }

  let offset = 0;

  if (
    timezone === "CEST"
  ) {
    offset = 2;
  }

  if (
    timezone === "CET"
  ) {
    offset = 1;
  }

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour - offset,
      minute,
      0
    )
  ).toISOString();
}

function to24Hour(
  hour,
  ampm
) {
  let h =
    Number(hour);

  const marker =
    clean(
      ampm,
      10
    ).toUpperCase();

  if (
    marker === "PM" &&
    h < 12
  ) {
    h += 12;
  }

  if (
    marker === "AM" &&
    h === 12
  ) {
    h = 0;
  }

  return h;
}

function parseStartDate(text) {
  const raw =
    clean(
      text,
      2000
    );

  const value =
    raw
      .toLowerCase()
      .replace(
        /,/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      );

  let m;

  m = value.match(
    /(\d{1,2})\s+([a-zà-ÿ]+)\s*(?:-|–|—|to|au)\s*\d{1,2}\s+([a-zà-ÿ]+)\s+(20\d{2})/
  );

  if (m) {
    const month =
      monthNumber(
        m[2]
      );

    if (month) {
      return makeIso(
        m[4],
        month,
        m[1]
      );
    }
  }

  m = value.match(
    /(\d{1,2})(?:st|nd|rd|th)?\s*(?:-|–|—|to|au)\s*\d{1,2}(?:st|nd|rd|th)?\s+([a-zà-ÿ]+)\s+(20\d{2})/
  );

  if (m) {
    const month =
      monthNumber(
        m[2]
      );

    if (month) {
      return makeIso(
        m[3],
        month,
        m[1]
      );
    }
  }

  m = value.match(
    /(\d{1,2})(?:st|nd|rd|th)\s+to\s+\d{1,2}(?:st|nd|rd|th)\s+([a-z]+)\s+(20\d{2})/
  );

  if (m) {
    const month =
      monthNumber(
        m[2]
      );

    if (month) {
      return makeIso(
        m[3],
        month,
        m[1]
      );
    }
  }

  m = value.match(
    /(?:du\s+)?(\d{1,2})\s+au\s+\d{1,2}\s+([a-zà-ÿ]+)\s+(20\d{2})/
  );

  if (m) {
    const month =
      monthNumber(
        m[2]
      );

    if (month) {
      return makeIso(
        m[3],
        month,
        m[1]
      );
    }
  }

  m = value.match(
    /(\d{1,2})[./](\d{1,2})\s*(?:-|–|—)\s*\d{1,2}[./]\d{1,2}\s+(20\d{2})/
  );

  if (m) {
    return makeIso(
      m[3],
      m[2],
      m[1]
    );
  }

  m = value.match(
    /(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\s*(\d{1,2})\s+([a-zà-ÿ]+)\s+(20\d{2})/
  );

  if (m) {
    const month =
      monthNumber(
        m[2]
      );

    if (month) {
      return makeIso(
        m[3],
        month,
        m[1]
      );
    }
  }

  m = raw.match(
    /([A-Za-z]+)\s+(\d{1,2})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i
  );

  if (m) {
    const month =
      monthNumber(
        m[1]
      );

    const yearMatch =
      raw.match(
        /\b(20\d{2})\b/
      );

    const year =
      yearMatch
        ? yearMatch[1]
        : new Date()
            .getFullYear();

    if (month) {
      return makeIso(
        year,
        month,
        m[2],
        to24Hour(
          m[3],
          m[5]
        ),
        m[4],
        /\bCEST\b/.test(raw)
          ? "CEST"
          : /\bCET\b/.test(raw)
          ? "CET"
          : ""
      );
    }
  }

  m = raw.match(
    /(\d{1,2})\s+([A-Za-z]+)\s+at\s+(\d{1,2}):(\d{2})/i
  );

  if (m) {
    const month =
      monthNumber(
        m[2]
      );

    const yearMatch =
      raw.match(
        /\b(20\d{2})\b/
      );

    const year =
      yearMatch
        ? yearMatch[1]
        : new Date()
            .getFullYear();

    if (month) {
      return makeIso(
        year,
        month,
        m[1],
        m[3],
        m[4],
        /\bCEST\b/.test(raw)
          ? "CEST"
          : /\bCET\b/.test(raw)
          ? "CET"
          : ""
      );
    }
  }

  return null;
}

/* =========================================================
   MEZINK — DATES
========================================================= */

function parseMezinkDate(text) {
  const raw =
    clean(
      text,
      2000
    )
      .replace(
        /[–—]/g,
        "-"
      )
      .replace(
        /\s+/g,
        " "
      );

  let m;

  m = raw.match(
    /\b(20\d{2})\.?\s+([A-Za-zÀ-ÿ]+)\.?\s+(\d{1,2})\s*-\s*([A-Za-zÀ-ÿ]+)\.?\s+\d{1,2}\b/i
  );

  if (m) {
    const month =
      monthNumber(
        m[2]
      );

    if (month) {
      return makeIso(
        m[1],
        month,
        m[3]
      );
    }
  }

  m = raw.match(
    /\b(20\d{2})\.?\s+([A-Za-zÀ-ÿ]+)\.?\s+(\d{1,2})(?:\s*-\s*\d{1,2})?\b/i
  );

  if (m) {
    const month =
      monthNumber(
        m[2]
      );

    if (month) {
      return makeIso(
        m[1],
        month,
        m[3]
      );
    }
  }

  return parseStartDate(
    raw
  );
}

function extractMezinkDateText(text) {
  const raw =
    clean(
      text,
      2000
    ).replace(
      /[–—]/g,
      "-"
    );

  const patterns = [
    /\b20\d{2}\.?\s+[A-Za-zÀ-ÿ]+\.?\s+\d{1,2}\s*-\s*[A-Za-zÀ-ÿ]+\.?\s+\d{1,2}\b/i,
    /\b20\d{2}\.?\s+[A-Za-zÀ-ÿ]+\.?\s+\d{1,2}(?:\s*-\s*\d{1,2})?\b/i
  ];

  for (
    const pattern
    of patterns
  ) {
    const match =
      raw.match(pattern);

    if (
      match &&
      match[0]
    ) {
      return clean(
        match[0],
        200
      );
    }
  }

  return "";
}

/* =========================================================
   STYLE / TYPE
========================================================= */

function detectStyles(text) {
  const t =
    clean(
      text,
      30000
    ).toLowerCase();

  const result = [];

  if (
    t.includes("kizomba")
  ) {
    result.push(
      "kizomba"
    );
  }

  if (
    t.includes("urban kiz") ||
    t.includes("urbankiz") ||
    t.includes("urban-kiz")
  ) {
    result.push(
      "urban-kiz"
    );
  }

  if (
    t.includes("semba")
  ) {
    result.push(
      "semba"
    );
  }

  if (
    t.includes("tarraxo") ||
    t.includes("tarraxa") ||
    t.includes("tarraxxo")
  ) {
    result.push(
      "tarraxo"
    );
  }

  if (
    t.includes("bachata")
  ) {
    result.push(
      "bachata"
    );
  }

  if (
    t.includes("salsa")
  ) {
    result.push(
      "salsa"
    );
  }

  if (
    t.includes("sbk")
  ) {
    result.push(
      "sbk"
    );
  }

  if (
    t.includes("kompa")
  ) {
    result.push(
      "kompa"
    );
  }

  return [
    ...new Set(result)
  ];
}

function detectEventType(text) {
  const t =
    clean(
      text,
      20000
    ).toLowerCase();

  if (
    t.includes("festival") ||
    t.includes("congress")
  ) {
    return "festival";
  }

  if (
    t.includes("weekender") ||
    t.includes("weekend")
  ) {
    return "weekend";
  }

  if (
    t.includes("workshop") ||
    t.includes("stage")
  ) {
    return "workshop";
  }

  if (
    t.includes("cours") ||
    t.includes("class")
  ) {
    return "class";
  }

  if (
    t.includes("party") ||
    t.includes("soirée") ||
    t.includes("soiree") ||
    t.includes("social")
  ) {
    return "party";
  }

  return "other";
}

/* =========================================================
   EUROKIZOMBA — PARSE EVENT
========================
/* =========================================================
   MEZINK — BLOCKS / PARSER
========================================================= */

function extractLinksFromHtml(html, baseUrl) {
  const links = [];

  const regex =
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while (
    (match = regex.exec(html)) !== null
  ) {
    const href =
      validUrl(
        match[1],
        baseUrl
      );

    const label =
      htmlToText(
        match[2]
      );

    if (href) {
      links.push({
        href,
        label:
          clean(
            label,
            300
          )
      });
    }
  }

  return links;
}

function stripMezinkActionText(text) {
  let value =
    clean(
      text,
      3000
    );

  const markers = [
    /\bTicket\b/i,
    /\bPromocode\b/i,
    /\bPromo code\b/i,
    /\bEvent\s*-\s*Unofficial\b/i,
    /\bFacebook event\b/i,
    /\bEvent\b/i,
    /\bMain Hotel\b/i,
    /\bHotel\b/i
  ];

  let cut = -1;

  for (
    const marker
    of markers
  ) {
    const match =
      value.match(
        marker
      );

    if (
      match &&
      (
        cut === -1 ||
        match.index < cut
      )
    ) {
      cut =
        match.index;
    }
  }

  if (cut >= 0) {
    value =
      value.slice(
        0,
        cut
      );
  }

  return clean(
    value,
    2000
  );
}

function splitMezinkHeader(header) {
  const parts =
    header
      .split("|")
      .map(
        (part) =>
          clean(
            part,
            500
          )
      )
      .filter(Boolean);

  let eventName = "";
  let dateText = "";
  let locationText = "";

  if (parts.length) {
    eventName =
      parts[0];
  }

  for (
    let i = 0;
    i < parts.length;
    i += 1
  ) {
    const part =
      parts[i];

    if (
      !dateText &&
      /\b20\d{2}\b/.test(
        part
      )
    ) {
      dateText =
        extractMezinkDateText(
          part
        ) ||
        part;

      continue;
    }

    if (
      i > 0 &&
      !locationText &&
      /,/.test(part) &&
      !/\b20\d{2}\b/.test(
        part
      )
    ) {
      locationText =
        part;
    }
  }

  if (!dateText) {
    dateText =
      extractMezinkDateText(
        header
      );
  }

  if (
    eventName &&
    /\b20\d{2}\b/.test(
      eventName
    )
  ) {
    eventName =
      clean(
        eventName.replace(
          /\b20\d{2}\.?\s+[A-Za-zÀ-ÿ]+\.?\s+\d{1,2}(?:\s*-\s*(?:[A-Za-zÀ-ÿ]+\.?\s+)?\d{1,2})?.*$/i,
          ""
        ),
        300
      );
  }

  if (
    !locationText &&
    parts.length >= 2
  ) {
    for (
      let i = 1;
      i < parts.length;
      i += 1
    ) {
      const part =
        parts[i];

      if (
        !/\b20\d{2}\b/.test(
          part
        ) &&
        !/\b(?:ticket|event|hotel|promocode)\b/i.test(
          part
        )
      ) {
        locationText =
          part;

        break;
      }
    }
  }

  return {
    eventName:
      clean(
        eventName,
        300
      ),

    dateText:
      clean(
        dateText,
        300
      ),

    locationText:
      clean(
        locationText,
        500
      )
  };
}

function isMezinkKizRelevant(text) {
  const t =
    clean(
      text,
      5000
    ).toLowerCase();

  if (
    t.includes("bachata") &&
    !/(kiz|kizomba|urban|tarrax|semba|kompa|sbk)/i.test(
      t
    )
  ) {
    return false;
  }

  if (
    /(kizomba|urbankiz|urban kiz|\bkizz\b|\bkiz\b|tarraxo|tarraxxo|semba|kompa)/i.test(
      t
    )
  ) {
    return true;
  }

  if (
    /(contratempo|suave dance festival|connections bali|all stars festival|wishez)/i.test(
      t
    )
  ) {
    return true;
  }

  return false;
}

function extractMezinkEvents(
  html,
  source
) {
  const events = [];
  const seen = new Set();

  const regex =
    /<img\b([^>]*)>([\s\S]*?)(?=<img\b|$)/gi;

  let match;

  while (
    (match = regex.exec(html)) !== null
  ) {
    const imgAttrs =
      match[1] || "";

    const blockHtml =
      match[2] || "";

    const rawText =
      htmlToText(
        blockHtml
      );

    if (
      !/\b20\d{2}\b/.test(
        rawText
      )
    ) {
      continue;
    }

    const header =
      stripMezinkActionText(
        rawText
      );

    if (
      !header ||
      header.length < 6
    ) {
      continue;
    }

    const info =
      splitMezinkHeader(
        header
      );

    if (
      !info.eventName ||
      !info.dateText
    ) {
      continue;
    }

    const relevanceText =
      `${info.eventName} ${header}`;

    if (
      !isMezinkKizRelevant(
        relevanceText
      )
    ) {
      continue;
    }

    const links =
      extractLinksFromHtml(
        blockHtml,
        source.url
      );

    const eventLink =
      links.find(
        (link) =>
          /\b(event|facebook event)\b/i.test(
            link.label
          )
      ) ||
      links.find(
        (link) =>
          /facebook\.com|fb\.me/i.test(
            link.href
          )
      );

    const ticketLink =
      links.find(
        (link) =>
          /\bticket\b/i.test(
            link.label
          )
      );

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

    seen.add(
      signature
    );

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
        header,

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
   INGEST
========================================================= */

async function sendToIngest(
  payload
) {
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
      JSON.parse(
        text
      );
  } catch {
    result = {
      raw:
        text
    };
  }

  if (
    !response.ok
  ) {
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
            "2.1-MEZINK",

          sources_supported:
            [
              "eurokizomba",
              "mezink"
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
      authorize(
        req
      );

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
          "2.1-MEZINK",

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

          version:
            "2.1-MEZINK",

          error:
            error.message
        }
      );
    }
  };
