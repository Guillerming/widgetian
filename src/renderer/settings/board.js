// The Layout board: one lane per column with a chip per widget (disabled ones dimmed), and the
// palette of widget types. Drag chips between and within lanes, or types from the palette into a
// lane; click a chip to open its settings. With the keyboard: Option + arrows move the focused chip.
import { CATALOG } from "../../shared/catalog.js";
import { createWidget, emptiestColumn, insertWidget, moveWidget } from "../../shared/config.js";
import { h, icon } from "../shared/dom.js";
import { ICONS } from "../shared/ui.js";
import { ownName, widgetTitle } from "./kit.js";
import { removeWidget } from "./pages/widget.js";

const WIDGET_DRAG = "application/x-widgetian-widget";
const TYPE_DRAG = "application/x-widgetian-type";

const isOurDrag = (event) => event.dataTransfer.types.includes(WIDGET_DRAG) || event.dataTransfer.types.includes(TYPE_DRAG);

/** Index among the lane's chips where a drop at clientY lands. */
const dropIndex = (lane, clientY, draggedId) => {
  const chips = [...lane.querySelectorAll(".chip")].filter((chip) => chip.dataset.id !== draggedId);
  const after = chips.findIndex((chip) => {
    const box = chip.getBoundingClientRect();
    return clientY < box.top + box.height / 2;
  });
  return after === -1 ? chips.length : after;
};

const addType = (ctx, type, column, index) => {
  const widget = createWidget(type);
  ctx.update((config) => insertWidget(config, widget, column, index), { structural: true });
};

const focusChip = (id) => document.querySelector(`.chip[data-id="${CSS.escape(id)}"] .chip-main`)?.focus();

const ARROWS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

const moveWithKeys = (ctx, widget, event) => {
  const arrow = event.altKey ? ARROWS[event.key] : null;
  if (!arrow) return;
  event.preventDefault();
  const [across, down] = arrow;
  const column = Math.min(ctx.config.layout.columns, Math.max(1, widget.column + across));
  const lane = ctx.config.widgets.filter((entry) => entry.column === widget.column).sort((a, b) => a.order - b.order);
  ctx.update((config) => moveWidget(config, widget.id, column, lane.findIndex((entry) => entry.id === widget.id) + down), { structural: true });
  focusChip(widget.id);
};

const chip = (ctx, widget) => {
  const name = ownName(widget);
  const element = h(
    "div",
    {
      class: "chip",
      draggable: true,
      dataset: { id: widget.id, enabled: String(widget.enabled) },
      onDragstart: (event) => {
        event.dataTransfer.setData(WIDGET_DRAG, widget.id);
        event.dataTransfer.effectAllowed = "move";
        element.classList.add("dragging");
      },
      onDragend: () => element.classList.remove("dragging"),
    },
    h(
      "button",
      {
        type: "button",
        class: "chip-main",
        title: "Drag to move · click to edit",
        onClick: () => ctx.go(`widget:${widget.id}`),
        onKeydown: (event) => moveWithKeys(ctx, widget, event),
      },
      h("span", { class: "chip-label" }, CATALOG[widget.type]?.name ?? widget.type, name ? h("small", {}, name) : null),
      widget.enabled ? null : h("span", { class: "chip-state" }, "Hidden"),
    ),
    h(
      "button",
      { type: "button", class: "chip-remove", title: "Delete", "aria-label": `Delete ${widgetTitle(widget)}`, onClick: () => removeWidget(ctx, widget) },
      icon(ICONS.cross, { size: 11, stroke: 2.2 }),
    ),
  );
  return element;
};

const lane = (ctx, number) => {
  const widgets = ctx.config.widgets.filter((widget) => widget.column === number).sort((a, b) => a.order - b.order);
  const element = h(
    "div",
    {
      class: "lane",
      "aria-label": `Column ${number}`,
      onDragover: (event) => {
        if (!isOurDrag(event)) return;
        event.preventDefault();
        element.classList.add("over");
      },
      onDragleave: (event) => {
        if (!element.contains(event.relatedTarget)) element.classList.remove("over");
      },
      onDrop: (event) => {
        event.preventDefault();
        element.classList.remove("over");
        const id = event.dataTransfer.getData(WIDGET_DRAG);
        const type = event.dataTransfer.getData(TYPE_DRAG);
        const index = dropIndex(element, event.clientY, id);
        if (id) ctx.update((config) => moveWidget(config, id, number, index), { structural: true });
        else if (Object.hasOwn(CATALOG, type)) addType(ctx, type, number, index);
      },
    },
    h("span", { class: "lane-title" }, `Column ${number}`),
    widgets.map((widget) => chip(ctx, widget)),
    widgets.length ? null : h("span", { class: "lane-empty" }, "Drop here"),
  );
  return element;
};

export const layoutBoard = (ctx) => {
  const { columns } = ctx.config.layout;
  return h(
    "div",
    { class: "board", style: { "--lanes": columns } },
    Array.from({ length: columns }, (_, index) => lane(ctx, index + 1)),
  );
};

/** Every widget type, to drag into a column. Clicking one adds it to the emptiest column. */
export const palette = (ctx) => {
  const present = new Set(ctx.config.widgets.map((widget) => widget.type));
  const tile = ([type, entry]) => {
    const taken = !entry.multiple && present.has(type);
    return h(
      "button",
      {
        type: "button",
        class: "palette-tile",
        draggable: !taken,
        disabled: taken,
        title: taken ? "Already on your desktop" : entry.description,
        onDragstart: (event) => {
          event.dataTransfer.setData(TYPE_DRAG, type);
          event.dataTransfer.effectAllowed = "copyMove";
        },
        onClick: () => addType(ctx, type, emptiestColumn(ctx.config)),
      },
      icon(ICONS.plus, { size: 12, stroke: 2.2 }),
      entry.name,
    );
  };
  return h(
    "section",
    { class: "group", "aria-label": "Add a widget" },
    h("h2", {}, "Add a widget"),
    h("div", { class: "palette" }, Object.entries(CATALOG).map(tile)),
    h("p", { class: "help" }, "Drag one into a column, or click it to add it to the emptiest one. Clock, Weather, Calendar, To do and Service status can be added several times."),
  );
};
