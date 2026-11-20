import * as Speech from "expo-speech";

/** Speak a French navigation instruction, interrupting any previous one. */
export function speak(text: string): void {
  if (!text.trim()) return;
  try {
    void Speech.stop();
    Speech.speak(text, { language: "fr-FR" });
  } catch {
    // voice guidance is best-effort
  }
}

export function stopSpeaking(): void {
  try {
    void Speech.stop();
  } catch {
    // ignore
  }
}
