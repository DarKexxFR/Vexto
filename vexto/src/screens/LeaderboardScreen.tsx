import { Text, View } from "react-native";

import { Card } from "@/components/Card";
import { ScreenContainer } from "@/components/ScreenContainer";
import { SAMPLE_LEADERBOARD } from "@/constants/sampleData";
import { formatInt } from "@/domain/format";

export function LeaderboardScreen() {
  const ranked = [...SAMPLE_LEADERBOARD].sort((a, b) => b.points - a.points);

  return (
    <ScreenContainer>
      <Text className="mb-1 mt-2 text-2xl font-bold text-forest">Classement</Text>
      <Text className="mb-4 text-sm text-muted">
        Vous et vos amis, classés par crédits carbone.
      </Text>

      <View className="gap-2">
        {ranked.map((entry, index) => (
          <Card
            key={entry.id}
            className={entry.isYou ? "border-leaf bg-leaf/5" : ""}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <Text className="w-6 text-center text-base font-bold text-muted">
                  {index + 1}
                </Text>
                <Text
                  className={`text-base ${entry.isYou ? "font-bold text-forest" : "font-medium text-forest"}`}
                >
                  {entry.name}
                </Text>
              </View>
              <Text className="text-base font-bold text-leaf">
                {formatInt(entry.points)} pts
              </Text>
            </View>
          </Card>
        ))}
      </View>
    </ScreenContainer>
  );
}
