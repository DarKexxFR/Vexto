import { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface ScreenContainerProps {
  children: ReactNode;
  scroll?: boolean;
}

/** Standard page shell: safe area + mineral-beige background + padding. */
export function ScreenContainer({ children, scroll = true }: ScreenContainerProps) {
  return (
    <SafeAreaView className="flex-1 bg-mineral" edges={["top"]}>
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-10 pt-2"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1 px-5 pt-2">{children}</View>
      )}
    </SafeAreaView>
  );
}
