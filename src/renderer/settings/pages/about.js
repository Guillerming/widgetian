// About: who makes Widgetian, where it lives, and the version there is (with the update check).
import { h } from "../../shared/dom.js";
import { row } from "../fields.js";
import { group } from "../kit.js";
import { updatesGroup } from "./updates.js";

const api = window.widgetian;

const REPOSITORY = "https://github.com/Guillerming/widgetian";
const LINKS = [
  { label: "Portfolio", text: "guillerming.es", url: "https://guillerming.es" },
  { label: "X", text: "@guillerming_es", url: "https://x.com/guillerming_es" },
  { label: "GitHub", text: "Guillerming/widgetian", url: REPOSITORY },
];
const CHANGELOG = `${REPOSITORY}/blob/main/CHANGELOG.md`;

const external = (url, text) =>
  h("a", { class: "external", href: url, onClick: (event) => (event.preventDefault(), api.openExternal(url).catch(() => {})) }, text);

export const aboutPage = (ctx) =>
  h(
    "div",
    { class: "page" },
    h(
      "header",
      { class: "about-head" },
      h("span", { class: "brand-mark about-mark", "aria-hidden": "true" }),
      h(
        "div",
        {},
        h("h1", {}, "Widgetian"),
        h("p", {}, "Glass desktop widgets for macOS. Free and open source, under the MIT license."),
        h("p", { class: "about-author" }, "Made by Guillermo, ", external("https://guillerming.es", "Guillerming"), "."),
      ),
    ),
    updatesGroup(ctx),
    group(
      "Links",
      ...LINKS.map(({ label, text, url }) => row(label, external(url, text))),
      row("Changelog", external(CHANGELOG, "What changed in each version")),
    ),
  );
