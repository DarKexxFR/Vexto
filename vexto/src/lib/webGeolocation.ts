/**
 * Browser geolocation used on the website instead of expo-location's web shim.
 *
 * expo-location on web relies on navigator.permissions.query(), which Safari
 * (especially iOS and home-screen web apps) implements partially, and it
 * rejects with a GeolocationPositionError that is not an `Error` — so the app
 * could only say "Localisation indisponible" with no reason. Here we call
 * navigator.geolocation directly, retry with the other accuracy mode, and
 * explain each failure in French.
 */

export type WebGeoErrorCode = "unsupported" | "insecure" | "denied" | "unavailable" | "timeout";

export class WebGeoError extends Error {
  readonly code: WebGeoErrorCode;
  constructor(code: WebGeoErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const isIOS = (): boolean =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const isSafari = (): boolean =>
  typeof navigator !== "undefined" && /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

/** French explanation for a browser geolocation failure, with where to fix it. */
export function webGeoMessage(code: WebGeoErrorCode): string {
  switch (code) {
    case "unsupported":
      return "Ce navigateur ne permet pas la localisation.";
    case "insecure":
      return "La localisation n'est possible que sur une adresse https.";
    case "denied":
      if (isIOS())
        return "Localisation bloquée pour ce site. Dans Safari, touchez « aA » › Réglages du site web › Localisation › Autoriser, puis rechargez la page. Vérifiez aussi Réglages › Confidentialité et sécurité › Service de localisation › Sites web Safari : « Lorsque l'app est active ».";
      if (isSafari())
        return "Localisation bloquée pour ce site. Safari › Réglages › Sites web › Localisation : choisissez « Autoriser », puis rechargez la page.";
      return "Localisation bloquée pour ce site. Autorisez-la via l'icône à gauche de la barre d'adresse, puis rechargez la page.";
    case "unavailable":
      return isIOS()
        ? "Position introuvable. Activez Réglages › Confidentialité et sécurité › Service de localisation, puis « Sites web Safari » avec « Position exacte », et réessayez."
        : "Position introuvable. Vérifiez que la localisation de l'appareil est activée, puis réessayez.";
    case "timeout":
      return "La position met trop de temps à arriver. Réessayez (idéalement près d'une fenêtre ou à l'extérieur).";
  }
}

function fail(code: WebGeoErrorCode): WebGeoError {
  return new WebGeoError(code, webGeoMessage(code));
}

function codeOf(err: GeolocationPositionError): WebGeoErrorCode {
  if (err.code === 1) return "denied";
  if (err.code === 3) return "timeout";
  return "unavailable";
}

function checkSupport(): void {
  if (typeof window !== "undefined" && window.isSecureContext === false) throw fail("insecure");
  if (typeof navigator === "undefined" || !navigator.geolocation) throw fail("unsupported");
}

function once(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/**
 * Current position as [lon, lat]. Tries a fast network/Wi-Fi fix first, then
 * the GPS; a permission refusal is reported immediately. Throws WebGeoError.
 */
export async function webCurrentPosition(): Promise<[number, number]> {
  checkSupport();
  const attempts: PositionOptions[] = [
    { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
  ];
  let lastCode: WebGeoErrorCode = "unavailable";
  for (const options of attempts) {
    try {
      const pos = await once(options);
      return [pos.coords.longitude, pos.coords.latitude];
    } catch (e) {
      lastCode = codeOf(e as GeolocationPositionError);
      if (lastCode === "denied") break;
    }
  }
  throw fail(lastCode);
}

/** Permission state without prompting; "unknown" where the browser won't say. */
export async function webPermissionState(): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  try {
    if (!navigator.permissions?.query) return "unknown";
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state;
  } catch {
    return "unknown";
  }
}

export interface WebFix {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
  };
  timestamp: number;
}

/** Continuous GPS updates. Returns a function that stops them. */
export function webWatchPosition(onFix: (fix: WebFix) => void, onError: (e: WebGeoError) => void): () => void {
  checkSupport();
  const id = navigator.geolocation.watchPosition(
    (p) =>
      onFix({
        coords: {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy ?? null,
          speed: p.coords.speed ?? null,
          heading: p.coords.heading ?? null,
        },
        timestamp: p.timestamp,
      }),
    (err) => onError(fail(codeOf(err))),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
