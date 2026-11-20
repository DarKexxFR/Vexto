import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { AddressSearchInput } from "@/components/AddressSearchInput";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { MapView } from "@/components/map/MapView";
import { ModeOptionCard } from "@/components/ModeOptionCard";
import { NavigationOverlay, type NavResult } from "@/components/NavigationOverlay";
import { HeaderAvatar } from "@/components/HeaderAvatar";
import { ScreenContainer } from "@/components/ScreenContainer";
import { journeyPoints, journeySegments } from "@/components/transit/journeyMap";
import { JourneyCard, JourneySteps } from "@/components/transit/TransitViews";
import { VelibCard, VelibLegend } from "@/components/bikeshare/VelibViews";
import type { MapPoint } from "@/components/map/useMapSync";
import { inVelibArea, type BikeStation } from "@/domain/bikeshare";
import { fetchVelibStations } from "@/lib/velib";
import { TripCelebration, type CelebrationData } from "@/components/TripCelebration";
import { Banner, Chip, ScreenHeader, SectionHeader } from "@/components/ui";
import { MODES } from "@/constants/modes";
import { evaluateAchievements, newlyUnlocked } from "@/domain/achievements";
import { pointsForTrip } from "@/domain/carbon";
import { equivalencesFor } from "@/domain/equivalences";
import { forestState } from "@/domain/forest";
import { formatCo2, formatDuration, formatTime } from "@/domain/format";
import { levelForPoints } from "@/domain/levels";
import { isSamePlace, shortPlaceLabel, type Place } from "@/domain/places";
import {
  buildModeOptions,
  recommendedOption,
  type PlanContext,
  type RoutesByProfile,
} from "@/domain/routing";
import { computeStreak, summarizeTrips, type TripLike } from "@/domain/stats";
import { minutesUntil, transitLegs, type TransitJourney } from "@/domain/transit";
import { getKnownPosition, useCurrentLocation } from "@/hooks/useCurrentLocation";
import { config, isMapboxConfigured } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { lineString, point } from "@/lib/geo";
import { haptic } from "@/lib/haptics";
import { getRoutes } from "@/lib/mapbox";
import { refreshProfile } from "@/lib/sync";
import { fetchJourneys, isTransitSetupError, transitErrorMessage } from "@/lib/transit";
import { createTrip, rejectionMessage, toListItem, verifyTrip } from "@/lib/trips";
import { useAppNavigation } from "@/navigation/types";
import { useAppStore } from "@/store/useAppStore";
import { usePrefsStore, type FavoriteKind } from "@/store/usePrefsStore";
import { useWeatherStore } from "@/store/useWeatherStore";
import { colors } from "@/theme/colors";
import type { TripMode } from "@/types/database";

type RouteStatus = "idle" | "loading" | "success" | "error";

const MY_POSITION = "Ma position";

function achievementsFor(trips: TripLike[]) {
  return evaluateAchievements({ summary: summarizeTrips(trips), streak: computeStreak(trips), trips });
}

export function RouteScreen() {
  const navigation = useAppNavigation();
  const session = useAppStore((s) => s.session);
  const routeRequest = useAppStore((s) => s.routeRequest);
  const clearRouteRequest = useAppStore((s) => s.clearRouteRequest);
  const upsertTrip = useAppStore((s) => s.upsertTrip);
  const applyTripReward = useAppStore((s) => s.applyTripReward);

  const home = usePrefsStore((s) => s.home);
  const work = usePrefsStore((s) => s.work);
  const recents = usePrefsStore((s) => s.recents);
  const owned = usePrefsStore((s) => s.owned);
  const voiceGuidance = usePrefsStore((s) => s.voiceGuidance);
  const addRecent = usePrefsStore((s) => s.addRecent);
  const setFavorite = usePrefsStore((s) => s.setFavorite);
  const setVoiceGuidance = usePrefsStore((s) => s.setVoiceGuidance);
  const advice = useWeatherStore((s) => s.advice);

  const location = useCurrentLocation();
  const [start, setStart] = useState<Place | null>(null);
  const [end, setEnd] = useState<Place | null>(null);
  const [proximity, setProximity] = useState<[number, number] | null>(null);
  const [routes, setRoutes] = useState<RoutesByProfile | null>(null);
  const [routeStatus, setRouteStatus] = useState<RouteStatus>("idle");
  const [routeError, setRouteError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedMode, setSelectedMode] = useState<TripMode | null>(null);
  const [preferredMode, setPreferredMode] = useState<TripMode | null>(null);
  const [favoritePicker, setFavoritePicker] = useState(false);
  const [searching, setSearching] = useState(false);
  const [navVisible, setNavVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);
  const [journeys, setJourneys] = useState<TransitJourney[] | null>(null);
  const [journeysLoading, setJourneysLoading] = useState(false);
  const [journeyIdx, setJourneyIdx] = useState(0);
  const [transitNotice, setTransitNotice] = useState<{ setup: boolean; message: string } | null>(null);
  /** Trip awaiting upload; keeps the created id so a retry never duplicates it. */
  const pendingTrip = useRef<{ result: NavResult; tripId: string | null } | null>(null);

  const useMyPosition = async (): Promise<void> => {
    const coords = await location.request();
    if (!coords) return;
    setProximity(coords);
    setStart({ label: MY_POSITION, coords });
  };

  // Silently start from the current position when permission was granted.
  useEffect(() => {
    let alive = true;
    void getKnownPosition().then((pos) => {
      if (!alive || !pos) return;
      setProximity(pos);
      setStart((s) => s ?? { label: MY_POSITION, coords: pos });
    });
    return () => {
      alive = false;
    };
  }, []);

  // Requests coming from Home (shortcuts, weather coach).
  useEffect(() => {
    if (!routeRequest) return;
    if (routeRequest.to) setEnd(routeRequest.to);
    if (routeRequest.from) setStart(routeRequest.from);
    else if (routeRequest.to && !start) void useMyPosition();
    if (routeRequest.mode) {
      setPreferredMode(routeRequest.mode);
      setSelectedMode(null);
    }
    clearRouteRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeRequest]);

  // A new itinerary → let the recommendation pick again.
  useEffect(() => {
    setSelectedMode(null);
    setFavoritePicker(false);
  }, [start, end]);

  // Fetch every routing profile in parallel when both ends are known.
  useEffect(() => {
    if (!start || !end || !isMapboxConfigured) {
      setRoutes(null);
      setRouteStatus("idle");
      return;
    }
    const ac = new AbortController();
    setRouteStatus("loading");
    setRouteError(null);
    getRoutes(start.coords, end.coords, ac.signal)
      .then((r) => {
        setRoutes(r);
        setRouteStatus("success");
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setRoutes(null);
        setRouteStatus("error");
        setRouteError(e instanceof Error ? e.message : "Itinéraire indisponible.");
      });
    return () => ac.abort();
  }, [start, end, reloadKey]);

  // Real public transport itineraries (IDFM PRIM) with departure times.
  useEffect(() => {
    setJourneyIdx(0);
    if (!start || !end) {
      setJourneys(null);
      return;
    }
    let alive = true;
    setJourneysLoading(true);
    fetchJourneys(start.coords, end.coords)
      .then((list) => {
        if (!alive) return;
        setJourneys(list);
        setTransitNotice(null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setJourneys(null);
        setTransitNotice({ setup: isTransitSetupError(e), message: transitErrorMessage(e) });
      })
      .finally(() => alive && setJourneysLoading(false));
    return () => {
      alive = false;
    };
  }, [start, end, reloadKey]);

  // Vélib' stations: a bike near the start, a free dock near the destination.
  const [velibStart, setVelibStart] = useState<BikeStation[] | null>(null);
  const [velibEnd, setVelibEnd] = useState<BikeStation[] | null>(null);
  const [velibLoading, setVelibLoading] = useState(false);
  const [velibError, setVelibError] = useState<string | null>(null);
  const velibAvailable = !!start && !!end && inVelibArea(start.coords) && inVelibArea(end.coords);
  useEffect(() => {
    setVelibStart(null);
    setVelibEnd(null);
    setVelibError(null);
    if (!start || !end || !inVelibArea(start.coords) || !inVelibArea(end.coords)) return;
    const ac = new AbortController();
    setVelibLoading(true);
    Promise.all([
      fetchVelibStations(start.coords, { need: "rent", limit: 3, signal: ac.signal }),
      fetchVelibStations(end.coords, { need: "return", limit: 3, signal: ac.signal }),
    ])
      .then(([a, b]) => {
        setVelibStart(a);
        setVelibEnd(b);
      })
      .catch(() => {
        if (!ac.signal.aborted) setVelibError("Disponibilités Vélib' indisponibles pour le moment.");
      })
      .finally(() => {
        if (!ac.signal.aborted) setVelibLoading(false);
      });
    return () => ac.abort();
  }, [start, end, reloadKey]);

  const velibPoints = useMemo<MapPoint[] | null>(() => {
    const pts: MapPoint[] = [
      ...(velibStart ?? []).map((s) => ({ coordinates: s.coords, color: colors.leaf, label: `🚲 ${s.bikes}`, major: true })),
      ...(velibEnd ?? []).map((s) => ({ coordinates: s.coords, color: colors.leaf, label: `🅿️ ${s.docks}`, major: true })),
    ];
    return pts.length > 0 ? pts : null;
  }, [velibStart, velibEnd]);

  const selectedJourney = journeys?.[journeyIdx] ?? null;

  const planContext = useMemo<PlanContext>(() => {
    let transit: PlanContext["transit"] = null;
    if (selectedJourney) {
      const first = transitLegs(selectedJourney)[0];
      const line = first?.line ? `${first.line.kind === "bus" ? "Bus" : first.line.modeLabel} ${first.line.code}` : "Transports";
      const at = first?.departure ? ` à ${formatTime(first.departure)}` : "";
      const corr = selectedJourney.transfers > 0 ? ` · ${selectedJourney.transfers} corresp.` : "";
      transit = {
        durationMin: Math.max(selectedJourney.durationMin, minutesUntil(selectedJourney.arrival)),
        distanceKm: selectedJourney.distanceKm > 0 ? selectedJourney.distanceKm : (routes?.["driving-traffic"]?.distanceKm ?? 0),
        summary: `${line}${at}${corr} · horaires temps réel`,
        path: null,
      };
    }
    return {
      weather: advice ? { badForSoftModes: advice.badForSoftModes, reason: advice.reason } : null,
      owned: { bike: owned.bike, eScooter: owned.eScooter },
      transit,
    };
  }, [advice, owned, selectedJourney, routes]);
  const options = useMemo(() => (routes ? buildModeOptions(routes, planContext) : []), [routes, planContext]);
  const recommended = recommendedOption(options);
  const preferred = preferredMode
    ? options.find((o) => o.mode === preferredMode && o.feasibility !== "unrealistic")
    : undefined;
  const activeMode: TripMode | null = selectedMode ?? preferred?.mode ?? recommended?.mode ?? options[0]?.mode ?? null;
  const active = options.find((o) => o.mode === activeMode) ?? null;
  const hasRoute = routeStatus === "success" && active !== null;
  const activeMeta = activeMode ? MODES[activeMode] : null;
  const activeEquivalence = active ? (equivalencesFor(active.co2SavedKg, 1)[0] ?? null) : null;
  const transitSegments = useMemo(() => journeySegments(selectedJourney), [selectedJourney]);
  const transitPoints = useMemo(() => journeyPoints(selectedJourney), [selectedJourney]);

  const favoriteOf = (place: Place | null): FavoriteKind | null => {
    if (!place) return null;
    if (home && isSamePlace(home, place)) return "home";
    if (work && isSamePlace(work, place)) return "work";
    return null;
  };
  const endFavorite = favoriteOf(end);

  const quickPlaces = useMemo(() => {
    const list: Array<{ key: string; place: Place; icon: "home" | "briefcase" | "time-outline"; label: string }> = [];
    if (home) list.push({ key: "home", place: home, icon: "home", label: "Maison" });
    if (work) list.push({ key: "work", place: work, icon: "briefcase", label: "Travail" });
    for (const r of recents) {
      if (list.some((q) => isSamePlace(q.place, r))) continue;
      list.push({ key: `r-${r.label}`, place: r, icon: "time-outline", label: shortPlaceLabel(r.label) });
    }
    return list.slice(0, 7);
  }, [home, work, recents]);

  const selectEnd = (place: Place) => {
    setEnd(place);
    addRecent(place);
    if (!start) void useMyPosition();
  };

  const swap = () => {
    haptic.tap();
    setStart(end);
    setEnd(start);
  };

  const saveFavorite = (kind: FavoriteKind) => {
    if (!end) return;
    setFavorite(kind, { ...end });
    setFavoritePicker(false);
    haptic.success();
  };

  // Trip submission -------------------------------------------------------------------------
  const onFinishTrip = async (result: NavResult) => {
    setNavVisible(false);
    const userId = session?.user.id;
    if (!userId) {
      setCelebration({ kind: "error", message: "Vous devez être connecté pour enregistrer un trajet.", canRetry: false });
      return;
    }
    if (result.traveledKm < 0.05 || result.track.length < 2) {
      setCelebration({
        kind: "rejected",
        mode: result.mode,
        km: result.traveledKm,
        reason: "Trajet trop court pour être validé : parcourez au moins 50 m avec l'application ouverte.",
      });
      return;
    }

    pendingTrip.current = { result, tripId: null };
    await uploadTrip();
  };

  const uploadTrip = async () => {
    const pending = pendingTrip.current;
    const userId = session?.user.id;
    if (!pending || !userId) return;
    const { result } = pending;
    setSaving(true);
    const before = useAppStore.getState();
    const beforePoints = before.profile?.cumulative_points ?? summarizeTrips(before.trips).points;
    const beforeCo2 = before.profile?.current_co2_saved ?? summarizeTrips(before.trips).co2Kg;
    const beforeBadges = achievementsFor(before.trips);
    try {
      const first = result.track[0];
      if (!pending.tripId) {
        pending.tripId = await createTrip({
          userId,
          mode: result.mode,
          distanceKm: result.traveledKm,
          startLocation: first ? point(first[0], first[1]) : undefined,
          endLocation: end ? point(end.coords[0], end.coords[1]) : undefined,
          gpsTrack: lineString(result.track),
          startedAt: result.startedAt ?? undefined,
          endedAt: result.endedAt,
        });
      }
      const trip = await verifyTrip(pending.tripId);
      pendingTrip.current = null;
      const item = toListItem(trip);
      upsertTrip(item);

      if (item.status !== "verified") {
        setCelebration({
          kind: "rejected",
          mode: item.mode,
          km: item.distance_km,
          reason: rejectionMessage(item) ?? "Trajet refusé par la vérification.",
        });
      } else if (item.mode === "carThermal") {
        setCelebration({
          kind: "neutral",
          mode: item.mode,
          km: item.distance_km,
          message:
            "La voiture sert de référence : elle ne rapporte pas de points. La prochaine fois, testez le vélo ou les transports !",
        });
      } else {
        const points = item.points_awarded;
        const co2 = item.co2_saved_kg;
        applyTripReward(points, co2);
        const afterBadges = achievementsFor(useAppStore.getState().trips);
        const levelBefore = levelForPoints(beforePoints).current;
        const levelAfter = levelForPoints(beforePoints + points).current;
        const forestBefore = forestState(beforeCo2);
        const forestAfter = forestState(beforeCo2 + co2);
        setCelebration({
          kind: "verified",
          mode: item.mode,
          km: item.distance_km,
          points,
          co2Kg: co2,
          equivalence: equivalencesFor(co2, 1)[0] ?? null,
          levelUp: levelAfter.index > levelBefore.index ? levelAfter : null,
          newBadges: newlyUnlocked(beforeBadges, afterBadges),
          treesGained: forestAfter.trees - forestBefore.trees,
          newStageName: forestAfter.stage !== forestBefore.stage ? forestAfter.stageName : null,
          dailyCapHit: points + 1 < pointsForTrip(item.mode, item.distance_km),
        });
      }
      // Re-sync counters with the server's truth.
      void refreshProfile();
    } catch (e) {
      setCelebration({
        kind: "error",
        message: friendlyError(e, "Échec de l'enregistrement du trajet."),
        canRetry: true,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer>
      <ScreenHeader title="Trajet" subtitle="Comparez les modes, gagnez des points, faites pousser votre forêt." right={<HeaderAvatar />} />

      {/* Search */}
      <Card className="mb-3 p-3">
        <View className="flex-row items-center gap-2">
          <View className="flex-1 gap-2">
            <AddressSearchInput
              kind="start"
              placeholder="Point de départ"
              accessibilityLabel="Départ"
              value={start}
              proximity={proximity}
              onSelect={setStart}
              onClear={() => setStart(null)}
              onActiveChange={setSearching}
              rightAccessory={
                <Pressable
                  onPress={() => void useMyPosition()}
                  disabled={location.loading}
                  accessibilityRole="button"
                  accessibilityLabel="Utiliser ma position"
                  className="h-12 w-12 items-center justify-center rounded-xl bg-forest active:opacity-80"
                >
                  {location.loading ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Icon name="locate" size={20} color={colors.white} />
                  )}
                </Pressable>
              }
            />
            <AddressSearchInput
              kind="end"
              placeholder="Où allez-vous ?"
              accessibilityLabel="Destination"
              value={end}
              proximity={proximity}
              onSelect={selectEnd}
              onClear={() => setEnd(null)}
              onActiveChange={setSearching}
              rightAccessory={
                <Pressable
                  onPress={() => {
                    haptic.tap();
                    setFavoritePicker((v) => !v);
                  }}
                  disabled={!end}
                  accessibilityRole="button"
                  accessibilityLabel="Enregistrer comme favori"
                  className={`h-12 w-12 items-center justify-center rounded-xl border border-line ${end ? "active:opacity-70" : "opacity-40"}`}
                >
                  <Icon name={endFavorite ? "star" : "star-outline"} size={20} color={endFavorite ? colors.amber : colors.forest} />
                </Pressable>
              }
            />
          </View>
        </View>
        {start && end ? (
          <Pressable
            onPress={swap}
            accessibilityRole="button"
            accessibilityLabel="Inverser départ et destination"
            className="mt-2 flex-row items-center gap-1 self-start rounded-full px-2 py-1 active:opacity-60"
          >
            <Icon name="swap-vertical" size={15} color={colors.leaf} />
            <Text className="text-xs font-semibold text-leaf">Inverser</Text>
          </Pressable>
        ) : null}
        {location.error ? <Text className="ml-1 mt-2 text-xs text-danger">{location.error}</Text> : null}
        {favoritePicker && end ? (
          <View className="mt-3 flex-row flex-wrap items-center gap-2">
            <Text className="text-xs text-muted">Enregistrer comme :</Text>
            <Pressable onPress={() => saveFavorite("home")} className="active:opacity-70">
              <Chip label={endFavorite === "home" ? "Maison ✓" : "Maison"} icon="home-outline" tone="leaf" />
            </Pressable>
            <Pressable onPress={() => saveFavorite("work")} className="active:opacity-70">
              <Chip label={endFavorite === "work" ? "Travail ✓" : "Travail"} icon="briefcase-outline" tone="sky" />
            </Pressable>
          </View>
        ) : null}
      </Card>

      {/* Quick destinations */}
      {quickPlaces.length > 0 && !searching ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerClassName="gap-2">
          {quickPlaces.map((q) => (
            <Pressable
              key={q.key}
              onPress={() => {
                haptic.tap();
                selectEnd(q.place);
              }}
              accessibilityRole="button"
              className="flex-row items-center gap-1.5 rounded-full border border-line bg-card px-3 py-2 active:opacity-70"
            >
              <Icon name={q.icon} size={14} color={q.icon === "time-outline" ? colors.muted : colors.leaf} />
              <Text className="max-w-[140px] text-sm font-medium text-forest" numberOfLines={1}>
                {q.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {/* Map */}
      {!isMapboxConfigured ? (
        <Banner
          tone="warning"
          title="Token Mapbox manquant"
          message="Ajoutez MAPBOX_TOKEN (pk.…) dans .env pour activer la carte, la recherche d'adresse et les itinéraires."
        />
      ) : (
        <View className="mb-4">
          <MapView
            token={config.mapboxToken}
            start={start?.coords ?? null}
            end={end?.coords ?? null}
            routeGeometry={active?.path?.geometry ?? null}
            routeColor={activeMeta?.color}
            routeDashed={activeMode === "publicTransit"}
            segments={activeMode === "publicTransit" ? transitSegments : null}
            points={activeMode === "publicTransit" ? transitPoints : activeMode === "bike" ? velibPoints : null}
            height={230}
          />
        </View>
      )}

      {/* Status */}
      {routeStatus === "loading" ? (
        <Card className="mb-4 flex-row items-center gap-3">
          <ActivityIndicator color={colors.leaf} />
          <Text className="text-sm text-muted">Comparaison des modes de transport…</Text>
        </Card>
      ) : null}
      {routeStatus === "error" && routeError ? (
        <Banner
          tone="danger"
          title="Itinéraire indisponible"
          message={routeError}
          actionLabel="Réessayer"
          onAction={() => setReloadKey((k) => k + 1)}
        />
      ) : null}
      {saving ? (
        <Card className="mb-4 flex-row items-center gap-3">
          <ActivityIndicator color={colors.leaf} />
          <Text className="text-sm text-muted">Validation du trajet (anti-triche)…</Text>
        </Card>
      ) : null}

      {hasRoute && active && activeMeta ? (
        <>
          <SectionHeader title="Vos options" />
          <View className="mb-4 gap-2">
            {options.map((o) => (
              <ModeOptionCard
                key={o.mode}
                option={o}
                selected={o.mode === activeMode}
                onPress={() => setSelectedMode(o.mode)}
              />
            ))}
          </View>

          {activeMode === "bike" && velibAvailable ? (
            <>
              <SectionHeader title="Vélib' · temps réel" />
              <View className="mb-4 gap-2">
                <VelibCard
                  title="Prendre un vélo près du départ"
                  stations={velibStart}
                  loading={velibLoading}
                  error={velibError}
                  emptyText="Aucun vélo disponible dans un rayon de 600 m."
                />
                <VelibCard
                  title="Le reposer près de l'arrivée"
                  stations={velibEnd}
                  loading={velibLoading}
                  error={velibError}
                  emptyText="Aucune place libre dans un rayon de 600 m."
                />
                <VelibLegend />
              </View>
            </>
          ) : null}

          {activeMode === "publicTransit" ? (
            journeys && journeys.length > 0 ? (
              <>
                <SectionHeader title="Prochains départs · temps réel" />
                <View className="mb-4 gap-2">
                  {journeys.map((j, i) => (
                    <JourneyCard
                      key={j.id}
                      journey={j}
                      now={new Date()}
                      selected={i === journeyIdx}
                      fastest={i === 0 && journeys.length > 1}
                      onPress={() => setJourneyIdx(i)}
                    />
                  ))}
                </View>
                {selectedJourney ? (
                  <View className="mb-4">
                    <JourneySteps journey={selectedJourney} />
                  </View>
                ) : null}
              </>
            ) : journeysLoading ? (
              <Card className="mb-4 flex-row items-center gap-3">
                <ActivityIndicator color={colors.sky} />
                <Text className="text-sm text-muted">Recherche des prochains bus, métros et RER…</Text>
              </Card>
            ) : transitNotice ? (
              <Banner
                tone="info"
                title={transitNotice.setup ? "Horaires réels non configurés" : "Lignes indisponibles pour le moment"}
                message={`${transitNotice.message} Sans ce service, l'app ne peut pas vous dire quel bus, métro ou RER prendre : la durée affichée est seulement estimée.`}
                actionLabel={transitNotice.setup ? undefined : "Réessayer"}
                onAction={transitNotice.setup ? undefined : () => setReloadKey((k) => k + 1)}
              />
            ) : journeys && journeys.length === 0 ? (
              <Banner tone="info" message="Aucun transport en commun trouvé pour ce trajet à cette heure-ci." />
            ) : null
          ) : null}

          <LinearGradient
            colors={[colors.forest, colors.forestSoft]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 24, padding: 18, marginBottom: 14 }}
          >
            {active.mode === "carThermal" ? (
              <>
                <Text className="text-sm text-white/70">En voiture</Text>
                <Text className="mt-1 text-2xl font-extrabold text-white">0 point</Text>
                <Text className="text-sm text-white/70">
                  {formatCo2(active.emissionsKg)} de CO₂ émis · choisissez un autre mode pour gagner des points
                </Text>
              </>
            ) : (
              <>
                <Text className="text-sm text-white/70">
                  Si vous validez ce trajet en {activeMeta.shortLabel.toLowerCase()} · {formatDuration(active.durationMin)}
                </Text>
                <Text className="mt-1 text-3xl font-extrabold text-white">+{active.points} points</Text>
                <Text className="text-sm text-white/80">{formatCo2(active.co2SavedKg)} de CO₂ évité vs voiture</Text>
                {activeEquivalence ? (
                  <Text className="mt-1 text-xs text-white/60">
                    ≈ {activeEquivalence.equivalence.icon} {activeEquivalence.value} {activeEquivalence.label}
                  </Text>
                ) : null}
              </>
            )}
          </LinearGradient>

          <Button
            label={`Démarrer · ${activeMeta.shortLabel}`}
            icon="navigate"
            variant="secondary"
            onPress={() => setNavVisible(true)}
            disabled={saving}
          />
          <Text className="mt-3 text-center text-xs text-muted">
            {activeMode === "publicTransit"
              ? "En transports, votre trace GPS est comparée aux lignes officielles (anti-triche PostGIS)."
              : "Suivi GPS en temps réel avec guidage vocal. Les points sont recalculés côté serveur."}
          </Text>
        </>
      ) : routeStatus === "idle" ? (
        <Card>
          <View className="flex-row items-center gap-3">
            <Text className="text-3xl">🗺️</Text>
            <Text className="flex-1 text-sm text-muted">
              {start
                ? "Indiquez votre destination pour comparer transports, vélo, trottinette et marche."
                : "Indiquez un départ (ou touchez la cible pour votre position) et une destination."}
            </Text>
          </View>
        </Card>
      ) : null}

      <NavigationOverlay
        visible={navVisible}
        token={config.mapboxToken}
        mode={activeMode ?? "publicTransit"}
        destination={end}
        initialPath={active?.path ?? null}
        journey={activeMode === "publicTransit" ? selectedJourney : null}
        voiceEnabled={voiceGuidance}
        onToggleVoice={() => setVoiceGuidance(!voiceGuidance)}
        onFinish={(result) => {
          void onFinishTrip(result);
        }}
        onCancel={() => setNavVisible(false)}
      />

      <TripCelebration
        data={celebration}
        retrying={saving}
        onRetry={() => void uploadTrip()}
        onClose={() => {
          pendingTrip.current = null;
          setCelebration(null);
        }}
        onSeeForest={() => {
          setCelebration(null);
          navigation.navigate("Forest");
        }}
      />
    </ScreenContainer>
  );
}
