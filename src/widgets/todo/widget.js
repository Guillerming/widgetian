// To do: a checklist edited on the desktop. Items live in this widget's settings in config.json,
// so the settings window and the desktop always show the same list. An item may carry a note
// (expand it to read or copy it: handy for long prompts or snippets).
import { h, icon, replace } from "../../renderer/shared/dom.js";
import { ICONS, card } from "../../renderer/shared/ui.js";

const COPIED_MS = 1600;
const CONFIRM_MS = 3000;

const withIds = (items) => items.map((item) => ({ ...item, id: item.id ?? crypto.randomUUID() }));
const newItem = (text) => ({ id: crypto.randomUUID(), text, note: "", done: false });

export function mount(root, ctx) {
  let settings = ctx.settings;
  let items = withIds(settings.items);
  let openId = null;
  let copiedId = null;
  let confirmClear = false;

  const shell = card({ eyebrow: settings.title || "To do", className: "todo" });
  const list = h("ul", { class: "items" });
  const footer = h("footer", { class: "todo-footer" });

  const persist = (next) => {
    items = next;
    render();
    ctx.save({ ...settings, items: next }).catch(() => {});
  };

  const input = h("input", {
    class: "add-input",
    type: "text",
    placeholder: "Add a task",
    "aria-label": "New task",
    maxLength: 500,
    onKeydown: (event) => {
      if (event.key !== "Enter" || !input.value.trim()) return;
      persist([...items, newItem(input.value.trim())]);
      input.value = "";
    },
  });
  shell.body.append(list, h("div", { class: "add" }, icon(ICONS.plus, { size: 14 }), input), footer);
  root.append(shell.element);

  const toggle = (id) => persist(items.map((item) => (item.id === id ? { ...item, done: !item.done } : item)));
  const remove = (id) => persist(items.filter((item) => item.id !== id));

  const copy = async (item) => {
    await ctx.api.copy(item.note || item.text);
    copiedId = item.id;
    render();
    setTimeout(() => {
      if (copiedId === item.id) copiedId = null;
      render();
    }, COPIED_MS);
  };

  const clearDone = () => {
    if (!confirmClear) {
      confirmClear = true;
      render();
      setTimeout(() => {
        confirmClear = false;
        render();
      }, CONFIRM_MS);
      return;
    }
    confirmClear = false;
    persist(items.filter((item) => !item.done));
  };

  const noteView = (item) =>
    h(
      "div",
      { class: "note" },
      h("pre", {}, item.note),
      h(
        "div",
        { class: "note-actions" },
        h("span", {}, `${item.note.length} characters`),
        h(
          "button",
          { type: "button", class: "copy", onClick: () => copy(item) },
          icon(ICONS[copiedId === item.id ? "check" : "copy"], { size: 12 }),
          copiedId === item.id ? "Copied" : "Copy",
        ),
      ),
    );

  const itemRow = (item) => {
    const open = openId === item.id;
    const hasNote = Boolean(item.note);
    const toggleNote = () => {
      if (!hasNote) return;
      openId = open ? null : item.id;
      render();
    };
    return h(
      "li",
      { class: "item", dataset: { done: item.done ? "true" : "false" } },
      h(
        "div",
        { class: "item-head" },
        h(
          "button",
          {
            type: "button",
            class: "check",
            "aria-pressed": String(item.done),
            "aria-label": `Mark "${item.text}" as ${item.done ? "not done" : "done"}`,
            onClick: () => toggle(item.id),
          },
          icon(ICONS.check, { size: 11, stroke: 2 }),
        ),
        h(
          "button",
          { type: "button", class: "text", "aria-expanded": hasNote ? String(open) : null, onClick: toggleNote },
          item.text,
          hasNote ? h("span", { class: "chevron" }, icon(ICONS.chevron, { size: 12 })) : null,
        ),
        h(
          "button",
          { type: "button", class: "icon-button remove", "aria-label": `Delete "${item.text}"`, onClick: () => remove(item.id) },
          icon(ICONS.trash, { size: 13 }),
        ),
      ),
      open ? noteView(item) : null,
    );
  };

  function render() {
    const visible = settings.hideDone ? items.filter((item) => !item.done) : items;
    const done = items.filter((item) => item.done).length;
    shell.setAside(items.length ? `${done}/${items.length} done` : "");
    const empty = h("li", { class: "empty" }, items.length ? "All done." : "Nothing to do. Add something below.");
    replace(list, visible.length ? visible.map(itemRow) : empty);
    const clearLabel = confirmClear ? "Sure? Click again" : `Clear ${done} done`;
    replace(footer, done > 0 ? h("button", { type: "button", class: "clear", onClick: clearDone }, clearLabel) : null);
  }

  render();
  return {
    update: (next) => {
      settings = next;
      items = withIds(next.items);
      shell.setEyebrow(next.title || "To do");
      render();
    },
  };
}
