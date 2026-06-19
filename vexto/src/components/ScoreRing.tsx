import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { colors } from "@/theme/colors";

interface ScoreRingProps {
  value: number;
  max: number;
  size?: number;
  label?: string;
}

/** Circular progress ring used to show progress toward the next reward tier. */
export function ScoreRing({ value, max, size = 132, label }: ScoreRingProps) {
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const dashOffset = circumference * (1 - ratio);

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.line}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.leaf}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View className="absolute items-center">
        <Text className="text-3xl font-bold text-forest">
          {Math.round(value).toLocaleString("fr-FR")}
        </Text>
        {label ? <Text className="text-xs text-muted">{label}</Text> : null}
      </View>
    </View>
  );
}
