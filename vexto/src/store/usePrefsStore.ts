import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { pushRecent, type Place } from "@/domain/places";

export type OwnedVehicle = "car" | "bike" | "eScooter";
export type FavoriteKind = "home" | "work";

interface PrefsState {
  home: Place | null;
  work: Place | null;
  recents: Place[];
  owned: Record<OwnedVehicle, boolean>;
  voiceGuidance: boolean;
  /** Set once the user opened "Ma Forêt" (hides the "Nouveau" badge). */
  forestVisited: boolean;

  setFavorite: (kind: FavoriteKind, place: Place | null) => void;
  addRecent: (place: Place) => void;
  clearRecents: () => void;
  setOwned: (vehicle: OwnedVehicle, owned: boolean) => void;
  setVoiceGuidance: (on: boolean) => void;
  markForestVisited: () => void;
}

/** Device-local preferences, persisted across launches (AsyncStorage). */
export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      home: null,
      work: null,
      recents: [],
      owned: { car: true, bike: false, eScooter: false },
      voiceGuidance: true,
      forestVisited: false,

      setFavorite: (kind, place) => set(kind === "home" ? { home: place } : { work: place }),
      addRecent: (place) => set((s) => ({ recents: pushRecent(s.recents, place) })),
      clearRecents: () => set({ recents: [] }),
      setOwned: (vehicle, owned) => set((s) => ({ owned: { ...s.owned, [vehicle]: owned } })),
      setVoiceGuidance: (voiceGuidance) => set({ voiceGuidance }),
      markForestVisited: () => set({ forestVisited: true }),
    }),
    {
      name: "vexto-prefs",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
