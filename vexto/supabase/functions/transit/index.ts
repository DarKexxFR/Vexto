// Supabase Edge Function "transit": secure proxy to Île-de-France Mobilités'
// PRIM platform (Navitia API) for journeys, next departures, nearby stops,
// search and line details. The PRIM API key never leaves the server.
//
// Deploy:   npx supabase functions deploy transit
// Secret:   npx supabase secrets set PRIM_API_KEY=<your PRIM key>
// Optional: PRIM_NAVITIA_BASE (defaults to the PRIM v2 Navitia endpoint)
//
// Only signed-in users can call it (Supabase verifies the JWT by default).
// Responses are cached in memory to spare the PRIM quota.

const BASE = (Deno.env.get("PRIM_NAVITIA_BASE") ??
  "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia").replace(/\/+$/, "");
const KEY = Deno.env.get("PRIM_API_KEY") ?? "";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type LngLat = [number, number];

type Body =
  | { action: "journeys"; from: LngLat; to: LngLat; datetime?: string; count?: number }
  | { action: "nearby"; at: LngLat; distance?: number }
  | { action: "departures"; stopAreaId: string; count?: number }
  | { action: "search"; q: string }
  | { action: "line"; lineId: string };

const ID_RE = /^[A-Za-z0-9_:.\-]{3,120}$/;
const DATETIME_RE = /^\d{8}T\d{4}(\d{2})?$/;

interface CacheEntry {
  at: number;
  ttl: number;
  status: number;
  body: string;
}
const cache = new Map<string, CacheEntry>();
const MAX_CACHE = 400;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function coord(value: unknown): string | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const lon = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
  return `${lon.toFixed(6)};${lat.toFixed(6)}`;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

async function prim(path: string, ttlSeconds: number): Promise<CacheEntry> {
  const url = `${BASE}/${path}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < hit.ttl) return hit;

  const res = await fetch(url, { headers: { apikey: KEY, Accept: "application/json" } });
  const entry: CacheEntry = { at: Date.now(), ttl: ttlSeconds * 1000, status: res.status, body: await res.text() };
  if (res.ok) {
    cache.set(url, entry);
    if (cache.size > MAX_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
  }
  return entry;
}

/** Map PRIM/Navitia statuses to app-friendly responses. */
function relay(entry: CacheEntry): Response {
  if (entry.status === 401 || entry.status === 403) return json({ error: "prim_unauthorized" }, 502);
  if (entry.status === 429) return json({ error: "prim_quota" }, 429);
  // Navitia answers 404 with { error: { id: "no_solution" | "unknown_object" … } }:
  // that is a valid "nothing found", not a failure.
  if (entry.status === 404 && entry.body.includes('"error"')) {
    return new Response(entry.body, { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }
  if (entry.status >= 400) return json({ error: "prim_error", status: entry.status }, 502);
  return new Response(entry.body, { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!KEY) return json({ error: "prim_key_missing" }, 503);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  try {
    switch (body.action) {
      case "journeys": {
        const from = coord(body.from);
        const to = coord(body.to);
        if (!from || !to) return json({ error: "bad_request" }, 400);
        const count = clampInt(body.count, 1, 6, 4);
        const datetime = body.datetime && DATETIME_RE.test(body.datetime) ? `&datetime=${body.datetime}` : "";
        return relay(
          await prim(
            `journeys?from=${from}&to=${to}&count=${count}&min_nb_journeys=${count}&data_freshness=realtime${datetime}`,
            30,
          ),
        );
      }
      case "nearby": {
        const at = coord(body.at);
        if (!at) return json({ error: "bad_request" }, 400);
        const distance = clampInt(body.distance, 100, 1500, 600);
        return relay(
          await prim(`coord/${at}/places_nearby?type%5B%5D=stop_area&distance=${distance}&count=15`, 600),
        );
      }
      case "departures": {
        if (!ID_RE.test(body.stopAreaId ?? "")) return json({ error: "bad_request" }, 400);
        const count = clampInt(body.count, 5, 60, 40);
        return relay(
          await prim(
            `stop_areas/${encodeURIComponent(body.stopAreaId)}/departures?count=${count}&data_freshness=realtime&depth=2`,
            20,
          ),
        );
      }
      case "search": {
        const q = (body.q ?? "").trim().slice(0, 60);
        if (q.length < 2) return json({ pt_objects: [] });
        return relay(
          await prim(
            `pt_objects?q=${encodeURIComponent(q)}&type%5B%5D=line&type%5B%5D=stop_area&count=15`,
            3600,
          ),
        );
      }
      case "line": {
        if (!ID_RE.test(body.lineId ?? "")) return json({ error: "bad_request" }, 400);
        const id = encodeURIComponent(body.lineId);
        const [line, stops] = await Promise.all([
          prim(`lines/${id}?depth=1`, 86_400),
          prim(`lines/${id}/stop_areas?count=400&depth=1`, 86_400),
        ]);
        if (line.status >= 400) return relay(line);
        return json({
          line: JSON.parse(line.body),
          stops: stops.status < 400 ? JSON.parse(stops.body) : { stop_areas: [] },
        });
      }
      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    return json({ error: "proxy_failure", message: e instanceof Error ? e.message : String(e) }, 502);
  }
});
