import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Platform, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Confetti } from "@/components/Confetti";
import { Chip } from "@/components/ui";
import { MODES } from "@/constants/modes";
import type { AchievementState } from "@/domain/achievements";
import type { EquivalenceValue } from "@/domain/equivalences";
import { formatCo2, formatDistance } from "@/domain/format";
import type { Level } from "@/domain/levels";
import { haptic } from "@/lib/haptics";
import type { TripMode } from "@/types/database";

export type CelebrationData =
  | {
      kind: "verified";
      mode: TripMode;
      km: number;
      points: number;
      co2Kg: number;
      equivalence: EquivalenceValue | null;
      levelUp: Level | null;
      newBadges: AchievementState[];
      treesGained: number;
      newStageName: string | null;
      dailyCapHit: boolean;
    }
  | { kind: "rejected"; mode: TripMode; km: number; reason: string }
  | { kind: "neutral"; mode: TripMode; km: number; message: string }
  | { kind: "error"; message: string; canRetry: boolean };

interface TripCelebrationProps {
  data: CelebrationData | null;
  onClose: () => void;
  onSeeForest: () => void;
  /** Re-send a trip whose upload failed (network loss at the end of a trip). */
  onRetry?: () => void;
  retrying?: boolean;
}

function useCountUp(target: number, active: boolean): number {
  const [value, setValue] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    anim.setValue(0);
    const id = anim.addListener(({ value: v }) => setValue(Math.round(v)));
    Animated.timing(anim, {
      toValue: target,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [anim, target, active]);
  return value;
}

/** Post-trip sheet: celebrates verified trips, explains rejected ones. */
export function TripCelebration({ data, onClose, onSeeForest, onRetry, retrying = false }: TripCelebrationProps) {
  const visible = data !== null;
  const verified = data?.kind === "verified";
  const points = useCountUp(verified ? data.points : 0, verified);
  const [burst, setBurst] = useState(0);
  const scale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    if (!data) return;
    scale.setValue(0.85);
    Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: Platform.OS !== "web" }).start();
    if (data.kind === "verified") {
      haptic.success();
      setBurst((b) => b + 1);
    } else {
      haptic.warning();
    }
  }, [data, scale]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/50 px-5">
        <Animated.View style={{ transform: [{ scale }], width: "100%", maxWidth: 420 }}>
          <View className="rounded-3xl bg-card p-6">
            {data?.kind === "verified" ? (
              <>
                <Text className="text-center text-5xl">🎉</Text>
                <Text className="mt-2 text-center text-2xl font-extrabold text-forest">Trajet validé !</Text>
                <Text className="mt-1 text-center text-sm text-muted">
                  {MODES[data.mode].label} · {formatDistance(data.km)}
                </Text>

                <View className="mt-4 items-center rounded-2xl bg-leaf-soft py-4">
                  <Text className="text-4xl font-extrabold text-leaf">+{points}</Text>
                  <Text className="text-sm font-semibold text-leaf">points</Text>
                  <Text className="mt-1 text-sm text-forest">{formatCo2(data.co2Kg)} de CO₂ évité</Text>
                  {data.equivalence ? (
                    <Text className="mt-1 px-4 text-center text-xs text-muted">
                      ≈ {data.equivalence.equivalence.icon} {data.equivalence.value} {data.equivalence.label}
                    </Text>
                  ) : null}
                </View>

                {data.dailyCapHit ? (
                  <Text className="mt-2 text-center text-xs text-muted">
                    Plafond quotidien atteint : vos points reprendront demain.
                  </Text>
                ) : null}

                <View className="mt-4 gap-2">
                  {data.levelUp ? (
                    <View className="flex-row items-center gap-2 rounded-xl bg-amber-soft px-3 py-2">
                      <Text className="text-xl">{data.levelUp.icon}</Text>
                      <Text className="flex-1 text-sm font-semibold text-forest">
                        Nouveau niveau : {data.levelUp.name} !
                      </Text>
                    </View>
                  ) : null}
                  {data.treesGained > 0 ? (
                    <View className="flex-row items-center gap-2 rounded-xl bg-leaf-soft px-3 py-2">
                      <Text className="text-xl">🌳</Text>
                      <Text className="flex-1 text-sm font-semibold text-forest">
                        +{data.treesGained} arbre{data.treesGained > 1 ? "s" : ""} dans votre forêt
                      </Text>
                    </View>
                  ) : data.newStageName ? (
                    <View className="flex-row items-center gap-2 rounded-xl bg-leaf-soft px-3 py-2">
                      <Text className="text-xl">🌱</Text>
                      <Text className="flex-1 text-sm font-semibold text-forest">
                        Votre arbre grandit : {data.newStageName.toLowerCase()}
                      </Text>
                    </View>
                  ) : null}
                  {data.newBadges.length > 0 ? (
                    <View className="rounded-xl bg-sky-soft px-3 py-2">
                      <Text className="mb-1 text-sm font-semibold text-forest">
                        Succès débloqué{data.newBadges.length > 1 ? "s" : ""} :
                      </Text>
                      <View className="flex-row flex-wrap gap-1.5">
                        {data.newBadges.map((b) => (
                          <Chip key={b.id} label={b.title} emoji={b.icon} tone="sky" />
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>

                <View className="mt-5 gap-2">
                  <Button label="Voir ma forêt" icon="leaf" onPress={onSeeForest} />
                  <Button label="Fermer" variant="ghost" onPress={onClose} />
                </View>
              </>
            ) : data?.kind === "rejected" ? (
              <>
                <Text className="text-center text-5xl">🧐</Text>
                <Text className="mt-2 text-center text-xl font-extrabold text-forest">Trajet non validé</Text>
                <Text className="mt-1 text-center text-sm text-muted">
                  {MODES[data.mode].label} · {formatDistance(data.km)}
                </Text>
                <View className="mt-4 rounded-2xl bg-danger-soft p-4">
                  <Text className="text-sm text-forest">{data.reason}</Text>
                </View>
                <Text className="mt-3 text-center text-xs text-muted">
                  Les points sont vérifiés côté serveur pour que le classement reste équitable.
                </Text>
                <View className="mt-5">
                  <Button label="Compris" onPress={onClose} />
                </View>
              </>
            ) : data?.kind === "neutral" ? (
              <>
                <Text className="text-center text-5xl">{MODES[data.mode].emoji}</Text>
                <Text className="mt-2 text-center text-xl font-extrabold text-forest">Trajet enregistré</Text>
                <Text className="mt-1 text-center text-sm text-muted">
                  {MODES[data.mode].label} · {formatDistance(data.km)}
                </Text>
                <Text className="mt-4 text-center text-sm text-forest">{data.message}</Text>
                <View className="mt-5">
                  <Button label="Compris" onPress={onClose} />
                </View>
              </>
            ) : data?.kind === "error" ? (
              <>
                <Text className="text-center text-5xl">📡</Text>
                <Text className="mt-2 text-center text-xl font-extrabold text-forest">Envoi impossible</Text>
                <Text className="mt-2 text-center text-sm text-muted">{data.message}</Text>
                {data.canRetry ? (
                  <Text className="mt-2 text-center text-xs text-muted">
                    Votre trajet est conservé : réessayez dès que le réseau revient.
                  </Text>
                ) : null}
                <View className="mt-5 gap-2">
                  {data.canRetry && onRetry ? (
                    <Button label="Réessayer" icon="refresh" onPress={onRetry} loading={retrying} />
                  ) : null}
                  <Button label={data.canRetry ? "Abandonner ce trajet" : "Fermer"} variant="ghost" onPress={onClose} />
                </View>
              </>
            ) : null}
          </View>
        </Animated.View>
        <Confetti burstKey={verified ? burst : 0} />
      </View>
    </Modal>
  );
}
