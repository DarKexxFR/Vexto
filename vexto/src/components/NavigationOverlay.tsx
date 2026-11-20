import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, McIcon } from "@/components/Icon";
import { ManeuverIcon } from "@/components/ManeuverIcon";
import { MapView } from "@/components/map/MapView";
import { journeyPoints, journeySegments } from "@/components/transit/journeyMap";
import { LineBadgeView } from "@/components/transit/TransitViews";
import { MODES } from "@/constants/modes";
import { co2SavedKg, pointsForTrip } from "@/domain/carbon";
import { formatClock, formatCo2, formatDistance, formatTime } from "@/domain/format";
import {
  bearingDeg,
  cumulativeDistances,
  guidanceFor,
  hasArrived,
  isOffRoute,
  maneuverGlyph,
  metersBetween,
  pickAnnouncement,
  projectOnLine,
  remainingMinutes,
  stepStarts,
} from "@/domain/navigation";
import { shortPlaceLabel, type Place } from "@/domain/places";
import { profileForMode, transitDurationMin, type RoutedPath } from "@/domain/routing";
import { formatWait, legInstruction, type TransitJourney, type TransitLeg } from "@/domain/transit";
import { useTripTracker } from "@/hooks/useTripTracker";
import { confirmAsync } from "@/lib/dialogs";
import { haptic } from "@/lib/haptics";
import { getRoute } from "@/lib/mapbox";
import { speak, stopSpeaking } from "@/lib/speech";
import { colors, shadows } from "@/theme/colors";
import type { TripMode } from "@/types/database";

export interface NavResult {
  mode: TripMode;
  traveledKm: number;
  track: Array<[number, number]>;
  startedAt: Date | null;
  endedAt: Date;
}

interface NavigationOverlayProps {
  visible: boolean;
  token: string;
  mode: TripMode;
  destination: Place | null;
  /** Planned path for the selected mode (re-planned from the first GPS fix). */
  initialPath: RoutedPath | null;
  /** Public transport itinerary to follow leg by leg (IDFM timetables). */
  journey?: TransitJourney | null;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  onFinish: (result: NavResult) => void;
  onCancel: () => void;
}

const KEEP_AWAKE_TAG = "vexto-navigation";
const REROUTE_COOLDOWN_MS = 15_000;

export function NavigationOverlay({
  visible,
  token,
  mode,
  destination,
  initialPath,
  journey = null,
  voiceEnabled,
  onToggleVoice,
  onFinish,
  onCancel,
}: NavigationOverlayProps) {
  const insets = useSafeAreaInsets();
  const tracker = useTripTracker();
  const meta = MODES[mode];
  // Transit follows rails/bus lanes the road router doesn't know: no turn-by-turn.
  const turnByTurn = mode !== "publicTransit";

  const [path, setPath] = useState<RoutedPath | null>(initialPath);
  const [rerouting, setRerouting] = useState(false);
  const [following, setFollowing] = useState(true);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [tick, setTick] = useState(0);
  const [legIndex, setLegIndex] = useState(0);
  // "Waiting" sections carry no instruction: the boarding banner already shows the countdown.
  const legs: TransitLeg[] = useMemo(() => (journey?.legs ?? []).filter((l) => l.type !== "wait"), [journey]);
  const currentLeg = journey ? (legs[legIndex] ?? null) : null;

  const spoken = useRef(new Set<string>());
  const offRouteCount = useRef(0);
  const lastReroute = useRef(0);
  const plannedFromFix = useRef(false);
  const arrivalAnnounced = useRef(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const voiceRef = useRef(voiceEnabled);
  voiceRef.current = voiceEnabled;

  const say = useCallback((text: string) => {
    if (voiceRef.current) speak(text);
  }, []);

  // Session lifecycle --------------------------------------------------------
  useEffect(() => {
    if (visible) {
      setPath(initialPath);
      setLegIndex(0);
      setArrived(false);
      setFollowing(true);
      spoken.current = new Set();
      offRouteCount.current = 0;
      plannedFromFix.current = false;
      arrivalAnnounced.current = false;
      void tracker.start();
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
      if (!journey) {
        say(
          turnByTurn
            ? "C'est parti !"
            : `C'est parti. Direction ${destination ? shortPlaceLabel(destination.label) : "votre destination"}.`,
        );
      }
    } else {
      tracker.stop();
      stopSpeaking();
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // 1-second clock for the stopwatch / ETA.
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [visible]);

  // Route geometry caches ------------------------------------------------------
  const line = path?.geometry.coordinates ?? null;
  const cum = useMemo(() => (line ? cumulativeDistances(line) : null), [line]);
  const starts = useMemo(() => (path ? stepStarts(path.steps) : []), [path]);
  const totalM = cum && cum.length > 0 ? (cum[cum.length - 1] ?? 0) : 0;

  const pos = tracker.position;
  const journeySegmentsMemo = useMemo(() => journeySegments(journey), [journey]);
  const journeyPointsMemo = useMemo(() => journeyPoints(journey), [journey]);
  const projection = useMemo(
    () => (pos && line && cum ? projectOnLine(pos, line, cum) : null),
    [pos, line, cum],
  );
  const guidance =
    turnByTurn && projection && path && path.steps.length > 0
      ? guidanceFor(projection.alongM, path.steps, starts, totalM)
      : null;
  const distToDestM = pos && destination ? metersBetween(pos, destination.coords) : null;

  const reroute = useCallback(
    async (from: [number, number], announce: boolean) => {
      if (!destination) return;
      lastReroute.current = Date.now();
      setRerouting(true);
      if (announce) say("Recalcul de l'itinéraire.");
      try {
        const fresh = await getRoute(from, destination.coords, profileForMode(mode));
        if (!visibleRef.current) return;
        spoken.current = new Set();
        setPath(fresh);
      } catch {
        // keep the previous path; we'll retry after the cooldown
      } finally {
        setRerouting(false);
      }
    },
    [destination, mode, say],
  );

  // React to every GPS fix ----------------------------------------------------------
  useEffect(() => {
    if (!visible || !pos || !destination) return;

    // Start from where the user really is (like Waze).
    if (turnByTurn && !plannedFromFix.current) {
      plannedFromFix.current = true;
      if (!projection || projection.distanceM > 30) {
        void reroute(pos, false);
        return;
      }
    }

    if (guidance && path) {
      const step = path.steps[guidance.stepIndex];
      const announcement = step
        ? pickAnnouncement(guidance.stepIndex, guidance.distanceToNextM, step.voice, spoken.current)
        : null;
      if (announcement) {
        announcement.keys.forEach((k) => spoken.current.add(k));
        say(announcement.text);
      }
    }

    if (turnByTurn && projection && !rerouting && !arrivalAnnounced.current) {
      offRouteCount.current = isOffRoute(projection.distanceM, tracker.accuracyM)
        ? offRouteCount.current + 1
        : 0;
      if (offRouteCount.current >= 3 && Date.now() - lastReroute.current > REROUTE_COOLDOWN_MS) {
        offRouteCount.current = 0;
        haptic.warning();
        void reroute(pos, true);
      }
    }

    if (distToDestM != null && !arrivalAnnounced.current && hasArrived(distToDestM, guidance?.remainingM ?? null)) {
      arrivalAnnounced.current = true;
      setArrived(true);
      haptic.success();
      say("Vous êtes arrivé à destination. Terminez le trajet pour valider vos points.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  // Transit itinerary: advance legs by position (near the leg's end) or, when
  // GPS is lost underground, by the timetable (scheduled arrival passed).
  useEffect(() => {
    if (!visible || !journey || !currentLeg || legIndex >= legs.length - 1) return;
    const nearEnd = pos && currentLeg.toCoords ? metersBetween(pos, currentLeg.toCoords) < 60 : false;
    const overdue = currentLeg.arrival ? Date.now() > currentLeg.arrival.getTime() + 60_000 : false;
    if (nearEnd || overdue) setLegIndex((i) => Math.min(i + 1, legs.length - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, tick, visible]);

  useEffect(() => {
    if (!visible || !currentLeg) return;
    const when =
      currentLeg.type === "transit" && currentLeg.departure ? ` Départ à ${formatTime(currentLeg.departure)}.` : "";
    say(`${legInstruction(currentLeg)}.${when}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legIndex, visible]);

  // Derived figures -------------------------------------------------------------------
  const elapsedS = tracker.getElapsedSeconds();
  const traveledKm = tracker.traveledKm;
  const remainingM = guidance?.remainingM ?? (distToDestM != null ? distToDestM * 1.25 : null);
  const etaMin = journey
    ? Math.max(0, (journey.arrival.getTime() - Date.now()) / 60_000)
    : remainingM == null
      ? null
      : turnByTurn && path
        ? remainingMinutes(remainingM, path.distanceKm, path.durationMin)
        : transitDurationMin(remainingM / 1000);
  const livePoints = pointsForTrip(mode, traveledKm);
  const liveCo2 = co2SavedKg(mode, traveledKm);
  const paused = tracker.status === "paused";

  const finish = async () => {
    if (!arrived) {
      const ok = await confirmAsync(
        "Terminer le trajet ?",
        "Vous n'êtes pas encore à destination. Les points seront calculés sur la distance parcourue.",
        "Terminer",
      );
      if (!ok) return;
    }
    tracker.stop();
    haptic.medium();
    onFinish({
      mode,
      traveledKm: tracker.traveledKm,
      track: tracker.track,
      startedAt: tracker.startedAt,
      endedAt: new Date(),
    });
  };

  const cancel = async () => {
    const ok =
      tracker.track.length < 2 ||
      (await confirmAsync("Abandonner le trajet ?", "Il ne sera pas enregistré et ne rapportera aucun point.", "Abandonner", true));
    if (!ok) return;
    tracker.stop();
    onCancel();
  };

  // Banner content ---------------------------------------------------------------------
  let banner: { icon: React.ReactNode; title: string; subtitle: string; tone: string; iconBg?: string };
  if (tracker.status === "denied") {
    banner = {
      icon: <Icon name="alert-circle-outline" size={30} color={colors.white} />,
      title: "Localisation refusée",
      subtitle: "Activez-la dans les réglages pour suivre votre trajet.",
      tone: colors.danger,
    };
  } else if (arrived) {
    banner = {
      icon: <McIcon name="flag-checkered" size={32} color={colors.white} />,
      title: "Vous êtes arrivé ! 🎉",
      subtitle: "Touchez « Terminer » pour valider vos points.",
      tone: colors.leaf,
    };
  } else if (journey && currentLeg) {
    const nextTransit = legs.slice(legIndex).find((l) => l.type === "transit");
    if (currentLeg.type === "transit" && currentLeg.line) {
      const boarded = currentLeg.departure ? Date.now() >= currentLeg.departure.getTime() : true;
      banner = {
        icon: <LineBadgeView line={currentLeg.line} size="md" />,
        title: boarded
          ? `Descendez à ${currentLeg.to}`
          : `${currentLeg.line.kind === "bus" ? "Bus" : currentLeg.line.modeLabel} ${currentLeg.line.code}${currentLeg.direction ? ` → ${currentLeg.direction}` : ""}`,
        subtitle: boarded
          ? `${currentLeg.stops} arrêt${currentLeg.stops > 1 ? "s" : ""} · arrivée ${currentLeg.arrival ? formatTime(currentLeg.arrival) : "—"}`
          : `Départ ${currentLeg.departure ? `${formatTime(currentLeg.departure)} (${formatWait(currentLeg.departure)})` : "imminent"} · ${currentLeg.from}`,
        tone: colors.forest,
        iconBg: colors.white,
      };
    } else if (currentLeg.type === "transfer" || currentLeg.type === "wait") {
      banner = {
        icon: <McIcon name="transit-transfer" size={30} color={colors.white} />,
        title: `Correspondance à ${currentLeg.from}`,
        subtitle: nextTransit?.line
          ? `Puis ${nextTransit.line.modeLabel} ${nextTransit.line.code}${nextTransit.departure ? ` à ${formatTime(nextTransit.departure)}` : ""}`
          : `${currentLeg.durationMin} min`,
        tone: colors.forest,
      };
    } else {
      banner = {
        icon: <McIcon name="walk" size={30} color={colors.white} />,
        title: `Marchez jusqu'à ${currentLeg.to || (destination ? shortPlaceLabel(destination.label) : "destination")}`,
        subtitle: nextTransit?.line
          ? `${currentLeg.durationMin} min · ${nextTransit.line.modeLabel} ${nextTransit.line.code}${nextTransit.departure ? ` à ${formatTime(nextTransit.departure)}` : ""}`
          : `Environ ${Math.max(1, currentLeg.durationMin)} min`,
        tone: colors.forest,
      };
    }
  } else if (!pos) {
    banner = {
      icon: <Icon name="locate" size={28} color={colors.white} />,
      title: "Recherche du signal GPS…",
      subtitle: "Restez à découvert quelques secondes.",
      tone: colors.forest,
    };
  } else if (!turnByTurn) {
    const bearing = destination ? bearingDeg(pos, destination.coords) : 0;
    const heading = tracker.headingDeg ?? 0;
    banner = {
      icon: (
        <View style={{ transform: [{ rotate: `${bearing - heading}deg` }] }}>
          <Icon name="navigate" size={28} color={colors.white} />
        </View>
      ),
      title: destination ? shortPlaceLabel(destination.label) : "Destination",
      subtitle:
        distToDestM != null ? `À ${formatDistance(distToDestM / 1000)} à vol d'oiseau · bon voyage !` : "En route",
      tone: colors.sky,
    };
  } else if (rerouting || !guidance) {
    banner = {
      icon: <Icon name="sync-outline" size={28} color={colors.white} />,
      title: rerouting ? "Recalcul de l'itinéraire…" : "Calcul de l'itinéraire…",
      subtitle: "Un instant",
      tone: colors.forest,
    };
  } else {
    const next = guidance.next;
    banner = {
      icon: <ManeuverIcon glyph={next ? maneuverGlyph(next) : "arrive"} size={36} />,
      title: next ? formatDistance(guidance.distanceToNextM / 1000) : "Destination",
      subtitle: next?.instruction ?? "Continuez jusqu'à destination",
      tone: colors.forest,
    };
  }

  const routeColor = meta.color;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => void cancel()}>
      <View className="flex-1 bg-mineral">
        <MapView
          token={token}
          start={null}
          end={destination?.coords ?? null}
          routeGeometry={path?.geometry ?? null}
          routeColor={routeColor}
          routeDashed={!turnByTurn}
          segments={journeySegmentsMemo}
          points={journeyPointsMemo}
          traveled={tracker.track}
          user={pos}
          heading={tracker.headingDeg}
          followUser
          recenterSignal={recenterSignal}
          onUserPan={() => setFollowing(false)}
        />

        {/* Top maneuver banner */}
        <View style={{ top: insets.top + 8 }} className="absolute left-3 right-3">
          <View style={[{ backgroundColor: banner.tone }, shadows.floating]} className="flex-row items-center gap-3 rounded-3xl p-4">
            <View
              className="h-14 w-14 items-center justify-center rounded-2xl bg-white/15"
              style={banner.iconBg ? { backgroundColor: banner.iconBg } : undefined}
            >
              {banner.icon}
            </View>
            <View className="flex-1">
              <Text className="text-xl font-extrabold text-white" numberOfLines={2}>
                {banner.title}
              </Text>
              <Text className="text-sm text-white/85" numberOfLines={2}>
                {banner.subtitle}
              </Text>
            </View>
            <Pressable
              onPress={() => void cancel()}
              accessibilityRole="button"
              accessibilityLabel="Quitter la navigation"
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full bg-white/20"
            >
              <Icon name="close" size={18} color={colors.white} />
            </Pressable>
          </View>
          {journey && !arrived && legIndex < legs.length - 1 ? (
            <Pressable
              onPress={() => {
                haptic.tap();
                setLegIndex((i) => Math.min(i + 1, legs.length - 1));
              }}
              accessibilityRole="button"
              className="mt-2 flex-row items-center gap-1 self-end rounded-full bg-card px-3 py-1.5 active:opacity-70"
              style={shadows.soft}
            >
              <Text className="text-xs font-bold text-forest">
                Étape {legIndex + 1}/{legs.length} · suivante
              </Text>
              <Icon name="chevron-forward" size={14} />
            </Pressable>
          ) : null}
          {paused ? (
            <View className="mt-2 self-center rounded-full bg-amber px-3 py-1">
              <Text className="text-xs font-bold text-white">En pause · la distance n'est pas comptée</Text>
            </View>
          ) : null}
        </View>

        {/* Recenter */}
        {!following ? (
          <Pressable
            onPress={() => {
              setRecenterSignal((n) => n + 1);
              setFollowing(true);
            }}
            accessibilityRole="button"
            style={[{ bottom: insets.bottom + 236 }, shadows.floating]}
            className="absolute right-4 flex-row items-center gap-1.5 rounded-full bg-card px-4 py-2.5"
          >
            <Icon name="locate" size={16} color={colors.sky} />
            <Text className="text-sm font-semibold text-forest">Recentrer</Text>
          </Pressable>
        ) : null}

        {/* Bottom panel */}
        <View
          style={[{ paddingBottom: insets.bottom + 14 }, shadows.floating]}
          className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-card px-5 pt-4"
        >
          <View className="mb-3 flex-row items-center gap-2">
            <View className="h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: meta.tint }}>
              <McIcon name={meta.icon} size={16} color={meta.color} />
            </View>
            <Text className="flex-1 text-sm font-semibold text-forest" numberOfLines={1}>
              {meta.label}
              {destination ? ` → ${shortPlaceLabel(destination.label)}` : ""}
            </Text>
            <Text className="text-sm font-extrabold text-leaf">+{livePoints} pts</Text>
          </View>

          <View className="mb-3 flex-row justify-between rounded-2xl bg-mineral px-4 py-3">
            <View>
              <Text className="text-xs text-muted">Temps</Text>
              <Text className="text-lg font-extrabold text-forest">{formatClock(elapsedS)}</Text>
            </View>
            <View className="items-center">
              <Text className="text-xs text-muted">Parcouru</Text>
              <Text className="text-lg font-extrabold text-forest">{formatDistance(traveledKm)}</Text>
            </View>
            <View className="items-end">
              <Text className="text-xs text-muted">{etaMin != null ? "Arrivée" : "Restant"}</Text>
              <Text className="text-lg font-extrabold text-forest">
                {etaMin != null ? formatTime(new Date(Date.now() + etaMin * 60_000)) : "—"}
              </Text>
            </View>
          </View>

          <Text className="mb-3 text-center text-xs text-muted">
            {mode === "carThermal"
              ? "Mode voiture : trajet de référence, sans points."
              : `${formatCo2(liveCo2)} de CO₂ évité jusqu'ici`}
          </Text>

          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => {
                haptic.tap();
                if (paused) tracker.resume();
                else tracker.pause();
              }}
              accessibilityRole="button"
              accessibilityLabel={paused ? "Reprendre" : "Pause"}
              className="h-14 w-14 items-center justify-center rounded-2xl border border-line active:opacity-70"
            >
              <Icon name={paused ? "play" : "pause"} size={22} />
            </Pressable>
            <Pressable
              onPress={() => {
                haptic.tap();
                if (voiceEnabled) stopSpeaking();
                onToggleVoice();
              }}
              accessibilityRole="switch"
              accessibilityState={{ checked: voiceEnabled }}
              accessibilityLabel="Guidage vocal"
              className="h-14 w-14 items-center justify-center rounded-2xl border border-line active:opacity-70"
            >
              <Icon name={voiceEnabled ? "volume-high-outline" : "volume-mute-outline"} size={22} />
            </Pressable>
            <Pressable
              onPress={() => void finish()}
              accessibilityRole="button"
              className={`h-14 flex-1 flex-row items-center justify-center gap-2 rounded-2xl active:opacity-80 ${arrived ? "bg-leaf" : "bg-forest"}`}
            >
              <Icon name="flag" size={18} color={colors.white} />
              <Text className="text-base font-bold text-white">Terminer le trajet</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
