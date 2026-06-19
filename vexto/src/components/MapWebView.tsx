import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { colors } from "@/theme/colors";
import type { GeoLineString } from "@/types/database";

interface MapWebViewProps {
  token: string;
  start: [number, number] | null;
  end: [number, number] | null;
  routeGeometry: GeoLineString | null;
  /** Live user position [lon, lat] (e.g. during navigation). */
  user?: [number, number] | null;
  /** When true, the map recenters on the user position as it updates. */
  followUser?: boolean;
  /** Map height in px. If omitted, the map fills its parent (flex: 1). */
  height?: number;
}

const PARIS: [number, number] = [2.3522, 48.8566];

function buildHtml(token: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no" />
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css" rel="stylesheet" />
  <script src="https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; }
    #map { background: ${colors.mineral}; }
    .user-dot {
      width: 18px; height: 18px; border-radius: 9px;
      background: #2563eb; border: 3px solid #fff;
      box-shadow: 0 0 0 3px rgba(37,99,235,0.25);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var post = function (msg) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      }
    };
    var startMarker = null, endMarker = null, userMarker = null, ready = false;

    mapboxgl.accessToken = ${JSON.stringify(token)};
    var map = new mapboxgl.Map({
      container: "map",
      style: "mapbox://styles/mapbox/light-v11",
      center: ${JSON.stringify(PARIS)},
      zoom: 10.5,
      attributionControl: false,
    });
    map.on("error", function (e) {
      post({ type: "error", message: (e && e.error && e.error.message) || "map error" });
    });

    function makeMarker(coords, color) {
      return new mapboxgl.Marker({ color: color }).setLngLat(coords).addTo(map);
    }

    function drawRoute(line) {
      var data = { type: "Feature", properties: {}, geometry: line };
      if (map.getSource("route")) {
        map.getSource("route").setData(data);
      } else {
        map.addSource("route", { type: "geojson", data: data });
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": ${JSON.stringify(colors.leaf)}, "line-width": 5 },
        });
      }
    }

    function clearRoute() {
      if (map.getLayer("route")) map.removeLayer("route");
      if (map.getSource("route")) map.removeSource("route");
    }

    function fitTo(points) {
      if (points.length === 0) return;
      if (points.length === 1) {
        map.flyTo({ center: points[0], zoom: 13 });
        return;
      }
      var b = points.reduce(function (acc, p) {
        return acc.extend(p);
      }, new mapboxgl.LngLatBounds(points[0], points[0]));
      map.fitBounds(b, { padding: 60, maxZoom: 14, duration: 500 });
    }

    window.__apply = function (state) {
      if (!ready) { window.__pending = state; return; }
      // start marker
      if (state.start) {
        if (startMarker) startMarker.setLngLat(state.start);
        else startMarker = makeMarker(state.start, ${JSON.stringify(colors.forest)});
      } else if (startMarker) { startMarker.remove(); startMarker = null; }
      // end marker
      if (state.end) {
        if (endMarker) endMarker.setLngLat(state.end);
        else endMarker = makeMarker(state.end, ${JSON.stringify(colors.leaf)});
      } else if (endMarker) { endMarker.remove(); endMarker = null; }
      // route
      var shouldFit = state.fit !== false;
      if (state.line && state.line.coordinates && state.line.coordinates.length) {
        drawRoute(state.line);
        if (shouldFit) fitTo(state.line.coordinates);
      } else {
        clearRoute();
        if (shouldFit) {
          var pts = [];
          if (state.start) pts.push(state.start);
          if (state.end) pts.push(state.end);
          fitTo(pts);
        }
      }
    };

    window.__setUser = function (coords, follow) {
      if (!ready) { window.__pendingUser = { coords: coords, follow: follow }; return; }
      if (!coords) {
        if (userMarker) { userMarker.remove(); userMarker = null; }
        return;
      }
      if (userMarker) {
        userMarker.setLngLat(coords);
      } else {
        var el = document.createElement("div");
        el.className = "user-dot";
        userMarker = new mapboxgl.Marker({ element: el }).setLngLat(coords).addTo(map);
      }
      if (follow) {
        map.easeTo({ center: coords, zoom: Math.max(map.getZoom(), 15.5), duration: 700 });
      }
    };

    map.on("load", function () {
      ready = true;
      post({ type: "ready" });
      if (window.__pending) { window.__apply(window.__pending); window.__pending = null; }
      if (window.__pendingUser) {
        window.__setUser(window.__pendingUser.coords, window.__pendingUser.follow);
        window.__pendingUser = null;
      }
    });
  </script>
</body>
</html>`;
}

export function MapWebView({
  token,
  start,
  end,
  routeGeometry,
  user = null,
  followUser = false,
  height,
}: MapWebViewProps) {
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  // Route + endpoints. When following the user (navigation), don't refit the
  // viewport — the camera stays centered on the live position instead.
  useEffect(() => {
    if (!ready) return;
    const state = { start, end, line: routeGeometry, fit: !followUser };
    ref.current?.injectJavaScript(
      `window.__apply(${JSON.stringify(state)}); true;`,
    );
  }, [ready, start, end, routeGeometry, followUser]);

  // Live user position (no viewport refit; optional follow).
  useEffect(() => {
    if (!ready) return;
    ref.current?.injectJavaScript(
      `window.__setUser(${JSON.stringify(user)}, ${followUser ? "true" : "false"}); true;`,
    );
  }, [ready, user, followUser]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type: string };
      if (msg.type === "ready") setReady(true);
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
        source={{ html: buildHtml(token) }}
        javaScriptEnabled
        domStorageEnabled
        onMessage={onMessage}
        style={{ flex: 1, backgroundColor: colors.mineral }}
      />
    </View>
  );
}
