// Every data source widgets can ask for, with a small cache: many widgets (or a fast poll) asking
// for the same thing share one request, and slow sources are not hit more than they need.
import path from "node:path";
import { app } from "electron";
import { readAiUsage } from "./ai-usage.js";
import { readCalendars } from "./calendar.js";
import { countImages, readLogo, readMusicLibrary, readWallpaperImages } from "./media.js";
import { readPower } from "./power.js";
import { readStatusBlock } from "./status.js";
import { readSystem } from "./system.js";
import { placeName } from "./place-name.js";
import { readForecast, searchPlaces } from "./weather.js";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
// Unauthenticated GitHub API calls are limited to 60 an hour per IP address.
const GITHUB_MIN_INTERVAL_MS = 2 * MINUTE;

export const defaultClaudeLimitsFile = () => path.join(app.getPath("userData"), "claude-limits.json");

const statusBlockTtl = ({ block: { every, checks = [] } }) => {
  const anonymousGithub = checks.some((check) => check.type === "github" && !check.token);
  return Math.max(every * SECOND - SECOND, anonymousGithub ? GITHUB_MIN_INTERVAL_MS : 0);
};

/** name → { read(params), ttl(params) in ms } */
const SOURCES = {
  power: { read: readPower, ttl: () => 30 * SECOND },
  // CPU load is measured between two readings: closer than this, it is mostly noise.
  system: { read: readSystem, ttl: () => 2 * SECOND - 100 },
  weather: { read: readForecast, ttl: () => 15 * MINUTE },
  places: { read: ({ query }) => searchPlaces(query), ttl: () => 10 * MINUTE },
  "place-name": { read: placeName, ttl: () => 24 * 60 * MINUTE },
  ai: {
    read: (params) => readAiUsage({ ...params, claudeLimitsFile: params.claudeLimitsFile || defaultClaudeLimitsFile() }),
    ttl: () => 3 * SECOND,
  },
  calendar: { read: readCalendars, ttl: () => 5 * MINUTE },
  "status-block": { read: readStatusBlock, ttl: statusBlockTtl },
  logo: { read: readLogo, ttl: () => 0 },
  music: { read: readMusicLibrary, ttl: () => 0 },
  "count-images": { read: countImages, ttl: () => 0 },
  images: { read: readWallpaperImages, ttl: () => 5 * MINUTE },
};

/** key → { at, value, promise? } */
const cache = new Map();

/**
 * @param {string} name
 * @param {object} params
 * @param {{ fresh?: boolean }} options fresh skips the cache (e.g. a "Rescan" button)
 */
export const readSource = async (name, params = {}, { fresh = false } = {}) => {
  const source = SOURCES[name];
  if (!source) throw new Error(`Unknown source "${name}"`);
  const key = `${name}:${JSON.stringify(params)}`;
  const entry = cache.get(key);
  if (entry?.promise) return entry.promise;
  if (!fresh && entry && Date.now() - entry.at < source.ttl(params)) return entry.value;
  const promise = source
    .read(params)
    .then((value) => {
      cache.set(key, { at: Date.now(), value });
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });
  cache.set(key, { ...entry, promise });
  return promise;
};
