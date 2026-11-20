import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/** Fire-and-forget haptic feedback; silently no-ops where unsupported (web). */
const enabled = Platform.OS === "ios" || Platform.OS === "android";

function run(fn: () => Promise<void>): void {
  if (!enabled) return;
  fn().catch(() => {
    // haptics are a nicety, never an error
  });
}

export const haptic = {
  tap: () => run(() => Haptics.selectionAsync()),
  light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
