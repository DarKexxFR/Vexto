/**
 * "Mon trajet quotidien": home ↔ work with the next public transport journey
 * in real time — when to leave, which lines, arrival, and traffic alerts.
 */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { ALERT_STYLE, LineBadgeView } from "@/components/transit/TransitViews";
import { defaultCommuteDirection, leaveLabel, type CommuteDirection } from "@/domain/commute";
import { formatDuration, formatTime } from "@/domain/format";
import { shortPlaceLabel, type Place } from "@/domain/places";
import { minutesUntil, type TransitJourney } from "@/domain/transit";
import { haptic } from "@/lib/haptics";
import { fetchJourneys, isTransitSetupError, transitErrorMessage } from "@/lib/transit";
import { colors } from "@/theme/colors";

interface CommuteCardProps {
  home: Place;
  work: Place;
  /** Refetch trigger (screen focus, pull-to-refresh). */
  refreshKey: number;
  onOpen: (from: Place, to: Place) => void;
}

export function CommuteCard({ home, work, refreshKey, onOpen }: CommuteCardProps) {
  const [direction, setDirection] = useState<CommuteDirection>(() => defaultCommuteDirection());
  const [journey, setJourney] = useState<TransitJourney | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const from = direction === "toWork" ? home : work;
  const to = direction === "toWork" ? work : home;

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const list = await fetchJourneys(from.coords, to.coords, undefined, 3);
      setJourney(list[0] ?? null);
      setStatus(list.length > 0 ? "ready" : "empty");
      setError(null);
      setNow(new Date());
    } catch (e) {
      setJourney(null);
      setStatus("error");
      setError(isTransitSetupError(e) ? "Horaires temps réel non configurés." : transitErrorMessage(e));
    }
  }, [from.coords, to.coords]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Keep the countdown fresh.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, []);

  const transitLegs = journey?.legs.filter((l) => l.type === "transit" && l.line) ?? [];
  const first = transitLegs[0];
  const alert = journey?.legs.flatMap((l) => l.alerts)[0];
  const leaveIn = journey ? minutesUntil(journey.departure, now) : 0;

  return (
    <Card className="mb-4" onPress={() => onOpen(from, to)} accessibilityLabel={`Trajet vers ${direction === "toWork" ? "le travail" : "la maison"}`}>
      <View className="flex-row items-center gap-2">
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-leaf-soft">
          <Icon name={direction === "toWork" ? "briefcase-outline" : "home-outline"} size={18} color={colors.leaf} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-bold text-forest" numberOfLines={1}>
            {direction === "toWork" ? "Maison → Travail" : "Travail → Maison"}
          </Text>
          <Text className="text-xs text-muted" numberOfLines={1}>
            vers {shortPlaceLabel(to.label)}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            haptic.tap();
            setDirection((d) => (d === "toWork" ? "toHome" : "toWork"));
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Inverser le trajet"
          className="h-9 w-9 items-center justify-center rounded-full border border-line active:opacity-70"
        >
          <Icon name="swap-horizontal" size={18} color={colors.forest} />
        </Pressable>
      </View>

      {status === "loading" && !journey ? (
        <View className="mt-3 flex-row items-center gap-2">
          <ActivityIndicator size="small" color={colors.leaf} />
          <Text className="text-xs text-muted">Recherche du prochain départ…</Text>
        </View>
      ) : status === "error" ? (
        <Text className="mt-3 text-xs text-muted">{error}</Text>
      ) : status === "empty" || !journey ? (
        <Text className="mt-3 text-xs text-muted">Aucun transport en commun trouvé pour le moment.</Text>
      ) : (
        <>
          <View className="mt-3 flex-row items-end justify-between">
            <View>
              <Text className={`text-xl font-extrabold ${leaveIn <= 2 ? "text-amber" : "text-forest"}`}>{leaveLabel(leaveIn)}</Text>
              <Text className="text-xs text-muted">
                départ {formatTime(journey.departure)} · arrivée {formatTime(journey.arrival)} · {formatDuration(journey.durationMin)}
              </Text>
            </View>
          </View>
          <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
            {transitLegs.map((l, i) => (
              <View key={i} className="flex-row items-center gap-1.5">
                {i > 0 ? <Icon name="chevron-forward" size={12} color={colors.faint} /> : null}
                <LineBadgeView line={l.line!} size="sm" />
              </View>
            ))}
            {first ? (
              <Text className="ml-1 flex-1 text-xs text-muted" numberOfLines={1}>
                {first.departure ? `à ${formatTime(first.departure)} ` : ""}depuis {first.from}
              </Text>
            ) : null}
          </View>
          {alert ? (
            <View className="mt-2 flex-row items-start gap-1">
              <Icon name="warning" size={12} color={ALERT_STYLE[alert.level].fg} />
              <Text className="flex-1 text-[11px] font-semibold" style={{ color: ALERT_STYLE[alert.level].fg }} numberOfLines={2}>
                {alert.title}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </Card>
  );
}
