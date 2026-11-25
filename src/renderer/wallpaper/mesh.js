// Uniforms for Paper Shaders' mesh gradient (vendor/paper-shaders) from a wallpaper theme.
import { getShaderColorFromString } from "./vendor/paper-shaders/get-shader-color-from-string.js";
import { ShaderFitOptions } from "./vendor/paper-shaders/shader-sizing.js";

/**
 * @param {string[]} colors
 * @param {import("../../shared/wallpaper-themes.js").Motion} motion
 */
export const meshUniforms = (colors, motion) => ({
  u_colors: colors.map(getShaderColorFromString),
  u_colorsCount: colors.length,
  u_distortion: motion.distortion,
  u_swirl: motion.swirl,
  u_grainMixer: motion.grainMixer,
  u_grainOverlay: motion.grainOverlay,
  u_fit: ShaderFitOptions.cover,
  u_scale: motion.scale,
  u_rotation: motion.rotation,
  u_offsetX: motion.offsetX,
  u_offsetY: motion.offsetY,
  u_originX: 0.5,
  u_originY: 0.5,
  u_worldWidth: 0,
  u_worldHeight: 0,
});
