import { Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ScreenContainer } from "@/components/ScreenContainer";
import { SAMPLE_REWARDS } from "@/constants/sampleData";
import { formatInt } from "@/domain/format";
import { useAppStore } from "@/store/useAppStore";

export function RewardsScreen() {
  const credits = useAppStore((s) => s.profile?.cumulative_points ?? 1175);

  return (
    <ScreenContainer>
      <Text className="mb-1 mt-2 text-2xl font-bold text-forest">Récompenses</Text>
      <Text className="mb-4 text-sm text-muted">
        Échangez vos crédits carbone contre des avantages.
      </Text>

      <Card className="mb-5 bg-forest">
        <Text className="text-sm text-white/70">Crédits disponibles</Text>
        <Text className="mt-1 text-3xl font-bold text-white">
          {formatInt(credits)}
        </Text>
      </Card>

      <View className="gap-3">
        {SAMPLE_REWARDS.map((reward) => {
          const affordable = credits >= reward.cost;
          return (
            <Card key={reward.id}>
              <View className="flex-row items-center gap-3">
                <View
                  className="h-12 w-12 items-center justify-center rounded-xl"
                  style={{ backgroundColor: reward.tile }}
                >
                  <Text className="text-xs font-bold text-white">
                    {reward.brand.slice(0, 1)}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-forest">
                    {reward.brand}
                  </Text>
                  <Text className="text-xs text-muted">{reward.title}</Text>
                </View>
              </View>
              <View className="mt-3 flex-row items-center justify-between">
                <Text className="text-sm font-bold text-forest">
                  {formatInt(reward.cost)} pts
                </Text>
                <View className="w-32">
                  <Button
                    label={affordable ? "Échanger" : "Bientôt"}
                    variant={affordable ? "secondary" : "ghost"}
                    disabled={!affordable}
                  />
                </View>
              </View>
            </Card>
          );
        })}
      </View>
    </ScreenContainer>
  );
}
