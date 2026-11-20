/** "Défis de la semaine": three rotating goals with live progress. */
import { Text, View } from "react-native";

import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { ProgressBar } from "@/components/ui";
import type { ChallengeState } from "@/domain/challenges";
import { formatDecimal } from "@/domain/format";
import { colors } from "@/theme/colors";

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : formatDecimal(v, 1));

export function ChallengesCard({ challenges, daysLeft }: { challenges: ChallengeState[]; daysLeft: number }) {
  const done = challenges.filter((c) => c.done).length;
  return (
    <Card className="mb-4">
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted">
          {done}/{challenges.length} réussis
        </Text>
        <Text className="text-xs text-muted">
          {daysLeft === 1 ? "dernier jour !" : `encore ${daysLeft} jours`}
        </Text>
      </View>
      {challenges.map((c, i) => (
        <View key={c.id} className={`flex-row items-center gap-3 py-2.5 ${i > 0 ? "border-t border-line" : ""}`}>
          <View
            className={`h-10 w-10 items-center justify-center rounded-xl ${c.done ? "bg-leaf" : "bg-mineral"}`}
            accessibilityLabel={c.done ? "Défi réussi" : undefined}
          >
            {c.done ? <Icon name="checkmark" size={20} color={colors.white} /> : <Text className="text-lg">{c.icon}</Text>}
          </View>
          <View className="min-w-0 flex-1">
            <View className="flex-row items-baseline justify-between gap-2">
              <Text className={`flex-1 text-sm font-semibold ${c.done ? "text-leaf" : "text-forest"}`} numberOfLines={1}>
                {c.title}
              </Text>
              <Text className="text-xs font-bold text-muted">
                {fmt(Math.min(c.value, c.target))}/{fmt(c.target)} {c.unit}
              </Text>
            </View>
            <View className="mt-1.5">
              <ProgressBar value={c.progress} color={c.done ? colors.leaf : colors.leafBright} />
            </View>
          </View>
        </View>
      ))}
      {done === challenges.length && challenges.length > 0 ? (
        <Text className="mt-2 text-center text-sm font-bold text-leaf">Tous les défis réussis cette semaine 🎉</Text>
      ) : null}
    </Card>
  );
}
