import { Text, View } from "react-native";

import { Chip, ModeIcon } from "@/components/ui";
import { MODES } from "@/constants/modes";
import { formatCo2, formatDistance, formatRelativeDay, formatTime } from "@/domain/format";
import { rejectionMessage, type TripListItem } from "@/lib/trips";

interface TripRowProps {
  trip: TripListItem;
  /** Show the day ("Hier", "lun. 12 nov.") in addition to the time. */
  showDay?: boolean;
}

export function TripRow({ trip, showDay = true }: TripRowProps) {
  const meta = MODES[trip.mode];
  const date = new Date(trip.created_at);
  const reason = rejectionMessage(trip);
  const points = Number(trip.points_awarded) || 0;

  return (
    <View className="flex-row items-center gap-3 py-3">
      <ModeIcon mode={trip.mode} size={42} />
      <View className="flex-1">
        <Text className="text-sm font-semibold text-forest" numberOfLines={1}>
          {meta.label}
        </Text>
        <Text className="text-xs text-muted" numberOfLines={1}>
          {showDay ? `${formatRelativeDay(date)} · ` : ""}
          {formatTime(date)} · {formatDistance(Number(trip.distance_km) || 0)}
        </Text>
        {reason ? (
          <Text className="mt-0.5 text-xs text-danger" numberOfLines={2}>
            {reason}
          </Text>
        ) : null}
      </View>
      <View className="items-end">
        {trip.status === "verified" ? (
          <>
            <Text className={`text-base font-bold ${points > 0 ? "text-leaf" : "text-muted"}`}>
              +{points} pts
            </Text>
            <Text className="text-xs text-muted">{formatCo2(Number(trip.co2_saved_kg) || 0)}</Text>
          </>
        ) : trip.status === "rejected" ? (
          <Chip label="Refusé" tone="danger" />
        ) : (
          <Chip label="En attente" tone="amber" />
        )}
      </View>
    </View>
  );
}
