import { isMissingBackendFeature } from "@/lib/errors";
import { lineToEwkt, pointToEwkt } from "@/lib/geo";
import { supabase } from "@/lib/supabase";
import type {
  GeoLineString,
  GeoPoint,
  TripInsert,
  TripMode,
  TripRejectionReason,
  TripRow,
} from "@/types/database";

export interface NewTripInput {
  userId: string;
  mode: TripMode;
  distanceKm: number;
  startLocation?: GeoPoint;
  endLocation?: GeoPoint;
  gpsTrack?: GeoLineString;
  transitOperatorId?: string;
  startedAt?: Date;
  endedAt?: Date;
}

/** Lightweight trip shape for lists and statistics (no geometries). */
export type TripListItem = Pick<
  TripRow,
  | "id"
  | "mode"
  | "distance_km"
  | "co2_saved_kg"
  | "points_awarded"
  | "verified_by_postgis"
  | "status"
  | "created_at"
> & {
  started_at?: string | null;
  ended_at?: string | null;
  rejection_reason?: TripRejectionReason | null;
};

export function toListItem(t: TripRow): TripListItem {
  return {
    id: t.id,
    mode: t.mode,
    distance_km: Number(t.distance_km) || 0,
    co2_saved_kg: Number(t.co2_saved_kg) || 0,
    points_awarded: Number(t.points_awarded) || 0,
    verified_by_postgis: t.verified_by_postgis,
    status: t.status,
    created_at: t.created_at,
    started_at: t.started_at ?? null,
    ended_at: t.ended_at ?? null,
    rejection_reason: t.rejection_reason ?? null,
  };
}

/**
 * Insert a trip in `pending` state. CO2/points are intentionally NOT trusted
 * from the client — they are computed server-side in `verify_trip`.
 * Geometries are sent as EWKT, which PostGIS accepts directly on insert.
 * Start/end timestamps feed the server speed check (dropped if the database
 * predates migration 0006).
 */
export async function createTrip(input: NewTripInput): Promise<string> {
  const base: TripInsert = {
    user_id: input.userId,
    mode: input.mode,
    distance_km: Math.round(input.distanceKm * 1000) / 1000,
    start_location: input.startLocation ? pointToEwkt(input.startLocation) : null,
    end_location: input.endLocation ? pointToEwkt(input.endLocation) : null,
    gps_track: input.gpsTrack ? lineToEwkt(input.gpsTrack) : null,
    transit_operator_id: input.transitOperatorId ?? null,
  };
  const withTimes: TripInsert = {
    ...base,
    started_at: input.startedAt?.toISOString() ?? null,
    ended_at: input.endedAt?.toISOString() ?? null,
  };

  const first = await supabase.from("trips").insert(withTimes).select("id").single();
  if (!first.error) return first.data.id;
  if (!isMissingBackendFeature(first.error)) throw first.error;

  const legacy = await supabase.from("trips").insert(base).select("id").single();
  if (legacy.error) throw legacy.error;
  return legacy.data.id;
}

/** Create a trip then verify it server-side, returning the verified row. */
export async function submitTrip(input: NewTripInput): Promise<TripRow> {
  const id = await createTrip(input);
  return verifyTrip(id);
}

/**
 * Verify a trip: server recomputes ADEME savings, runs the anti-cheat checks,
 * awards points and updates profile aggregates atomically (idempotent).
 */
export async function verifyTrip(tripId: string): Promise<TripRow> {
  const { data, error } = await supabase.rpc("verify_trip", { p_trip_id: tripId });
  if (error) throw error;
  return data as TripRow;
}

/** The signed-in user's trips, newest first (lightweight columns only). */
export async function listTrips(userId: string, limit = 300): Promise<TripListItem[]> {
  const v2 = await supabase
    .from("trips")
    .select(
      "id, mode, distance_km, co2_saved_kg, points_awarded, verified_by_postgis, status, created_at, started_at, ended_at, rejection_reason",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!v2.error) return (v2.data ?? []).map((t) => toListItem(t as TripRow));
  if (!isMissingBackendFeature(v2.error)) throw v2.error;

  const v1 = await supabase
    .from("trips")
    .select("id, mode, distance_km, co2_saved_kg, points_awarded, verified_by_postgis, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (v1.error) throw v1.error;
  return (v1.data ?? []).map((t) => toListItem(t as TripRow));
}

/** Why the server refused a trip, in plain French (null when verified). */
export function rejectionMessage(
  trip: Pick<TripListItem, "status" | "mode" | "rejection_reason">,
): string | null {
  if (trip.status !== "rejected") return null;
  switch (trip.rejection_reason) {
    case "no_track":
      return "Trace GPS absente ou trop courte : gardez l'application ouverte pendant le trajet.";
    case "invalid_duration":
      return "Horaires du trajet invalides.";
    case "too_fast":
      return "Vitesse moyenne incohérente avec le mode choisi (anti-triche).";
    case "off_transit_network":
      return "Votre trace GPS ne suit pas une ligne de transport officielle (anti-triche).";
    default:
      return trip.mode === "publicTransit"
        ? "Trajet non vérifié sur une ligne de transport officielle (anti-triche)."
        : "Trajet refusé par la vérification anti-triche.";
  }
}
