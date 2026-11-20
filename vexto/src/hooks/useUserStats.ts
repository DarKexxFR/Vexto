import { useMemo } from "react";

import { evaluateAchievements } from "@/domain/achievements";
import { forestState } from "@/domain/forest";
import { levelForPoints } from "@/domain/levels";
import {
  computeStreak,
  dailySeries,
  summarizeTrips,
  weekOverWeek,
} from "@/domain/stats";
import { availablePoints } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

/** Everything derived from the profile + trip history, memoised. */
export function useUserStats() {
  const trips = useAppStore((s) => s.trips);
  const profile = useAppStore((s) => s.profile);

  return useMemo(() => {
    const summary = summarizeTrips(trips);
    const streak = computeStreak(trips);
    const week = weekOverWeek(trips);
    const series = dailySeries(trips, 7);
    const achievements = evaluateAchievements({ summary, streak, trips });
    // Profile aggregates are the source of truth (server-maintained); the trip
    // list is only a fallback while the profile loads.
    const points = profile?.cumulative_points ?? summary.points;
    const co2Kg = profile?.current_co2_saved ?? summary.co2Kg;
    return {
      summary,
      streak,
      week,
      series,
      achievements,
      unlockedCount: achievements.filter((a) => a.unlocked).length,
      points,
      co2Kg,
      available: profile ? availablePoints(profile) : points,
      level: levelForPoints(points),
      forest: forestState(co2Kg),
    };
  }, [trips, profile]);
}
