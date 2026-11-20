import { Pressable, Text, View } from "react-native";

import { Icon } from "@/components/Icon";
import { Chip, ModeIcon } from "@/components/ui";
import { MODES } from "@/constants/modes";
import { formatCo2, formatDistance, formatDuration } from "@/domain/format";
import type { ModeOption, ModeTag } from "@/domain/routing";
import { haptic } from "@/lib/haptics";
import { colors } from "@/theme/colors";

const TAG_CHIP: Record<ModeTag, { label: string; emoji: string; tone: "leaf" | "sky" | "amber" }> = {
  recommended: { label: "Recommandé", emoji: "⭐", tone: "amber" },
  fastest: { label: "Le plus rapide", emoji: "⚡", tone: "sky" },
  greenest: { label: "Le plus vert", emoji: "🌱", tone: "leaf" },
};

interface ModeOptionCardProps {
  option: ModeOption;
  selected: boolean;
  onPress: () => void;
}

/** One transport option: time, distance, CO₂, points and smart tags. */
export function ModeOptionCard({ option, selected, onPress }: ModeOptionCardProps) {
  const meta = MODES[option.mode];
  const isCar = option.mode === "carThermal";
  const unrealistic = option.feasibility === "unrealistic";

  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${meta.label}, ${formatDuration(option.durationMin)}, ${option.points} points`}
      className={`rounded-2xl p-3.5 active:opacity-80 ${selected ? "border-2 border-leaf bg-card" : "border border-line bg-card"}`}
      style={{ opacity: unrealistic ? 0.55 : 1 }}
    >
      <View className="flex-row items-center gap-3">
        <ModeIcon mode={option.mode} size={44} />
        <View className="flex-1">
          <Text className="text-base font-extrabold text-forest" numberOfLines={1}>
            {option.durationEstimated ? "≈ " : ""}
            {formatDuration(option.durationMin)}
          </Text>
          <Text className="text-xs text-muted" numberOfLines={1}>
            {meta.shortLabel} · {formatDistance(option.distanceKm)}
          </Text>
          {option.tags.length > 0 ? (
            <View className="mt-1 flex-row flex-wrap gap-1">
              {option.tags.map((t) => (
                <Chip key={t} label={TAG_CHIP[t].label} emoji={TAG_CHIP[t].emoji} tone={TAG_CHIP[t].tone} />
              ))}
            </View>
          ) : null}
          {option.note ? (
            <Text className="mt-1 text-xs text-muted" numberOfLines={2}>
              {option.note}
            </Text>
          ) : null}
        </View>
        <View className="items-end">
          {isCar ? (
            <>
              <Text className="text-sm font-bold text-muted">0 pt</Text>
              <Text className="text-xs text-danger">{formatCo2(option.emissionsKg)} émis</Text>
            </>
          ) : (
            <>
              <Text className="text-base font-extrabold text-leaf">+{option.points} pts</Text>
              <Text className="text-xs text-muted">{formatCo2(option.co2SavedKg)} évité</Text>
            </>
          )}
        </View>
        {selected ? (
          <View className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full bg-leaf">
            <Icon name="checkmark" size={13} color={colors.white} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
