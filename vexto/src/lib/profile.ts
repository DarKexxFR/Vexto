import { supabase } from "@/lib/supabase";
import type { ProfileRow } from "@/types/database";

export async function getProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface LeaderboardEntry {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  cumulative_points: number;
  current_co2_saved: number;
}

/** Global leaderboard ordered by points. */
export async function getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, cumulative_points, current_co2_saved")
    .order("cumulative_points", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
