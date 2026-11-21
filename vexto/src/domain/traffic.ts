/**
 * Traffic alerts ("info trafic") from Navitia `disruptions`, which PRIM
 * returns alongside departures and journeys. Pure parsing, no extra API.
 */

export type AlertLevel = "blocking" | "delays" | "info";

export interface TrafficAlert {
  id: string;
  level: AlertLevel;
  /** Short headline, e.g. "RER B : trafic interrompu entre…". */
  title: string;
  /** Plain-text details (HTML stripped). */
  message: string;
  /** Lines concerned (Navitia ids). */
  lineIds: string[];
  /** Stop areas concerned (Navitia ids). */
  stopAreaIds: string[];
  end: Date | null;
}

export interface NvDisruption {
  id?: string;
  disruption_id?: string;
  status?: string;
  severity?: { name?: string; effect?: string; priority?: number };
  messages?: { text?: string; channel?: { name?: string; types?: string[] } }[];
  impacted_objects?: { pt_object?: { id?: string; embedded_type?: string } }[];
  application_periods?: { begin?: string; end?: string }[];
}

const BLOCKING = new Set(["NO_SERVICE", "REDUCED_SERVICE", "STOP_MOVED", "DETOUR"]);
const DELAYS = new Set(["SIGNIFICANT_DELAYS", "MODIFIED_SERVICE"]);

function navitiaDate(v: string | undefined): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/.exec(v ?? "");
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
}

/** "<p>Trafic <b>interrompu</b></p>" → "Trafic interrompu". */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function alertLevel(effect: string | undefined, name?: string): AlertLevel {
  const e = (effect ?? "").toUpperCase();
  if (BLOCKING.has(e) || /bloquant|interrompu/i.test(name ?? "")) return "blocking";
  if (DELAYS.has(e) || /perturb|retard/i.test(name ?? "")) return "delays";
  return "info";
}

/** Active alerts, most severe first; past ones and empty messages are dropped. */
export function parseDisruptions(list: NvDisruption[] | undefined, now: Date = new Date()): TrafficAlert[] {
  const out: TrafficAlert[] = [];
  const seen = new Set<string>();
  for (const d of list ?? []) {
    const id = d.id ?? d.disruption_id;
    if (!id || seen.has(id) || d.status === "past") continue;
    const periods = (d.application_periods ?? []).map((p) => ({ begin: navitiaDate(p.begin), end: navitiaDate(p.end) }));
    const current = periods.find((p) => (!p.begin || p.begin <= now) && (!p.end || p.end >= now));
    if (periods.length > 0 && !current && d.status !== "active") continue;

    const msgs = d.messages ?? [];
    const pick = (re: RegExp) => msgs.find((m) => (m.channel?.types ?? []).some((t) => re.test(t)) || re.test(m.channel?.name ?? ""));
    const titleMsg = pick(/title|titre/i);
    const bodyMsg = pick(/web|mobile|moteur|email/i) ?? msgs.find((m) => m !== titleMsg);
    const message = stripHtml(bodyMsg?.text ?? "");
    const title = stripHtml(titleMsg?.text ?? "") || message.split("\n")[0]?.slice(0, 140) || "";
    if (!title && !message) continue;

    seen.add(id);
    const objects = (d.impacted_objects ?? []).map((o) => o.pt_object).filter(Boolean);
    out.push({
      id,
      level: alertLevel(d.severity?.effect, d.severity?.name),
      title,
      message: message === title ? "" : message,
      lineIds: objects.filter((o) => o?.embedded_type === "line" && o.id).map((o) => o!.id!),
      stopAreaIds: objects.filter((o) => o?.embedded_type === "stop_area" && o.id).map((o) => o!.id!),
      end: current?.end ?? null,
    });
  }
  const rank: Record<AlertLevel, number> = { blocking: 0, delays: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** Alerts concerning a line (by id) and/or linked explicitly by id. */
export function alertsFor(alerts: TrafficAlert[], lineId: string | null, linkedIds: string[] = []): TrafficAlert[] {
  return alerts.filter((a) => linkedIds.includes(a.id) || (lineId != null && a.lineIds.includes(lineId)));
}
