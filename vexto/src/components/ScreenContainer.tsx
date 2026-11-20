import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { colors } from "@/theme/colors";

interface ScreenContainerProps {
  children: ReactNode;
  scroll?: boolean;
  /** Pull-to-refresh handler (scroll mode only). */
  onRefresh?: () => void;
  refreshing?: boolean;
  edges?: Edge[];
  /** Extra content padding classes. */
  contentClassName?: string;
}

/** Standard page shell: safe area + mineral-beige background + padding. */
export function ScreenContainer({
  children,
  scroll = true,
  onRefresh,
  refreshing = false,
  edges = ["top"],
  contentClassName = "",
}: ScreenContainerProps) {
  return (
    <SafeAreaView className="flex-1 bg-mineral" edges={edges}>
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName={`px-5 pb-12 pt-2 ${contentClassName}`}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.leaf}
                colors={[colors.leaf]}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View className={`flex-1 px-5 pt-2 ${contentClassName}`}>{children}</View>
      )}
    </SafeAreaView>
  );
}
