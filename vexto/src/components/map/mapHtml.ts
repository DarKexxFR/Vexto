import { colors } from "@/theme/colors";

export const PARIS: [number, number] = [2.3522, 48.8566];

/** Commands understood by the map page (see window.__* below). */
export type MapCommand = "apply" | "user" | "traveled" | "recenter";

/** Messages posted by the map page to the host. */
export type MapMessage =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "userPan" };

/**
 * Self-contained Mapbox GL JS page shared by the native WebView and the web
 * iframe. The host drives it through window.__<command>(payload) and listens
 * to JSON messages (ReactNativeWebView.postMessage or parent.postMessage).
 */
export function buildMapHtml(token: string): string {
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
    .pin-start {
      width: 16px; height: 16px; border-radius: 50%;
      background: ${colors.forest}; border: 3px solid #fff;
      box-shadow: 0 1px 6px rgba(16,43,25,.35);
    }
    .pin-end {
      width: 34px; height: 34px; border-radius: 50% 50% 50% 0;
      background: ${colors.leaf}; transform: rotate(-45deg);
      border: 3px solid #fff; box-shadow: 0 2px 8px rgba(16,43,25,.35);
      display: flex; align-items: center; justify-content: center;
    }
    .pin-end span { transform: rotate(45deg); font-size: 15px; line-height: 1; }
    .user {
      position: relative; width: 22px; height: 22px;
    }
    .user .dot {
      position: absolute; inset: 0; border-radius: 50%;
      background: #2563eb; border: 3px solid #fff;
      box-shadow: 0 0 0 6px rgba(37,99,235,.18), 0 1px 4px rgba(0,0,0,.3);
    }
    .user .cone {
      position: absolute; left: 50%; top: -18px; width: 0; height: 0;
      margin-left: -9px; border-left: 9px solid transparent; border-right: 9px solid transparent;
      border-bottom: 20px solid rgba(37,99,235,.35); display: none;
    }
    .user.has-heading .cone { display: block; }
    .mapboxgl-ctrl-attrib { font-size: 10px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var post = function (msg) {
      var data = JSON.stringify(msg);
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(data);
      else if (window.parent && window.parent !== window) window.parent.postMessage(data, "*");
    };
    var ready = false, queue = {};
    var startMarker = null, endMarker = null, userMarker = null, userEl = null;
    var lastUser = null, lastHeading = null, followPaused = false, followMode = false;

    if (!window.mapboxgl) {
      post({ type: "error", message: "Carte indisponible (hors ligne ?)" });
    }
    mapboxgl.accessToken = ${JSON.stringify(token)};
    var map = new mapboxgl.Map({
      container: "map",
      style: "mapbox://styles/mapbox/light-v11",
      center: ${JSON.stringify(PARIS)},
      zoom: 10.5,
      attributionControl: false,
      pitchWithRotate: true,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
    map.on("error", function (e) {
      var status = e && e.error && e.error.status;
      var message = status === 401 ? "Token Mapbox invalide" : ((e && e.error && e.error.message) || "Erreur de carte");
      post({ type: "error", message: message });
    });
    map.on("dragstart", function (e) {
      if (e && e.originalEvent && followMode && !followPaused) {
        followPaused = true;
        post({ type: "userPan" });
      }
    });

    function el(className, html) {
      var d = document.createElement("div");
      d.className = className;
      if (html) d.innerHTML = html;
      return d;
    }

    function setLine(id, line, paint, before) {
      var data = { type: "Feature", properties: {}, geometry: line };
      if (map.getSource(id)) {
        map.getSource(id).setData(data);
        Object.keys(paint).forEach(function (k) { map.setPaintProperty(id, k, paint[k]); });
        return;
      }
      map.addSource(id, { type: "geojson", data: data });
      map.addLayer({
        id: id, type: "line", source: id,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: paint,
      }, before);
    }

    function removeLine(id) {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    }

    var LINE_LAYOUT = { "line-join": "round", "line-cap": "round" };

    function setSegments(segs) {
      var fc = { type: "FeatureCollection", features: segs.map(function (g) {
        return { type: "Feature", properties: { color: g.color || ${JSON.stringify(colors.leaf)}, dashed: !!g.dashed },
          geometry: { type: "LineString", coordinates: g.coordinates } };
      }) };
      if (map.getSource("segments")) { map.getSource("segments").setData(fc); return; }
      var below = map.getLayer("traveled") ? "traveled" : undefined;
      map.addSource("segments", { type: "geojson", data: fc });
      map.addLayer({ id: "segments-casing", type: "line", source: "segments", layout: LINE_LAYOUT,
        filter: ["==", ["get", "dashed"], false],
        paint: { "line-color": "#ffffff", "line-width": 10 } }, below);
      map.addLayer({ id: "segments-solid", type: "line", source: "segments", layout: LINE_LAYOUT,
        filter: ["==", ["get", "dashed"], false],
        paint: { "line-color": ["get", "color"], "line-width": 6 } }, below);
      map.addLayer({ id: "segments-dashed", type: "line", source: "segments", layout: LINE_LAYOUT,
        filter: ["==", ["get", "dashed"], true],
        paint: { "line-color": ["get", "color"], "line-width": 4, "line-dasharray": [0.4, 1.8] } }, below);
    }

    function clearSegments() {
      ["segments-dashed", "segments-solid", "segments-casing"].forEach(function (id) {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      if (map.getSource("segments")) map.removeSource("segments");
    }

    function setPoints(pts) {
      var fc = { type: "FeatureCollection", features: pts.map(function (p) {
        return { type: "Feature", properties: { color: p.color || ${JSON.stringify(colors.forest)} },
          geometry: { type: "Point", coordinates: p.coordinates } };
      }) };
      if (map.getSource("points")) { map.getSource("points").setData(fc); return; }
      map.addSource("points", { type: "geojson", data: fc });
      map.addLayer({ id: "points", type: "circle", source: "points",
        paint: { "circle-radius": 5, "circle-color": "#ffffff", "circle-stroke-width": 3, "circle-stroke-color": ["get", "color"] } });
    }

    function fitTo(points) {
      if (points.length === 0) return;
      if (points.length === 1) { map.flyTo({ center: points[0], zoom: 14 }); return; }
      var b = points.reduce(function (acc, p) { return acc.extend(p); },
        new mapboxgl.LngLatBounds(points[0], points[0]));
      map.fitBounds(b, { padding: { top: 50, bottom: 50, left: 40, right: 40 }, maxZoom: 15, duration: 600 });
    }

    var commands = {
      apply: function (s) {
        if (s.start) {
          if (startMarker) startMarker.setLngLat(s.start);
          else startMarker = new mapboxgl.Marker({ element: el("pin-start") }).setLngLat(s.start).addTo(map);
        } else if (startMarker) { startMarker.remove(); startMarker = null; }
        if (s.end) {
          if (endMarker) endMarker.setLngLat(s.end);
          else endMarker = new mapboxgl.Marker({ element: el("pin-end", "<span>🏁</span>"), anchor: "bottom" }).setLngLat(s.end).addTo(map);
        } else if (endMarker) { endMarker.remove(); endMarker = null; }

        setPoints(s.points || []);
        if (s.segments && s.segments.length) {
          removeLine("route"); removeLine("route-casing");
          setSegments(s.segments);
          if (s.fit !== false) {
            var all = [];
            s.segments.forEach(function (g) { all = all.concat(g.coordinates); });
            if (s.end) all.push(s.end);
            fitTo(all);
          }
        } else if (s.line && s.line.coordinates && s.line.coordinates.length > 1) {
          clearSegments();
          // Keep the travelled breadcrumb on top of the planned route.
          var below = map.getLayer("traveled") ? "traveled" : undefined;
          setLine("route-casing", s.line, { "line-color": "#ffffff", "line-width": 10 }, below);
          // Re-create the route layer: dash patterns can't be cleanly unset.
          removeLine("route");
          var paint = { "line-color": s.color || ${JSON.stringify(colors.leaf)}, "line-width": 6 };
          if (s.dashed) paint["line-dasharray"] = [1.2, 1.4];
          setLine("route", s.line, paint, below);
          if (s.fit !== false) fitTo(s.line.coordinates);
        } else {
          clearSegments();
          removeLine("route"); removeLine("route-casing");
          if (s.fit !== false) {
            var pts = [];
            if (s.start) pts.push(s.start);
            if (s.end) pts.push(s.end);
            fitTo(pts);
          }
        }
      },
      traveled: function (p) {
        if (p.coords && p.coords.length > 1) {
          setLine("traveled", { type: "LineString", coordinates: p.coords },
            { "line-color": "#8E9A93", "line-width": 6, "line-opacity": 0.85 });
        } else { removeLine("traveled"); }
      },
      user: function (p) {
        followMode = !!p.follow;
        if (!p.coords) {
          if (userMarker) { userMarker.remove(); userMarker = null; }
          return;
        }
        lastUser = p.coords;
        lastHeading = typeof p.heading === "number" ? p.heading : null;
        if (!userMarker) {
          userEl = el("user", "<div class='cone'></div><div class='dot'></div>");
          userMarker = new mapboxgl.Marker({ element: userEl, rotationAlignment: "map", pitchAlignment: "map" })
            .setLngLat(p.coords).addTo(map);
        } else {
          userMarker.setLngLat(p.coords);
        }
        if (lastHeading !== null) { userEl.classList.add("has-heading"); userMarker.setRotation(lastHeading); }
        else userEl.classList.remove("has-heading");
        if (p.follow && !followPaused) camera();
      },
      recenter: function () {
        followPaused = false;
        if (lastUser) camera();
      },
    };

    function camera() {
      map.easeTo({
        center: lastUser,
        zoom: Math.max(map.getZoom(), 16),
        bearing: lastHeading !== null ? lastHeading : map.getBearing(),
        pitch: 45,
        duration: 900,
      });
    }

    ["apply", "user", "traveled", "recenter"].forEach(function (name) {
      window["__" + name] = function (payload) {
        if (!ready) { queue[name] = payload; return; }
        try { commands[name](payload || {}); } catch (err) { post({ type: "error", message: String(err) }); }
      };
    });

    map.on("load", function () {
      ready = true;
      post({ type: "ready" });
      ["apply", "traveled", "user", "recenter"].forEach(function (name) {
        if (queue[name] !== undefined) { commands[name](queue[name] || {}); delete queue[name]; }
      });
    });
  </script>
</body>
</html>`;
}
