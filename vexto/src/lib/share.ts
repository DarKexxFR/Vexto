import { Share } from "react-native";
import * as Clipboard from "expo-clipboard";

import { notify } from "@/lib/dialogs";

/** Copy text; resolves false when the platform refuses (e.g. web permissions). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Native share sheet, with a graceful fallback where sharing is unsupported
 * (desktop browsers): the message is copied to the clipboard instead.
 */
export async function shareText(message: string): Promise<void> {
  try {
    await Share.share({ message });
  } catch {
    const copied = await copyText(message);
    notify(
      copied ? "Texte copié" : "Partage indisponible",
      copied ? "Le message a été copié, collez-le où vous voulez." : message,
    );
  }
}
