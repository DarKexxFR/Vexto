import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";

import type { Place } from "@/domain/places";
import type { Profile } from "@/lib/profile";
import type { TripListItem } from "@/lib/trips";
import type { TripMode } from "@/types/database";

export type AsyncStatus = "idle" | "loading" | "success" | "error";

/** Ask the Trajet screen to plan a route (e.g. from a Home shortcut). */
export interface RouteRequest {
  /** Destination; omitted = only preselect a mode (weather coach). */
  to?: Place | null;
  /** Start place; omitted = use the current GPS position. */
  from?: Place | null;
  mode?: TripMode | null;
  nonce: number;
}

interface AppState {
  session: Session | null;
  profile: Profile | null;
  profileStatus: AsyncStatus;
  trips: TripListItem[];
  tripsStatus: AsyncStatus;
  routeRequest: RouteRequest | null;

  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setProfileStatus: (status: AsyncStatus) => void;
  setTrips: (trips: TripListItem[]) => void;
  setTripsStatus: (status: AsyncStatus) => void;
  /** Insert or replace a trip (newest first). */
  upsertTrip: (trip: TripListItem) => void;
  /** Optimistically bump local counters after a verified trip. */
  applyTripReward: (points: number, co2SavedKg: number) => void;
  /** Optimistically record spent points after a redemption. */
  applyRedemption: (pointsSpent: number) => void;
  requestRoute: (request: Omit<RouteRequest, "nonce">) => void;
  clearRouteRequest: () => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  session: null,
  profile: null,
  profileStatus: "idle",
  trips: [],
  tripsStatus: "idle",
  routeRequest: null,

  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setProfileStatus: (profileStatus) => set({ profileStatus }),
  setTrips: (trips) => set({ trips }),
  setTripsStatus: (tripsStatus) => set({ tripsStatus }),

  upsertTrip: (trip) =>
    set((state) => {
      const others = state.trips.filter((t) => t.id !== trip.id);
      return {
        trips: [trip, ...others].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
      };
    }),

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

  applyRedemption: (pointsSpent) =>
    set((state) =>
      state.profile
        ? { profile: { ...state.profile, spent_points: state.profile.spent_points + pointsSpent } }
        : {},
    ),

  requestRoute: (request) => set({ routeRequest: { ...request, nonce: Date.now() } }),
  clearRouteRequest: () => set({ routeRequest: null }),

  reset: () =>
    set({
      session: null,
      profile: null,
      profileStatus: "idle",
      trips: [],
      tripsStatus: "idle",
      routeRequest: null,
    }),
}));
