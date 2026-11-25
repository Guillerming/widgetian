// Interpolation between two sets of shader uniforms, used to cross-fade themes.

/** @param {number} a @param {number} b @param {number} t */
export const lerp = (a, b, t) => a + (b - a) * t;

/** Takes the short way round the circle. */
const lerpDegrees = (a, b, t) => a + ((((b - a) % 360) + 540) % 360 - 180) * t;

/** @param {number} t 0–1 */
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const blendValue = (key, from, to, t) => {
  if (typeof from === "number" && typeof to === "number") {
    return key === "u_rotation" ? lerpDegrees(from, to, t) : lerp(from, to, t);
  }
  if (Array.isArray(from) && Array.isArray(to) && from.length === to.length) {
    return to.map((value, index) => blendValue(key, from[index], value, t));
  }
  return to;
};

/**
 * Uniforms part way from `from` to `to` (numbers, colours and nested arrays are blended).
 * @param {Record<string, unknown>} from
 * @param {Record<string, unknown>} to
 * @param {number} t 0–1
 * @returns {Record<string, unknown>}
 */
export const blendUniforms = (from, to, t) =>
  Object.fromEntries(Object.entries(to).map(([key, value]) => [key, blendValue(key, from[key], value, t)]));
