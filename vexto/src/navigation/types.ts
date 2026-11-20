import {
  useNavigation,
  type CompositeNavigationProp,
  type NavigatorScreenParams,
} from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

export type TabParamList = {
  Home: undefined;
  Leaderboard: undefined;
  Route: undefined;
  Rewards: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Forest: undefined;
  History: undefined;
};

export type AppNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

/** Typed navigation usable from tabs and stack screens alike. */
export function useAppNavigation(): AppNavigation {
  return useNavigation<AppNavigation>();
}
