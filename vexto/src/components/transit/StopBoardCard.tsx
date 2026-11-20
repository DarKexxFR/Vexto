import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { Icon, McIcon } from "@/components/Icon";
import { DepartureRow } from "@/components/transit/TransitViews";
import { formatDistance } from "@/domain/format";
import type { DepartureGroup } from "@/domain/transit";
import { colors } from "@/theme/colors";

interface StopBoardCardProps {
  name: string;
  distanceM?: number | null;
  /** undefined = loading, "error" = unavailable. */
  groups: DepartureGroup[] | "error" | undefined;
  now: Date;
  favorite: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
  maxRows?: number;
}

/** A stop with its next departures (Horaires tab, Home). */
export function StopBoardCard({
  name,
  distanceM,
  groups,
  now,
  favorite,
  onToggleFavorite,
  onOpen,
  maxRows = 4,
}: StopBoardCardProps) {
  return (
    <Card className="mb-3" onPress={onOpen} accessibilityLabel={`Arrêt ${name}`}>
      <View className="flex-row items-center gap-2">
        <View className="h-8 w-8 items-center justify-center rounded-lg bg-sky-soft">
          <McIcon name="bus-stop" size={18} color={colors.sky} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-forest" numberOfLines={1}>
            {name}
          </Text>
          {distanceM != null ? (
            <Text className="text-xs text-muted">à {formatDistance(distanceM / 1000)}</Text>
          ) : null}
        </View>
        <Pressable
          onPress={onToggleFavorite}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        >
          <Icon name={favorite ? "star" : "star-outline"} size={20} color={favorite ? colors.amber : colors.faint} />
        </Pressable>
      </View>

      <View className="mt-1">
        {groups === undefined ? (
          <View className="flex-row items-center gap-2 py-3">
            <ActivityIndicator size="small" color={colors.leaf} />
            <Text className="text-xs text-muted">Prochains passages…</Text>
          </View>
        ) : groups === "error" ? (
          <Text className="py-2 text-xs text-muted">Horaires indisponibles pour le moment.</Text>
        ) : groups.length === 0 ? (
          <Text className="py-2 text-xs text-muted">Aucun départ prévu dans les prochaines heures.</Text>
        ) : (
          groups.slice(0, maxRows).map((g, i) => (
            <View key={g.key} className={i > 0 ? "border-t border-line" : ""}>
              <DepartureRow group={g} now={now} />
            </View>
          ))
        )}
      </View>
      {Array.isArray(groups) && groups.length > maxRows ? (
        <Text className="mt-1 text-xs font-semibold text-leaf">+ {groups.length - maxRows} autres lignes →</Text>
      ) : null}
    </Card>
  );
}
