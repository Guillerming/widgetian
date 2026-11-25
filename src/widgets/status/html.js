// A script's own HTML, inside a shadow root so its CSS stays in and the card's stays out. Scripts,
// frames, forms and inline handlers are removed (the page's CSP would block them anyway); links and
// elements with data-action go through the card.
import { h } from "../../renderer/shared/dom.js";

const BLOCKED = "script, iframe, frame, object, embed, link, meta, base, form, template";
const BASE_CSS = `
:host { display: block; font-size: 12px; line-height: 1.45; color: var(--ink, #fff); }
a { color: inherit; text-underline-offset: 2px; }
button { padding: 5px 10px; border: 0; border-radius: 8px; background: rgba(255, 255, 255, 0.14); color: inherit; font: inherit; }
a, button, [data-action] { cursor: pointer; }
button:hover { background: rgba(255, 255, 255, 0.22); }
img { max-width: 100%; }
`;

const isUnsafe = ({ name, value }) =>
  name.startsWith("on") || name === "srcdoc" || (["href", "src", "xlink:href", "action"].includes(name) && /^\s*(javascript|vbscript):/i.test(value));

const cleanNodes = (html) => {
  const { body } = new DOMParser().parseFromString(html, "text/html");
  for (const element of body.querySelectorAll(BLOCKED)) element.remove();
  for (const element of body.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) if (isUnsafe(attribute)) element.removeAttribute(attribute.name);
  }
  return [...body.childNodes];
};

/** @param {{ html: string, css: string }} section @param {{ open: Function, run: Function }} handlers */
export const htmlSection = ({ html, css }, handlers) => {
  const host = h("div", { class: "block-html" });
  const root = host.attachShadow({ mode: "open" });
  root.append(h("style", {}, BASE_CSS), h("style", {}, css), ...cleanNodes(html));
  root.addEventListener("click", (event) => {
    const target = event.target.closest?.("[data-action], a[href]");
    if (!target) return;
    event.preventDefault();
    if (target.dataset.action) handlers.run(target.dataset.action);
    else handlers.open(target.href);
  });
  return host;
};
