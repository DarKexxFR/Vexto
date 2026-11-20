import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";

import { Card } from "@/components/Card";
import { HeaderAvatar } from "@/components/HeaderAvatar";
import { Icon, McIcon } from "@/components/Icon";
import { ScreenContainer } from "@/components/ScreenContainer";
import { StopBoardCard } from "@/components/transit/StopBoardCard";
import { LineBadgeView } from "@/components/transit/TransitViews";
import { Banner, EmptyState, ScreenHeader, SectionHeader } from "@/components/ui";
import { formatDistance } from "@/domain/format";
import type { DepartureGroup, StopAreaSummary, TransitSearchResult } from "@/domain/transit";
import { getKnownPosition, requestPosition } from "@/hooks/useCurrentLocation";
import { haptic } from "@/lib/haptics";
import {
  fetchDepartures,
  fetchNearbyStops,
  isTransitSetupError,
  regionAt,
  searchTransit,
  transitErrorMessage,
  type TransitRegion,
} from "@/lib/transit";
import { useAppNavigation } from "@/navigation/types";
import { usePrefsStore } from "@/store/usePrefsStore";
import { colors } from "@/theme/colors";

const QUICK_SEARCHES: Record<TransitRegion, string[]> = {
  idfm: ["RER A", "RER B", "RER C", "RER D", "Métro 1", "Métro 4", "Métro 14", "T3a", "Bus 38"],
  dijon: ["Tram T1", "Tram T2", "Lianes 3", "Lianes 5", "Corol", "Dijon Ville"],
  sncf: ["TER", "TGV", "Intercités", "Gare"],
};

type NearbyStatus = "idle" | "loading" | "ready" | "needs-location" | "error";

/** "Horaires": live departures around you, favourite stops, line & stop search. */
export function TransitScreen() {
  const navigation = useAppNavigation();
  const focused = useIsFocused();
  const favoriteStops = usePrefsStore((s) => s.favoriteStops);
  const toggleFavoriteStop = usePrefsStore((s) => s.toggleFavoriteStop);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TransitSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [nearby, setNearby] = useState<StopAreaSummary[]>([]);
  const [nearbyStatus, setNearbyStatus] = useState<NearbyStatus>("idle");
  const [boards, setBoards] = useState<Record<string, DepartureGroup[] | "error">>({});
  const [setupError, setSetupError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

  const isFavorite = (id: string) => favoriteStops.some((f) => f.id === id);

  const loadBoards = useCallback(async (ids: string[]) => {
    const unique = [...new Set(ids)].slice(0, 5);
    const entries = await Promise.all(
      unique.map(async (id): Promise<[string, DepartureGroup[] | "error"]> => {
        try {
          return [id, await fetchDepartures(id)];
        } catch (e) {
          if (isTransitSetupError(e)) setSetupError(transitErrorMessage(e));
          return [id, "error"];
        }
      }),
    );
    setBoards((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    setNow(new Date());
  }, []);

  // Last known position: picks the local network (Paris, Dijon…) for search.
  const lastPos = useRef<[number, number] | null>(null);
  const [region, setRegion] = useState<TransitRegion>("idfm");

  const loadNearby = useCallback(async (ask: boolean): Promise<StopAreaSummary[]> => {
    setNearbyStatus("loading");
    let pos = await getKnownPosition();
    if (!pos && ask) pos = await requestPosition();
    if (!pos) {
      setNearbyStatus("needs-location");
      return [];
    }
    lastPos.current = pos;
    setRegion(regionAt(pos));
    try {
      const stops = await fetchNearbyStops(pos);
      setNearby(stops);
      setNearbyStatus("ready");
      setSetupError(null);
      return stops;
    } catch (e) {
      setNearbyStatus("error");
      if (isTransitSetupError(e)) setSetupError(transitErrorMessage(e));
      return [];
    }
  }, []);

  const refresh = useCallback(
    async (ask = false) => {
      const stops = await loadNearby(ask);
      await loadBoards([...favoriteStops.map((f) => f.id), ...stops.slice(0, 2).map((s) => s.id)]);
    },
    [favoriteStops, loadBoards, loadNearby],
  );

  // Refresh whenever the tab gets focus, then keep the countdowns ticking.
  useEffect(() => {
    if (focused) void refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);
  useEffect(() => {
    if (!focused) return;
    const id = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(id);
  }, [focused]);

  // Debounced line / stop search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      searchTransit(q, lastPos.current)
        .then((r) => {
          setResults(r);
          setSearchError(null);
        })
        .catch((e: unknown) => {
          setResults([]);
          setSearchError(transitErrorMessage(e));
        })
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh(false);
    setRefreshing(false);
  };

  const openStop = (stop: { id: string; name: string; coords?: [number, number] | null }) =>
    navigation.navigate("Stop", { id: stop.id, name: stop.name, coords: stop.coords ?? null });

  const searchMode = query.trim().length >= 2;
  const favoriteIds = new Set(favoriteStops.map((f) => f.id));

  return (
    <ScreenContainer onRefresh={() => void onRefresh()} refreshing={refreshing}>
      <ScreenHeader title="Horaires" subtitle="Bus, métro, RER, tram : en temps réel" right={<HeaderAvatar />} />

      <View className="mb-3 h-12 flex-row items-center gap-2 rounded-2xl border border-line bg-card px-3">
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Ligne ou arrêt (RER B, 38, Châtelet…)"
          placeholderTextColor={colors.faint}
          autoCorrect={false}
          returnKeyType="search"
          className="h-full min-w-0 flex-1 text-base text-forest"
          accessibilityLabel="Rechercher une ligne ou un arrêt"
        />
        {searching ? <ActivityIndicator size="small" color={colors.leaf} /> : null}
        {!searching && query.length > 0 ? (
          <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Effacer">
            <Icon name="close-circle" size={18} color={colors.faint} />
          </Pressable>
        ) : null}
      </View>

      {searchMode ? (
        <>
          {searchError ? <Banner tone="warning" message={searchError} /> : null}
          {!searching && results.length === 0 && !searchError ? (
            <EmptyState emoji="🔎" title="Aucun résultat" message="Essayez « RER A », « 91 » ou le nom d'une gare." />
          ) : null}
          {results.length > 0 ? (
            <Card className="py-1">
              {results.map((r, i) => (
                <Pressable
                  key={`${r.kind}-${r.id}`}
                  onPress={() => {
                    haptic.tap();
                    if (r.kind === "line") navigation.navigate("Line", { id: r.id, name: r.name });
                    else openStop(r);
                  }}
                  accessibilityRole="button"
                  className={`flex-row items-center gap-3 py-3 active:opacity-70 ${i > 0 ? "border-t border-line" : ""}`}
                >
                  {r.kind === "line" ? (
                    <LineBadgeView line={r.badge} />
                  ) : (
                    <View className="h-8 w-8 items-center justify-center rounded-lg bg-sky-soft">
                      <McIcon name="bus-stop" size={18} color={colors.sky} />
                    </View>
                  )}
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-forest" numberOfLines={1}>
                      {r.kind === "line" ? `${r.badge.modeLabel} ${r.badge.code}` : r.name}
                    </Text>
                    <Text className="text-xs text-muted" numberOfLines={1}>
                      {r.kind === "line" ? [r.name !== r.badge.code ? r.name : null, r.badge.network].filter(Boolean).join(" · ") || "Ligne" : "Arrêt · voir les départs"}
                    </Text>
                  </View>
                  <Icon name="chevron-forward" size={18} color={colors.faint} />
                </Pressable>
              ))}
            </Card>
          ) : null}
        </>
      ) : (
        <>
          {setupError ? <Banner tone="warning" title="Horaires temps réel à configurer" message={setupError} /> : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerClassName="gap-2">
            {QUICK_SEARCHES[region].map((q) => (
              <Pressable
                key={q}
                onPress={() => setQuery(q)}
                accessibilityRole="button"
                className="rounded-full border border-line bg-card px-3 py-2 active:opacity-70"
              >
                <Text className="text-sm font-semibold text-forest">{q}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {favoriteStops.length > 0 ? (
            <>
              <SectionHeader title="Mes arrêts" />
              {favoriteStops.map((f) => (
                <StopBoardCard
                  key={f.id}
                  name={f.name}
                  groups={boards[f.id]}
                  now={now}
                  favorite
                  onToggleFavorite={() => toggleFavoriteStop(f)}
                  onOpen={() => openStop(f)}
                />
              ))}
            </>
          ) : null}

          <SectionHeader title="À proximité" />
          {nearbyStatus === "needs-location" ? (
            <Card onPress={() => void refresh(true)} accessibilityLabel="Activer la localisation">
              <View className="flex-row items-center gap-3">
                <Icon name="locate" size={22} color={colors.sky} />
                <Text className="flex-1 text-sm text-forest">
                  Activez la localisation pour voir les prochains passages autour de vous.
                </Text>
              </View>
            </Card>
          ) : nearbyStatus === "loading" && nearby.length === 0 ? (
            <View className="items-center py-6">
              <ActivityIndicator color={colors.leaf} />
            </View>
          ) : nearbyStatus === "error" && nearby.length === 0 ? (
            <Text className="text-sm text-muted">Arrêts à proximité indisponibles pour le moment.</Text>
          ) : nearby.length === 0 && nearbyStatus === "ready" ? (
            <Text className="text-sm text-muted">Aucun arrêt dans un rayon de 600 m.</Text>
          ) : (
            <>
              {nearby
                .filter((s) => !favoriteIds.has(s.id))
                .slice(0, 2)
                .map((s) => (
                  <StopBoardCard
                    key={s.id}
                    name={s.name}
                    distanceM={s.distanceM}
                    groups={boards[s.id]}
                    now={now}
                    favorite={isFavorite(s.id)}
                    onToggleFavorite={() => toggleFavoriteStop({ id: s.id, name: s.name, coords: s.coords })}
                    onOpen={() => openStop(s)}
                  />
                ))}
              {nearby.filter((s) => !favoriteIds.has(s.id)).length > 2 ? (
                <Card className="py-1">
                  {nearby
                    .filter((s) => !favoriteIds.has(s.id))
                    .slice(2)
                    .map((s, i) => (
                      <Pressable
                        key={s.id}
                        onPress={() => openStop(s)}
                        accessibilityRole="button"
                        className={`flex-row items-center gap-3 py-3 active:opacity-70 ${i > 0 ? "border-t border-line" : ""}`}
                      >
                        <McIcon name="bus-stop" size={18} color={colors.sky} />
                        <Text className="flex-1 text-sm font-semibold text-forest" numberOfLines={1}>
                          {s.name}
                        </Text>
                        {s.distanceM != null ? (
                          <Text className="text-xs text-muted">{formatDistance(s.distanceM / 1000)}</Text>
                        ) : null}
                        <Icon name="chevron-forward" size={16} color={colors.faint} />
                      </Pressable>
                    ))}
                </Card>
              ) : null}
            </>
          )}

          <Text className="mt-4 text-center text-[11px] text-faint">
            Données Île-de-France Mobilités (PRIM) · 📡 = horaire en temps réel
          </Text>
        </>
      )}
    </ScreenContainer>
  );
}
