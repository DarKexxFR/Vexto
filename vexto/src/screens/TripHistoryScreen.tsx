import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { ScreenContainer } from "@/components/ScreenContainer";
import { TripRow } from "@/components/TripRow";
import { Chip, EmptyState, ScreenHeader } from "@/components/ui";
import { MODES } from "@/constants/modes";
import { dayKey, summarizeTrips } from "@/domain/stats";
import { formatCo2, formatInt, formatKm, formatRelativeDay } from "@/domain/format";
import { refreshTrips } from "@/lib/sync";
import type { TripListItem } from "@/lib/trips";
import { useAppNavigation } from "@/navigation/types";
import { useAppStore } from "@/store/useAppStore";
import type { TripMode } from "@/types/database";

type Filter = "all" | TripMode;

const FILTERS: Filter[] = ["all", "publicTransit", "bike", "eScooter", "walk", "carThermal"];

export function TripHistoryScreen() {
  const navigation = useAppNavigation();
  const trips = useAppStore((s) => s.trips);
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(
    () => (filter === "all" ? trips : trips.filter((t) => t.mode === filter)),
    [trips, filter],
  );
  const summary = useMemo(() => summarizeTrips(filtered), [filtered]);

  const groups = useMemo(() => {
    const map = new Map<string, TripListItem[]>();
    for (const t of filtered) {
      const key = dayKey(new Date(t.created_at));
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshTrips();
    setRefreshing(false);
  };

  return (
    <ScreenContainer onRefresh={() => void onRefresh()} refreshing={refreshing}>
      <ScreenHeader title="Mes trajets" subtitle="Tout votre historique, vérifié côté serveur." onBack={() => navigation.goBack()} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerClassName="gap-2">
        {FILTERS.map((f) => (
          <Pressable key={f} onPress={() => setFilter(f)} accessibilityRole="button" className="active:opacity-70">
            <Chip
              label={f === "all" ? "Tous" : MODES[f].shortLabel}
              emoji={f === "all" ? undefined : MODES[f].emoji}
              tone={filter === f ? "leaf" : "muted"}
            />
          </Pressable>
        ))}
      </ScrollView>

      <View className="mb-4 flex-row gap-3">
        {[
          { label: "Trajets validés", value: formatInt(summary.verifiedTrips) },
          { label: "Distance", value: formatKm(summary.totalKm) },
          { label: "CO₂ évité", value: formatCo2(summary.co2Kg) },
        ].map((s) => (
          <View key={s.label} className="flex-1 rounded-2xl border border-line bg-card p-3">
            <Text className="text-[11px] text-muted">{s.label}</Text>
            <Text className="text-base font-extrabold text-forest" numberOfLines={1} adjustsFontSizeToFit>
              {s.value}
            </Text>
          </View>
        ))}
      </View>

      {groups.length === 0 ? (
        <EmptyState
          emoji="📭"
          title={filter === "all" ? "Aucun trajet enregistré" : "Aucun trajet avec ce mode"}
          message="Vos trajets apparaîtront ici dès que vous en terminerez un."
          actionLabel="Planifier un trajet"
          onAction={() => navigation.navigate("Tabs", { screen: "Route" })}
        />
      ) : (
        groups.map(([key, list]) => (
          <View key={key} className="mb-3">
            <Text className="mb-1.5 ml-1 text-xs font-bold uppercase text-muted">
              {formatRelativeDay(new Date(list[0]?.created_at ?? Date.now()))}
            </Text>
            <Card className="py-1">
              {list.map((t, i) => (
                <View key={t.id} className={i > 0 ? "border-t border-line" : ""}>
                  <TripRow trip={t} showDay={false} />
                </View>
              ))}
            </Card>
          </View>
        ))
      )}
    </ScreenContainer>
  );
}
