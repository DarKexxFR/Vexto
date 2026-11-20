import type { ReactNode } from "react";
import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { formatInt } from "@/domain/format";
import { colors } from "@/theme/colors";

interface ScoreRingProps {
  /** 0..1 progress shown by the arc. */
  progress: number;
  /** Big number in the centre (ignored when `children` is given). */
  value?: number;
  label?: string;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  textColor?: string;
  labelColor?: string;
  children?: ReactNode;
}

/** Circular progress ring (e.g. progress toward the next level). */
export function ScoreRing({
  progress,
  value,
  label,
  size = 132,
  strokeWidth = 12,
  color = colors.leaf,
  trackColor = colors.line,
  textColor = colors.forest,
  labelColor = colors.muted,
  children,
}: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const dashOffset = circumference * (1 - ratio);

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View className="absolute items-center">
        {children ?? (
          <>
            <Text style={{ color: textColor, fontSize: size * 0.22 }} className="font-extrabold">
              {formatInt(value ?? 0)}
            </Text>
            {label ? (
              <Text style={{ color: labelColor }} className="text-xs">
                {label}
              </Text>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}
