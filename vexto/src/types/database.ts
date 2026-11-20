/**
 * Strict types for the Vexto Postgres schema.
 *
 * This is a curated, hand-maintained subset of the full Supabase-generated
 * types (the generated file also contains hundreds of PostGIS function
 * signatures we don't need on the client). Regenerate the full version any
 * time with the Supabase MCP `generate_typescript_types` tool.
 *
 * PostGIS geometry columns are typed as GeoJSON-ish `string | null` because the
 * REST API returns them as WKB/EWKT strings unless explicitly transformed.
 *
 * Columns added by migration 0006 are optional (`?`) so the app keeps working
 * against a database where that migration has not been applied yet.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TripMode =
  | "carThermal"
  | "publicTransit"
  | "bike"
  | "eScooter"
  | "walk";

export type TripStatus = "pending" | "verified" | "rejected";
export type FriendshipStatus = "pending" | "accepted" | "blocked";

/** Server-side reasons a trip can be rejected (migration 0006). */
export type TripRejectionReason =
  | "no_track"
  | "invalid_duration"
  | "too_fast"
  | "off_transit_network";

/**
 * NOTE: Row/Insert/Update shapes use `type` aliases (not `interface`) on
 * purpose. supabase-js constrains the schema against `Record<string, unknown>`,
 * and `interface` types are not assignable to an index signature in a
 * conditional `extends` check (they may be augmented later). Using `type`
 * aliases gives them an implicit index signature so the schema type-checks.
 */

/** A GeoJSON Point, the shape we send to the DB for lon/lat columns. */
export type GeoPoint = {
  type: "Point";
  coordinates: [number, number]; // [lon, lat]
};

/** A GeoJSON LineString, used for recorded GPS tracks. */
export type GeoLineString = {
  type: "LineString";
  coordinates: Array<[number, number]>;
};

export type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  cumulative_points: number;
  current_co2_saved: number;
  /** Points already exchanged for rewards (0006). */
  spent_points?: number;
  created_at: string;
  updated_at: string;
};

export type TransitOperatorRow = {
  id: string;
  name: string;
  mode: string;
  gtfs_ref: string | null;
  route: string | null;
  created_at: string;
};

export type TripRow = {
  id: string;
  user_id: string;
  mode: TripMode;
  start_location: string | null;
  end_location: string | null;
  gps_track: string | null;
  distance_km: number;
  co2_saved_kg: number;
  points_awarded: number;
  verified_by_postgis: boolean;
  transit_operator_id: string | null;
  status: TripStatus;
  created_at: string;
  started_at?: string | null;
  ended_at?: string | null;
  rejection_reason?: TripRejectionReason | null;
};

export type TripInsert = {
  user_id: string;
  mode: TripMode;
  start_location?: string | null;
  end_location?: string | null;
  gps_track?: string | null;
  distance_km: number;
  transit_operator_id?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
};

export type FriendshipRow = {
  id: string;
  user_id_1: string;
  user_id_2: string;
  status: FriendshipStatus;
  requested_by: string | null;
  created_at: string;
};

export type RewardRow = {
  id: string;
  brand_name: string;
  title: string;
  voucher_code: string | null;
  points_cost: number;
  expiration_date: string | null;
  active: boolean;
  created_at: string;
};

export type RedemptionRow = {
  id: string;
  user_id: string;
  reward_id: string;
  points_spent: number;
  created_at: string;
  voucher_code?: string | null;
  reward_title?: string | null;
  brand_name?: string | null;
};

export type LeaderboardSinceRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  points: number;
  co2_saved: number;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & Pick<ProfileRow, "id">;
        Update: Partial<Pick<ProfileRow, "full_name" | "avatar_url">>;
        Relationships: [];
      };
      transit_operators: {
        Row: TransitOperatorRow;
        Insert: Partial<TransitOperatorRow> & Pick<TransitOperatorRow, "name">;
        Update: Partial<TransitOperatorRow>;
        Relationships: [];
      };
      trips: {
        Row: TripRow;
        Insert: TripInsert;
        Update: Partial<TripRow>;
        Relationships: [];
      };
      friendships: {
        Row: FriendshipRow;
        Insert: Pick<FriendshipRow, "user_id_1" | "user_id_2"> &
          Partial<FriendshipRow>;
        Update: Partial<FriendshipRow>;
        Relationships: [];
      };
      rewards: {
        Row: RewardRow;
        Insert: Partial<RewardRow> &
          Pick<RewardRow, "brand_name" | "title" | "points_cost">;
        Update: Partial<RewardRow>;
        Relationships: [];
      };
      redemptions: {
        Row: RedemptionRow;
        Insert: Pick<RedemptionRow, "user_id" | "reward_id" | "points_spent">;
        Update: Partial<RedemptionRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      verify_trip: {
        Args: { p_trip_id: string };
        Returns: TripRow;
      };
      validate_trip_geo: {
        Args: {
          p_track: string;
          p_operator_id: string;
          p_buffer_m?: number;
        };
        Returns: boolean;
      };
      redeem_reward: {
        Args: { p_reward_id: string };
        Returns: RedemptionRow;
      };
      send_friend_request: {
        Args: { p_code: string };
        Returns: FriendshipRow;
      };
      respond_friend_request: {
        Args: { p_friendship_id: string; p_accept: boolean };
        Returns: undefined;
      };
      remove_friend: {
        Args: { p_friend_id: string };
        Returns: undefined;
      };
      leaderboard_since: {
        Args: { p_since: string; p_limit?: number; p_user_ids?: string[] | null };
        Returns: LeaderboardSinceRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
