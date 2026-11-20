import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { MapView } from "@/components/map/MapView";
import { ScreenContainer } from "@/components/ScreenContainer";
import { lineSegments, linePoints } from "@/components/transit/journeyMap";
import { LineBadgeView } from "@/components/transit/TransitViews";
import { Banner, Chip, ScreenHeader, SectionHeader } from "@/components/ui";
import type { LineDetail } from "@/domain/transit";
import { config, isMapboxConfigured } from "@/lib/config";
import { haptic } from "@/lib/haptics";
import { fetchLine, transitErrorMessage } from "@/lib/transit";
import type { RootStackParamList } from "@/navigation/types";
import { colors } from "@/theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Line">;

/** A line's official shape, service hours and ordered stops. */
export function LineScreen({ route, navigation }: Props) {
  const { id, name } = route.params;
  const [detail, setDetail] = useState<LineDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchLine(id)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        if (!d) setError("Ligne introuvable.");
      })
      .catch((e: unknown) => alive && setError(transitErrorMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  const segments = useMemo(() => lineSegments(detail), [detail]);
  const points = useMemo(() => linePoints(detail), [detail]);
  const title = detail ? `${detail.badge.modeLabel} ${detail.badge.code}` : (name ?? "Ligne");

  return (
    <ScreenContainer>
      <ScreenHeader title={title} subtitle={detail?.badge.network || "Tracé et arrêts"} onBack={() => navigation.goBack()} />

      {error ? <Banner tone="warning" message={error} /> : null}

      {loading ? (
        <View className="items-center py-12">
          <ActivityIndicator color={colors.leaf} />
        </View>
      ) : detail ? (
        <>
          <Card className="mb-4 flex-row items-center gap-3">
            <LineBadgeView line={detail.badge} size="lg" />
            <View className="flex-1">
              <Text className="text-base font-bold text-forest" numberOfLines={2}>
                {detail.name !== detail.badge.code ? detail.name : title}
              </Text>
              <View className="mt-1 flex-row flex-wrap gap-1.5">
                {detail.openingTime ? <Chip label={`1er départ ${detail.openingTime}`} icon="sunny-outline" tone="amber" /> : null}
                {detail.closingTime ? <Chip label={`Dernier ${detail.closingTime}`} icon="moon-outline" tone="sky" /> : null}
              </View>
            </View>
          </Card>

          {isMapboxConfigured && segments ? (
            <View className="mb-4">
              <MapView
                token={config.mapboxToken}
                start={null}
                end={null}
                routeGeometry={null}
                segments={segments}
                points={points}
                height={260}
              />
            </View>
          ) : null}

          <SectionHeader title={`Arrêts · ${detail.stops.length}`} />
          <Card className="py-2">
            {detail.stops.map((s, i) => {
              const first = i === 0;
              const last = i === detail.stops.length - 1;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    haptic.tap();
                    navigation.navigate("Stop", { id: s.id, name: s.name, coords: s.coords, lineId: id });
                  }}
                  accessibilityRole="button"
                  className="flex-row items-center active:opacity-70"
                >
                  <View className="w-7 items-center self-stretch">
                    <View
                      style={{
                        position: "absolute",
                        top: first ? "50%" : 0,
                        bottom: last ? "50%" : 0,
                        width: 4,
                        backgroundColor: detail.badge.color,
                      }}
                    />
                    <View
                      style={{ marginTop: "auto", marginBottom: "auto", borderColor: detail.badge.color }}
                      className={`rounded-full border-[3px] bg-white ${first || last ? "h-4 w-4" : "h-3 w-3"}`}
                    />
                  </View>
                  <Text
                    className={`flex-1 py-2.5 pl-2 text-sm ${first || last ? "font-extrabold text-forest" : "text-forest"}`}
                    numberOfLines={1}
                  >
                    {s.name}
                  </Text>
                  <Icon name="time-outline" size={16} color={colors.faint} />
                </Pressable>
              );
            })}
          </Card>
          <Text className="mt-3 text-center text-[11px] text-faint">
            Touchez un arrêt pour ses prochains passages · données Île-de-France Mobilités
          </Text>
        </>
      ) : null}
    </ScreenContainer>
  );
}
