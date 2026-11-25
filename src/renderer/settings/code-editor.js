// The JavaScript field of a script block: a plain editor, examples to start from, a Run button that
// shows what the script returns (as the card would, and as data), and what it may use.
import { SCRIPT_EXAMPLES } from "../../shared/script-examples.js";
import { drawSections } from "../../widgets/status/view.js";
import { h, replace } from "../shared/dom.js";

const api = window.widgetian;

const HELP = `Runs in Node.js, as you, on this Mac. Use await freely and return what to show.

You have
  sh("command")        runs it with your shell, gives its output
  json("https://…")    gets a JSON address
  fetch, require       as in Node.js
  ago(date)            "3 min ago"
  bytes(12345678)      "12.3 MB"
  action               what was clicked ("" on a normal refresh)
  state                an object kept between runs

You can return any of these, shown in the order you write them
  hero      { tone, title, detail, progress: 0–1, running, url or action, hint }   the ring
  text      "…"
  rows      [{ tone, label, detail, running, url or action }]
  stats     [{ label, value, detail, tone }]
  progress  { label, value: 0–1, detail, tone }
  chart     { label, value, detail, note, live, values: […], from, to, url }
            or series: [{ values, style: "area" | "line" | "dashed" }]
  list      { title, empty, items: [{ icon, label, text, detail, live, url or action }] }
  buttons   [{ label, url or action }]
  tabs      [{ name, live, …any of these }]
  html, css your own HTML; links and data-action="…" work
  refresh   seconds until the next run, for jobs in progress
  live      true puts a green dot on the block's tab

tone is "good", "wait" or "bad". An array of objects shows one after the other.
url opens a web page; action runs the script again with that action.`;

const insertTab = (event) => {
  if (event.key !== "Tab" || event.shiftKey || event.altKey || event.metaKey) return;
  event.preventDefault();
  event.target.setRangeText("  ", event.target.selectionStart, event.target.selectionEnd, "end");
  event.target.dispatchEvent(new Event("input", { bubbles: true }));
};

const heroPreview = (hero) =>
  hero ? h("div", { class: "preview-hero", dataset: { tone: hero.tone } }, h("span", { class: "check-mark" }), h("strong", {}, hero.title), h("span", {}, hero.detail)) : null;

const preview = (view, rerun) => {
  const handlers = { open: (url) => api.openExternal(url).catch(() => {}), run: rerun };
  return h("div", { class: "script-preview" }, h("div", { class: "status" }, heroPreview(view.hero), drawSections(view.sections, handlers, new Map())));
};

const resultOf = (result) => [
  result.ok ? null : h("p", { class: "script-error", role: "alert" }, result.error),
  result.view ? preview(result.view, () => {}) : null,
  result.logs.length ? h("pre", { class: "code" }, result.logs.join("\n")) : null,
  result.ok ? h("details", {}, h("summary", {}, `Returned in ${result.ms} ms`), h("pre", { class: "code" }, result.value)) : null,
];

export const codeInput = (field, value, onChange, id) => {
  const editor = h(
    "textarea",
    { id, class: "code-editor", rows: 16, spellcheck: false, autocomplete: "off", onInput: (event) => onChange(event.target.value), onKeydown: insertTab },
    value ?? "",
  );
  const output = h("div", { class: "script-output", "aria-live": "polite" });
  const run = async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    replace(output, h("p", { class: "help" }, "Running…"));
    try {
      replace(output, resultOf(await api.status.testScript(editor.value)));
    } catch (error) {
      replace(output, h("p", { class: "script-error", role: "alert" }, error.message));
    } finally {
      button.disabled = false;
    }
  };
  const useExample = (event) => {
    const example = SCRIPT_EXAMPLES[Number(event.target.value)];
    event.target.value = "";
    if (!example) return;
    if (editor.value.trim() && !window.confirm("Replace the script with this example?")) return;
    editor.value = example.code;
    onChange(editor.value);
  };
  return h(
    "div",
    { class: "script-field" },
    editor,
    h(
      "div",
      { class: "script-actions" },
      h("button", { type: "button", class: "primary", onClick: run }, "Run"),
      h(
        "select",
        { "aria-label": "Start from an example", onChange: useExample },
        h("option", { value: "" }, "Start from an example…"),
        SCRIPT_EXAMPLES.map((example, index) => h("option", { value: String(index) }, example.name)),
      ),
    ),
    output,
    h("details", { class: "script-help" }, h("summary", {}, "What a script can use and return"), h("pre", { class: "code" }, HELP)),
  );
};
