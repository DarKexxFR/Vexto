import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";

import type { ProfileRow, TripMode } from "@/types/database";

/** A route the user is currently planning / has selected on the Trajet screen. */
export interface ActiveRoute {
  from: string;
  to: string;
  distanceKm: number;
  mode: TripMode;
}

export type AsyncStatus = "idle" | "loading" | "success" | "error";

interface AppState {
  session: Session | null;
  profile: ProfileRow | null;
  activeRoute: ActiveRoute | null;
  profileStatus: AsyncStatus;

  setSession: (session: Session | null) => void;
  setProfile: (profile: ProfileRow | null) => void;
  setProfileStatus: (status: AsyncStatus) => void;
  setActiveRoute: (route: ActiveRoute | null) => void;
  /** Optimistically bump local counters after a verified trip. */
  applyTripReward: (points: number, co2SavedKg: number) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  session: null,
  profile: null,
  activeRoute: null,
  profileStatus: "idle",

  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setProfileStatus: (profileStatus) => set({ profileStatus }),
  setActiveRoute: (activeRoute) => set({ activeRoute }),

  applyTripReward: (points, co2SavedKg) =>
    set((state) =>
      state.profile
        ? {
            profile: {
              ...state.profile,
              cumulative_points: state.profile.cumulative_points + points,
              current_co2_saved: state.profile.current_co2_saved + co2SavedKg,
            },
          }
        : {},
    ),

  reset: () =>
    set({ session: null, profile: null, activeRoute: null, profileStatus: "idle" }),
}));
