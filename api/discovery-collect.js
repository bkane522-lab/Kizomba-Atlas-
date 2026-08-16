/* =========================================================
   KIZOMBA ATLAS — DISCOVERY COLLECTOR
   Version stable 1.2
   ========================================================= */

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
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

function validUrl(value) {
  const raw = clean(value, 3000);

  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);

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

/* =========================================================
   AUTHENTIFICATION
========================================================= */

function getCollectorSecret(req) {
  const headerSecret =
    req.headers &&
    req.headers["x-collector-secret"]
      ? String(req.headers["x-collector-secret"]).trim()
      : "";

  const authHeader =
    req.headers &&
    req.headers.authorization
      ? String(req.headers.authorization).trim()
      : "";

  let bearerSecret = "";

  if (authHeader.indexOf("Bearer ") === 0) {
    bearerSecret =
      authHeader.substring(7).trim();
  }

  const bodySecret =
    req.body &&
    req.body.collector_secret
      ? String(req.body.collector_secret).trim()
      : "";

  return (
    headerSecret ||
    bearerSecret ||
    bodySecret
  );
}

function isAuthorized(req) {
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
        "DISCOVERY_COLLECT_SECRET non configuré dans Vercel."
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
   CONFIGURATION DES SOURCES
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
      "DISCOVERY_FEEDS_JSON contient un JSON invalide."
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      "DISCOVERY_FEEDS_JSON doit être un tableau JSON."
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
   TÉLÉCHARGEMENT D'UNE SOURCE
========================================================= */

async function fetchSource(url) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(function () {
      controller.abort();
    }, 10000);

  try {
    const response =
      await fetch(url, {
        method: "GET",

        headers: {
          "User-Agent":
            "KizombaAtlasDiscovery/1.2",

          Accept:
            "text/html,application/xhtml+xml,application/xml,text/xml,*/*"
        },

        signal:
          controller.signal
      });

    if (!response.ok) {
      throw new Error(
        "Source HTTP " +
        response.status
      );
    }

    return await response.text();

  } finally {
    clearTimeout(timeout);
  }
}

/* =========================================================
   TEXTE / FILTRE DANSE
========================================================= */

function htmlToText(html) {
  return clean(html, 100000)
    .replace(
      /<script[^>]*>[\s\S]*?<\/script>/gi,
      " "
    )
    .replace(
      /<style[^>]*>[\s\S]*?<\/style>/gi,
      " "
    )
    .replace(
      /<[^>]+>/g,
      " "
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function isRelevant(text) {
  const value =
    clean(text, 50000)
      .toLowerCase();

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
    "kompa"
  ];

  return keywords.some(
    function (keyword) {
      return (
        value.indexOf(keyword) !== -1
      );
    }
  );
}

/* =========================================================
   ENVOI VERS DISCOVERY-INGEST
========================================================= */

async function sendToIngest(data) {
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
        JSON.stringify(data)
    });

  const text =
    await response.text();

  let result = {};

  try {
    result =
      JSON.parse(text);
  } catch (error) {
    result = {
      raw: text
    };
  }

  if (!response.ok) {
    throw new Error(
      "Discovery ingest HTTP " +
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
   TRAITEMENT D'UNE SOURCE HTML
========================================================= */

async function processSource(
  source,
  report
) {
  const html =
    await fetchSource(
      source.url
    );

  const text =
    htmlToText(html);

  report.sources_read += 1;

  /*
   * Pour cette première version stable,
   * on vérifie uniquement que la page
   * contient du contenu pertinent.
   *
   * On ne crée PAS encore plusieurs
   * événements depuis une même page.
   */

  if (!isRelevant(text)) {
    report.sources_irrelevant += 1;
    return;
  }

  report.sources_relevant += 1;

  /*
   * On envoie une fiche "source à examiner".
   * Elle reste status = new.
   * Rien n'est publié automatiquement.
   */

  const payload = {
    source_platform:
      source.platform,

    source_url:
      source.url,

    source_name:
      source.name,

    source_text:
      text.slice(0, 10000),

    event_name:
      "Source détectée — " +
      (
        source.name ||
        "Kizomba"
      ),

    organizer_name:
      "",

    event_type:
      "other",

    styles:
      [],

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
      "Source publique détectée automatiquement par Kizomba Atlas.",

    confidence:
      0.2,

    verification_notes:
      "SOURCE AUTOMATIQUE — à vérifier manuellement. Aucun événement n'a été publié automatiquement."
  };

  await sendToIngest(
    payload
  );

  report.items_sent += 1;
}

/* =========================================================
   HANDLER VERCEL
========================================================= */

module.exports =
  async function handler(
    req,
    res
  ) {
    /*
     * Pas de cache pendant les tests.
     */

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
    );

    /*
     * GET = simple vérification.
     * Il ne lance aucune collecte.
     */

    if (req.method === "GET") {
      return sendJson(
        res,
        200,
        {
          ok: true,
          service:
            "Kizomba Atlas Discovery Collector",
          version:
            "1.2-STABLE",
          message:
            "Collector opérationnel"
        }
      );
    }

    /*
     * La vraie collecte utilise POST.
     */

    if (req.method !== "POST") {
      res.setHeader(
        "Allow",
        "GET, POST"
      );

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

    /*
     * Vérification de sécurité.
     */

    const authorization =
      isAuthorized(req);

    if (!authorization.ok) {
      return sendJson(
        res,
        authorization.status,
        {
          ok: false,
          error:
            authorization.error
        }
      );
    }

    try {
      const sources =
        getSources();

      const report = {
        ok: true,

        version:
          "1.2-STABLE",

        sources_configured:
          sources.length,

        sources_read:
          0,

        sources_relevant:
          0,

        sources_irrelevant:
          0,

        items_sent:
          0,

        errors:
          []
      };

      for (
        const source of sources
      ) {
        try {
          await processSource(
            source,
            report
          );

        } catch (error) {
          report.errors.push({
            source:
              source.name,

            url:
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

    } catch (error) {
      console.error(
        "DISCOVERY_COLLECT_ERROR",
        error
      );

      return sendJson(
        res,
        500,
        {
          ok: false,
          version:
            "1.2-STABLE",
          error:
            error.message ||
            "Erreur inconnue"
        }
      );
    }
  };
