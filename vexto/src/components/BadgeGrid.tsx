import { Text, View } from "react-native";

import { ProgressBar } from "@/components/ui";
import type { AchievementState } from "@/domain/achievements";
import { formatDecimal, formatInt } from "@/domain/format";
import { colors } from "@/theme/colors";

function progressLabel(a: AchievementState): string {
  const fmt = (n: number) => (a.unit === "kg" || a.unit === "km" ? formatDecimal(n, n < 10 ? 1 : 0) : formatInt(n));
  return `${fmt(Math.min(a.current, a.target))} / ${fmt(a.target)} ${a.unit}`;
}

/** Two-column grid of achievements; locked ones show their progress. */
export function BadgeGrid({ achievements }: { achievements: AchievementState[] }) {
  const sorted = [...achievements].sort(
    (a, b) => Number(b.unlocked) - Number(a.unlocked) || b.progress - a.progress,
  );
  return (
    <View className="flex-row flex-wrap justify-between gap-y-3">
      {sorted.map((a) => (
        <View
          key={a.id}
          className={`w-[48.5%] rounded-2xl border p-3 ${a.unlocked ? "border-leaf/30 bg-leaf-soft" : "border-line bg-card"}`}
          accessibilityLabel={`${a.title}, ${a.unlocked ? "débloqué" : `progression ${Math.round(a.progress * 100)} %`}`}
        >
          <View className="flex-row items-center gap-2">
            <Text className="text-2xl" style={{ opacity: a.unlocked ? 1 : 0.35 }}>
              {a.icon}
            </Text>
            <Text
              className={`flex-1 text-sm font-bold ${a.unlocked ? "text-forest" : "text-muted"}`}
              numberOfLines={2}
            >
              {a.title}
            </Text>
          </View>
          <Text className="mt-1 text-xs text-muted" numberOfLines={2}>
            {a.description}
          </Text>
          {a.unlocked ? (
            <Text className="mt-2 text-xs font-bold text-leaf">✓ Débloqué</Text>
          ) : (
            <View className="mt-2">
              <ProgressBar value={a.progress} height={6} color={colors.leafBright} />
              <Text className="mt-1 text-[10px] text-muted">{progressLabel(a)}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}
