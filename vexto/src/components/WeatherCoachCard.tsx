import { useEffect } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { Icon, McIcon } from "@/components/Icon";
import { MODES } from "@/constants/modes";
import { describeWeather, type CoachTone } from "@/domain/weather";
import { useWeatherStore } from "@/store/useWeatherStore";
import { colors } from "@/theme/colors";
import type { TripMode } from "@/types/database";

const TONE: Record<CoachTone, { bg: string; fg: string }> = {
  great: { bg: colors.leafSoft, fg: colors.leaf },
  good: { bg: colors.skySoft, fg: colors.sky },
  caution: { bg: colors.amberSoft, fg: colors.amber },
};

interface WeatherCoachCardProps {
  onPlan: (mode: TripMode) => void;
}

/** "Coach météo": live conditions + the best low-carbon mode right now. */
export function WeatherCoachCard({ onPlan }: WeatherCoachCardProps) {
  const status = useWeatherStore((s) => s.status);
  const weather = useWeatherStore((s) => s.weather);
  const advice = useWeatherStore((s) => s.advice);
  const placeLabel = useWeatherStore((s) => s.placeLabel);
  const load = useWeatherStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "needs-location" && !weather) {
    return (
      <Card className="mb-4" onPress={() => void load({ askPermission: true, force: true })}>
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-sky-soft">
            <Text className="text-xl">🌤️</Text>
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold text-forest">Coach météo</Text>
            <Text className="text-xs text-muted">
              Activez la localisation pour savoir quel mode choisir selon la météo.
            </Text>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.muted} />
        </View>
      </Card>
    );
  }

  if (!weather || !advice) {
    if (status === "error") {
      return (
        <Card className="mb-4" onPress={() => void load({ force: true })}>
          <View className="flex-row items-center gap-3">
            <Icon name="cloud-offline-outline" size={20} color={colors.muted} />
            <Text className="flex-1 text-sm text-muted">Météo indisponible · toucher pour réessayer</Text>
          </View>
        </Card>
      );
    }
    return (
      <Card className="mb-4">
        <View className="flex-row items-center gap-3">
          <ActivityIndicator color={colors.leaf} />
          <Text className="text-sm text-muted">Le coach regarde le ciel…</Text>
        </View>
      </Card>
    );
  }

  const tone = TONE[advice.tone];
  const label = describeWeather(weather.weatherCode, weather.isDay);
  const meta = MODES[advice.mode];

  return (
    <Card className="mb-4">
      <View className="flex-row items-center gap-3">
        <View className="h-14 w-14 items-center justify-center rounded-2xl" style={{ backgroundColor: tone.bg }}>
          <Text className="text-2xl">{label.emoji}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-xs text-muted" numberOfLines={1}>
            Coach météo{placeLabel && placeLabel !== "Autour de vous" ? ` · ${placeLabel}` : ""} · {Math.round(weather.temperatureC)} °C, {label.label.toLowerCase()}
          </Text>
          <Text className="text-base font-bold text-forest" numberOfLines={1}>
            {advice.title}
          </Text>
        </View>
      </View>
      <Text className="mt-2 text-sm text-forest">{advice.message}</Text>
      <Pressable
        onPress={() => onPlan(advice.mode)}
        accessibilityRole="button"
        className="mt-3 flex-row items-center justify-between rounded-xl px-3 py-2.5 active:opacity-80"
        style={{ backgroundColor: tone.bg }}
      >
        <View className="flex-row items-center gap-2">
          <McIcon name={meta.icon} size={18} color={tone.fg} />
          <Text className="text-sm font-semibold" style={{ color: tone.fg }}>
            Planifier en {meta.shortLabel.toLowerCase()}
          </Text>
        </View>
        <Icon name="arrow-forward" size={16} color={tone.fg} />
      </Pressable>
    </Card>
  );
}
