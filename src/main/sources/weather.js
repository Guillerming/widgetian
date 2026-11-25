// Weather from Open-Meteo (free, no key): forecast for coordinates and a city search.
// Coordinates are rounded to ~1 km before they leave the Mac.
import { httpFetch } from "../http.js";
import { PRODUCT } from "../product.js";

const FORECAST_API = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_API = "https://geocoding-api.open-meteo.com/v1/search";
const TIMEOUT_MS = 10000;
const USER_AGENT = `${PRODUCT.name} (+${PRODUCT.page})`;

const round = (value) => Math.round(Number(value) * 100) / 100;

const getJson = async (url) => {
  const response = await httpFetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Open-Meteo answered ${response.status}`);
  return response.json();
};

/** Open-Meteo's forecast → what the widget shows. Index 0 of daily is today. */
export const summarize = (data) => {
  const { current, daily } = data;
  return {
    temperature: Math.round(current.temperature_2m),
    code: current.weather_code,
    isDay: Boolean(current.is_day),
    high: Math.round(daily.temperature_2m_max[0]),
    low: Math.round(daily.temperature_2m_min[0]),
    rainChance: daily.precipitation_probability_max[0] ?? 0,
    days: daily.time.slice(1).map((date, offset) => {
      const index = offset + 1;
      return {
        date,
        code: daily.weather_code[index],
        high: Math.round(daily.temperature_2m_max[index]),
        low: Math.round(daily.temperature_2m_min[index]),
        rainChance: daily.precipitation_probability_max[index] ?? 0,
      };
    }),
  };
};

/** @param {{ latitude: number, longitude: number, units?: string, days?: number }} params */
export const readForecast = async ({ latitude, longitude, units = "celsius", days = 4 }) => {
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    throw new Error("No location yet");
  }
  const query = new URLSearchParams({
    latitude: String(round(latitude)),
    longitude: String(round(longitude)),
    timezone: "auto",
    forecast_days: String(Math.min(7, Math.max(1, Number(days) + 1))),
    temperature_unit: units === "fahrenheit" ? "fahrenheit" : "celsius",
    current: "temperature_2m,weather_code,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  });
  return summarize(await getJson(`${FORECAST_API}?${query}`));
};

/** City search for the settings window. */
export const searchPlaces = async (name) => {
  const trimmed = String(name ?? "").trim();
  if (trimmed.length < 2) return [];
  const query = new URLSearchParams({ name: trimmed, count: "6", language: "en", format: "json" });
  const data = await getJson(`${GEOCODING_API}?${query}`);
  return (data.results ?? []).map((place) => ({
    name: place.name,
    detail: [place.admin1, place.country].filter(Boolean).join(", "),
    latitude: place.latitude,
    longitude: place.longitude,
  }));
};
