import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Icon, type IconName } from "@/components/Icon";
import { haptic } from "@/lib/haptics";
import { colors } from "@/theme/colors";

type Variant = "primary" | "secondary" | "ghost" | "soft" | "danger" | "light";
type Size = "md" | "sm";

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the parent's width (default true). */
  block?: boolean;
  accessibilityHint?: string;
}

const containerByVariant: Record<Variant, string> = {
  primary: "bg-forest",
  secondary: "bg-leaf",
  ghost: "bg-transparent border border-line",
  soft: "bg-leaf-soft",
  danger: "bg-danger-soft",
  light: "bg-white",
};

const textByVariant: Record<Variant, string> = {
  primary: "text-white",
  secondary: "text-white",
  ghost: "text-forest",
  soft: "text-leaf",
  danger: "text-danger",
  light: "text-forest",
};

const iconColorByVariant: Record<Variant, string> = {
  primary: colors.white,
  secondary: colors.white,
  ghost: colors.forest,
  soft: colors.leaf,
  danger: colors.danger,
  light: colors.forest,
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  disabled = false,
  block = true,
  accessibilityHint,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const sizing = size === "sm" ? "h-10 px-4 rounded-xl" : "h-14 px-5 rounded-2xl";
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      className={`flex-row items-center justify-center ${sizing} ${containerByVariant[variant]} ${block ? "" : "self-start"} ${isDisabled ? "opacity-50" : "active:opacity-80"}`}
    >
      {loading ? (
        <ActivityIndicator color={iconColorByVariant[variant]} />
      ) : (
        <View className="flex-row items-center gap-2">
          {icon ? (
            <Icon name={icon} size={size === "sm" ? 16 : 19} color={iconColorByVariant[variant]} />
          ) : null}
          <Text
            className={`${size === "sm" ? "text-sm" : "text-base"} font-semibold ${textByVariant[variant]}`}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
