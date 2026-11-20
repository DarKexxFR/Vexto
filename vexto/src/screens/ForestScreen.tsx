import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { BadgeGrid } from "@/components/BadgeGrid";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ForestScene } from "@/components/forest/ForestScene";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Chip, ProgressBar, ScreenHeader, SectionHeader } from "@/components/ui";
import { equivalencesFor } from "@/domain/equivalences";
import {
  GROWTH_STAGES,
  KG_PER_TREE,
  nextWildlife,
  SEASON_LABELS,
  seasonFor,
  skyPhase,
  wildlifeFor,
} from "@/domain/forest";
import { formatCo2, formatDecimal, pluralize } from "@/domain/format";
import { useUserStats } from "@/hooks/useUserStats";
import { shareText } from "@/lib/share";
import { useAppNavigation } from "@/navigation/types";
import { usePrefsStore } from "@/store/usePrefsStore";
import { colors } from "@/theme/colors";

const SEASON_EMOJI = { spring: "🌸", summer: "☀️", autumn: "🍂", winter: "❄️" } as const;
const PHASE_LABEL = { dawn: "Aube", day: "Jour", dusk: "Crépuscule", night: "Nuit étoilée" } as const;

/** "Ma Forêt Vexto" — la surprise du chef. */
export function ForestScreen() {
  const navigation = useAppNavigation();
  const stats = useUserStats();
  const markForestVisited = usePrefsStore((s) => s.markForestVisited);
  const [width, setWidth] = useState(0);
  const now = new Date();
  const season = seasonFor(now);
  const phase = skyPhase(now);
  const { forest, co2Kg, streak, achievements, unlockedCount } = stats;
  const animals = wildlifeFor(forest.trees);
  const nextAnimal = nextWildlife(forest.trees);
  const equivalences = equivalencesFor(co2Kg, 3);

  useEffect(() => {
    markForestVisited();
  }, [markForestVisited]);

  const share = () => {
    const trees = `${forest.trees} ${pluralize(forest.trees, "arbre", "arbres")}`;
    void shareText(
      `🌳 Ma forêt Vexto compte ${trees} : j'ai évité ${formatCo2(co2Kg)} de CO₂ en me déplaçant autrement. Et toi ? #Vexto`,
    );
  };

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Ma Forêt"
        subtitle="La surprise du chef 🎁 — elle pousse à chaque trajet vert"
        onBack={() => navigation.goBack()}
      />

      <View
        className="mb-4 overflow-hidden rounded-3xl border border-line bg-card"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        <ForestScene co2Kg={co2Kg} width={width} height={250} date={now} />
        <View className="absolute left-3 top-3 flex-row gap-1.5">
          <Chip label={SEASON_LABELS[season]} emoji={SEASON_EMOJI[season]} tone="overlay" />
          <Chip label={PHASE_LABEL[phase]} tone="overlay" />
        </View>
      </View>

      <View className="mb-4 flex-row gap-3">
        <Card className="flex-1 items-center">
          <Text className="text-3xl font-extrabold text-leaf">{forest.trees}</Text>
          <Text className="text-xs text-muted">{pluralize(forest.trees, "arbre adulte", "arbres adultes")}</Text>
        </Card>
        <Card className="flex-1 items-center">
          <Text className="text-3xl font-extrabold text-forest">{formatCo2(co2Kg)}</Text>
          <Text className="text-xs text-muted">de CO₂ évité</Text>
        </Card>
      </View>

      <Card className="mb-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-bold text-forest">Arbre en croissance</Text>
          <Chip label={forest.stageName} tone="leaf" emoji="🌱" />
        </View>
        <View className="mt-3 flex-row justify-between">
          {GROWTH_STAGES.map((name, i) => (
            <View key={name} className="flex-1 items-center">
              <View
                className={`h-2.5 w-2.5 rounded-full ${i <= forest.stage ? "bg-leaf" : "bg-line"}`}
              />
              <Text
                className={`mt-1 text-center text-[10px] ${i === forest.stage ? "font-bold text-forest" : "text-muted"}`}
                numberOfLines={1}
              >
                {name}
              </Text>
            </View>
          ))}
        </View>
        <View className="mt-3">
          <ProgressBar value={forest.progressInTree} color={colors.leaf} />
        </View>
        <Text className="mt-2 text-xs text-muted">
          Encore {formatDecimal(forest.kgToNextTree, 1)} kg de CO₂ évité pour un nouvel arbre adulte
          (1 arbre = {KG_PER_TREE} kg, ce qu'un arbre absorbe en un an environ).
        </Text>
      </Card>

      <SectionHeader title="La faune revient" />
      <Card className="mb-4">
        {animals.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {animals.map((a) => (
              <Chip key={a.name} label={a.name} emoji={a.icon} tone="leaf" />
            ))}
          </View>
        ) : (
          <Text className="text-sm text-muted">Aucun visiteur pour l'instant… plantez votre premier arbre !</Text>
        )}
        {nextAnimal ? (
          <Text className="mt-3 text-xs text-muted">
            Prochain visiteur : {nextAnimal.icon} {nextAnimal.name} à {nextAnimal.minTrees}{" "}
            {pluralize(nextAnimal.minTrees, "arbre", "arbres")}.
          </Text>
        ) : null}
      </Card>

      <SectionHeader title="Votre impact, concrètement" />
      <Card className="mb-4">
        {equivalences.map((e, i) => (
          <View key={e.equivalence.id} className={`flex-row items-center gap-3 ${i > 0 ? "mt-3" : ""}`}>
            <Text className="text-2xl">{e.equivalence.icon}</Text>
            <Text className="flex-1 text-sm text-forest">
              <Text className="font-extrabold">{e.value}</Text> {e.label}
            </Text>
          </View>
        ))}
        <Text className="mt-3 text-[11px] text-faint">Ordres de grandeur ADEME (Impact CO₂).</Text>
      </Card>

      <SectionHeader title="Série en cours" />
      <Card className="mb-4 flex-row items-center gap-4">
        <Text className="text-4xl">{streak.current > 0 ? "🔥" : "🪵"}</Text>
        <View className="flex-1">
          <Text className="text-lg font-extrabold text-forest">
            {streak.current} {pluralize(streak.current, "jour", "jours")} d'affilée
          </Text>
          <Text className="text-xs text-muted">
            Record : {streak.best} {pluralize(streak.best, "jour", "jours")}
            {streak.current > 0 && !streak.activeToday ? " · faites un trajet vert aujourd'hui pour la prolonger" : ""}
          </Text>
        </View>
      </Card>

      <SectionHeader title={`Succès · ${unlockedCount}/${achievements.length}`} />
      <View className="mb-5">
        <BadgeGrid achievements={achievements} />
      </View>

      <Button label="Partager ma forêt" icon="share-social-outline" variant="secondary" onPress={share} />
    </ScreenContainer>
  );
}
