import { Text } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import {
  createBottomTabNavigator,
  type BottomTabNavigationProp,
} from "@react-navigation/bottom-tabs";

import { colors } from "@/theme/colors";
import { HomeScreen } from "@/screens/HomeScreen";
import { RouteScreen } from "@/screens/RouteScreen";
import { LeaderboardScreen } from "@/screens/LeaderboardScreen";
import { RewardsScreen } from "@/screens/RewardsScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";

export type RootTabParamList = {
  Accueil: undefined;
  Trajet: undefined;
  Classement: undefined;
  Récompenses: undefined;
  Profil: undefined;
};

export type TabNavigation = BottomTabNavigationProp<RootTabParamList>;

const Tab = createBottomTabNavigator<RootTabParamList>();

const TAB_ICONS: Record<keyof RootTabParamList, string> = {
  Accueil: "🏠",
  Trajet: "🧭",
  Classement: "🏆",
  Récompenses: "🎁",
  Profil: "👤",
};

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

export function RootNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.forest,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopColor: colors.line,
          },
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.6 }}>
              {TAB_ICONS[route.name]}
            </Text>
          ),
        })}
      >
        <Tab.Screen name="Accueil">
          {({ navigation }) => (
            <HomeScreen onPlanTrip={() => navigation.navigate("Trajet")} />
          )}
        </Tab.Screen>
        <Tab.Screen name="Trajet" component={RouteScreen} />
        <Tab.Screen name="Classement" component={LeaderboardScreen} />
        <Tab.Screen name="Récompenses" component={RewardsScreen} />
        <Tab.Screen name="Profil" component={ProfileScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
