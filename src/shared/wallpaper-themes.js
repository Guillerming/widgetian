/**
 * Wallpaper themes for the Paper Shaders "mesh-gradient".
 *
 * Palettes are inspired by classic macOS wallpapers. Every theme has exactly four colours so
 * the wallpaper can blend smoothly from one theme to the next. Themes are clean (no grain)
 * and keep distortion and twirl subtle (≤ 0.25); they differ in speed, angle, zoom and position.
 *
 * motion:
 *   speed         animation speed (0 = still)
 *   distortion    organic warping of the colour shapes (0–1)
 *   swirl         twirl of the colours around each other (0–1)
 *   grainMixer    grain that roughens the edges between colours (0–1)
 *   grainOverlay  grain laid over the whole image (0–1)
 *   rotation      degrees
 *   scale         zoom (1 = fit the screen)
 *   offsetX/Y     shift of the pattern (-1–1)
 *
 * @typedef {{ speed: number, distortion: number, swirl: number, grainMixer: number,
 *   grainOverlay: number, rotation: number, scale: number, offsetX: number, offsetY: number }} Motion
 * @typedef {{ id: string, name: string, origin: string, colors: string[], motion: Motion }} Theme
 */

const NO_GRAIN = { grainMixer: 0, grainOverlay: 0 };

/** @type {Theme[]} */
export const THEMES = [
  {
    // Near-black ink with barely-there colour.
    id: "dark",
    name: "Dark",
    origin: "Almost black",
    colors: ["#06070d", "#14162b", "#1f0f2e", "#0a1c22"],
    motion: {
      ...NO_GRAIN, speed: 0.4, distortion: 0.15, swirl: 0.05,
      rotation: 30, scale: 1.1, offsetX: -0.15, offsetY: 0.1,
    },
  },
  {
    // Aqua blue with bright swooshes.
    id: "tiger",
    name: "Tiger",
    origin: "Mac OS X 10.4",
    colors: ["#0b2a6f", "#1f62c9", "#5fb4f5", "#cdeeff"],
    motion: {
      ...NO_GRAIN, speed: 0.3, distortion: 0.1, swirl: 0.25,
      rotation: 210, scale: 0.9, offsetX: 0.25, offsetY: -0.1,
    },
  },
  {
    // Purple aurora over deep space.
    id: "leopard",
    name: "Leopard",
    origin: "Mac OS X 10.5",
    colors: ["#140a33", "#5a2aa0", "#d24fa8", "#3f7fe0"],
    motion: {
      ...NO_GRAIN, speed: 0.4, distortion: 0.25, swirl: 0.15,
      rotation: 290, scale: 0.9, offsetX: -0.05, offsetY: -0.1,
    },
  },
  {
    // Desert dunes at dusk under a blue sky.
    id: "mojave",
    name: "Mojave",
    origin: "macOS 10.14",
    colors: ["#cf8a4e", "#8f4a2b", "#3a2840", "#3f669c"],
    motion: {
      ...NO_GRAIN, speed: 0.2, distortion: 0.2, swirl: 0.05,
      rotation: 95, scale: 1, offsetX: 0, offsetY: 0.1,
    },
  },
  {
    // This widget's original palette.
    id: "big-sur",
    name: "Big Sur",
    origin: "macOS 11",
    colors: ["#fa4b3e", "#ff9a54", "#85c8e8", "#285c9e"],
    motion: {
      ...NO_GRAIN, speed: 0.5, distortion: 0.15, swirl: 0.15,
      rotation: 126, scale: 0.8, offsetX: 0, offsetY: 0,
    },
  },
  {
    // Vivid violet and coral ribbons: the liveliest.
    id: "monterey",
    name: "Monterey",
    origin: "macOS 12",
    colors: ["#2e1690", "#7b3fe4", "#e0569d", "#ff8c6b"],
    motion: {
      ...NO_GRAIN, speed: 0.6, distortion: 0.25, swirl: 0.2,
      rotation: 160, scale: 0.85, offsetX: 0.15, offsetY: 0.15,
    },
  },
  {
    // Rolling green hills under a blue sky.
    id: "sonoma",
    name: "Sonoma",
    origin: "macOS 14",
    colors: ["#1f4d2a", "#4f9a4c", "#b39a3c", "#3f78bf"],
    motion: {
      ...NO_GRAIN, speed: 0.25, distortion: 0.2, swirl: 0.1,
      rotation: 60, scale: 1, offsetX: -0.1, offsetY: 0.15,
    },
  },
  {
    // Warm red and magenta waves over deep indigo.
    id: "sequoia",
    name: "Sequoia",
    origin: "macOS 15",
    colors: ["#1e1550", "#c2245e", "#f2543a", "#f7a35c"],
    motion: {
      ...NO_GRAIN, speed: 0.35, distortion: 0.2, swirl: 0.1,
      rotation: 200, scale: 0.9, offsetX: 0.1, offsetY: -0.05,
    },
  },
];

/** The original palette of this widget. */
export const DEFAULT_THEME_ID = "big-sur";

/**
 * @param {unknown} id
 * @returns {Theme} the matching theme, or the default one for unknown ids
 */
export const findTheme = (id) =>
  THEMES.find((theme) => theme.id === id) ?? THEMES.find((theme) => theme.id === DEFAULT_THEME_ID);

/** How the user's own gradients move: like Big Sur. */
export const CUSTOM_MOTION = findTheme(DEFAULT_THEME_ID).motion;
export const MAX_CUSTOM_THEMES = 12;
export const isCustomThemeId = (id) => /^custom(-[a-z0-9]{1,24})?$/.test(String(id));

/**
 * Every gradient the user can pick: the built-in themes, then their own. `hidden` ones stay listed
 * in Settings but are not offered anywhere else.
 * @param {{ customThemes: { id: string, name: string, colors: string[] }[], hiddenThemes: string[] }} wallpaper
 * @returns {(Theme & { custom: boolean, hidden: boolean })[]}
 */
export const gradientsOf = (wallpaper) => {
  const hidden = new Set(wallpaper.hiddenThemes ?? []);
  return [
    ...THEMES.map((theme) => ({ ...theme, custom: false, hidden: hidden.has(theme.id) })),
    ...(wallpaper.customThemes ?? []).map(({ id, name, colors }) => ({
      id,
      name,
      origin: "",
      colors,
      motion: CUSTOM_MOTION,
      custom: true,
      hidden: hidden.has(id),
    })),
  ];
};

/** The gradient with this id, or the default theme. */
export const gradientOf = (wallpaper, id) =>
  gradientsOf(wallpaper).find((theme) => theme.id === id) ?? { ...findTheme(DEFAULT_THEME_ID), custom: false, hidden: false };
