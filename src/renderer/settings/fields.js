// Form controls generated from the catalog's field descriptions (src/shared/catalog.js).
// Each control reports changes through onChange(value, { structural }). Structural changes
// (adding a list item, switching a check's type…) re-render the page; typing does not, so focus stays.
import { h, replace } from "../shared/dom.js";
import { codeInput } from "./code-editor.js";

const api = window.widgetian;
let uid = 0;
const nextId = () => {
  uid += 1;
  return `field-${uid}`;
};

const debounce = (task, ms) => {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => task(...args), ms);
  };
};

/** A labelled row: label on the left, control on the right, help underneath. */
export const row = (label, control, { help = "", id = "", stacked = false } = {}) =>
  h(
    "div",
    { class: `row${stacked ? " stacked" : ""}` },
    h("label", { class: "row-label", for: id || null }, label),
    h("div", { class: "row-control" }, control, help ? h("p", { class: "help" }, help) : null),
  );

export const toggle = (checked, onChange, { id = nextId(), label = "", disabled = false } = {}) =>
  h(
    "span",
    { class: "switch" },
    h("input", {
      id,
      type: "checkbox",
      role: "switch",
      checked,
      disabled,
      "aria-label": label || null,
      onChange: (event) => onChange(event.target.checked),
    }),
    h("span", { class: "switch-track", "aria-hidden": "true" }),
  );

export const select = (value, options, onChange, { id = nextId() } = {}) =>
  h(
    "select",
    { id, onChange: (event) => onChange(event.target.value) },
    options.map((option) =>
      h("option", { value: option.value, selected: option.value === value, disabled: Boolean(option.disabled) }, option.label),
    ),
  );

/** Buttons that behave like a radio group, e.g. Off / Gradient / Images. */
export const segmented = (value, options, onChange, label) =>
  h(
    "div",
    { class: "segmented", role: "radiogroup", "aria-label": label },
    options.map((option) =>
      h(
        "button",
        { type: "button", role: "radio", "aria-checked": String(option.value === value), onClick: () => option.value !== value && onChange(option.value) },
        option.label,
      ),
    ),
  );

const textInput = (field, value, onChange, id) => {
  const input = h("input", {
    id,
    type: field.secret ? "password" : "text",
    value: value ?? "",
    placeholder: field.placeholder ?? "",
    spellcheck: false,
    autocomplete: "off",
    onInput: (event) => onChange(event.target.value),
  });
  if (!field.secret) return input;
  const reveal = h(
    "button",
    {
      type: "button",
      class: "ghost small",
      onClick: () => {
        input.type = input.type === "password" ? "text" : "password";
        reveal.textContent = input.type === "password" ? "Show" : "Hide";
      },
    },
    "Show",
  );
  return h("div", { class: "with-button" }, input, reveal);
};

const numberInput = (field, value, onChange, id) =>
  h("input", {
    id,
    type: "number",
    value: value ?? "",
    min: field.min ?? null,
    max: field.max ?? null,
    step: field.step ?? 1,
    class: "narrow",
    onChange: (event) => {
      const number = Number(event.target.value);
      if (event.target.value !== "" && Number.isFinite(number)) onChange(number);
    },
  });

const timeZones = () => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
};

const timezoneInput = (field, value, onChange, id) => {
  const known = timeZones();
  const zones = value && !known.includes(value) ? [value, ...known] : known;
  const own = { value: "", label: `This Mac's: ${Intl.DateTimeFormat().resolvedOptions().timeZone}` };
  return select(value ?? "", [own, ...zones.map((zone) => ({ value: zone, label: zone.replaceAll("_", " ") }))], onChange, { id });
};

const folderInput = (field, value, onChange, id) => {
  const input = h("input", { id, type: "text", value: value ?? "", spellcheck: false, onChange: (event) => onChange(event.target.value.trim()) });
  const choose = async () => {
    const folder = await api.chooseFolder(input.value);
    if (!folder) return;
    input.value = folder;
    onChange(folder);
  };
  return h("div", { class: "with-button" }, input, h("button", { type: "button", class: "ghost small", onClick: choose }, "Choose…"));
};

const imageInput = (field, value, onChange, id) => {
  const input = h("input", {
    id,
    type: "text",
    value: value ?? "",
    placeholder: field.placeholder ?? "",
    spellcheck: false,
    onInput: (event) => onChange(event.target.value),
  });
  const choose = async () => {
    const file = await api.chooseImage();
    if (!file) return;
    input.value = file;
    onChange(file);
  };
  return h("div", { class: "with-button" }, input, h("button", { type: "button", class: "ghost small", onClick: choose }, "Choose…"));
};

/** Automatic (this Mac) or a city found with Open-Meteo's geocoder. */
const locationInput = (field, value, onChange) => {
  const results = h("ul", { class: "place-results" });
  const chosen = h("p", { class: "help" });
  let current = value;
  const showChosen = () => {
    chosen.textContent =
      current.mode === "manual" && current.name ? `Showing the weather for ${current.name}.` : "No city chosen yet.";
  };
  const pick = (place) => {
    current = { mode: "manual", name: place.name, latitude: place.latitude, longitude: place.longitude };
    onChange(current);
    replace(results);
    showChosen();
  };
  const placeButton = (place) =>
    h("li", {}, h("button", { type: "button", onClick: () => pick(place) }, h("strong", {}, place.name), h("span", {}, place.detail)));
  const search = debounce(async (query) => {
    if (query.trim().length < 2) return replace(results);
    try {
      const places = await api.source("places", { query });
      return replace(results, places.length ? places.map(placeButton) : h("li", { class: "empty" }, "No places found."));
    } catch {
      return replace(results, h("li", { class: "empty" }, "Search is unavailable right now."));
    }
  }, 300);
  showChosen();
  const manualArea = h(
    "div",
    { class: "location-search" },
    h("input", {
      type: "search",
      placeholder: "Search a city",
      value: current.mode === "manual" ? current.name : "",
      onInput: (event) => search(event.target.value),
    }),
    results,
    chosen,
  );
  const modes = [
    { value: "auto", label: "Automatic" },
    { value: "manual", label: "Choose a city" },
  ];
  return h(
    "div",
    {},
    segmented(current.mode, modes, (mode) => onChange({ ...current, mode }, { structural: true }), "Location"),
    current.mode === "manual" ? manualArea : null,
  );
};

const appliesTo = (field, item) =>
  !field.when || Object.entries(field.when).every(([key, allowed]) => allowed.includes(item[key]));

const newId = () => Math.random().toString(36).slice(2, 8);

/** Ids of the collapsible items that are open, so redrawing the page keeps them open. */
const openItems = new Set();

const itemTitle = (field, item) => {
  const type = field.itemFields.find((entry) => entry.key === "type")?.options.find((option) => option.value === item.type)?.label;
  return [type, item.title, item.tab ? `Tab: ${item.tab}` : ""].filter(Boolean).join(" · ");
};

/** A list of objects: one card per item, each with its own fields; add, remove, reorder. */
const listInput = (field, value, onChange) => {
  // The list as it is now, not as it was drawn: typing in one item does not redraw the others.
  let items = Array.isArray(value) ? value : [];
  const update = (next, structural = false) => {
    items = next;
    onChange(next, { structural });
  };
  const move = (index, delta) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    update(next, true);
  };
  const actions = (index, title) =>
    h(
      "div",
      { class: "list-item-actions" },
      h("span", { class: "list-item-number" }, title ?? String(index + 1)),
      h("button", { type: "button", class: "ghost small", disabled: index === 0, "aria-label": "Move up", onClick: () => move(index, -1) }, "↑"),
      h(
        "button",
        { type: "button", class: "ghost small", disabled: index === items.length - 1, "aria-label": "Move down", onClick: () => move(index, 1) },
        "↓",
      ),
      h("button", { type: "button", class: "ghost small danger", onClick: () => update(items.filter((_, other) => other !== index), true) }, "Remove"),
    );
  const itemFields = (item, index) =>
    field.itemFields
      .filter((itemField) => appliesTo(itemField, item))
      .map((itemField) =>
        renderField(itemField, item[itemField.key], (fieldValue, options = {}) => {
          const next = items.map((entry, other) => (other === index ? { ...entry, [itemField.key]: fieldValue } : entry));
          update(next, Boolean(options.structural));
        }),
      );
  const collapsible = (item, index) =>
    h(
      "details",
      {
        class: "list-item",
        open: openItems.has(item.id),
        onToggle: (event) => (event.currentTarget.open ? openItems.add(item.id) : openItems.delete(item.id)),
      },
      h("summary", {}, itemTitle(field, item)),
      actions(index, ""),
      itemFields(item, index),
    );
  const plain = (item, index) => h("fieldset", { class: "list-item" }, actions(index), itemFields(item, index));
  const cards = items.map(field.collapsible ? collapsible : plain);
  const add = () => {
    const item = structuredClone(field.itemDefaults ?? {});
    if (!field.collapsible) return update([...items, item], true);
    const id = newId();
    openItems.add(id);
    return update([...items, { id, ...item }], true);
  };
  return h(
    "div",
    { class: "list" },
    cards.length ? cards : h("p", { class: "help" }, "Nothing here yet."),
    h("button", { type: "button", class: "ghost", onClick: add }, `+ ${field.addLabel ?? "Add"}`),
  );
};

const CONTROLS = {
  text: textInput,
  textarea: (field, value, onChange, id) =>
    h("textarea", { id, rows: 4, placeholder: field.placeholder ?? "", spellcheck: false, onInput: (event) => onChange(event.target.value) }, value ?? ""),
  number: numberInput,
  boolean: (field, value, onChange, id) => toggle(Boolean(value), onChange, { id, label: field.label }),
  select: (field, value, onChange, id) => select(value, field.options, (next) => onChange(next, { structural: true }), { id }),
  timezone: timezoneInput,
  folder: folderInput,
  image: imageInput,
  code: codeInput,
  location: locationInput,
  color: (field, value, onChange, id) =>
    h("input", { id, type: "color", value: value ?? "#4f8cff", onInput: (event) => onChange(event.target.value) }),
  list: listInput,
};

/**
 * @param {{ key: string, label: string, type: string, help?: string }} field
 * @param {unknown} value
 * @param {(value: unknown, options?: { structural?: boolean }) => void} onChange
 * @param {HTMLElement | null} extra shown right under the control
 */
export function renderField(field, value, onChange, extra = null) {
  const id = nextId();
  const control = (CONTROLS[field.type] ?? CONTROLS.text)(field, value, onChange, id);
  const stacked = ["list", "textarea", "location", "code"].includes(field.type);
  return row(field.label, extra ? [control, extra] : control, { help: field.help, id, stacked });
}
