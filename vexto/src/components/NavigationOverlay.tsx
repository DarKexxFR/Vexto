import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MapWebView } from "@/components/MapWebView";
import { MODES } from "@/constants/modes";
import { co2SavedKg, pointsForTrip } from "@/domain/carbon";
import { formatCo2, formatKm } from "@/domain/format";
import { useTripTracker } from "@/hooks/useTripTracker";
import { getRoute, profileForMode, type RouteResult } from "@/lib/mapbox";
import type { GeoLineString, TripMode } from "@/types/database";

export interface TripResult {
  traveledKm: number;
  track: Array<[number, number]>;
}

interface NavigationOverlayProps {
  visible: boolean;
  token: string;
  mode: TripMode;
  start: [number, number] | null;
  end: [number, number] | null;
  routeGeometry: GeoLineString | null;
  plannedDistanceKm: number;
  onFinish: (result: TripResult) => void;
  onCancel: () => void;
}

export function NavigationOverlay({
  visible,
  token,
  mode,
  start,
  end,
  routeGeometry,
  plannedDistanceKm,
  onFinish,
  onCancel,
}: NavigationOverlayProps) {
  const insets = useSafeAreaInsets();
  const tracker = useTripTracker();
  const meta = MODES[mode];

  // Live navigation starts from the user's real position (like Waze): once we
  // get the first GPS fix we recompute the route from there to the destination.
  const [navStart, setNavStart] = useState<[number, number] | null>(null);
  const [navRoute, setNavRoute] = useState<RouteResult | null>(null);
  const recomputed = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (visible) {
      void tracker.start();
    } else {
      tracker.stop();
      setNavStart(null);
      setNavRoute(null);
      recomputed.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible || recomputed.current) return;
    const pos = tracker.position;
    if (!pos || !end) return;
    recomputed.current = true;
    setNavStart(pos);
    getRoute(pos, end, profileForMode(mode))
      .then((r) => {
        if (mounted.current) setNavRoute(r);
      })
      .catch(() => {
        // Keep the planned route as a fallback if recompute fails.
      });
  }, [visible, tracker.position, end, mode]);

  const displayRoute = navRoute?.geometry ?? routeGeometry;
  const displayPlannedKm = navRoute?.distanceKm ?? plannedDistanceKm;

  const handleFinish = () => {
    tracker.stop();
    onFinish({ traveledKm: tracker.traveledKm, track: tracker.track });
  };

  const handleCancel = () => {
    tracker.stop();
    onCancel();
  };

  const livePoints = pointsForTrip(mode, tracker.traveledKm);
  const liveCo2 = co2SavedKg(mode, tracker.traveledKm);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleCancel}>
      <View className="flex-1 bg-mineral">
        <MapWebView
          token={token}
          start={navStart ? null : start}
          end={end}
          routeGeometry={displayRoute}
          user={tracker.position}
          followUser
        />

        {/* Top live banner */}
        <View
          style={{ top: insets.top + 8 }}
          className="absolute left-4 right-4"
        >
          <View className="flex-row items-center justify-between rounded-2xl border border-line bg-card p-4">
            <View className="flex-row items-center gap-3">
              <Text className="text-2xl">{meta.icon}</Text>
              <View>
                <Text className="text-base font-bold text-forest">
                  {meta.label}
                </Text>
                <Text className="text-xs text-muted">
                  {tracker.status === "tracking"
                    ? "Navigation en cours…"
                    : tracker.status === "denied"
                      ? "Localisation refusée"
                      : "En attente du GPS…"}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={handleCancel}
              className="h-9 w-9 items-center justify-center rounded-full bg-line"
            >
              <Text className="text-base text-forest">✕</Text>
            </Pressable>
          </View>
        </View>

        {/* Bottom stats + finish */}
        <View
          style={{ paddingBottom: insets.bottom + 16 }}
          className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-line bg-card px-5 pt-4"
        >
          <View className="mb-4 flex-row justify-between">
            <View>
              <Text className="text-xs text-muted">Parcouru</Text>
              <Text className="text-lg font-bold text-forest">
                {formatKm(tracker.traveledKm)}
              </Text>
            </View>
            <View className="items-center">
              <Text className="text-xs text-muted">Prévu</Text>
              <Text className="text-lg font-bold text-forest">
                {formatKm(displayPlannedKm)}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-xs text-muted">Points (est.)</Text>
              <Text className="text-lg font-bold text-leaf">+{livePoints}</Text>
            </View>
          </View>

          {tracker.status === "denied" ? (
            <Text className="mb-3 text-center text-xs text-danger">
              Active la localisation pour suivre ton trajet en temps réel.
            </Text>
          ) : (
            <Text className="mb-3 text-center text-xs text-muted">
              {formatCo2(liveCo2)} de CO₂ évité jusqu'ici
            </Text>
          )}

          <Pressable
            onPress={handleFinish}
            className="h-13 items-center justify-center rounded-2xl bg-leaf py-4"
          >
            <Text className="text-base font-semibold text-white">
              Terminer le trajet
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
