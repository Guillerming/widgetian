// A tiny DOM builder: h("p", { class: "x", onClick }, "text", child). No framework, no innerHTML,
// so text from config files or the network is always inserted as text.
const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set(["svg", "path", "circle", "rect", "line", "g", "defs", "linearGradient", "stop", "polyline"]);

const setProp = (element, key, value) => {
  if (value === null || value === undefined || value === false) return;
  if (key === "class") element.setAttribute("class", value);
  else if (key === "style" && typeof value === "object") {
    for (const [name, styleValue] of Object.entries(value)) {
      if (name.startsWith("--")) element.style.setProperty(name, styleValue);
      else element.style[name] = styleValue;
    }
  } else if (key === "dataset") Object.assign(element.dataset, value);
  else if (key.startsWith("on") && typeof value === "function") element.addEventListener(key.slice(2).toLowerCase(), value);
  else if (key === "ref" && typeof value === "function") value(element);
  // Boolean properties (disabled, checked, draggable…) are set as such: draggable="" would mean "auto".
  else if (value === true && typeof element[key] === "boolean") element[key] = true;
  else if (value === true) element.setAttribute(key, "");
  else if (key in element && !(element instanceof SVGElement) && key !== "list") element[key] = value;
  else element.setAttribute(key, String(value));
};

const appendChildren = (element, children) => {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
};

/**
 * @param {string} tag
 * @param {Record<string, unknown>} [props]
 * @param {...unknown} children nodes, strings, numbers, arrays; null/false are skipped
 */
export const h = (tag, props = {}, ...children) => {
  const element = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) setProp(element, key, value);
  appendChildren(element, children);
  return element;
};

/** Replaces all children of `element`. */
export const replace = (element, ...children) => {
  element.replaceChildren();
  appendChildren(element, children);
  return element;
};

/** A stroked (or filled) 24×24 icon from one SVG path. */
export const icon = (d, { size = 20, filled = false, stroke = 1.6 } = {}) =>
  h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: filled ? "currentColor" : "none",
      stroke: filled ? "none" : "currentColor",
      "stroke-width": stroke,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    },
    h("path", { d }),
  );
