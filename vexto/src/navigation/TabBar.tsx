import { useEffect, useState } from "react";
import { Keyboard, Platform, Pressable, Text, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "@/components/Icon";
import { haptic } from "@/lib/haptics";
import type { TabParamList } from "@/navigation/types";
import { colors, shadows } from "@/theme/colors";

interface TabConfig {
  label: string;
  icon: IconName;
  iconActive: IconName;
  primary?: boolean;
}

const TABS: Record<keyof TabParamList, TabConfig> = {
  Home: { label: "Accueil", icon: "home-outline", iconActive: "home" },
  Leaderboard: { label: "Classement", icon: "trophy-outline", iconActive: "trophy" },
  Route: { label: "Trajet", icon: "navigate", iconActive: "navigate", primary: true },
  Rewards: { label: "Récompenses", icon: "gift-outline", iconActive: "gift" },
  Profile: { label: "Profil", icon: "person-outline", iconActive: "person" },
};

/** Custom bottom bar: pill highlight + a raised central "Trajet" button. */
export function VextoTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Android resizes the window for the keyboard: hide the bar meanwhile.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (keyboardOpen) return null;

  return (
    <View
      style={[{ paddingBottom: Math.max(insets.bottom, 10) }, shadows.soft]}
      className="flex-row items-end border-t border-line bg-card px-1 pt-2"
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const cfg = TABS[route.name as keyof TabParamList];
        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            haptic.tap();
            navigation.navigate(route.name);
          }
        };

        if (cfg.primary) {
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityLabel={cfg.label}
              accessibilityState={{ selected: focused }}
              className="flex-1 items-center active:opacity-80"
            >
              <View
                style={[{ marginTop: -26 }, shadows.floating]}
                className={`h-[58px] w-[58px] items-center justify-center rounded-full border-4 border-mineral ${focused ? "bg-leaf" : "bg-forest"}`}
              >
                <Icon name={cfg.icon} size={24} color={colors.white} />
              </View>
              <Text
                className={`mt-1 text-[11px] ${focused ? "font-bold text-forest" : "font-medium text-muted"}`}
              >
                {cfg.label}
              </Text>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityLabel={cfg.label}
            accessibilityState={{ selected: focused }}
            className="flex-1 items-center active:opacity-70"
          >
            <View className={`rounded-full px-4 py-1 ${focused ? "bg-leaf-soft" : ""}`}>
              <Icon
                name={focused ? cfg.iconActive : cfg.icon}
                size={21}
                color={focused ? colors.forest : colors.muted}
              />
            </View>
            <Text
              numberOfLines={1}
              className={`mt-1 text-[11px] ${focused ? "font-bold text-forest" : "font-medium text-muted"}`}
            >
              {cfg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
