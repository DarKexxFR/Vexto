/**
 * Visual building blocks for public transport: official line badges, next
 * departures rows and journey cards.
 */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Icon, McIcon, type McIconName } from "@/components/Icon";
import { formatDuration, formatTime } from "@/domain/format";
import {
  formatWait,
  minutesUntil,
  type DepartureGroup,
  type LineBadge,
  type TransitJourney,
  type TransitModeKind,
} from "@/domain/transit";
import { haptic } from "@/lib/haptics";
import { colors } from "@/theme/colors";

export const KIND_ICON: Record<TransitModeKind, McIconName> = {
  rer: "train",
  metro: "subway-variant",
  train: "train-variant",
  tram: "tram",
  cable: "gondola",
  bus: "bus",
  other: "bus",
};

const KIND_LABEL: Record<TransitModeKind, string> = {
  rer: "RER",
  metro: "Métro",
  train: "Train",
  tram: "Tram",
  cable: "Câble",
  bus: "Bus",
  other: "Ligne",
};

interface LineBadgeViewProps {
  line: LineBadge;
  size?: "sm" | "md" | "lg";
}

/** Mode icon + official line colour pill ("RER A", "M 1", "38"). */
export function LineBadgeView({ line, size = "md" }: LineBadgeViewProps) {
  const dims = { sm: { h: 22, font: 12, icon: 14 }, md: { h: 28, font: 14, icon: 17 }, lg: { h: 40, font: 20, icon: 24 } }[size];
  const round = line.kind === "metro" || line.kind === "rer";
  return (
    <View
      className="flex-row items-center gap-1"
      accessibilityLabel={`${KIND_LABEL[line.kind]} ${line.code}`}
    >
      <McIcon name={KIND_ICON[line.kind]} size={dims.icon} color={colors.forest} />
      <View
        style={{
          minWidth: dims.h,
          height: dims.h,
          borderRadius: round ? dims.h / 2 : 6,
          backgroundColor: line.color,
          paddingHorizontal: line.code.length > 2 ? 6 : 0,
        }}
        className="items-center justify-center"
      >
        <Text style={{ color: line.textColor, fontSize: dims.font }} className="font-extrabold" numberOfLines={1}>
          {line.code}
        </Text>
      </View>
    </View>
  );
}

interface DepartureRowProps {
  group: DepartureGroup;
  now: Date;
  onPress?: () => void;
}

/** "RER B → Aéroport CDG · 3 min · 11 min · 19 min" */
export function DepartureRow({ group, now, onPress }: DepartureRowProps) {
  const content = (
    <View className="flex-row items-center gap-3 py-2.5">
      <LineBadgeView line={group.line} />
      <View className="flex-1">
        <Text className="text-sm font-semibold text-forest" numberOfLines={1}>
          {group.direction || "Direction inconnue"}
        </Text>
        <View className="mt-1 flex-row flex-wrap gap-1.5">
          {group.times.slice(0, 3).map((t, i) => {
            const soon = minutesUntil(t.at, now) <= 2;
            return (
              <View
                key={`${t.at.getTime()}-${i}`}
                className={`flex-row items-center gap-1 rounded-md px-2 py-0.5 ${i === 0 ? (soon ? "bg-amber-soft" : "bg-leaf-soft") : "bg-mineral"}`}
              >
                {t.realtime ? <Icon name="radio-outline" size={10} color={i === 0 ? colors.leaf : colors.muted} /> : null}
                <Text className={`text-xs ${i === 0 ? "font-extrabold text-forest" : "font-semibold text-muted"}`}>
                  {formatWait(t.at, now)}
                </Text>
                {t.delayMin >= 2 ? <Text className="text-[10px] font-bold text-danger">+{t.delayMin}</Text> : null}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
      className="active:opacity-70"
    >
      {content}
    </Pressable>
  );
}

interface JourneyCardProps {
  journey: TransitJourney;
  now: Date;
  selected: boolean;
  /** Arrives first among the proposed journeys. */
  fastest?: boolean;
  onPress: () => void;
}

/** One transit itinerary: leave at…, lines used, arrive at… */
export function JourneyCard({ journey, now, selected, fastest = false, onPress }: JourneyCardProps) {
  const firstTransit = journey.legs.find((l) => l.type === "transit");
  const leaveIn = minutesUntil(journey.departure, now);
  const boardIn = firstTransit?.departure ? minutesUntil(firstTransit.departure, now) : null;
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`Départ ${formatTime(journey.departure)}, arrivée ${formatTime(journey.arrival)}`}
      className={`rounded-2xl bg-card p-3.5 active:opacity-80 ${selected ? "border-2 border-sky" : "border border-line"}`}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-baseline gap-1.5">
          <Text className="text-lg font-extrabold text-forest">{formatTime(journey.departure)}</Text>
          <Icon name="arrow-forward" size={13} color={colors.muted} />
          <Text className="text-lg font-extrabold text-forest">{formatTime(journey.arrival)}</Text>
        </View>
        <View className="items-end">
          <Text className="text-sm font-bold text-forest">{formatDuration(journey.durationMin)}</Text>
          {fastest ? (
            <View className="mt-0.5 rounded-md bg-leaf-soft px-1.5 py-0.5">
              <Text className="text-[10px] font-bold text-leaf">⚡ Le plus rapide</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
        {journey.legs.map((leg, i) => {
          if (leg.type === "transit" && leg.line) {
            return (
              <View key={i} className="flex-row items-center gap-1.5">
                {i > 0 ? <Icon name="chevron-forward" size={12} color={colors.faint} /> : null}
                <LineBadgeView line={leg.line} size="sm" />
              </View>
            );
          }
          if (leg.type === "walk" && leg.durationMin > 0) {
            return (
              <View key={i} className="flex-row items-center gap-1">
                {i > 0 ? <Icon name="chevron-forward" size={12} color={colors.faint} /> : null}
                <McIcon name="walk" size={15} color={colors.muted} />
                <Text className="text-xs text-muted">{leg.durationMin}</Text>
              </View>
            );
          }
          return null;
        })}
      </View>

      <View className="mt-2 gap-1">
        {journey.legs.map((leg, i) =>
          leg.type === "transit" && leg.line ? (
            <View key={i} className="flex-row items-center gap-2">
              <View style={{ width: 4, alignSelf: "stretch", borderRadius: 2, backgroundColor: leg.line.color }} />
              <Text className="flex-1 text-xs text-forest" numberOfLines={2}>
                <Text className="font-bold">{leg.from}</Text>
                {" → "}
                <Text className="font-bold">{leg.to}</Text>
                <Text className="text-muted">
                  {` · ${leg.line.kind === "bus" ? "bus" : leg.line.modeLabel} ${leg.line.code} · ${leg.stops} arrêt${leg.stops > 1 ? "s" : ""}`}
                </Text>
              </Text>
            </View>
          ) : null,
        )}
      </View>

      <Text className="mt-2 text-xs text-muted" numberOfLines={2}>
        {leaveIn <= 0 ? "Partez maintenant" : `Partez dans ${leaveIn} min`}
        {firstTransit && boardIn != null
          ? ` · ${firstTransit.line?.kind === "bus" ? "bus" : firstTransit.line?.modeLabel ?? ""} ${firstTransit.line?.code ?? ""} à ${formatTime(firstTransit.departure as Date)} depuis ${firstTransit.from}`
          : ""}
        {journey.transfers > 0 ? ` · ${journey.transfers} corresp.` : ""}
      </Text>
      {firstTransit?.realtime ? (
        <View className="mt-1 flex-row items-center gap-1">
          <Icon name="radio-outline" size={11} color={colors.leaf} />
          <Text className="text-[11px] font-semibold text-leaf">
            Temps réel{firstTransit.delayMin >= 2 ? ` · retard ${firstTransit.delayMin} min` : ""}
          </Text>
        </View>
      ) : null}
      {journey.status ? <Text className="mt-1 text-[11px] font-semibold text-danger">Perturbations sur ce trajet</Text> : null}
    </Pressable>
  );
}

interface JourneyStepsProps {
  journey: TransitJourney;
}

/**
 * Step-by-step plan of the selected itinerary, so you know exactly which line
 * to take: "Prenez le RER B direction Aéroport CDG à Châtelet (08:42) →
 * descendez à Gare du Nord (2 arrêts)".
 */
export function JourneySteps({ journey }: JourneyStepsProps) {
  const steps = journey.legs.filter((l) => l.type !== "wait" && !(l.type === "walk" && l.durationMin <= 0));
  return (
    <View className="rounded-2xl border border-line bg-card p-3.5">
      <Text className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Votre itinéraire étape par étape</Text>
      {steps.map((leg, i) => {
        const last = i === steps.length - 1;
        if (leg.type === "transit" && leg.line) {
          const what = leg.line.kind === "bus" ? `le bus ${leg.line.code}` : `le ${leg.line.modeLabel} ${leg.line.code}`;
          return (
            <View key={i} className="flex-row gap-3">
              <View className="items-center">
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: leg.line.color, marginTop: 6 }} />
                {!last ? <View style={{ width: 4, flex: 1, backgroundColor: leg.line.color, opacity: 0.6 }} /> : null}
              </View>
              <View className="flex-1 pb-3">
                <View className="flex-row flex-wrap items-center gap-2">
                  <LineBadgeView line={leg.line} size="md" />
                  {leg.departure ? <Text className="text-sm font-extrabold text-forest">{formatTime(leg.departure)}</Text> : null}
                  {leg.realtime && leg.delayMin >= 2 ? (
                    <Text className="text-xs font-bold text-danger">retard {leg.delayMin} min</Text>
                  ) : null}
                </View>
                <Text className="mt-1 text-sm text-forest">
                  Prenez <Text className="font-bold">{what}</Text>
                  {leg.direction ? (
                    <>
                      {" "}direction <Text className="font-bold">{leg.direction}</Text>
                    </>
                  ) : null}
                </Text>
                <Text className="text-xs text-muted">Montez à {leg.from}</Text>
                <Text className="mt-1 text-sm text-forest">
                  Descendez à <Text className="font-bold">{leg.to}</Text>
                </Text>
                <Text className="text-xs text-muted">
                  {leg.stops} arrêt{leg.stops > 1 ? "s" : ""} · {formatDuration(leg.durationMin)}
                  {leg.arrival ? ` · arrivée ${formatTime(leg.arrival)}` : ""}
                </Text>
                <StopList names={leg.stopList.map((st) => st.name)} color={leg.line.color} />
              </View>
            </View>
          );
        }
        const label =
          leg.type === "transfer"
            ? `Correspondance à pied à ${leg.from}${leg.to && leg.to !== leg.from ? ` vers ${leg.to}` : ""}`
            : `Marchez jusqu'à ${last ? "votre destination" : leg.to || "l'arrêt"}`;
        return (
          <View key={i} className="flex-row gap-3">
            <View className="items-center" style={{ width: 12 }}>
              <McIcon name="walk" size={14} color={colors.muted} />
              {!last ? <View style={{ width: 2, flex: 1, borderLeftWidth: 2, borderStyle: "dotted", borderColor: colors.faint }} /> : null}
            </View>
            <View className="flex-1 pb-3">
              <Text className="text-sm text-forest">{label}</Text>
              <Text className="text-xs text-muted">{formatDuration(Math.max(1, leg.durationMin))} à pied</Text>
            </View>
          </View>
        );
      })}
      <Text className="text-xs font-semibold text-forest">Arrivée prévue à {formatTime(journey.arrival)}</Text>
    </View>
  );
}

/** "Voir les 6 arrêts" → every station / stop of the ride, boarding and exit in bold. */
function StopList({ names, color }: { names: string[]; color: string }) {
  const [open, setOpen] = useState(false);
  if (names.length < 2) return null;
  return (
    <View className="mt-1">
      <Pressable
        onPress={() => {
          haptic.tap();
          setOpen((v) => !v);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        hitSlop={6}
        className="flex-row items-center gap-1 self-start"
      >
        <Text className="text-xs font-bold text-sky">
          {open ? "Masquer les arrêts" : `Voir les ${names.length} arrêts`}
        </Text>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={12} color={colors.sky} />
      </Pressable>
      {open ? (
        <View className="mt-1.5">
          {names.map((name, i) => {
            const edge = i === 0 || i === names.length - 1;
            return (
              <View key={`${name}-${i}`} className="flex-row items-center gap-2 py-0.5">
                <View
                  style={{
                    width: edge ? 10 : 6,
                    height: edge ? 10 : 6,
                    borderRadius: 5,
                    marginHorizontal: edge ? 0 : 2,
                    backgroundColor: edge ? color : colors.card,
                    borderWidth: 2,
                    borderColor: color,
                  }}
                />
                <Text className={`text-xs ${edge ? "font-bold text-forest" : "text-muted"}`}>{name}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
