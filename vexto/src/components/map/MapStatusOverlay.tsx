import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Icon } from "@/components/Icon";
import { colors } from "@/theme/colors";

interface MapStatusOverlayProps {
  ready: boolean;
  error: string | null;
}

/** Loading spinner / error card drawn above the map page. */
export function MapStatusOverlay({ ready, error }: MapStatusOverlayProps) {
  if (error) {
    return (
      <View style={StyleSheet.absoluteFill} className="items-center justify-center bg-mineral px-6">
        <Icon name="map-outline" size={28} color={colors.muted} />
        <Text className="mt-2 text-center text-sm font-semibold text-forest">Carte indisponible</Text>
        <Text className="mt-1 text-center text-xs text-muted">{error}</Text>
      </View>
    );
  }
  if (!ready) {
    return (
      <View style={StyleSheet.absoluteFill} className="items-center justify-center bg-mineral">
        <ActivityIndicator color={colors.leaf} />
      </View>
    );
  }
  return null;
}
