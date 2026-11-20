#!/usr/bin/env node
/**
 * Import the official Île-de-France Mobilités line shapes (open data,
 * "Tracés des lignes de transport en commun d'Île-de-France", ODbL) into
 * public.transit_operators. verify_trip() then checks transit GPS traces
 * against the real network (migration 0006/0007).
 *
 * Usage (Node 20+, no dependencies):
 *   node scripts/import-idfm-lines.mjs
 *       → downloads the dataset, writes supabase/seed/idfm_lines.sql
 *         (paste it in Supabase › SQL editor, or `psql -f`).
 *   node scripts/import-idfm-lines.mjs --file traces.geojson
 *       → uses a GeoJSON you exported from data.iledefrance-mobilites.fr.
 *   node scripts/import-idfm-lines.mjs --modes=metro,rer,train,tram,bus
 *       → modes to import. Default: metro, rer, train, tram, cable.
 *         Buses share the road with cars: importing them makes the
 *         anti-cheat accept car trips that follow a bus route.
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/import-idfm-lines.mjs --upload
 *       → upserts directly through the REST API (service role key, keep it secret).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATASET_URL =
  "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/" +
  "traces-des-lignes-de-transport-en-commun-idfm/exports/geojson";

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const value = (name) => {
  const f = flag(name);
  if (!f) return null;
  if (f.includes("=")) return f.split("=").slice(1).join("=");
  const i = args.indexOf(f);
  return args[i + 1] ?? null;
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODES = new Set((value("modes") ?? "metro,rer,train,tram,cable").split(",").map((m) => m.trim().toLowerCase()));
const OUT = resolve(ROOT, value("out") ?? "supabase/seed/idfm_lines.sql");

/** First non-empty property among candidates (dataset field names vary). */
function pick(props, names) {
  for (const n of names) {
    const v = props?.[n];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

/** GTFS route_type or a free-text mode → our mode keys. */
export function modeOf(props) {
  const routeType = pick(props, ["route_type", "routetype"]);
  const text = (pick(props, ["transportmode", "mode", "route_type_name", "networkname", "network_name", "shortname_groupoflines"]) ?? "").toLowerCase();
  if (/\brer\b/.test(text)) return "rer";
  if (/m[ée]tro|metro|subway/.test(text) || routeType === "1") return "metro";
  if (/tram/.test(text) || routeType === "0") return "tram";
  if (/funi|c[aâ]ble|cable|t[ée]l[ée]ph/.test(text) || routeType === "5" || routeType === "6" || routeType === "7") return "cable";
  if (/rail|train|transilien|ter\b/.test(text) || routeType === "2") return "train";
  if (/bus|noctilien|coach/.test(text) || routeType === "3" || routeType === "700") return "bus";
  return "other";
}

function lines(geometry) {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  if (geometry.type === "GeometryCollection") return (geometry.geometries ?? []).flatMap(lines);
  return [];
}

const round = (n) => Math.round(Number(n) * 1e6) / 1e6;

export function toEwkt(parts) {
  const body = parts
    .filter((p) => p.length > 1)
    .map((p) => `(${p.map(([x, y]) => `${round(x)} ${round(y)}`).join(",")})`)
    .join(",");
  return `SRID=4326;MULTILINESTRING(${body})`;
}

/** Group features per line (one row per IDFM line, all branches merged). */
export function collectLines(geojson, modes = MODES) {
  const byId = new Map();
  let skipped = 0;
  for (const f of geojson.features ?? []) {
    const p = f.properties ?? {};
    const mode = modeOf(p);
    if (!modes.has(mode)) {
      skipped += 1;
      continue;
    }
    const id = pick(p, ["route_id", "id_ligne", "idrefligc", "id_line", "line_id", "id"]);
    const parts = lines(f.geometry);
    if (!id || parts.length === 0) {
      skipped += 1;
      continue;
    }
    const code = pick(p, ["route_short_name", "shortname_line", "shortname", "code", "name_line"]) ?? id;
    const entry = byId.get(id) ?? {
      id,
      mode,
      code,
      name: pick(p, ["route_long_name", "name_line", "longname", "name"]) ?? code,
      color: (pick(p, ["route_color", "colourweb_hexa", "color"]) ?? "").replace(/^#/, "") || null,
      network: pick(p, ["networkname", "network_name", "operatorname", "agency_name"]),
      parts: [],
    };
    entry.parts.push(...parts);
    byId.set(id, entry);
  }
  return { lines: [...byId.values()], skipped };
}

const sqlText = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const label = (l) => `${{ metro: "Métro", rer: "RER", train: "Train", tram: "Tram", cable: "Câble", bus: "Bus" }[l.mode] ?? "Ligne"} ${l.code}`;

export function toSql(list) {
  const rows = list.map(
    (l) =>
      `(${sqlText(label(l))}, 'publicTransit', ${sqlText(l.id)}, ${sqlText(l.id)}, ${sqlText(l.code)}, ` +
      `${sqlText(l.color)}, ${sqlText(l.network)}, ${sqlText(toEwkt(l.parts))}::geometry)`,
  );
  return [
    "-- Generated by scripts/import-idfm-lines.mjs — official IDFM line shapes (ODbL).",
    "begin;",
    ...chunk(rows, 50).map(
      (batch) =>
        "insert into public.transit_operators (name, mode, gtfs_ref, idfm_line_id, line_code, line_color, network, route)\nvalues\n  " +
        batch.join(",\n  ") +
        "\non conflict (idfm_line_id) do update set name = excluded.name, line_code = excluded.line_code,\n" +
        "  line_color = excluded.line_color, network = excluded.network, route = excluded.route;",
    ),
    "commit;",
    "",
  ].join("\n");
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function upload(list) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --upload");
  for (const batch of chunk(list, 20)) {
    const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/transit_operators?on_conflict=idfm_line_id`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(
        batch.map((l) => ({
          name: label(l),
          mode: "publicTransit",
          gtfs_ref: l.id,
          idfm_line_id: l.id,
          line_code: l.code,
          line_color: l.color,
          network: l.network,
          route: toEwkt(l.parts),
        })),
      ),
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
    process.stdout.write(".");
  }
  process.stdout.write("\n");
}

async function main() {
  const file = value("file");
  let geojson;
  if (file) {
    geojson = JSON.parse(readFileSync(resolve(file), "utf8"));
  } else {
    console.log(`Téléchargement des tracés IDFM…\n  ${DATASET_URL}`);
    const res = await fetch(DATASET_URL);
    if (!res.ok) throw new Error(`Téléchargement impossible (${res.status}). Exportez le GeoJSON depuis le site et utilisez --file.`);
    geojson = await res.json();
  }
  const { lines: list, skipped } = collectLines(geojson);
  const byMode = list.reduce((acc, l) => ({ ...acc, [l.mode]: (acc[l.mode] ?? 0) + 1 }), {});
  console.log(`${list.length} lignes retenues (${JSON.stringify(byMode)}), ${skipped} tracés ignorés.`);
  if (list.length === 0) throw new Error("Aucune ligne trouvée : vérifiez le fichier ou l'option --modes.");

  if (flag("upload")) {
    await upload(list);
    console.log("✅ Lignes importées dans Supabase.");
  } else {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, toSql(list));
    console.log(`✅ SQL écrit dans ${OUT} — exécutez-le dans l'éditeur SQL de Supabase.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  });
}
