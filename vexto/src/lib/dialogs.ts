import { Alert, Platform } from "react-native";

/**
 * Yes/no confirmation that also works on web (react-native-web's Alert does
 * not render buttons). Resolves true when the user confirms.
 */
export function confirmAsync(
  title: string,
  message: string,
  confirmLabel = "Confirmer",
  destructive = false,
): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? true);
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: "Annuler", style: "cancel", onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Simple informational message (web: window.alert). */
export function notify(title: string, message: string): void {
  if (Platform.OS === "web") {
    globalThis.alert?.(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
