import { lineToEwkt, pointToEwkt } from "@/lib/geo";
import { supabase } from "@/lib/supabase";
import type { GeoLineString, GeoPoint, TripMode, TripRow } from "@/types/database";

export interface NewTripInput {
  userId: string;
  mode: TripMode;
  distanceKm: number;
  startLocation?: GeoPoint;
  endLocation?: GeoPoint;
  gpsTrack?: GeoLineString;
  transitOperatorId?: string;
}

/**
 * Insert a trip in `pending` state. CO2/points are intentionally NOT trusted
 * from the client — they are computed server-side in `verify_trip`.
 *
 * Geometries are sent as EWKT, which PostGIS accepts directly on insert.
 */
export async function createTrip(input: NewTripInput): Promise<TripRow> {
  const { data, error } = await supabase
    .from("trips")
    .insert({
      user_id: input.userId,
      mode: input.mode,
      distance_km: input.distanceKm,
      start_location: input.startLocation
        ? pointToEwkt(input.startLocation)
        : null,
      end_location: input.endLocation ? pointToEwkt(input.endLocation) : null,
      gps_track: input.gpsTrack ? lineToEwkt(input.gpsTrack) : null,
      transit_operator_id: input.transitOperatorId ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Create a trip then verify it server-side, returning the verified row. */
export async function submitTrip(input: NewTripInput): Promise<TripRow> {
  const created = await createTrip(input);
  return verifyTrip(created.id);
}

/**
 * Verify a trip: server recomputes ADEME savings, runs the PostGIS anti-cheat
 * check, awards points and updates profile aggregates atomically.
 */
export async function verifyTrip(tripId: string): Promise<TripRow> {
  const { data, error } = await supabase.rpc("verify_trip", {
    p_trip_id: tripId,
  });
  if (error) throw error;
  return data as TripRow;
}

/** List the signed-in user's trips, newest first. */
export async function listTrips(userId: string): Promise<TripRow[]> {
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
