// The wallpaper window (one per display, under the Finder's icons):
//   gradient → an animated mesh gradient (Paper Shaders) that cross-fades between themes;
//   images   → a folder of pictures, cross-fading every few minutes, with an optional effect.
import { THEMES, findTheme } from "../../shared/wallpaper-themes.js";
import { h } from "../shared/dom.js";
import { blendUniforms, easeInOutCubic, lerp } from "./blend.js";
import { meshUniforms } from "./mesh.js";
import { ShaderMount } from "./vendor/paper-shaders/shader-mount.js";
import { meshGradientFragmentShader } from "./vendor/paper-shaders/shaders/mesh-gradient.js";

const api = window.widgetian;
const TRANSITION_MS = 1600;
const IMAGE_FADE_MS = 1800;
const MAX_PIXEL_COUNT = 1200 * 1200 * 2;
const CUSTOM_MOTION = THEMES.find((theme) => theme.id === "big-sur").motion;
const stage = document.getElementById("stage");

let wallpaper = null;
let onBattery = false;

// ---------- gradient ----------
let shader = null;
/** What is on screen right now (mid-transition values included). */
let shown = null;
let frame = 0;

const themeOf = (settings) =>
  settings.theme === "custom"
    ? { id: "custom", colors: settings.customColors, motion: CUSTOM_MOTION }
    : findTheme(settings.theme);

const speedFactor = (settings) => (settings.pauseOnBattery && onBattery ? 0 : settings.speed);

/** Uniforms and speed for the wallpaper settings. */
const shaderTarget = (settings) => {
  const { colors, motion } = themeOf(settings);
  return { uniforms: meshUniforms(colors, motion), speed: motion.speed * speedFactor(settings) };
};

const startGradient = (settings) => {
  const target = shaderTarget(settings);
  const element = h("div", { class: "layer shader" });
  stage.replaceChildren(element);
  shader = new ShaderMount(
    element,
    meshGradientFragmentShader,
    target.uniforms,
    { alpha: false, antialias: true, preserveDrawingBuffer: false },
    target.speed,
    0,
    1,
    MAX_PIXEL_COUNT,
  );
  shown = target;
};

const fadeGradient = (settings) => {
  const from = shown;
  const to = shaderTarget(settings);
  const instant = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = performance.now();
  const step = (now) => {
    const progress = instant ? 1 : Math.min(1, (now - start) / TRANSITION_MS);
    const eased = easeInOutCubic(progress);
    shown = { uniforms: blendUniforms(from.uniforms, to.uniforms, eased), speed: lerp(from.speed, to.speed, eased) };
    shader?.setUniforms(shown.uniforms);
    shader?.setSpeed(shown.speed);
    if (progress < 1) frame = requestAnimationFrame(step);
  };
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(step);
};

const stopGradient = () => {
  cancelAnimationFrame(frame);
  shader?.dispose();
  shader = null;
  shown = null;
};

// ---------- images ----------
let images = [];
let imageIndex = -1;
let imageTimer = null;
/** Each start gets a number, so an answer that arrives late (another folder by now) is ignored. */
let imageRun = 0;

const addImageLayer = (layer) => {
  layer.dataset.effect = wallpaper.imageEffect;
  stage.append(layer);
  requestAnimationFrame(() => layer.classList.add("visible"));
  // Drop what was there once the new picture has faded in.
  setTimeout(() => {
    while (layer.parentNode === stage && layer.previousSibling) layer.previousSibling.remove();
  }, IMAGE_FADE_MS);
};

/** The next picture that loads; one that does not (broken, unsupported) is skipped. */
const showNextImage = (run, attempts = images.length) => {
  if (run !== imageRun || attempts <= 0) return;
  imageIndex = (imageIndex + 1) % images.length;
  const img = h("img", { alt: "", src: `media://image/${images[imageIndex].id}` });
  img.addEventListener("load", () => run === imageRun && addImageLayer(h("div", { class: "layer image" }, img)));
  img.addEventListener("error", () => showNextImage(run, attempts - 1));
};

const scheduleImages = () => {
  clearInterval(imageTimer);
  const run = imageRun;
  imageTimer = setInterval(() => showNextImage(run), wallpaper.imageMinutes * 60 * 1000);
};

const stopImages = () => {
  imageRun += 1;
  clearInterval(imageTimer);
  imageTimer = null;
};

const startImages = async () => {
  stopImages();
  const run = imageRun;
  // The folder comes from config.json in the main process; the page only asks for "the images".
  const result = await api.source("images", {}).catch(() => ({ images: [] }));
  if (run !== imageRun) return;
  images = [...result.images].sort(() => Math.random() - 0.5);
  imageIndex = -1;
  if (images.length === 0) {
    stage.replaceChildren(h("div", { class: "layer empty" }));
    return;
  }
  showNextImage(run);
  scheduleImages();
};

// ---------- switching ----------
const applyGradient = (next, previous) => {
  if (previous?.mode === "gradient" && shader) return fadeGradient(next);
  stopImages();
  return startGradient(next);
};

const applyImages = (next, previous) => {
  if (previous?.mode !== "images" || previous.imagesFolder !== next.imagesFolder) {
    stopGradient();
    return startImages();
  }
  // The same pictures: change only what changed, without starting over.
  if (previous.imageEffect !== next.imageEffect) {
    for (const layer of stage.querySelectorAll(".layer.image")) layer.dataset.effect = next.imageEffect;
  }
  if (previous.imageMinutes !== next.imageMinutes && images.length > 0) scheduleImages();
  return undefined;
};

const apply = async (next) => {
  const previous = wallpaper;
  wallpaper = next;
  if (next.mode === "gradient") return applyGradient(next, previous);
  if (next.mode === "images") return applyImages(next, previous);
  stopGradient();
  stopImages();
  return stage.replaceChildren();
};

const start = async () => {
  const [config, info] = await Promise.all([api.config.get(), api.appInfo()]);
  onBattery = info.onBattery;
  await apply(config.wallpaper);
  api.config.onChange((next) => apply(next.wallpaper));
  api.wallpaper.onBattery((value) => {
    onBattery = value;
    if (wallpaper?.mode === "gradient" && shader) fadeGradient(wallpaper);
  });
};

start().catch((error) => console.error("Wallpaper failed", error));
