/**
 * Vélib' station rows and cards: bikes (mechanical / electric) and free docks.
 */
import { ActivityIndicator, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { McIcon, type McIconName } from "@/components/Icon";
import { availabilityLevel, type BikeStation } from "@/domain/bikeshare";
import { formatDistance } from "@/domain/format";
import { colors } from "@/theme/colors";

const LEVEL_COLORS = {
  none: { fg: colors.danger, bg: colors.dangerSoft },
  low: { fg: colors.amber, bg: colors.amberSoft },
  ok: { fg: colors.leaf, bg: colors.leafSoft },
} as const;

function Count({ icon, value, label, color }: { icon: McIconName; value: number; label: string; color?: string }) {
  const level = LEVEL_COLORS[availabilityLevel(value)];
  return (
    <View
      className="flex-row items-center gap-1 rounded-lg px-2 py-1"
      style={{ backgroundColor: level.bg }}
      accessibilityLabel={`${value} ${label}`}
    >
      <McIcon name={icon} size={14} color={color ?? level.fg} />
      <Text className="text-xs font-extrabold" style={{ color: level.fg }}>
        {value}
      </Text>
    </View>
  );
}

/** "Hôtel de Ville · 120 m — 🚲 20 ⚡ 6 🅿 12" */
export function VelibStationRow({ station, first = false }: { station: BikeStation; first?: boolean }) {
  const closed = !station.renting && !station.returning;
  return (
    <View className={`flex-row items-center gap-3 py-2.5 ${first ? "" : "border-t border-line"}`}>
      <View className="h-8 w-8 items-center justify-center rounded-full bg-leaf-soft">
        <McIcon name="bicycle" size={17} color={colors.leaf} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-forest" numberOfLines={2}>
          {station.name}
        </Text>
        <Text className="text-xs text-muted">
          {station.distanceM != null ? formatDistance(station.distanceM / 1000) : ""}
          {closed ? " · station fermée" : ""}
        </Text>
      </View>
      {closed ? null : (
        <View className="flex-row gap-1.5">
          <Count icon="bicycle" value={station.mechanical} label="vélos mécaniques" />
          <Count icon="lightning-bolt" value={station.ebikes} label="vélos électriques" color={colors.sky} />
          <Count icon="parking" value={station.docks} label="places libres" />
        </View>
      )}
    </View>
  );
}

interface VelibCardProps {
  title: string;
  stations: BikeStation[] | null;
  loading: boolean;
  error?: string | null;
  emptyText: string;
}

/** A titled list of nearby stations with loading / empty / error states. */
export function VelibCard({ title, stations, loading, error, emptyText }: VelibCardProps) {
  return (
    <Card className="py-3">
      <Text className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{title}</Text>
      {loading && !stations ? (
        <ActivityIndicator color={colors.leaf} style={{ marginVertical: 8 }} />
      ) : error ? (
        <Text className="py-1 text-sm text-muted">{error}</Text>
      ) : !stations || stations.length === 0 ? (
        <Text className="py-1 text-sm text-muted">{emptyText}</Text>
      ) : (
        stations.map((s, i) => <VelibStationRow key={s.id} station={s} first={i === 0} />)
      )}
    </Card>
  );
}

/** Legend under Vélib' lists. */
export function VelibLegend() {
  return (
    <View className="mt-2 flex-row flex-wrap items-center justify-center gap-3">
      <View className="flex-row items-center gap-1">
        <McIcon name="bicycle" size={12} color={colors.muted} />
        <Text className="text-[11px] text-muted">mécaniques</Text>
      </View>
      <View className="flex-row items-center gap-1">
        <McIcon name="lightning-bolt" size={12} color={colors.sky} />
        <Text className="text-[11px] text-muted">électriques</Text>
      </View>
      <View className="flex-row items-center gap-1">
        <McIcon name="parking" size={12} color={colors.muted} />
        <Text className="text-[11px] text-muted">places libres</Text>
      </View>
      <Text className="text-[11px] text-faint">· Vélib' Métropole, temps réel</Text>
    </View>
  );
}
