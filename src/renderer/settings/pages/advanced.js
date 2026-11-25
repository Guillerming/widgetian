import { normalizeConfig } from "../../../shared/config.js";
import { h } from "../../shared/dom.js";
import { row } from "../fields.js";
import { group, page } from "../kit.js";

const api = window.widgetian;

export const advancedPage = (ctx) => {
  const editor = h("textarea", { class: "json-editor", spellcheck: false, rows: 22, "aria-label": "config.json" }, JSON.stringify(ctx.config, null, 2));
  const message = h("p", { class: "help", role: "status" });
  const applyJson = () => {
    try {
      const next = normalizeConfig(JSON.parse(editor.value));
      ctx.update(() => next);
      message.textContent = "Applied.";
    } catch (error) {
      message.textContent = `Not valid JSON: ${error.message}`;
    }
  };
  return page(
    "Advanced",
    "Everything lives in one JSON file. Edit it here or in any editor: Widgetian picks up changes as soon as the file is saved.",
    group("", row("config.json", h("button", { type: "button", class: "ghost", onClick: () => api.openConfigFile() }, "Open in editor"), { help: ctx.info.configFile })),
    h(
      "section",
      { class: "group" },
      h("h2", {}, "Edit as JSON"),
      editor,
      h(
        "div",
        { class: "page-actions" },
        message,
        h("button", { type: "button", class: "ghost", onClick: () => ctx.go("advanced") }, "Revert"),
        h("button", { type: "button", class: "primary", onClick: applyJson }, "Apply"),
      ),
    ),
    h("p", { class: "about" }, `Widgetian ${ctx.info.version}`),
  );
};
