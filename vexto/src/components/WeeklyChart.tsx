import { Text, View } from "react-native";

import type { DayStat } from "@/domain/stats";
import { formatCo2 } from "@/domain/format";
import { colors } from "@/theme/colors";

interface WeeklyChartProps {
  series: DayStat[];
  height?: number;
}

/** 7-day bar chart of CO₂ avoided; today's bar is highlighted. */
export function WeeklyChart({ series, height = 96 }: WeeklyChartProps) {
  const max = Math.max(...series.map((d) => d.co2Kg), 0);
  const bestIndex = max > 0 ? series.findIndex((d) => d.co2Kg === max) : -1;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`CO₂ évité ces 7 derniers jours : ${series
        .map((d) => `${d.letter} ${formatCo2(d.co2Kg)}`)
        .join(", ")}`}
    >
      <View className="flex-row items-end justify-between" style={{ height }}>
        {series.map((d, i) => {
          const ratio = max > 0 ? d.co2Kg / max : 0;
          const barHeight = d.co2Kg > 0 ? Math.max(6, ratio * (height - 18)) : 4;
          const color = d.isToday ? colors.leaf : d.co2Kg > 0 ? colors.leafBright : colors.line;
          return (
            <View key={d.key} className="flex-1 items-center justify-end">
              {i === bestIndex ? (
                <Text className="mb-1 text-[10px] font-bold text-leaf" numberOfLines={1}>
                  {formatCo2(d.co2Kg)}
                </Text>
              ) : null}
              <View
                style={{ height: barHeight, width: 22, borderRadius: 8, backgroundColor: color }}
              />
            </View>
          );
        })}
      </View>
      <View className="mt-2 flex-row justify-between">
        {series.map((d) => (
          <Text
            key={d.key}
            className={`flex-1 text-center text-xs ${d.isToday ? "font-bold text-forest" : "text-muted"}`}
          >
            {d.letter}
          </Text>
        ))}
      </View>
    </View>
  );
}
