// Weather: now + the next days from Open-Meteo, for this Mac's location or a chosen city.
import { h, icon, replace } from "../../renderer/shared/dom.js";
import { card, notice } from "../../renderer/shared/ui.js";

const REFRESH_MS = 10 * 60 * 1000;
const LOCATION_TIMEOUT_MS = 6000;
const LOCATION_MAX_AGE_MS = 30 * 60 * 1000;
const LOCATION_CACHE_KEY = "weather/last-position";

const ICON_PATHS = {
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z",
  partly: "M8.5 6.5a3.5 3.5 0 0 1 6.3 1M7 19h10a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 19ZM8 2.5v1.2M3.3 7.5h1.2M4.6 4.1l.9.9",
  cloud: "M7 19h10a4.5 4.5 0 0 0 .7-8.9 6 6 0 0 0-11.5 2A3.5 3.5 0 0 0 7 19Z",
  fog: "M4 9h16M6 13h12M4 17h16",
  rain: "M7 15h10a4 4 0 0 0 .6-8A5.5 5.5 0 0 0 7 8.6 3.2 3.2 0 0 0 7 15ZM8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5",
  snow: "M7 14h10a4 4 0 0 0 .6-8A5.5 5.5 0 0 0 7 7.6 3.2 3.2 0 0 0 7 14ZM8 18h0M12 20h0M16 18h0M10 17h0M14 17h0",
  storm: "M7 14h10a4 4 0 0 0 .6-8A5.5 5.5 0 0 0 7 7.6 3.2 3.2 0 0 0 7 14ZM12.5 15l-2 3.5h3l-2 3.5",
};

/** WMO weather codes (as returned by Open-Meteo) → label and icon. */
const CONDITIONS = [
  { codes: [0], label: "Clear", icon: "sun" },
  { codes: [1, 2], label: "Partly cloudy", icon: "partly" },
  { codes: [3], label: "Overcast", icon: "cloud" },
  { codes: [45, 48], label: "Fog", icon: "fog" },
  { codes: [51, 53, 55, 56, 57], label: "Drizzle", icon: "rain" },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], label: "Rain", icon: "rain" },
  { codes: [71, 73, 75, 77, 85, 86], label: "Snow", icon: "snow" },
  { codes: [95, 96, 99], label: "Thunderstorm", icon: "storm" },
];

const condition = (code, isDay = true) => {
  const match = CONDITIONS.find(({ codes }) => codes.includes(code)) ?? CONDITIONS[2];
  return !isDay && match.icon === "sun" ? { ...match, icon: "moon" } : match;
};

const weatherIcon = (kind, size) => icon(ICON_PATHS[kind], { size });

const readCachedPosition = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(LOCATION_CACHE_KEY) ?? "null");
    return cached && Date.now() - cached.at < LOCATION_MAX_AGE_MS ? cached : null;
  } catch {
    return null;
  }
};

const cachePosition = (position) => {
  try {
    localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify({ ...position, at: Date.now() }));
  } catch {
    // Storage unavailable: macOS is asked again next time.
  }
};

/** This Mac's position through macOS Location Services (asks for permission once). */
const currentPosition = () =>
  new Promise((resolve, reject) => {
    const cached = readCachedPosition();
    if (cached) return resolve(cached);
    if (!navigator.geolocation) return reject(new Error("unavailable"));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const position = { latitude: coords.latitude, longitude: coords.longitude };
        cachePosition(position);
        resolve(position);
      },
      reject,
      { timeout: LOCATION_TIMEOUT_MS, maximumAge: LOCATION_MAX_AGE_MS },
    );
  });

const dayItem = (day, index, showRain, weekday) =>
  h(
    "li",
    { title: `${condition(day.code).label}${showRain ? ` · rain ${day.rainChance}%` : ""}` },
    h("small", {}, index === 0 ? "Tomorrow" : weekday.format(new Date(`${day.date}T12:00`))),
    weatherIcon(condition(day.code).icon, 20),
    h("span", {}, `${day.high}° `, h("em", {}, `${day.low}°`)),
  );

const forecastView = (weather, { showRain, days }, weekday) => {
  const now = condition(weather.code, weather.isDay);
  const upcoming = weather.days.slice(0, days);
  return [
    h(
      "div",
      { class: "now" },
      weatherIcon(now.icon, 40),
      h("p", { class: "temperature" }, `${weather.temperature}°`),
      h("p", { class: "condition" }, now.label),
    ),
    upcoming.length > 0
      ? h(
          "ol",
          { class: "days", "aria-label": "Next days", style: { "--days": upcoming.length } },
          upcoming.map((day, index) => dayItem(day, index, showRain, weekday)),
        )
      : null,
  ];
};

export function mount(root, ctx) {
  const { settings } = ctx;
  const shell = card({ eyebrow: "Weather", className: "weather" });
  root.append(shell.element);
  const weekday = new Intl.DateTimeFormat(ctx.locale ?? "en-GB", { weekday: "short" });
  const manual = settings.location.mode === "manual";
  let loaded = false;

  const show = (...children) => replace(shell.body, ...children);
  const askForCity = (text) =>
    show(notice(text), h("button", { class: "link-button", type: "button", onClick: ctx.openSettings }, "Choose a city"));

  /** Without Location Services, the city of this Mac's time zone (Europe/London → London) is close enough. */
  const timeZoneCity = async () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const city = zone.split("/").pop()?.replace(/_/g, " ");
    const [place] = city ? await ctx.api.source("places", { query: city }) : [];
    if (!place) throw new Error("No location");
    return { latitude: place.latitude, longitude: place.longitude, name: place.name };
  };

  const locate = async () => {
    if (manual) {
      const { latitude, longitude, name } = settings.location;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return { latitude, longitude, name };
    }
    let position;
    try {
      position = await currentPosition();
    } catch {
      return timeZoneCity();
    }
    const { name } = await ctx.api.source("place-name", position).catch(() => ({ name: "" }));
    return { ...position, name };
  };

  const refresh = async () => {
    let place;
    try {
      place = await locate();
    } catch {
      if (!loaded) askForCity("Can't get this Mac's location. Allow Widgetian in System Settings › Privacy › Location Services.");
      return;
    }
    if (!place) return askForCity("No city chosen yet.");
    try {
      const weather = await ctx.api.source("weather", {
        latitude: place.latitude,
        longitude: place.longitude,
        units: settings.units,
        days: settings.days,
      });
      shell.setEyebrow(place.name || "Weather");
      const range = `H ${weather.high}° · L ${weather.low}°`;
      shell.setAside(settings.showRain && weather.rainChance > 0 ? `${range} · Rain ${weather.rainChance}%` : range);
      show(...forecastView(weather, settings, weekday));
      loaded = true;
    } catch {
      if (!loaded) show(notice("Weather unavailable right now."));
    }
  };

  show(notice(manual ? "One moment…" : "Finding your location…"));
  ctx.every(REFRESH_MS, refresh);
}
