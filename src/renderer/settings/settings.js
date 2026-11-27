// The settings window: a sidebar of sections and a page per section. Every change is saved to
// config.json shortly after it happens (no Save button); the desktop updates live.
import { h, replace } from "../shared/dom.js";
import { SECTIONS, renderSection, sidebarSection } from "./sections.js";

const api = window.widgetian;
const SAVE_DELAY_MS = 350;
const SAVED_LABEL_MS = 1600;

const sidebar = document.getElementById("sidebar");
const content = document.getElementById("content");
const saveState = document.getElementById("save-state");

let config = null;
let info = null;
let section = decodeURIComponent(location.hash.slice(1)) || "layout";
let lastSaved = "";
let saveTimer = null;
let savedTimer = null;

const showSaveState = (text) => {
  saveState.textContent = text;
  clearTimeout(savedTimer);
  if (text === "Saved") {
    savedTimer = setTimeout(() => {
      saveState.textContent = "";
    }, SAVED_LABEL_MS);
  }
};

const save = async () => {
  const sent = JSON.stringify(config);
  try {
    const saved = await api.config.save(config);
    lastSaved = JSON.stringify(saved);
    // Keep what was saved (normalised) unless the user changed something meanwhile.
    if (JSON.stringify(config) === sent) config = saved;
    showSaveState("Saved");
  } catch (error) {
    showSaveState(`Not saved: ${error.message}`);
  }
};

const update = (change, { structural = false } = {}) => {
  config = change(config);
  showSaveState("Saving…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, SAVE_DELAY_MS);
  if (structural) renderPage();
};

const go = (next) => {
  section = next;
  history.replaceState(null, "", `#${encodeURIComponent(next)}`);
  renderSidebar();
  renderPage();
  content.scrollTop = 0;
};

const ctx = {
  get config() {
    return config;
  },
  get info() {
    return info;
  },
  update,
  go,
};

const navItem = ({ id, label, apart }) =>
  h(
    "li",
    { class: apart ? "apart" : null },
    h("button", { type: "button", class: "nav-item", "aria-current": sidebarSection(section) === id ? "page" : null, onClick: () => go(id) }, label),
  );

function renderSidebar() {
  replace(
    sidebar,
    h("div", { class: "brand" }, h("span", { class: "brand-mark", "aria-hidden": "true" }), "Widgetian"),
    h("nav", { "aria-label": "Settings" }, h("ul", {}, SECTIONS.map(navItem))),
  );
}

/** Redraws the page without losing the place. */
function renderPage() {
  const { scrollTop } = content;
  replace(content, renderSection(ctx, section));
  content.scrollTop = scrollTop;
}

const isTyping = () => content.contains(document.activeElement) && document.activeElement !== document.body;

const start = async () => {
  [config, info] = await Promise.all([api.config.get(), api.appInfo()]);
  lastSaved = JSON.stringify(config);
  renderSidebar();
  renderPage();

  // Changes made elsewhere (the desktop, a text editor): adopt them unless they are our own echo.
  api.config.onChange((next) => {
    const text = JSON.stringify(next);
    if (text === lastSaved || text === JSON.stringify(config)) return;
    lastSaved = text;
    config = next;
    if (!isTyping()) renderPage();
  });
  api.config.onInvalid((message) => showSaveState(`config.json has an error: ${message}`));
  api.onDisplays((displays) => {
    info = { ...info, displays };
    if (section === "general" && !isTyping()) renderPage();
  });
  api.onSettingsSection((next) => go(next));
};

start().catch((error) => replace(content, h("p", { class: "help" }, `Settings could not load: ${error.message}`)));
