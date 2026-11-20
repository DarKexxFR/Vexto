import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from "react-native";

import { mulberry32 } from "@/domain/forest";
import { colors } from "@/theme/colors";

const PALETTE = [colors.leaf, colors.leafBright, colors.amber, colors.sky, colors.violet, "#F4A7C0", "#FFD566"];

interface ConfettiProps {
  /** Change this value to fire a new burst. */
  burstKey: number;
  count?: number;
}

/** Lightweight confetti rain built on the core Animated API (no deps). */
export function Confetti({ burstKey, count = 40 }: ConfettiProps) {
  const { width, height } = useWindowDimensions();
  const progress = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;

  const pieces = useMemo(() => {
    const rng = mulberry32(burstKey + 1);
    return Array.from({ length: count }, (_, i) => ({
      left: rng() * width,
      drift: (rng() - 0.5) * 140,
      size: 6 + rng() * 7,
      color: PALETTE[i % PALETTE.length] ?? colors.leaf,
      spin: 360 + rng() * 720,
      delay: rng() * 450,
      duration: 1800 + rng() * 1400,
      round: rng() > 0.6,
    }));
  }, [burstKey, count, width]);

  useEffect(() => {
    if (burstKey === 0) return;
    const animations = progress.map((v, i) => {
      v.setValue(0);
      const p = pieces[i];
      return Animated.timing(v, {
        toValue: 1,
        duration: p?.duration ?? 2000,
        delay: p?.delay ?? 0,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== "web",
      });
    });
    Animated.parallel(animations).start();
  }, [burstKey, pieces, progress]);

  if (burstKey === 0) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => {
        const v = progress[i];
        if (!v) return null;
        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              top: -20,
              left: p.left,
              width: p.size,
              height: p.round ? p.size : p.size * 0.5,
              borderRadius: p.round ? p.size / 2 : 2,
              backgroundColor: p.color,
              opacity: v.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, height + 40] }) },
                { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
                { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.spin}deg`] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
