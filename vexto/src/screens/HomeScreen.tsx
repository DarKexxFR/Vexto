import { View, Text } from "react-native";

import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ScoreRing } from "@/components/ScoreRing";
import { ScreenContainer } from "@/components/ScreenContainer";
import { SAMPLE_LEADERBOARD } from "@/constants/sampleData";
import { formatCo2, formatInt } from "@/domain/format";
import { useAppStore } from "@/store/useAppStore";

interface HomeScreenProps {
  onPlanTrip: () => void;
}

const NEXT_TIER = 1500;

export function HomeScreen({ onPlanTrip }: HomeScreenProps) {
  const profile = useAppStore((s) => s.profile);

  const points = profile?.cumulative_points ?? 1175;
  const co2Saved = profile?.current_co2_saved ?? 28.4;
  const rank =
    SAMPLE_LEADERBOARD.findIndex((f) => f.isYou) + 1 || 3;

  return (
    <ScreenContainer>
      <View className="mb-6 mt-2">
        <Text className="text-sm text-muted">Bonjour 👋</Text>
        <Text className="text-2xl font-bold text-forest">
          {profile?.full_name ?? "Bienvenue sur Vexto"}
        </Text>
      </View>

      <Card className="mb-4 items-center bg-forest">
        <Text className="mb-3 text-sm font-medium text-white/70">
          Vos crédits carbone
        </Text>
        <View className="rounded-full bg-white p-2">
          <ScoreRing value={points} max={NEXT_TIER} label="points" />
        </View>
        <Text className="mt-3 text-xs text-white/70">
          Plus que {formatInt(Math.max(0, NEXT_TIER - points))} pts pour le
          prochain palier
        </Text>
      </Card>

      <View className="mb-4 flex-row gap-3">
        <Card className="flex-1">
          <Text className="text-xs text-muted">CO₂ évité</Text>
          <Text className="mt-1 text-xl font-bold text-leaf">
            {formatCo2(co2Saved)}
          </Text>
        </Card>
        <Card className="flex-1">
          <Text className="text-xs text-muted">Classement</Text>
          <Text className="mt-1 text-xl font-bold text-forest">#{rank}</Text>
        </Card>
      </View>

      <Card className="mb-5">
        <Text className="mb-1 text-base font-semibold text-forest">
          Prêt pour un trajet bas-carbone ?
        </Text>
        <Text className="mb-4 text-sm text-muted">
          Comparez les modes de transport et gagnez des points pour chaque
          gramme de CO₂ évité.
        </Text>
        <Button label="Planifier un trajet" onPress={onPlanTrip} />
      </Card>
    </ScreenContainer>
  );
}
