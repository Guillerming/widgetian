import { CATALOG } from "../../../shared/catalog.js";
import { createWidget, insertWidget } from "../../../shared/config.js";
import { h } from "../../shared/dom.js";
import { renderField, row, toggle } from "../fields.js";
import { group, page, widgetTitle } from "../kit.js";

const api = window.widgetian;

/** Claude Code only hands its plan limits to a statusline command: this is the one to paste. */
const statuslineHelp = (ctx) => {
  const snippet = JSON.stringify({ statusLine: { type: "command", command: ctx.info.statuslineCommand } }, null, 2);
  return group(
    "Claude Code statusline",
    h(
      "div",
      { class: "explain" },
      h(
        "p",
        {},
        "Claude Code shares your plan limits only with its statusline. Add this to ~/.claude/settings.json and the Claude rings fill in after your next prompt in the terminal:",
      ),
      h("pre", { class: "code" }, snippet),
      h("button", { type: "button", class: "ghost small", onClick: () => api.copy(snippet) }, "Copy"),
      h("p", { class: "help" }, "It replaces any statusline you already have and prints nothing. Claude's desktop app does not run statuslines."),
    ),
  );
};

const backToLayout = (ctx) => h("button", { type: "button", class: "back", onClick: () => ctx.go("layout") }, "‹ Layout");

/** A copy of the config without one widget, after asking. */
export const removeWidget = (ctx, widget) => {
  if (!window.confirm(`Delete “${widgetTitle(widget)}”? Its settings will be lost.`)) return false;
  ctx.update((config) => ({ ...config, widgets: config.widgets.filter((entry) => entry.id !== widget.id) }), { structural: true });
  return true;
};

export const widgetPage = (ctx, id) => {
  const widget = ctx.config.widgets.find((entry) => entry.id === id);
  if (!widget) return page("Widget not found", "It may have been deleted.", backToLayout(ctx));
  const type = CATALOG[widget.type];
  const change = (update, options) =>
    ctx.update((config) => ({ ...config, widgets: config.widgets.map((entry) => (entry.id === id ? update(entry) : entry)) }), options);
  const setSetting = (key) => (value, options) => change((entry) => ({ ...entry, settings: { ...entry.settings, [key]: value } }), options);
  const duplicate = () => {
    const current = ctx.config.widgets.find((entry) => entry.id === id);
    const copy = { ...createWidget(current.type), settings: structuredClone(current.settings) };
    const below = ctx.config.widgets.filter((entry) => entry.column === current.column && entry.order <= current.order).length;
    ctx.update((config) => insertWidget(config, copy, current.column, below));
    ctx.go(`widget:${copy.id}`);
  };
  return h(
    "div",
    {},
    h("div", { class: "page crumbs" }, backToLayout(ctx)),
    page(
      widgetTitle(widget),
      type.description,
      group("", row("Show on the desktop", toggle(widget.enabled, (enabled) => change((entry) => ({ ...entry, enabled }))))),
      type.fields.length ? group("Settings", ...type.fields.map((field) => renderField(field, widget.settings[field.key], setSetting(field.key)))) : null,
      widget.type === "ai" ? statuslineHelp(ctx) : null,
      h(
        "div",
        { class: "page-actions" },
        type.multiple ? h("button", { type: "button", class: "ghost", onClick: duplicate }, "Duplicate") : null,
        h("button", { type: "button", class: "ghost danger", onClick: () => removeWidget(ctx, widget) && ctx.go("layout") }, "Delete widget"),
      ),
    ),
  );
};
