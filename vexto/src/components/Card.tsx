import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { haptic } from "@/lib/haptics";

interface CardProps {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** Makes the whole card tappable. */
  onPress?: () => void;
  accessibilityLabel?: string;
}

/** White surface with the subtle Sage-Tech border. No heavy shadows. */
export function Card({ children, className = "", style, onPress, accessibilityLabel }: CardProps) {
  const classes = `rounded-2xl border border-line bg-card p-4 ${className}`;
  if (!onPress) {
    return (
      <View className={classes} style={style}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`${classes} active:opacity-80`}
      style={style}
    >
      {children}
    </Pressable>
  );
}
