// Supabase Edge Function "transit": secure proxy to Navitia transit APIs for
// journeys, next departures, nearby stops, search and line details. API keys
// never leave the server. Three regions, picked from the coordinates:
//
//   idfm   Île-de-France (RATP, SNCF Transilien/RER, Optile…) — IDFM PRIM
//          secret PRIM_API_KEY
//   dijon  Dijon Métropole (Divia bus & tram) — navitia.io, coverage fr-ne-dijon
//          secret NAVITIA_API_KEY
//   sncf   Everywhere else in France: TER, Intercités, TGV… — api.sncf.com
//          secret SNCF_API_KEY
//
// Deploy:   npx supabase functions deploy transit   (or paste in the dashboard)
// Optional: PRIM_NAVITIA_BASE, SNCF_NAVITIA_BASE, DIJON_NAVITIA_BASE
//
// Only signed-in users can call it (Supabase verifies the JWT by default).
// Responses are cached in memory to spare the providers' quotas.

type Region = "idfm" | "dijon" | "sncf";

interface Provider {
  base: string;
  key: string;
  /** PRIM wants an "apikey" header; Navitia (navitia.io, api.sncf.com) Basic auth. */
  auth: "apikey" | "basic";
}

const env = (name: string) => Deno.env.get(name) ?? "";
const trim = (url: string) => url.replace(/\/+$/, "");

const PROVIDERS: Record<Region, Provider> = {
  idfm: {
    base: trim(env("PRIM_NAVITIA_BASE") || "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia"),
    key: env("PRIM_API_KEY"),
    auth: "apikey",
  },
  dijon: {
    base: trim(env("DIJON_NAVITIA_BASE") || "https://api.navitia.io/v1/coverage/fr-ne-dijon"),
    key: env("NAVITIA_API_KEY"),
    auth: "basic",
  },
  sncf: {
    base: trim(env("SNCF_NAVITIA_BASE") || "https://api.sncf.com/v1/coverage/sncf"),
    key: env("SNCF_API_KEY"),
    auth: "basic",
  },
};
const REGIONS: Region[] = ["idfm", "dijon", "sncf"];
const isRegion = (r: unknown): r is Region => typeof r === "string" && (REGIONS as string[]).includes(r);

/** Local network covering a point; "sncf" (national rail) elsewhere. */
function regionAt(lon: number, lat: number): Region {
  if (lon >= 1.4 && lon <= 3.6 && lat >= 48.1 && lat <= 49.25) return "idfm";
  if (lon >= 4.85 && lon <= 5.25 && lat >= 47.2 && lat <= 47.45) return "dijon";
  return "sncf";
}

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type LngLat = [number, number];

type Body =
  | { action: "journeys"; from: LngLat; to: LngLat; datetime?: string; count?: number }
  | { action: "nearby"; at: LngLat; distance?: number }
  | { action: "departures"; stopAreaId: string; count?: number; region?: Region }
  | { action: "search"; q: string; near?: LngLat }
  | { action: "line"; lineId: string; region?: Region };

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

function lngLat(value: unknown): LngLat | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const lon = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
  return [lon, lat];
}

function coord(p: LngLat): string {
  return `${p[0].toFixed(6)};${p[1].toFixed(6)}`;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

async function call(region: Region, path: string, ttlSeconds: number): Promise<CacheEntry> {
  const provider = PROVIDERS[region];
  const url = `${provider.base}/${path}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < hit.ttl) return hit;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (provider.auth === "apikey") headers.apikey = provider.key;
  else headers.Authorization = `Basic ${btoa(`${provider.key}:`)}`;

  const res = await fetch(url, { headers });
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

function keyMissing(region: Region): Response {
  return json({ error: "prim_key_missing", region }, 503);
}

/** Map provider statuses to app-friendly responses, tagged with the region. */
function relay(entry: CacheEntry, region: Region): Response {
  if (entry.status === 401 || entry.status === 403) return json({ error: "prim_unauthorized", region }, 502);
  if (entry.status === 429) return json({ error: "prim_quota", region }, 429);
  // Navitia answers 404 with { error: { id: "no_solution" | "unknown_object" … } }:
  // that is a valid "nothing found", not a failure.
  const ok = entry.status < 400 || (entry.status === 404 && entry.body.includes('"error"'));
  if (!ok) return json({ error: "prim_error", status: entry.status, region }, 502);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(entry.body);
  } catch {
    return json({ error: "prim_error", region }, 502);
  }
  return json({ ...data, vexto_region: region });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!REGIONS.some((r) => PROVIDERS[r].key)) return keyMissing("idfm");

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  try {
    switch (body.action) {
      case "journeys": {
        const from = lngLat(body.from);
        const to = lngLat(body.to);
        if (!from || !to) return json({ error: "bad_request" }, 400);
        // Same local network at both ends → that network; otherwise national rail.
        const a = regionAt(from[0], from[1]);
        const b = regionAt(to[0], to[1]);
        const region: Region = a === b ? a : "sncf";
        if (!PROVIDERS[region].key) return keyMissing(region);
        const count = clampInt(body.count, 1, 6, 4);
        const datetime = body.datetime && DATETIME_RE.test(body.datetime) ? `&datetime=${body.datetime}` : "";
        return relay(
          await call(
            region,
            `journeys?from=${coord(from)}&to=${coord(to)}&count=${count}&min_nb_journeys=${count}&data_freshness=realtime${datetime}`,
            30,
          ),
          region,
        );
      }
      case "nearby": {
        const at = lngLat(body.at);
        if (!at) return json({ error: "bad_request" }, 400);
        const region = regionAt(at[0], at[1]);
        if (!PROVIDERS[region].key) return keyMissing(region);
        // Train stations are sparser than metro / bus stops: look further.
        const distance = clampInt(body.distance, 100, region === "sncf" ? 5000 : 1500, region === "sncf" ? 3000 : 600);
        return relay(
          await call(region, `coord/${coord(at)}/places_nearby?type%5B%5D=stop_area&distance=${distance}&count=15`, 600),
          region,
        );
      }
      case "departures": {
        const region: Region = isRegion(body.region) ? body.region : "idfm";
        if (!ID_RE.test(body.stopAreaId ?? "")) return json({ error: "bad_request" }, 400);
        if (!PROVIDERS[region].key) return keyMissing(region);
        const count = clampInt(body.count, 5, 60, 40);
        return relay(
          await call(
            region,
            `stop_areas/${encodeURIComponent(body.stopAreaId)}/departures?count=${count}&data_freshness=realtime&depth=2`,
            20,
          ),
          region,
        );
      }
      case "search": {
        const q = (body.q ?? "").trim().slice(0, 60);
        if (q.length < 2) return json({ results: [] });
        // The local network around the user (if any) plus national rail.
        const near = lngLat(body.near);
        const local = near ? regionAt(near[0], near[1]) : "idfm";
        const regions = [...new Set<Region>([local, "sncf"])].filter((r) => PROVIDERS[r].key);
        const path = `pt_objects?q=${encodeURIComponent(q)}&type%5B%5D=line&type%5B%5D=stop_area&count=15`;
        const entries = await Promise.all(regions.map((r) => call(r, path, 3600)));
        const results = entries.flatMap((e, i) => {
          if (e.status >= 400) return [];
          try {
            return [{ region: regions[i], data: JSON.parse(e.body) }];
          } catch {
            return [];
          }
        });
        if (results.length === 0 && entries[0]) return relay(entries[0], regions[0]);
        return json({ results });
      }
      case "line": {
        const region: Region = isRegion(body.region) ? body.region : "idfm";
        if (!ID_RE.test(body.lineId ?? "")) return json({ error: "bad_request" }, 400);
        if (!PROVIDERS[region].key) return keyMissing(region);
        const id = encodeURIComponent(body.lineId);
        const [line, stops] = await Promise.all([
          call(region, `lines/${id}?depth=1`, 86_400),
          call(region, `lines/${id}/stop_areas?count=400&depth=1`, 86_400),
        ]);
        if (line.status >= 400) return relay(line, region);
        return json({
          line: JSON.parse(line.body),
          stops: stops.status < 400 ? JSON.parse(stops.body) : { stop_areas: [] },
          vexto_region: region,
        });
      }
      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    return json({ error: "proxy_failure", message: e instanceof Error ? e.message : String(e) }, 502);
  }
});
