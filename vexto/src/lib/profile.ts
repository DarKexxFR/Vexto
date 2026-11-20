import { isMissingBackendFeature } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import type { ProfileRow } from "@/types/database";

/** The signed-in user's profile as the app uses it (email comes from auth). */
export type Profile = Omit<ProfileRow, "email" | "spent_points"> & { spent_points: number };

export interface LeaderboardEntry {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  points: number;
  co2Kg: number;
}

function toProfile(row: Omit<ProfileRow, "email">): Profile {
  return {
    ...row,
    cumulative_points: Number(row.cumulative_points) || 0,
    current_co2_saved: Number(row.current_co2_saved) || 0,
    spent_points: Number(row.spent_points ?? 0) || 0,
  };
}

/**
 * Load a profile with explicit columns (emails are private since 0006). Falls
 * back to the pre-0006 column set when `spent_points` does not exist yet.
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const withBalance = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, cumulative_points, current_co2_saved, spent_points, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();
  if (!withBalance.error) return withBalance.data ? toProfile(withBalance.data) : null;
  if (!isMissingBackendFeature(withBalance.error)) throw withBalance.error;

  const legacy = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, cumulative_points, current_co2_saved, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();
  if (legacy.error) throw legacy.error;
  return legacy.data ? toProfile(legacy.data) : null;
}

export async function updateDisplayName(userId: string, fullName: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName.trim() })
    .eq("id", userId);
  if (error) throw error;
}

/** Points available to spend (lifetime points minus redeemed ones). */
export function availablePoints(profile: Profile | null): number {
  if (!profile) return 0;
  return Math.max(0, profile.cumulative_points - profile.spent_points);
}

type PublicProfile = Pick<
  ProfileRow,
  "id" | "full_name" | "avatar_url" | "cumulative_points" | "current_co2_saved"
>;

function toEntry(row: PublicProfile): LeaderboardEntry {
  return {
    id: row.id,
    full_name: row.full_name,
    avatar_url: row.avatar_url,
    points: Number(row.cumulative_points) || 0,
    co2Kg: Number(row.current_co2_saved) || 0,
  };
}

/** All-time leaderboard ordered by lifetime points. */
export async function getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, cumulative_points, current_co2_saved")
    .order("cumulative_points", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toEntry);
}

export async function getProfilesByIds(ids: string[]): Promise<LeaderboardEntry[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, cumulative_points, current_co2_saved")
    .in("id", ids);
  if (error) throw error;
  return (data ?? []).map(toEntry);
}

/** 1-based global rank for a given points total. */
export async function getRank(points: number): Promise<number> {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .gt("cumulative_points", points);
  if (error) throw error;
  return (count ?? 0) + 1;
}

/** Points earned since a date (e.g. this week). Requires migration 0006. */
export async function getLeaderboardSince(
  since: Date,
  limit = 50,
  userIds?: string[],
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("leaderboard_since", {
    p_since: since.toISOString(),
    p_limit: limit,
    p_user_ids: userIds ?? null,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    full_name: r.full_name,
    avatar_url: r.avatar_url,
    points: Number(r.points) || 0,
    co2Kg: Number(r.co2_saved) || 0,
  }));
}
