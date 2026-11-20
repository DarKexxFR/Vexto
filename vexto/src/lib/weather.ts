import type { WeatherNow } from "@/domain/weather";

/** Open-Meteo: free, no API key. https://open-meteo.com/ */
const BASE = "https://api.open-meteo.com/v1/forecast";

interface OpenMeteoResponse {
  current?: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
    is_day: number;
  };
  hourly?: { time: string[]; precipitation_probability: Array<number | null> };
}

/**
 * Current conditions at a position. Coordinates are rounded to ~1 km before
 * leaving the device: plenty for weather, better for privacy.
 */
export async function fetchWeather(
  coords: [number, number],
  signal?: AbortSignal,
): Promise<WeatherNow> {
  const [lon, lat] = coords;
  const params = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    current: "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day",
    hourly: "precipitation_probability",
    forecast_days: "2",
    timezone: "auto",
  });
  const res = await fetch(`${BASE}?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`Météo indisponible (${res.status})`);
  const json = (await res.json()) as OpenMeteoResponse;
  const c = json.current;
  if (!c) throw new Error("Météo indisponible.");

  // Max precipitation probability over the next 3 hourly slots.
  let rainChanceNext3h = 0;
  const times = json.hourly?.time ?? [];
  const probs = json.hourly?.precipitation_probability ?? [];
  const currentHour = `${c.time.slice(0, 13)}:00`;
  const start = times.findIndex((t) => t >= currentHour);
  if (start >= 0) {
    for (let i = start; i < Math.min(times.length, start + 3); i += 1) {
      rainChanceNext3h = Math.max(rainChanceNext3h, probs[i] ?? 0);
    }
  }

  return {
    temperatureC: c.temperature_2m,
    apparentC: c.apparent_temperature,
    precipitationMm: c.precipitation,
    weatherCode: c.weather_code,
    windKmh: c.wind_speed_10m,
    isDay: c.is_day === 1,
    rainChanceNext3h,
  };
}
