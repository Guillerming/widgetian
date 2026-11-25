// Pieces every settings page is made of.
import { CATALOG } from "../../shared/catalog.js";
import { h } from "../shared/dom.js";

export const page = (title, intro, ...content) =>
  h("div", { class: "page" }, h("header", { class: "page-head" }, h("h1", {}, title), intro ? h("p", {}, intro) : null), ...content);

export const group = (title, ...rows) =>
  h("section", { class: "group" }, title ? h("h2", {}, title) : null, h("div", { class: "group-box" }, ...rows));

/** Changes some values of one part of the config ("general", "layout"…). */
export const updatePart = (ctx, part, values, options) =>
  ctx.update((config) => ({ ...config, [part]: { ...config[part], ...values } }), options);

export const numberBox = (value, min, max, onChange, id) =>
  h("input", {
    id: id ?? null,
    type: "number",
    class: "narrow",
    value,
    min,
    max,
    onChange: (event) => {
      const number = Number(event.target.value);
      if (event.target.value !== "" && Number.isFinite(number)) onChange(number);
    },
  });

/** What the user calls a widget, besides its type: "London", "GitHub"… */
export const ownName = (widget) => {
  const base = CATALOG[widget.type]?.name ?? widget.type;
  const own =
    widget.settings.label ||
    widget.settings.name ||
    (widget.type === "todo" ? widget.settings.title : "") ||
    (widget.type === "weather" && widget.settings.location.mode === "manual" ? widget.settings.location.name : "");
  return own && own !== base ? own : "";
};

export const widgetTitle = (widget) => {
  const base = CATALOG[widget.type]?.name ?? widget.type;
  return ownName(widget) ? `${base} · ${ownName(widget)}` : base;
};
