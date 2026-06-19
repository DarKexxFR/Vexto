import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { AddressSearchInput } from "@/components/AddressSearchInput";
import { MapWebView } from "@/components/MapWebView";
import { NavigationOverlay, type TripResult } from "@/components/NavigationOverlay";
import { ScreenContainer } from "@/components/ScreenContainer";
import { MODES, ROUTE_MODES, estimateMinutes } from "@/constants/modes";
import { evaluateMode } from "@/domain/carbon";
import { formatCo2, formatDuration, formatKm } from "@/domain/format";
import { config, isMapboxConfigured } from "@/lib/config";
import {
  getRoute,
  profileForMode,
  reverseGeocode,
  type GeocodeResult,
  type RouteResult,
} from "@/lib/mapbox";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import { lineString, point } from "@/lib/geo";
import { submitTrip } from "@/lib/trips";
import { useAppStore } from "@/store/useAppStore";
import type { TripMode } from "@/types/database";
import { colors } from "@/theme/colors";

type Recap =
  | { state: "saving" }
  | { state: "error"; message: string }
  | {
      state: "done";
      mode: TripMode;
      km: number;
      points: number;
      co2: number;
      verified: boolean;
    };

interface Place {
  coords: [number, number];
  label: string;
}

type RouteStatus = "idle" | "loading" | "success" | "error";

export function RouteScreen() {
  const [start, setStart] = useState<Place | null>(null);
  const [end, setEnd] = useState<Place | null>(null);
  const [startLabel, setStartLabel] = useState<string | null>(null);

  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeStatus, setRouteStatus] = useState<RouteStatus>("idle");
  const [routeError, setRouteError] = useState<string | null>(null);

  const [selectedMode, setSelectedMode] = useState<TripMode>("publicTransit");
  const [navVisible, setNavVisible] = useState(false);
  const [recap, setRecap] = useState<Recap | null>(null);
  const location = useCurrentLocation();

  const session = useAppStore((s) => s.session);
  const applyTripReward = useAppStore((s) => s.applyTripReward);

  // Fetch a route matching the selected mode's profile whenever endpoints or
  // mode change, so distance/duration/geometry reflect how you'd travel.
  useEffect(() => {
    if (!start || !end) {
      setRoute(null);
      setRouteStatus("idle");
      return;
    }
    const ac = new AbortController();
    setRouteStatus("loading");
    setRouteError(null);
    getRoute(start.coords, end.coords, profileForMode(selectedMode), ac.signal)
      .then((res) => {
        setRoute(res);
        setRouteStatus("success");
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setRoute(null);
        setRouteStatus("error");
        setRouteError(e instanceof Error ? e.message : "Itinéraire indisponible.");
      });
    return () => ac.abort();
  }, [start, end, selectedMode]);

  const handleUseLocation = async () => {
    const coords = await location.request();
    if (!coords) return;
    let label = "Ma position";
    try {
      const reverse = await reverseGeocode(coords);
      if (reverse) label = reverse;
    } catch {
      // keep the fallback label
    }
    setStart({ coords, label });
    setStartLabel(label);
  };

  const onSelectStart = (r: GeocodeResult) => {
    setStart({ coords: r.coordinates, label: r.placeName });
    setStartLabel(null);
  };
  const onSelectEnd = (r: GeocodeResult) =>
    setEnd({ coords: r.coordinates, label: r.placeName });

  const distanceKm = route?.distanceKm ?? 0;

  const outcomes = useMemo(
    () =>
      ROUTE_MODES.map((mode) => ({
        meta: MODES[mode],
        eval: evaluateMode(mode, distanceKm),
        minutes: estimateMinutes(mode, distanceKm),
      })),
    [distanceKm],
  );

  const selected = outcomes.find((o) => o.meta.mode === selectedMode);
  const hasRoute = routeStatus === "success" && route !== null;

  const onFinishTrip = async (result: TripResult) => {
    setNavVisible(false);
    const userId = session?.user.id;
    if (!userId) {
      setRecap({ state: "error", message: "Vous devez être connecté." });
      return;
    }
    if (result.traveledKm < 0.05) {
      setRecap({
        state: "error",
        message: "Trajet trop court pour être validé (déplacez-vous un peu).",
      });
      return;
    }

    setRecap({ state: "saving" });
    try {
      const track = result.track;
      const first = track[0];
      const startPt = first ? point(first[0], first[1]) : undefined;
      const endPt = end ? point(end.coords[0], end.coords[1]) : undefined;
      const gpsTrack = track.length >= 2 ? lineString(track) : undefined;

      // Server recomputes CO2/points (ADEME) and runs the PostGIS anti-cheat.
      const trip = await submitTrip({
        userId,
        mode: selectedMode,
        distanceKm: result.traveledKm,
        startLocation: startPt,
        endLocation: endPt,
        gpsTrack,
      });

      const points = Number(trip.points_awarded);
      const co2 = Number(trip.co2_saved_kg);
      applyTripReward(points, co2);
      setRecap({
        state: "done",
        mode: selectedMode,
        km: result.traveledKm,
        points,
        co2,
        verified: trip.status === "verified",
      });
    } catch (e) {
      setRecap({
        state: "error",
        message:
          e instanceof Error ? e.message : "Échec de l'enregistrement du trajet.",
      });
    }
  };

  return (
    <ScreenContainer>
      <Text className="mb-1 mt-2 text-2xl font-bold text-forest">Trajet</Text>
      <Text className="mb-4 text-sm text-muted">
        Cherchez votre itinéraire, choisissez votre mode, puis lancez la
        navigation en temps réel.
      </Text>

      {!isMapboxConfigured ? (
        <Card className="mb-4 border-danger/40 bg-danger/5">
          <Text className="text-sm font-semibold text-danger">
            Token Mapbox manquant
          </Text>
          <Text className="mt-1 text-xs text-muted">
            Ajoutez votre token public Mapbox dans .env (MAPBOX_TOKEN) pour
            activer la carte, la recherche d'adresse et le calcul d'itinéraire.
          </Text>
        </Card>
      ) : (
        <View className="mb-4">
          <MapWebView
            token={config.mapboxToken}
            start={start?.coords ?? null}
            end={end?.coords ?? null}
            routeGeometry={route?.geometry ?? null}
            height={280}
          />
        </View>
      )}

      <AddressSearchInput
        label="Départ"
        placeholder="Adresse de départ"
        selectedLabel={startLabel}
        onSelect={onSelectStart}
        rightAccessory={
          <Pressable
            onPress={handleUseLocation}
            disabled={location.loading}
            className="h-12 w-12 items-center justify-center rounded-xl bg-forest"
          >
            {location.loading ? (
              <ActivityIndicator size="small" color={colors.card} />
            ) : (
              <Text className="text-lg">📍</Text>
            )}
          </Pressable>
        }
      />
      {location.error ? (
        <Text className="-mt-2 mb-2 text-xs text-danger">{location.error}</Text>
      ) : null}

      <AddressSearchInput
        label="Destination"
        placeholder="Où allez-vous ?"
        onSelect={onSelectEnd}
      />

      {routeStatus === "loading" ? (
        <Card className="mb-4 flex-row items-center gap-3">
          <ActivityIndicator color={colors.leaf} />
          <Text className="text-sm text-muted">Calcul de l'itinéraire…</Text>
        </Card>
      ) : null}

      {routeStatus === "error" ? (
        <Card className="mb-4 border-danger/40 bg-danger/5">
          <Text className="text-sm text-danger">{routeError}</Text>
        </Card>
      ) : null}

      {recap?.state === "saving" ? (
        <Card className="mb-4 flex-row items-center gap-3">
          <ActivityIndicator color={colors.leaf} />
          <Text className="text-sm text-muted">Validation du trajet…</Text>
        </Card>
      ) : null}

      {recap?.state === "error" ? (
        <Card className="mb-4 border-danger/40 bg-danger/5">
          <Text className="text-sm text-danger">{recap.message}</Text>
        </Card>
      ) : null}

      {recap?.state === "done" ? (
        <Card
          className={`mb-4 ${recap.verified ? "border-leaf bg-leaf/5" : "border-danger/40 bg-danger/5"}`}
        >
          <Text className="text-sm font-semibold text-forest">
            {recap.verified ? "Trajet validé ✅" : "Trajet enregistré"} ·{" "}
            {MODES[recap.mode].label}
          </Text>
          <Text className="mt-1 text-xs text-muted">
            {formatKm(recap.km)} · +{recap.points} points ·{" "}
            {formatCo2(recap.co2)} évité
          </Text>
          {!recap.verified ? (
            <Text className="mt-1 text-xs text-muted">
              {recap.mode === "publicTransit"
                ? "Trajet non vérifié sur une ligne de transport officielle (anti-triche)."
                : "Ce mode ne rapporte pas de points (référence voiture)."}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {hasRoute ? (
        <>
          <Card className="mb-4 flex-row items-center justify-between">
            <View>
              <Text className="text-xs text-muted">Distance</Text>
              <Text className="text-lg font-bold text-forest">
                {formatKm(distanceKm)}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-xs text-muted">
                Durée · {MODES[selectedMode].label}
              </Text>
              <Text className="text-lg font-bold text-forest">
                {formatDuration(route.durationMin)}
              </Text>
            </View>
          </Card>

          <Text className="mb-2 text-xs font-semibold uppercase text-muted">
            Choisissez votre mode
          </Text>
          <View className="mb-5 gap-2">
            {outcomes.map(({ meta, eval: outcome, minutes }) => {
              const active = meta.mode === selectedMode;
              return (
                <Pressable
                  key={meta.mode}
                  onPress={() => setSelectedMode(meta.mode)}
                >
                  <Card className={active ? "border-leaf bg-leaf/5" : ""}>
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-3">
                        <Text className="text-2xl">{meta.icon}</Text>
                        <View>
                          <Text className="text-sm font-semibold text-forest">
                            {meta.label}
                          </Text>
                          <Text className="text-xs text-muted">
                            {formatDuration(minutes)} ·{" "}
                            {formatCo2(outcome.emissionsKg)}
                          </Text>
                        </View>
                      </View>
                      <View className="items-end">
                        <Text className="text-base font-bold text-leaf">
                          +{outcome.points} pts
                        </Text>
                        <Text className="text-xs text-muted">
                          {formatCo2(outcome.co2SavedKg)} évité
                        </Text>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>

          {selected ? (
            <Card className="mb-4 bg-forest">
              <Text className="text-sm text-white/70">
                Si vous validez ce trajet
              </Text>
              <Text className="mt-1 text-2xl font-bold text-white">
                +{selected.eval.points} points
              </Text>
              <Text className="text-sm text-white/70">
                {formatCo2(selected.eval.co2SavedKg)} de CO₂ évité vs voiture
              </Text>
            </Card>
          ) : null}

          <Button
            label="Démarrer le trajet"
            variant="secondary"
            onPress={() => {
              setRecap(null);
              setNavVisible(true);
            }}
          />
          <Text className="mt-3 text-center text-xs text-muted">
            Suivi GPS en temps réel. Les points en transport en commun sont
            confirmés après validation (anti-triche PostGIS).
          </Text>
        </>
      ) : (
        <Card>
          <Text className="text-sm text-muted">
            Renseignez un départ et une destination pour comparer les modes de
            transport et estimer vos points.
          </Text>
        </Card>
      )}

      <NavigationOverlay
        visible={navVisible}
        token={config.mapboxToken}
        mode={selectedMode}
        start={start?.coords ?? null}
        end={end?.coords ?? null}
        routeGeometry={route?.geometry ?? null}
        plannedDistanceKm={distanceKm}
        onFinish={(result) => {
          void onFinishTrip(result);
        }}
        onCancel={() => setNavVisible(false)}
      />
    </ScreenContainer>
  );
}
