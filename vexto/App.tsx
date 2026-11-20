import "./global.css";
import { ActivityIndicator, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useAuthSession } from "@/hooks/useAuthSession";
import { isSupabaseConfigured } from "@/lib/config";
import { RootNavigator } from "@/navigation/RootNavigator";
import { AuthScreen } from "@/screens/AuthScreen";
import { ConfigErrorScreen } from "@/screens/ConfigErrorScreen";
import { useAppStore } from "@/store/useAppStore";
import { colors } from "@/theme/colors";

function Splash() {
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest }}
    >
      <Text style={{ fontSize: 48 }}>🌿</Text>
      <Text style={{ marginTop: 8, fontSize: 28, fontWeight: "800", color: colors.white }}>Vexto</Text>
      <ActivityIndicator style={{ marginTop: 24 }} color={colors.leafBright} />
    </View>
  );
}

function Gate() {
  const { ready } = useAuthSession();
  const session = useAppStore((s) => s.session);

  if (!ready) return <Splash />;
  return session ? <RootNavigator /> : <AuthScreen />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {isSupabaseConfigured ? <Gate /> : <ConfigErrorScreen />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
