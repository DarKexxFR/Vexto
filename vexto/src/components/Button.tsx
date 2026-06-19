import { ActivityIndicator, Pressable, Text } from "react-native";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
}

const containerByVariant: Record<Variant, string> = {
  primary: "bg-forest",
  secondary: "bg-leaf",
  ghost: "bg-transparent border border-line",
};

const textByVariant: Record<Variant, string> = {
  primary: "text-white",
  secondary: "text-white",
  ghost: "text-forest",
};

export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`h-13 flex-row items-center justify-center rounded-2xl px-5 py-4 ${containerByVariant[variant]} ${isDisabled ? "opacity-50" : ""}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === "ghost" ? "#102B19" : "#FFFFFF"} />
      ) : (
        <Text className={`text-base font-semibold ${textByVariant[variant]}`}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
