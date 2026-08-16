/* =========================================================
   KIZOMBA ATLAS — DISCOVERY COLLECTOR
   Version 1.4
   Extraction améliorée EuroKizomba
========================================================= */

function sendJson(res, status, data) {
  res.statusCode = status;

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  res.end(
    JSON.stringify(data)
  );
}

function clean(value, maxLength) {
  const max =
    maxLength || 5000;

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function validUrl(
  value,
  baseUrl
) {
  const raw =
    clean(value, 3000);

  if (!raw) {
    return "";
  }

  try {
    const url =
      baseUrl
        ? new URL(
            raw,
            baseUrl
          )
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
  return clean(
    value,
    100000
  )
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
      .replace(
        /<[^>]+>/g,
        " "
      )
  )
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================================================
   AUTH
========================================================= */

function getCollectorSecret(req) {
  const headers =
    req.headers || {};

  const headerSecret =
    headers[
      "x-collector-secret"
    ]
      ? String(
          headers[
            "x-collector-secret"
          ]
        ).trim()
      : "";

  const authHeader =
    headers.authorization
      ? String(
          headers.authorization
        ).trim()
      : "";

  let bearerSecret = "";

  if (
    authHeader.indexOf(
      "Bearer "
    ) === 0
  ) {
    bearerSecret =
      authHeader
        .substring(7)
        .trim();
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
    process.env
      .DISCOVERY_COLLECT_SECRET
      ? String(
          process.env
            .DISCOVERY_COLLECT_SECRET
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

  if (
    provided !== expected
  ) {
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
    process.env
      .DISCOVERY_FEEDS_JSON;

  if (!raw) {
    throw new Error(
      "DISCOVERY_FEEDS_JSON non configuré."
    );
  }

  let parsed;

  try {
    parsed =
      JSON.parse(raw);
  } catch (error) {
    throw new Error(
      "DISCOVERY_FEEDS_JSON invalide."
    );
  }

  if (
    !Array.isArray(parsed)
  ) {
    throw new Error(
      "DISCOVERY_FEEDS_JSON doit être un tableau."
    );
  }

  return parsed
    .map(function (source) {
      return {
        name:
          clean(
            source.name,
            200
          ),

        url:
          validUrl(
            source.url
          ),

        type:
          clean(
            source.type ||
            "html",
            50
          ).toLowerCase(),

        platform:
          clean(
            source.platform ||
            "web",
            50
          ),

        enabled:
          source.enabled !==
          false
      };
    })
    .filter(
      function (source) {
        return (
          source.enabled &&
          source.url
        );
      }
    );
}

/* =========================================================
   HTTP
========================================================= */

async function fetchText(url) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      function () {
        controller.abort();
      },
      12000
    );

  try {
    const response =
      await fetch(
        url,
        {
          method: "GET",

          headers: {
            "User-Agent":
              "KizombaAtlasDiscovery/1.4",

            Accept:
              "text/html,application/xhtml+xml,*/*"
          },

          signal:
            controller.signal
        }
      );

    if (
      !response.ok
    ) {
      throw new Error(
        "HTTP " +
        response.status +
        " sur " +
        url
      );
    }

    return await response.text();

  } finally {
    clearTimeout(
      timeout
    );
  }
}

/* =========================================================
   LIENS EUROKIZOMBA
========================================================= */

function extractEuroKizombaLinks(
  html,
  baseUrl
) {
  const seen =
    new Set();

  const links =
    [];

  const regex =
    /href\s*=\s*["']([^"']*\/(?:en\/)?evenement\/[^"'?#]+)["']/gi;

  let match;

  while (
    (
      match =
        regex.exec(html)
    ) !== null
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
   META
========================================================= */

function getMeta(
  html,
  key
) {
  const patterns = [
    new RegExp(
      '<meta[^>]+property=["\']' +
      key +
      '["\'][^>]+content=["\']([^"\']*)["\'][^>]*>',
      "i"
    ),

    new RegExp(
      '<meta[^>]+content=["\']([^"\']*)["\'][^>]+property=["\']' +
      key +
      '["\'][^>]*>',
      "i"
    )
  ];

  for (
    const regex
    of patterns
  ) {
    const match =
      html.match(regex);

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
  let title =
    getMeta(
      html,
      "og:title"
    );

  if (!title) {
    const h1 =
      html.match(
        /<h1[^>]*>([\s\S]*?)<\/h1>/i
      );

    if (
      h1 &&
      h1[1]
    ) {
      title =
        htmlToText(
          h1[1]
        );
    }
  }

  if (!title) {
    const tag =
      html.match(
        /<title[^>]*>([\s\S]*?)<\/title>/i
      );

    if (
      tag &&
      tag[1]
    ) {
      title =
        htmlToText(
          tag[1]
        );
    }
  }

  return clean(
    title
      .replace(
        /\s*[-–—|]\s*EuroKizomba.*$/i,
        ""
      ),
    300
  );
}

/* =========================================================
   LABEL EXTRACTION
========================================================= */

function extractField(
  text,
  label,
  nextLabels
) {
  const escapedLabel =
    label.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const escapedStops =
    nextLabels
      .map(function (item) {
        return item.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );
      })
      .join("|");

  const regex =
    new RegExp(
      "(?:📅|📍|🏠|👤|🏷️)?\\s*" +
      escapedLabel +
      "\\s*:?[\\s]+(.+?)(?=\\s+(?:📅|📍|🏠|👤|🏷️)?\\s*(?:" +
      escapedStops +
      ")\\s*:?[\\s]+|$)",
      "i"
    );

  const match =
    text.match(regex);

  if (
    match &&
    match[1]
  ) {
    return clean(
      match[1],
      1000
    );
  }

  return "";
}

/* =========================================================
   DATE PARSER
========================================================= */

const months = {
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
  décembre: 12,
  decembre: 12
};

function isoDate(
  year,
  month,
  day,
  hour,
  minute
) {
  const y =
    Number(year);

  const m =
    Number(month);

  const d =
    Number(day);

  const h =
    Number(
      hour || 12
    );

  const min =
    Number(
      minute || 0
    );

  if (
    !y ||
    !m ||
    !d ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > 31
  ) {
    return null;
  }

  /*
   * Midi UTC limite les décalages de date
   * quand l'heure exacte n'est pas connue.
   */

  const date =
    new Date(
      Date.UTC(
        y,
        m - 1,
        d,
        h,
        min,
        0
      )
    );

  return date.toISOString();
}

function parseStartDate(
  dateText
) {
  if (!dateText) {
    return null;
  }

  const value =
    clean(
      dateText,
      1000
    )
      .toLowerCase()
      .replace(/,/g, " ");

  /*
   * Exemple :
   * 31 Jul at 19:00 – 3 Aug at 19:00 CEST
   */

  let match =
    value.match(
      /(\d{1,2})\s+([a-zà-ÿ]+)\s+(?:at\s+)?(\d{1,2}):(\d{2})/
    );

  if (match) {
    const day =
      Number(match[1]);

    const month =
      months[
        match[2]
      ];

    const hour =
      Number(match[3]);

    const minute =
      Number(match[4]);

    const yearMatch =
      value.match(
        /\b(20\d{2})\b/
      );

    const year =
      yearMatch
        ? Number(
            yearMatch[1]
          )
        : 2026;

    if (month) {
      return isoDate(
        year,
        month,
        day,
        hour,
        minute
      );
    }
  }

  /*
   * Exemple :
   * 17-24 Sept 2026
   */

  match =
    value.match(
      /(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\s+([a-zà-ÿ]+)\s+(20\d{2})/
    );

  if (match) {
    const day =
      Number(match[1]);

    const month =
      months[
        match[2]
      ];

    const year =
      Number(match[3]);

    if (month) {
      return isoDate(
        year,
        month,
        day,
        12,
        0
      );
    }
  }

  /*
   * Exemple :
   * 30 juillet – 3 août 2026
   */

  match =
    value.match(
      /(\d{1,2})\s+([a-zà-ÿ]+)\s*[-–]\s*\d{1,2}\s+[a-zà-ÿ]+\s+(20\d{2})/
    );

  if (match) {
    const day =
      Number(match[1]);

    const month =
      months[
        match[2]
      ];

    const year =
      Number(match[3]);

    if (month) {
      return isoDate(
        year,
        month,
        day,
        12,
        0
      );
    }
  }

  /*
   * Exemple :
   * Du 06 au 09 Août 2026
   */

  match =
    value.match(
      /(?:du\s+)?(\d{1,2})\s+(?:au\s+\d{1,2}\s+)?([a-zà-ÿ]+)\s+(20\d{2})/
    );

  if (match) {
    const day =
      Number(match[1]);

    const month =
      months[
        match[2]
      ];

    const year =
      Number(match[3]);

    if (month) {
      return isoDate(
        year,
        month,
        day,
        12,
        0
      );
    }
  }

  return null;
}

/* =========================================================
   STYLES / TYPE
========================================================= */

function detectStyles(text) {
  const value =
    clean(
      text,
      30000
    ).toLowerCase();

  const styles = [];

  if (
    value.includes(
      "kizomba"
    )
  ) {
    styles.push(
      "kizomba"
    );
  }

  if (
    value.includes(
      "urban kiz"
    ) ||
    value.includes(
      "urbankiz"
    ) ||
    value.includes(
      "urban-kiz"
    )
  ) {
    styles.push(
      "urban-kiz"
    );
  }

  if (
    value.includes(
      "semba"
    )
  ) {
    styles.push(
      "semba"
    );
  }

  if (
    value.includes(
      "tarraxo"
    ) ||
    value.includes(
      "tarraxa"
    )
  ) {
    styles.push(
      "tarraxo"
    );
  }

  if (
    value.includes(
      "bachata"
    )
  ) {
    styles.push(
      "bachata"
    );
  }

  if (
    value.includes(
      "salsa"
    )
  ) {
    styles.push(
      "salsa"
    );
  }

  if (
    value.includes(
      "sbk"
    )
  ) {
    styles.push(
      "sbk"
    );
  }

  if (
    value.includes(
      "kompa"
    )
  ) {
    styles.push(
      "kompa"
    );
  }

  return Array.from(
    new Set(styles)
  );
}

function detectEventType(
  text
) {
  const value =
    clean(
      text,
      20000
    ).toLowerCase();

  if (
    value.includes(
      "festival"
    )
  ) {
    return "festival";
  }

  if (
    value.includes(
      "workshop"
    ) ||
    value.includes(
      "stage"
    )
  ) {
    return "workshop";
  }

  if (
    value.includes(
      "cours"
    ) ||
    value.includes(
      "class"
    )
  ) {
    return "class";
  }

  if (
    value.includes(
      "soirée"
    ) ||
    value.includes(
      "soiree"
    ) ||
    value.includes(
      "party"
    ) ||
    value.includes(
      "social"
    )
  ) {
    return "party";
  }

  return "other";
}

/* =========================================================
   EVENT PARSER
========================================================= */

function parseEvent(
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

  const allLabels = [
    "Date",
    "Location",
    "Venue",
    "Organizer",
    "Type",
    "Phone",
    "Email",
    "View on Facebook",
    "Tickets",
    "Add to Calendar"
  ];

  const dateText =
    extractField(
      text,
      "Date",
      allLabels.filter(
        function (label) {
          return label !==
          "Date";
        }
      )
    );

  const location =
    extractField(
      text,
      "Location",
      allLabels.filter(
        function (label) {
          return label !==
          "Location";
        }
      )
    );

  const venue =
    extractField(
      text,
      "Venue",
      allLabels.filter(
        function (label) {
          return label !==
          "Venue";
        }
      )
    );

  const organizer =
    extractField(
      text,
      "Organizer",
      allLabels.filter(
        function (label) {
          return label !==
          "Organizer";
        }
      )
    );

  const typeText =
    extractField(
      text,
      "Type",
      allLabels.filter(
        function (label) {
          return label !==
          "Type";
        }
      )
    );

  const locationParts =
    location
      .split(",")
      .map(function (item) {
        return clean(
          item,
          300
        );
      })
      .filter(Boolean);

  const city =
    locationParts.length
      ? locationParts[0]
      : "";

  const country =
    locationParts.length
      ? locationParts[
          locationParts.length -
          1
        ]
      : "";

  const combined =
    [
      title,
      description,
      typeText,
      text.slice(
        0,
        12000
      )
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
      image || null,

    organizer_name:
      organizer,

    venue_name:
      venue,

    location:
      location,

    city:
      city,

    country:
      country,

    date_text:
      dateText,

    starts_at:
      parseStartDate(
        dateText
      ),

    event_type:
      typeText
        ? detectEventType(
            typeText +
            " " +
            title
          )
        : detectEventType(
            combined
          ),

    styles:
      detectStyles(
        combined
      ),

    source_text:
      combined.slice(
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
  const secret =
    process.env
      .DISCOVERY_INGEST_SECRET
      ? String(
          process.env
            .DISCOVERY_INGEST_SECRET
        ).trim()
      : "";

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
    String(base)
      .replace(
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

  if (
    !response.ok
  ) {
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

  for (
    const eventUrl
    of selected
  ) {
    try {
      const html =
        await fetchText(
          eventUrl
        );

      const event =
        parseEvent(
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

        confidence:
          event.starts_at &&
          event.city
            ? 0.75
            : 0.55,

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

      report.items_sent +=
        1;

      report.preview.push({
        event_name:
          event.title,

        date_text:
          event.date_text,

        starts_at:
          event.starts_at,

        city:
          event.city,

        country:
          event.country,

        venue:
          event.venue_name,

        organizer:
          event.organizer_name
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
            "1.4",

          message:
            "Collector EuroKizomba amélioré opérationnel"
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

    if (!auth.ok) {
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
          "1.4",

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
          ok:
            false,

          version:
            "1.4",

          error:
            error.message
        }
      );
    }
  };
