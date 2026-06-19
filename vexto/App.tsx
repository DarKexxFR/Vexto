import "./global.css";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useAuthSession } from "@/hooks/useAuthSession";
import { AuthScreen } from "@/screens/AuthScreen";
import { RootNavigator } from "@/navigation/RootNavigator";
import { useAppStore } from "@/store/useAppStore";
import { colors } from "@/theme/colors";

function Gate() {
  const { ready } = useAuthSession();
  const session = useAppStore((s) => s.session);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.mineral,
        }}
      >
        <ActivityIndicator size="large" color={colors.forest} />
      </View>
    );
  }

  return session ? <RootNavigator /> : <AuthScreen />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Gate />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
