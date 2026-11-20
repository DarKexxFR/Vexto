/** "Mon bilan du mois": a shareable monthly recap with month navigation. */
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon, McIcon } from "@/components/Icon";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Chip, EmptyState, ProgressBar, ScreenHeader, SectionHeader, StatTile } from "@/components/ui";
import { MODES } from "@/constants/modes";
import { equivalencesFor } from "@/domain/equivalences";
import { formatChange, formatCo2, formatDecimal, formatInt } from "@/domain/format";
import { monthLabel, monthRecap, recapMonths, recapShareText } from "@/domain/recap";
import { LOW_CARBON_MODES } from "@/domain/stats";
import { haptic } from "@/lib/haptics";
import { shareText } from "@/lib/share";
import { useAppNavigation } from "@/navigation/types";
import { useAppStore } from "@/store/useAppStore";
import { colors } from "@/theme/colors";

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export function RecapScreen() {
  const navigation = useAppNavigation();
  const trips = useAppStore((s) => s.trips);
  const months = useMemo(() => recapMonths(trips), [trips]);
  const [index, setIndex] = useState(0);
  const current = months[Math.min(index, months.length - 1)] ?? { year: new Date().getFullYear(), month: new Date().getMonth() };
  const r = useMemo(() => monthRecap(trips, current.year, current.month), [trips, current.year, current.month]);
  const eqs = useMemo(() => equivalencesFor(r.co2Kg, 3), [r.co2Kg]);
  const maxCount = Math.max(1, ...LOW_CARBON_MODES.map((m) => r.byMode[m].count));
  const label = monthLabel(current.year, current.month);

  const step = (delta: number) => {
    const next = index + delta;
    if (next < 0 || next >= months.length) return;
    haptic.tap();
    setIndex(next);
  };

  return (
    <ScreenContainer>
      <ScreenHeader title="Mon bilan" subtitle="Votre impact, mois par mois" onBack={() => navigation.goBack()} />

      {/* Month switcher */}
      <View className="mb-4 flex-row items-center justify-between rounded-2xl border border-line bg-card px-2 py-1.5">
        <Pressable
          onPress={() => step(1)}
          disabled={index >= months.length - 1}
          accessibilityRole="button"
          accessibilityLabel="Mois précédent"
          className={`h-9 w-9 items-center justify-center rounded-full ${index >= months.length - 1 ? "opacity-30" : "active:opacity-60"}`}
        >
          <Icon name="chevron-back" size={20} color={colors.forest} />
        </Pressable>
        <Text className="text-base font-bold capitalize text-forest">{label}</Text>
        <Pressable
          onPress={() => step(-1)}
          disabled={index === 0}
          accessibilityRole="button"
          accessibilityLabel="Mois suivant"
          className={`h-9 w-9 items-center justify-center rounded-full ${index === 0 ? "opacity-30" : "active:opacity-60"}`}
        >
          <Icon name="chevron-forward" size={20} color={colors.forest} />
        </Pressable>
      </View>

      {r.trips === 0 ? (
        <EmptyState
          emoji="🗓️"
          title="Aucun trajet ce mois-ci"
          message="Validez des trajets bas-carbone pour remplir votre bilan."
          actionLabel="Planifier un trajet"
          onAction={() => navigation.navigate("Tabs", { screen: "Route" })}
        />
      ) : (
        <>
          <LinearGradient
            colors={[colors.forest, colors.forestSoft]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 24, padding: 20, marginBottom: 16 }}
          >
            <Text className="text-sm capitalize text-white/70">{label}</Text>
            <Text className="mt-1 text-4xl font-extrabold text-white">{formatCo2(r.co2Kg)}</Text>
            <Text className="text-sm text-white/80">de CO₂ évités</Text>
            <View className="mt-3 flex-row flex-wrap gap-2">
              {r.co2ChangePct != null ? (
                <Chip label={`${formatChange(r.co2ChangePct)} vs mois précédent`} tone="dark" icon={r.co2ChangePct >= 0 ? "trending-up" : "trending-down"} />
              ) : null}
              <Chip label={`${formatDecimal(r.trees, 1)} arbre${r.trees >= 2 ? "s" : ""}`} emoji="🌳" tone="dark" />
            </View>
          </LinearGradient>

          <View className="mb-4 flex-row gap-3">
            <StatTile label="Verts" icon="leaf-outline" value={formatInt(r.lowCarbonTrips)} hint={`${Math.round(r.greenShare * 100)} % du total`} />
            <StatTile label="Distance" icon="navigate-outline" value={`${formatDecimal(r.km, 0)} km`} hint={`${r.activeDays} jour${r.activeDays > 1 ? "s" : ""} actif${r.activeDays > 1 ? "s" : ""}`} />
            <StatTile label="Points" icon="star-outline" value={formatInt(r.points)} color={colors.leaf} hint="gagnés" />
          </View>

          <SectionHeader title="Vos modes" />
          <Card className="mb-4">
            {LOW_CARBON_MODES.map((m) => {
              const meta = MODES[m];
              const v = r.byMode[m];
              return (
                <View key={m} className="flex-row items-center gap-3 py-1.5">
                  <McIcon name={meta.icon} size={18} color={meta.color} />
                  <Text className="w-24 text-sm text-forest">{meta.shortLabel}</Text>
                  <View className="flex-1">
                    <ProgressBar value={v.count / maxCount} color={meta.color} />
                  </View>
                  <Text className="w-16 text-right text-xs font-bold text-muted">
                    {v.count} · {formatDecimal(v.km, 0)} km
                  </Text>
                </View>
              );
            })}
            {r.favoriteMode ? (
              <Text className="mt-2 text-sm text-forest">
                Mode préféré : <Text className="font-bold">{MODES[r.favoriteMode].emoji} {MODES[r.favoriteMode].shortLabel}</Text>
              </Text>
            ) : null}
          </Card>

          {r.bestDay ? (
            <Card className="mb-4 flex-row items-center gap-3">
              <Text className="text-3xl">🏆</Text>
              <View className="flex-1">
                <Text className="text-sm font-bold text-forest">Meilleure journée</Text>
                <Text className="text-xs text-muted">
                  {WEEKDAYS[r.bestDay.date.getDay()]} {r.bestDay.date.getDate()} · {formatCo2(r.bestDay.co2Kg)} évités
                </Text>
              </View>
            </Card>
          ) : null}

          <SectionHeader title="C'est comme…" />
          <Card className="mb-4">
            {eqs.map((e, i) => (
              <View key={e.equivalence.id} className={`flex-row items-center gap-3 py-2 ${i > 0 ? "border-t border-line" : ""}`}>
                <Text className="text-2xl">{e.equivalence.icon}</Text>
                <Text className="flex-1 text-sm text-forest">
                  <Text className="font-extrabold">{e.value}</Text> {e.label}
                </Text>
              </View>
            ))}
          </Card>

          <Button
            label="Partager mon bilan"
            icon="share-social-outline"
            onPress={() => void shareText(recapShareText(r, (m) => MODES[m].shortLabel))}
          />
        </>
      )}
    </ScreenContainer>
  );
}
