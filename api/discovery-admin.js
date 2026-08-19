/* =========================================================
   KIZOMBA ATLAS — DISCOVERY ADMIN API
   Lecture / modération de discovery_candidates
   Authentification: session Supabase + public.is_admin()
========================================================= */

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function env() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url) throw new Error("SUPABASE_URL manquant dans Vercel.");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant dans Vercel.");
  return { url: url.replace(/\/$/, ""), serviceKey };
}

function bearer(req) {
  const raw = String(req.headers.authorization || "").trim();
  return raw.startsWith("Bearer ") ? raw.slice(7).trim() : "";
}

async function verifyAdmin(req) {
  const token = bearer(req);
  if (!token) return { ok: false, status: 401, error: "Session administrateur absente." };

  const { url, serviceKey } = env();
  const response = await fetch(`${url}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });

  const text = await response.text();
  let value = null;
  try { value = JSON.parse(text); } catch { value = text; }

  if (!response.ok || value !== true) {
    return { ok: false, status: 403, error: "Accès administrateur refusé." };
  }

  return { ok: true, token };
}

async function listCandidates(req) {
  const { url, serviceKey } = env();
  const requestedStatus = String(req.query?.status || "new").trim().toLowerCase();
  const status = ["new", "rejected", "all"].includes(requestedStatus) ? requestedStatus : "new";
  const rawLimit = Number(req.query?.limit || 50);
  const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? rawLimit : 50, 100));

  const params = new URLSearchParams();
  params.set("select", "*");
  if (status !== "all") params.set("status", `eq.${status}`);
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));

  const response = await fetch(`${url}/rest/v1/discovery_candidates?${params.toString()}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json"
    }
  });

  const text = await response.text();
  let data = [];
  try { data = text ? JSON.parse(text) : []; } catch { throw new Error(`Supabase: ${text}`); }
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${JSON.stringify(data)}`);
  return Array.isArray(data) ? data : [];
}

async function setCandidateStatus(id, status) {
  const { url, serviceKey } = env();
  const safeId = String(id || "").trim();
  if (!safeId) throw new Error("Identifiant candidat manquant.");

  const response = await fetch(`${url}/rest/v1/discovery_candidates?id=eq.${encodeURIComponent(safeId)}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify({ status })
  });

  const text = await response.text();
  let data = [];
  try { data = text ? JSON.parse(text) : []; } catch { data = text; }
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return Array.isArray(data) ? data[0] || null : data;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const auth = await verifyAdmin(req);
    if (!auth.ok) return json(res, auth.status, { ok: false, error: auth.error });

    if (req.method === "GET") {
      const candidates = await listCandidates(req);
      return json(res, 200, { ok: true, candidates, count: candidates.length });
    }

    if (req.method === "PATCH") {
      const body = req.body || {};
      const action = String(body.action || "").trim().toLowerCase();
      const nextStatus = action === "reject" ? "rejected" : action === "restore" ? "new" : "";
      if (!nextStatus) return json(res, 400, { ok: false, error: "Action attendue: reject ou restore." });

      const candidate = await setCandidateStatus(body.id, nextStatus);
      return json(res, 200, { ok: true, candidate });
    }

    res.setHeader("Allow", "GET, PATCH, OPTIONS");
    return json(res, 405, { ok: false, error: "Méthode non autorisée." });
  } catch (error) {
    console.error("discovery-admin:", error);
    return json(res, 500, { ok: false, error: error.message || "Erreur serveur" });
  }
};
