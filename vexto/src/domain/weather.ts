/**
 * Weather-aware "coach": reads current conditions (Open-Meteo, WMO codes) and
 * suggests the best low-carbon mode for right now.
 */
import type { TripMode } from "@/types/database";

export interface WeatherNow {
  temperatureC: number;
  apparentC: number;
  precipitationMm: number;
  /** WMO weather interpretation code. */
  weatherCode: number;
  windKmh: number;
  isDay: boolean;
  /** Highest precipitation probability over the next 3 hours (0..100). */
  rainChanceNext3h: number;
}

export interface WeatherLabel {
  label: string;
  emoji: string;
}

export function describeWeather(code: number, isDay = true): WeatherLabel {
  if (code === 0) return { label: "Ciel dégagé", emoji: isDay ? "☀️" : "🌙" };
  if (code === 1) return { label: "Plutôt dégagé", emoji: isDay ? "🌤️" : "🌙" };
  if (code === 2) return { label: "Partiellement nuageux", emoji: "⛅" };
  if (code === 3) return { label: "Couvert", emoji: "☁️" };
  if (code === 45 || code === 48) return { label: "Brouillard", emoji: "🌫️" };
  if (code >= 51 && code <= 55) return { label: "Bruine", emoji: "🌦️" };
  if (code === 56 || code === 57) return { label: "Bruine verglaçante", emoji: "🧊" };
  if (code >= 61 && code <= 65) return { label: "Pluie", emoji: "🌧️" };
  if (code === 66 || code === 67) return { label: "Pluie verglaçante", emoji: "🧊" };
  if (code >= 71 && code <= 77) return { label: "Neige", emoji: "🌨️" };
  if (code >= 80 && code <= 82) return { label: "Averses", emoji: "🌦️" };
  if (code === 85 || code === 86) return { label: "Averses de neige", emoji: "🌨️" };
  if (code >= 95) return { label: "Orage", emoji: "⛈️" };
  return { label: "Temps variable", emoji: "🌥️" };
}

export type CoachTone = "great" | "good" | "caution";

export interface CoachAdvice {
  mode: TripMode;
  title: string;
  message: string;
  tone: CoachTone;
  /** Walking / cycling / scooter are discouraged right now. */
  badForSoftModes: boolean;
  /** Short reason shown next to soft modes when discouraged. */
  reason: string | null;
}

const isStorm = (c: number) => c >= 95;
const isSnow = (c: number) => (c >= 71 && c <= 77) || c === 85 || c === 86;
const isFreezing = (c: number) => c === 56 || c === 57 || c === 66 || c === 67;
const isRain = (c: number) => (c >= 51 && c <= 55) || (c >= 61 && c <= 65) || (c >= 80 && c <= 82);
const isFog = (c: number) => c === 45 || c === 48;

export function coachAdvice(w: WeatherNow): CoachAdvice {
  const code = w.weatherCode;
  const t = Math.round(w.apparentC);

  if (isStorm(code) || isSnow(code) || isFreezing(code)) {
    const what = isStorm(code) ? "Orage" : isSnow(code) ? "Neige" : "Verglas";
    return {
      mode: "publicTransit",
      title: `${what} en vue`,
      message: "Restez à l'abri : les transports en commun sont l'option la plus sûre aujourd'hui.",
      tone: "caution",
      badForSoftModes: true,
      reason: what,
    };
  }
  if (w.precipitationMm >= 0.2 || isRain(code)) {
    return {
      mode: "publicTransit",
      title: "Il pleut",
      message: "Métro, tram ou bus : vous restez au sec et vous gagnez des points.",
      tone: "caution",
      badForSoftModes: true,
      reason: "Pluie",
    };
  }
  if (w.rainChanceNext3h >= 60) {
    return {
      mode: "publicTransit",
      title: `Pluie probable (${Math.round(w.rainChanceNext3h)} %)`,
      message: "Des averses arrivent dans les prochaines heures : les transports sont un bon pari.",
      tone: "good",
      badForSoftModes: true,
      reason: "Pluie probable",
    };
  }
  if (w.windKmh >= 45) {
    return {
      mode: "publicTransit",
      title: "Vent fort",
      message: `Rafales autour de ${Math.round(w.windKmh)} km/h : évitez le vélo et la trottinette.`,
      tone: "caution",
      badForSoftModes: true,
      reason: "Vent fort",
    };
  }
  if (w.apparentC <= 0) {
    return {
      mode: "publicTransit",
      title: `Il gèle (${t} °C ressentis)`,
      message: "Risque de verglas : privilégiez les transports en commun.",
      tone: "caution",
      badForSoftModes: true,
      reason: "Gel",
    };
  }
  if (w.apparentC >= 33) {
    return {
      mode: "publicTransit",
      title: `Forte chaleur (${t} °C)`,
      message: "Hydratez-vous et préférez des transports climatisés aux heures chaudes.",
      tone: "caution",
      badForSoftModes: true,
      reason: "Canicule",
    };
  }
  if (isFog(code)) {
    return {
      mode: "walk",
      title: "Brouillard",
      message: "Visibilité réduite : à pied c'est tranquille, à vélo allumez vos lumières.",
      tone: "good",
      badForSoftModes: false,
      reason: null,
    };
  }
  if (w.apparentC >= 12 && w.apparentC <= 28 && w.windKmh < 25 && code <= 3) {
    return {
      mode: "bike",
      title: code <= 1 ? "Grand beau temps" : "Temps idéal",
      message: `${t} °C et pas de pluie : conditions parfaites pour pédaler !`,
      tone: "great",
      badForSoftModes: false,
      reason: null,
    };
  }
  if (w.apparentC < 12) {
    return {
      mode: "bike",
      title: `Frais mais sec (${t} °C)`,
      message: "Gants et écharpe, et en selle : le vélo, ça réchauffe !",
      tone: "good",
      badForSoftModes: false,
      reason: null,
    };
  }
  return {
    mode: "walk",
    title: `Temps doux (${t} °C)`,
    message: "Parfait pour marcher ou rouler en douceur.",
    tone: "good",
    badForSoftModes: false,
    reason: null,
  };
}
