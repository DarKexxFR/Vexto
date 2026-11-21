import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";

import { Card } from "@/components/Card";
import { ChallengesCard } from "@/components/ChallengesCard";
import { CommuteCard } from "@/components/CommuteCard";
import { ForestScene } from "@/components/forest/ForestScene";
import { Icon, McIcon } from "@/components/Icon";
import { ScoreRing } from "@/components/ScoreRing";
import { ScreenContainer } from "@/components/ScreenContainer";
import { StopBoardCard } from "@/components/transit/StopBoardCard";
import { TripRow } from "@/components/TripRow";
import { Avatar, Chip, EmptyState, ProgressBar, SectionHeader, StatTile } from "@/components/ui";
import { WeatherCoachCard } from "@/components/WeatherCoachCard";
import { WeeklyChart } from "@/components/WeeklyChart";
import { daysLeftInWeek, evaluateChallenges } from "@/domain/challenges";
import { shortPlaceLabel, type Place } from "@/domain/places";
import { firstName, formatChange, formatCo2, formatInt, greeting, pluralize } from "@/domain/format";
import type { DepartureGroup } from "@/domain/transit";
import { useUserStats } from "@/hooks/useUserStats";
import { confirmAsync } from "@/lib/dialogs";
import { getRank } from "@/lib/profile";
import { refreshAll } from "@/lib/sync";
import { fetchDepartures } from "@/lib/transit";
import { useAppNavigation } from "@/navigation/types";
import { useAppStore } from "@/store/useAppStore";
import { usePrefsStore, type FavoriteKind } from "@/store/usePrefsStore";
import { useWeatherStore } from "@/store/useWeatherStore";
import { colors } from "@/theme/colors";
import type { TripMode } from "@/types/database";

export function HomeScreen() {
  const navigation = useAppNavigation();
  const session = useAppStore((s) => s.session);
  const profile = useAppStore((s) => s.profile);
  const trips = useAppStore((s) => s.trips);
  const tripsStatus = useAppStore((s) => s.tripsStatus);
  const requestRoute = useAppStore((s) => s.requestRoute);
  const home = usePrefsStore((s) => s.home);
  const work = usePrefsStore((s) => s.work);
  const forestVisited = usePrefsStore((s) => s.forestVisited);
  const favoriteStops = usePrefsStore((s) => s.favoriteStops);
  const toggleFavoriteStop = usePrefsStore((s) => s.toggleFavoriteStop);
  const focused = useIsFocused();
  const firstStop = favoriteStops[0] ?? null;
  const [stopBoard, setStopBoard] = useState<DepartureGroup[] | "error" | undefined>(undefined);
  const [boardTime, setBoardTime] = useState(() => new Date());
  const stats = useUserStats();
  const [rank, setRank] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [forestWidth, setForestWidth] = useState(0);
  // Bumped on focus / pull-to-refresh to reload live cards.
  const [liveKey, setLiveKey] = useState(0);
  useEffect(() => {
    if (focused) setLiveKey((k) => k + 1);
  }, [focused]);

  const points = profile?.cumulative_points;
  useEffect(() => {
    if (points == null) return;
    let alive = true;
    getRank(points)
      .then((r) => alive && setRank(r))
      .catch(() => alive && setRank(null));
    return () => {
      alive = false;
    };
  }, [points]);

  // Next departures at the favourite stop, refreshed when Home is shown.
  const firstStopId = firstStop?.id;
  useEffect(() => {
    if (!firstStopId || !focused) return;
    let alive = true;
    fetchDepartures(firstStopId)
      .then((g) => {
        if (!alive) return;
        setStopBoard(g);
        setBoardTime(new Date());
      })
      .catch(() => alive && setStopBoard("error"));
    return () => {
      alive = false;
    };
  }, [firstStopId, focused]);

  const onRefresh = async () => {
    setRefreshing(true);
    setLiveKey((k) => k + 1);
    await Promise.all([refreshAll(), useWeatherStore.getState().load({ force: true })]);
    setRefreshing(false);
  };

  const name =
    firstName(profile?.full_name) ??
    firstName(session?.user.user_metadata?.full_name as string | undefined) ??
    "Vextonaute";

  const goTo = async (kind: FavoriteKind, place: Place | null) => {
    if (place) {
      requestRoute({ to: place });
      navigation.navigate("Route");
      return;
    }
    const go = await confirmAsync(
      kind === "home" ? "Adresse « Maison »" : "Adresse « Travail »",
      "Cherchez l'adresse dans l'onglet Trajet, puis touchez l'étoile ☆ pour l'enregistrer.",
      "Aller à Trajet",
    );
    if (go) navigation.navigate("Route");
  };

  const planWithMode = (mode: TripMode) => {
    requestRoute({ mode });
    navigation.navigate("Route");
  };

  const { level, streak, week, series, forest, summary } = stats;
  const recent = trips.slice(0, 3);
  const challenges = useMemo(() => evaluateChallenges(trips), [trips]);

  return (
    <ScreenContainer onRefresh={() => void onRefresh()} refreshing={refreshing}>
      {/* Header */}
      <View className="mb-5 mt-2 flex-row items-center">
        <View className="flex-1">
          <Text className="text-sm text-muted">{greeting()},</Text>
          <Text className="text-2xl font-extrabold text-forest" numberOfLines={1}>
            {name} 👋
          </Text>
        </View>
        {streak.current > 0 ? (
          <View className="mr-3">
            <Chip label={`${streak.current} j`} emoji="🔥" tone="amber" />
          </View>
        ) : null}
        <Pressable onPress={() => navigation.navigate("Profile")} accessibilityRole="button" accessibilityLabel="Profil">
          <Avatar name={profile?.full_name ?? name} seed={session?.user.id ?? "vexto"} size={44} />
        </Pressable>
      </View>

      {/* Level hero */}
      <LinearGradient
        colors={[colors.forest, colors.forestSoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 28, padding: 20, marginBottom: 16 }}
      >
        <View className="flex-row items-center justify-between">
          <Chip label={`Niveau ${level.current.index + 1} · ${level.current.name}`} emoji={level.current.icon} tone="dark" />
          <Pressable onPress={() => navigation.navigate("Forest")} hitSlop={8} accessibilityRole="button">
            <Text className="text-xs font-semibold text-leaf-bright">Ma forêt →</Text>
          </Pressable>
        </View>
        <View className="mt-4 flex-row items-center gap-5">
          <ScoreRing
            progress={level.progress}
            value={stats.points}
            label="points"
            size={124}
            strokeWidth={11}
            color={colors.leafBright}
            trackColor="rgba(255,255,255,0.15)"
            textColor={colors.white}
            labelColor="rgba(255,255,255,0.7)"
          />
          <View className="flex-1 gap-3">
            <View>
              <Text className="text-xs text-white/60">CO₂ évité</Text>
              <Text className="text-xl font-extrabold text-white">{formatCo2(stats.co2Kg)}</Text>
            </View>
            <View>
              <Text className="text-xs text-white/60">Trajets verts</Text>
              <Text className="text-xl font-extrabold text-white">{formatInt(summary.lowCarbonTrips)}</Text>
            </View>
          </View>
        </View>
        <View className="mt-4">
          <ProgressBar value={level.progress} color={colors.leafBright} trackColor="rgba(255,255,255,0.15)" />
          <Text className="mt-2 text-xs text-white/70">
            {level.next
              ? `Encore ${formatInt(level.pointsToNext)} pts pour devenir ${level.next.name} ${level.next.icon}`
              : "Niveau maximum atteint, bravo ! 🌍"}
          </Text>
        </View>
      </LinearGradient>

      {/* Quick stats */}
      <View className="mb-4 flex-row gap-3">
        <StatTile
          label="Rang"
          icon="podium-outline"
          value={rank ? `#${rank}` : "—"}
          hint="général"
          onPress={() => navigation.navigate("Leaderboard")}
        />
        <StatTile
          label="Série"
          icon="flame"
          value={`${streak.current} j`}
          color={streak.current > 0 ? colors.amber : colors.forest}
          hint={`record ${streak.best} j`}
          onPress={() => navigation.navigate("Forest")}
        />
        <StatTile
          label="Crédits"
          icon="gift-outline"
          value={formatInt(stats.available)}
          color={colors.leaf}
          hint="à dépenser"
          onPress={() => navigation.navigate("Rewards")}
        />
      </View>

      <WeatherCoachCard onPlan={planWithMode} />

      {/* Daily commute, live */}
      {home && work ? (
        <>
          <SectionHeader title="Mon trajet quotidien" />
          <CommuteCard
            home={home}
            work={work}
            refreshKey={liveKey}
            onOpen={(from, to) => {
              requestRoute({ from, to, mode: "publicTransit" });
              navigation.navigate("Route");
            }}
          />
        </>
      ) : null}

      {/* Real-time departures (IDFM) */}
      {firstStop ? (
        <>
          <SectionHeader title="Mon arrêt" actionLabel="Horaires" onAction={() => navigation.navigate("Transit")} />
          <StopBoardCard
            name={firstStop.name}
            groups={stopBoard}
            now={boardTime}
            favorite
            maxRows={3}
            onToggleFavorite={() => toggleFavoriteStop(firstStop)}
            onOpen={() => navigation.navigate("Stop", { id: firstStop.id, name: firstStop.name, coords: firstStop.coords })}
          />
        </>
      ) : (
        <Card className="mb-4" onPress={() => navigation.navigate("Transit")} accessibilityLabel="Horaires en temps réel">
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-sky-soft">
              <McIcon name="subway-variant" size={22} color={colors.sky} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-forest">Horaires en temps réel</Text>
              <Text className="text-xs text-muted">
                Bus, métro, RER, tram : sachez quand partir. Ajoutez votre arrêt en favori ⭐
              </Text>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.muted} />
          </View>
        </Card>
      )}

      {/* Shortcuts */}
      <SectionHeader title="Raccourcis" />
      <View className="mb-4 flex-row gap-3">
        {(
          [
            { kind: "home" as const, place: home, icon: "home-outline" as const, title: "Maison" },
            { kind: "work" as const, place: work, icon: "briefcase-outline" as const, title: "Travail" },
          ]
        ).map((s) => (
          <Card key={s.kind} className="flex-1" onPress={() => void goTo(s.kind, s.place)} accessibilityLabel={s.title}>
            <View className="flex-row items-center gap-2">
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-leaf-soft">
                <Icon name={s.icon} size={18} color={colors.leaf} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-forest">{s.title}</Text>
                <Text className="text-xs text-muted" numberOfLines={1}>
                  {s.place ? shortPlaceLabel(s.place.label) : "Définir"}
                </Text>
              </View>
            </View>
          </Card>
        ))}
      </View>

      {/* Weekly challenges */}
      <SectionHeader title="Défis de la semaine" />
      <ChallengesCard challenges={challenges} daysLeft={daysLeftInWeek(new Date())} />

      {/* Weekly chart */}
      <SectionHeader title="Cette semaine" actionLabel="Mon bilan" onAction={() => navigation.navigate("Recap")} />
      <Card className="mb-4">
        <View className="mb-3 flex-row items-end justify-between">
          <View>
            <Text className="text-2xl font-extrabold text-forest">{formatCo2(week.thisWeekKg)}</Text>
            <Text className="text-xs text-muted">de CO₂ évité sur 7 jours</Text>
          </View>
          {week.changePct != null ? (
            <Chip
              label={`${formatChange(week.changePct)} vs sem. passée`}
              tone={week.changePct >= 0 ? "leaf" : "amber"}
              icon={week.changePct >= 0 ? "trending-up" : "trending-down"}
            />
          ) : null}
        </View>
        <WeeklyChart series={series} />
      </Card>

      {/* Forest teaser — la surprise du chef */}
      <Card
        className="mb-4 overflow-hidden p-0"
        onPress={() => navigation.navigate("Forest")}
        accessibilityLabel="Ouvrir ma forêt"
      >
        <View onLayout={(e) => setForestWidth(e.nativeEvent.layout.width)}>
          <ForestScene co2Kg={stats.co2Kg} width={forestWidth} height={130} showWildlife={false} maxTrees={30} />
          {!forestVisited ? (
            <View className="absolute left-3 top-3">
              <Chip label="Nouveau · surprise du chef" emoji="🎁" tone="overlay" />
            </View>
          ) : null}
        </View>
        <View className="flex-row items-center justify-between p-4">
          <View className="flex-1">
            <Text className="text-base font-bold text-forest">Ma Forêt Vexto</Text>
            <Text className="text-xs text-muted">
              {forest.trees} {pluralize(forest.trees, "arbre", "arbres")} · arbre en cours : {forest.stageName.toLowerCase()}
            </Text>
          </View>
          <Icon name="chevron-forward" size={20} color={colors.muted} />
        </View>
      </Card>

      {/* Recent trips */}
      <SectionHeader
        title="Derniers trajets"
        actionLabel={trips.length > 0 ? "Tout voir" : undefined}
        onAction={() => navigation.navigate("History")}
      />
      {recent.length > 0 ? (
        <Card className="py-1">
          {recent.map((t, i) => (
            <View key={t.id} className={i > 0 ? "border-t border-line" : ""}>
              <TripRow trip={t} />
            </View>
          ))}
        </Card>
      ) : tripsStatus === "loading" ? (
        <Card>
          <Text className="text-sm text-muted">Chargement de vos trajets…</Text>
        </Card>
      ) : (
        <EmptyState
          emoji="🧭"
          title="Aucun trajet pour l'instant"
          message="Planifiez votre premier trajet bas-carbone et plantez votre première graine."
          actionLabel="Planifier un trajet"
          onAction={() => navigation.navigate("Route")}
        />
      )}
    </ScreenContainer>
  );
}
