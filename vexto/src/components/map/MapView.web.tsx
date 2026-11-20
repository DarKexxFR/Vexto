import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";

import { buildMapHtml, type MapCommand, type MapMessage } from "@/components/map/mapHtml";
import { MapStatusOverlay } from "@/components/map/MapStatusOverlay";
import { useMapSync, type MapViewProps } from "@/components/map/useMapSync";

export type { MapViewProps } from "@/components/map/useMapSync";

type MapWindow = Window & Partial<Record<`__${MapCommand}`, (payload: unknown) => void>>;

/**
 * Web version: the same Mapbox page in a same-origin `srcdoc` iframe
 * (react-native-webview has no web implementation).
 */
export function MapView(props: MapViewProps) {
  const { token, height, onUserPan } = props;
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const html = useMemo(() => buildMapHtml(token), [token]);
  const onUserPanRef = useRef(onUserPan);
  onUserPanRef.current = onUserPan;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      try {
        const msg = JSON.parse(String(event.data)) as MapMessage;
        if (msg.type === "ready") setReady(true);
        else if (msg.type === "error") setError(msg.message);
        else if (msg.type === "userPan") onUserPanRef.current?.();
      } catch {
        // ignore foreign messages
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const send = useCallback((command: MapCommand, payload: unknown) => {
    const win = frame.current?.contentWindow as MapWindow | null | undefined;
    win?.[`__${command}`]?.(payload);
  }, []);

  useMapSync(send, ready, props);

  return (
    <View
      style={height != null ? { height } : { flex: 1 }}
      className={`overflow-hidden ${height != null ? "rounded-2xl border border-line" : ""}`}
    >
      <iframe
        ref={frame}
        srcDoc={html}
        title="Carte"
        style={{ border: 0, width: "100%", height: "100%", display: "block" }}
      />
      <MapStatusOverlay ready={ready} error={error} />
    </View>
  );
}
