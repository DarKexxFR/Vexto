/**
 * Whether the device itself is offline. Browsers (Safari: "Load failed") and
 * React Native report a blocked or unreachable server exactly like a missing
 * connection, so only claim "no internet" when the device says so.
 */
export function isDeviceOffline(): boolean {
  return typeof navigator !== "undefined" && "onLine" in navigator && navigator.onLine === false;
}
