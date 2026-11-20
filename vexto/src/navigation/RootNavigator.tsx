import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { VextoTabBar } from "@/navigation/TabBar";
import type { RootStackParamList, TabParamList } from "@/navigation/types";
import { ForestScreen } from "@/screens/ForestScreen";
import { HomeScreen } from "@/screens/HomeScreen";
import { LeaderboardScreen } from "@/screens/LeaderboardScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";
import { RewardsScreen } from "@/screens/RewardsScreen";
import { RouteScreen } from "@/screens/RouteScreen";
import { TripHistoryScreen } from "@/screens/TripHistoryScreen";
import { colors } from "@/theme/colors";

export type { RootStackParamList, TabParamList } from "@/navigation/types";

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.mineral,
    card: colors.card,
    border: colors.line,
    primary: colors.forest,
    text: colors.ink,
  },
};

function Tabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <VextoTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: "Accueil" }} />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen} options={{ title: "Classement" }} />
      <Tab.Screen name="Route" component={RouteScreen} options={{ title: "Trajet" }} />
      <Tab.Screen name="Rewards" component={RewardsScreen} options={{ title: "Récompenses" }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: "Profil" }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.mineral } }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="Forest" component={ForestScreen} options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="History" component={TripHistoryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
