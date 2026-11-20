import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { MapView } from "@/components/map/MapView";
import { ScreenContainer } from "@/components/ScreenContainer";
import { DepartureRow } from "@/components/transit/TransitViews";
import { Banner, Chip, EmptyState, ScreenHeader } from "@/components/ui";
import { formatTime } from "@/domain/format";
import type { DepartureGroup, TransitModeKind } from "@/domain/transit";
import { config, isMapboxConfigured } from "@/lib/config";
import { haptic } from "@/lib/haptics";
import { fetchDepartures, transitErrorMessage } from "@/lib/transit";
import type { RootStackParamList } from "@/navigation/types";
import { usePrefsStore } from "@/store/usePrefsStore";
import { colors } from "@/theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Stop">;

const KIND_FILTER_LABEL: Record<TransitModeKind, string> = {
  rer: "RER",
  metro: "Métro",
  train: "Train",
  tram: "Tram",
  cable: "Câble",
  bus: "Bus",
  other: "Autres",
};

/** Live departures board of one stop area, refreshed every 30 s. */
export function StopScreen({ route, navigation }: Props) {
  const { id, name, coords, lineId } = route.params;
  const focused = useIsFocused();
  const isFavorite = usePrefsStore((s) => s.favoriteStops.some((f) => f.id === id));
  const toggleFavoriteStop = usePrefsStore((s) => s.toggleFavoriteStop);

  const [groups, setGroups] = useState<DepartureGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<TransitModeKind | "all">("all");

  const load = useCallback(async () => {
    try {
      const g = await fetchDepartures(id);
      setGroups(g);
      setError(null);
      setUpdatedAt(new Date());
      setNow(new Date());
    } catch (e) {
      setError(transitErrorMessage(e));
      setGroups((prev) => prev ?? []);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!focused) return;
    const refreshTimer = setInterval(() => void load(), 30_000);
    const clock = setInterval(() => setNow(new Date()), 10_000);
    return () => {
      clearInterval(refreshTimer);
      clearInterval(clock);
    };
  }, [focused, load]);

  const kinds = useMemo(() => [...new Set((groups ?? []).map((g) => g.line.kind))], [groups]);
  const visible = useMemo(() => {
    const list = (groups ?? []).filter((g) => filter === "all" || g.line.kind === filter);
    if (!lineId) return list;
    return [...list.filter((g) => g.line.id === lineId), ...list.filter((g) => g.line.id !== lineId)];
  }, [groups, filter, lineId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <ScreenContainer onRefresh={() => void onRefresh()} refreshing={refreshing}>
      <ScreenHeader
        title={name}
        subtitle="Prochains départs en temps réel"
        onBack={() => navigation.goBack()}
        right={
          <Pressable
            onPress={() => {
              haptic.tap();
              toggleFavoriteStop({ id, name, coords: coords ?? null });
            }}
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
            className="h-10 w-10 items-center justify-center rounded-full border border-line bg-card active:opacity-70"
          >
            <Icon name={isFavorite ? "star" : "star-outline"} size={20} color={isFavorite ? colors.amber : colors.forest} />
          </Pressable>
        }
      />

      {coords && isMapboxConfigured ? (
        <View className="mb-4">
          <MapView token={config.mapboxToken} start={null} end={coords} routeGeometry={null} height={150} />
        </View>
      ) : null}

      {error ? <Banner tone="warning" message={error} actionLabel="Réessayer" onAction={() => void onRefresh()} /> : null}

      {kinds.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerClassName="gap-2">
          {(["all", ...kinds] as const).map((k) => (
            <Pressable key={k} onPress={() => setFilter(k)} accessibilityRole="button" className="active:opacity-70">
              <Chip label={k === "all" ? "Toutes" : KIND_FILTER_LABEL[k]} tone={filter === k ? "leaf" : "muted"} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {groups === null ? (
        <View className="items-center py-10">
          <ActivityIndicator color={colors.leaf} />
        </View>
      ) : visible.length === 0 && !error ? (
        <EmptyState emoji="🌙" title="Aucun départ prévu" message="Pas de passage dans les prochaines heures à cet arrêt." />
      ) : visible.length > 0 ? (
        <Card className="py-1">
          {visible.map((g, i) => (
            <View
              key={g.key}
              className={`${i > 0 ? "border-t border-line" : ""} ${lineId && g.line.id === lineId ? "bg-leaf-soft/40" : ""}`}
            >
              <DepartureRow
                group={g}
                now={now}
                onPress={g.line.id ? () => navigation.navigate("Line", { id: g.line.id as string }) : undefined}
              />
            </View>
          ))}
        </Card>
      ) : null}

      {updatedAt ? (
        <Text className="mt-3 text-center text-[11px] text-faint">
          Mis à jour à {formatTime(updatedAt)} · actualisation automatique · 📡 = temps réel
        </Text>
      ) : null}
    </ScreenContainer>
  );
}
