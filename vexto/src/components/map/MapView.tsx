import { useCallback, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { buildMapHtml, type MapCommand, type MapMessage } from "@/components/map/mapHtml";
import { MapStatusOverlay } from "@/components/map/MapStatusOverlay";
import { useMapSync, type MapViewProps } from "@/components/map/useMapSync";
import { colors } from "@/theme/colors";

export type { MapViewProps } from "@/components/map/useMapSync";

/** Mapbox GL JS in a WebView (works in Expo Go, no native SDK needed). */
export function MapView(props: MapViewProps) {
  const { token, height, onUserPan } = props;
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const html = useMemo(() => buildMapHtml(token), [token]);

  const send = useCallback((command: MapCommand, payload: unknown) => {
    ref.current?.injectJavaScript(
      `window.__${command} && window.__${command}(${JSON.stringify(payload)}); true;`,
    );
  }, []);

  useMapSync(send, ready, props);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as MapMessage;
      if (msg.type === "ready") setReady(true);
      else if (msg.type === "error") setError(msg.message);
      else if (msg.type === "userPan") onUserPan?.();
    } catch {
      // ignore malformed messages
    }
  };

  return (
    <View
      style={height != null ? { height } : { flex: 1 }}
      className={`overflow-hidden ${height != null ? "rounded-2xl border border-line" : ""}`}
    >
      <WebView
        ref={ref}
        originWhitelist={["*"]}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        onMessage={onMessage}
        style={{ flex: 1, backgroundColor: colors.mineral }}
        scrollEnabled={false}
        overScrollMode="never"
      />
      <MapStatusOverlay ready={ready} error={error} />
    </View>
  );
}
