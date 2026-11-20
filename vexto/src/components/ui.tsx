/**
 * Small presentational building blocks shared by every screen.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Pressable, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Icon, McIcon, type IconName } from "@/components/Icon";
import { MODES } from "@/constants/modes";
import { initials } from "@/domain/format";
import { haptic } from "@/lib/haptics";
import { avatarColor, colors } from "@/theme/colors";
import type { TripMode } from "@/types/database";

// ScreenHeader -----------------------------------------------------------------

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onBack?: () => void;
}

export function ScreenHeader({ title, subtitle, right, onBack }: ScreenHeaderProps) {
  return (
    <View className="mb-4 mt-2 flex-row items-center gap-3">
      {onBack ? (
        <Pressable
          onPress={() => {
            haptic.tap();
            onBack();
          }}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full border border-line bg-card active:opacity-70"
        >
          <Icon name="chevron-back" size={20} />
        </Pressable>
      ) : null}
      <View className="flex-1">
        <Text className="text-2xl font-bold text-forest" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text className="mt-0.5 text-sm text-muted">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

// SectionHeader ----------------------------------------------------------------

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View className="mb-2 mt-1 flex-row items-center justify-between">
      <Text className="text-xs font-bold uppercase tracking-wider text-muted">{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          <Text className="text-sm font-semibold text-leaf">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Chip ---------------------------------------------------------------------------

export type ChipTone = "leaf" | "amber" | "sky" | "violet" | "muted" | "danger" | "dark" | "overlay";

const CHIP_TONES: Record<ChipTone, { bg: string; fg: string }> = {
  leaf: { bg: colors.leafSoft, fg: colors.leaf },
  amber: { bg: colors.amberSoft, fg: colors.amber },
  sky: { bg: colors.skySoft, fg: colors.sky },
  violet: { bg: colors.violetSoft, fg: colors.violet },
  muted: { bg: "#EFEEE8", fg: colors.muted },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  dark: { bg: "rgba(255,255,255,0.14)", fg: colors.white },
  /** Solid dark pill for text drawn over bright illustrations (forest sky). */
  overlay: { bg: "rgba(16,43,25,0.78)", fg: colors.white },
};

interface ChipProps {
  label: string;
  tone?: ChipTone;
  icon?: IconName;
  emoji?: string;
}

export function Chip({ label, tone = "leaf", icon, emoji }: ChipProps) {
  const t = CHIP_TONES[tone];
  return (
    <View
      className="flex-row items-center gap-1 self-start rounded-full px-2.5 py-1"
      style={{ backgroundColor: t.bg }}
    >
      {icon ? <Icon name={icon} size={12} color={t.fg} /> : null}
      {emoji ? <Text className="text-xs">{emoji}</Text> : null}
      <Text className="text-xs font-semibold" style={{ color: t.fg }}>
        {label}
      </Text>
    </View>
  );
}

// ProgressBar ----------------------------------------------------------------------

interface ProgressBarProps {
  value: number; // 0..1
  color?: string;
  trackColor?: string;
  height?: number;
}

export function ProgressBar({
  value,
  color = colors.leaf,
  trackColor = colors.line,
  height = 8,
}: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: clamped, duration: 700, useNativeDriver: false }).start();
  }, [anim, clamped]);
  return (
    <View
      style={{ height, borderRadius: height / 2, backgroundColor: trackColor, overflow: "hidden" }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Animated.View
        style={{
          height,
          borderRadius: height / 2,
          backgroundColor: color,
          width: anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
        }}
      />
    </View>
  );
}

// EmptyState -------------------------------------------------------------------------

interface EmptyStateProps {
  emoji: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ emoji, title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View className="items-center rounded-2xl border border-dashed border-line bg-card px-6 py-8">
      <Text className="mb-2 text-4xl">{emoji}</Text>
      <Text className="text-center text-base font-semibold text-forest">{title}</Text>
      {message ? <Text className="mt-1 text-center text-sm text-muted">{message}</Text> : null}
      {actionLabel && onAction ? (
        <View className="mt-4 w-full">
          <Button label={actionLabel} onPress={onAction} variant="soft" size="sm" />
        </View>
      ) : null}
    </View>
  );
}

// Banner (error / info) -------------------------------------------------------------------

interface BannerProps {
  tone?: "danger" | "info" | "success" | "warning";
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

const BANNER_TONES = {
  danger: { bg: colors.dangerSoft, fg: colors.danger, icon: "alert-circle-outline" as IconName },
  info: { bg: colors.skySoft, fg: colors.sky, icon: "information-circle-outline" as IconName },
  success: { bg: colors.leafSoft, fg: colors.leaf, icon: "checkmark-circle" as IconName },
  warning: { bg: colors.amberSoft, fg: colors.amber, icon: "alert-circle-outline" as IconName },
};

export function Banner({ tone = "info", title, message, actionLabel, onAction }: BannerProps) {
  const t = BANNER_TONES[tone];
  return (
    <View className="mb-4 flex-row gap-3 rounded-2xl p-4" style={{ backgroundColor: t.bg }}>
      <Icon name={t.icon} size={20} color={t.fg} />
      <View className="flex-1">
        {title ? (
          <Text className="text-sm font-bold" style={{ color: t.fg }}>
            {title}
          </Text>
        ) : null}
        <Text className="text-sm text-forest">{message}</Text>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} className="mt-2" accessibilityRole="button" hitSlop={6}>
            <Text className="text-sm font-bold" style={{ color: t.fg }}>
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// Avatar -------------------------------------------------------------------------------------

interface AvatarProps {
  name: string | null | undefined;
  seed: string;
  size?: number;
  ring?: string;
}

export function Avatar({ name, seed, size = 44, ring }: AvatarProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: avatarColor(seed),
        borderWidth: ring ? 3 : 0,
        borderColor: ring,
      }}
      className="items-center justify-center"
    >
      <Text style={{ fontSize: size * 0.38 }} className="font-bold text-white">
        {initials(name)}
      </Text>
    </View>
  );
}

// ModeIcon -------------------------------------------------------------------------------------

interface ModeIconProps {
  mode: TripMode;
  size?: number;
}

export function ModeIcon({ mode, size = 44 }: ModeIconProps) {
  const meta = MODES[mode];
  return (
    <View
      style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: meta.tint }}
      className="items-center justify-center"
    >
      <McIcon name={meta.icon} size={size * 0.52} color={meta.color} />
    </View>
  );
}

// StatTile -------------------------------------------------------------------------------------

interface StatTileProps {
  label: string;
  value: string;
  icon?: IconName;
  color?: string;
  hint?: string;
  onPress?: () => void;
}

export function StatTile({ label, value, icon, color = colors.forest, hint, onPress }: StatTileProps) {
  const content = (
    <>
      <View className="mb-1 flex-row items-center gap-1.5">
        {icon ? <Icon name={icon} size={14} color={colors.muted} /> : null}
        <Text className="text-xs text-muted" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text className="text-xl font-bold" style={{ color }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? (
        <Text className="mt-0.5 text-[11px] text-muted" numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={() => {
          haptic.tap();
          onPress();
        }}
        accessibilityRole="button"
        className="flex-1 rounded-2xl border border-line bg-card p-3.5 active:opacity-80"
      >
        {content}
      </Pressable>
    );
  }
  return <View className="flex-1 rounded-2xl border border-line bg-card p-3.5">{content}</View>;
}

// Segmented control -----------------------------------------------------------------------------

interface SegmentedProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <View className="mb-4 flex-row rounded-2xl bg-line/60 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (!active) haptic.tap();
              onChange(o.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={`flex-1 items-center rounded-xl py-2 ${active ? "bg-card" : ""}`}
          >
            <Text className={`text-sm font-semibold ${active ? "text-forest" : "text-muted"}`}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
