// The Updates group of About: the daily check, and the version there is to install. The main
// process (src/main/updater.js) owns the state; this only shows it and redraws its own rows as it
// changes, so a download in progress does not redraw the whole page.
import { h, replace } from "../../shared/dom.js";
import { row, toggle } from "../fields.js";
import { group, updatePart } from "../kit.js";

const api = window.widgetian;
let latest = null;
let slot = null;

const timeOf = (ms) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(ms);

const button = (label, onClick, { primary = false, disabled = false } = {}) =>
  h("button", { type: "button", class: primary ? "primary" : "ghost", disabled, onClick }, label);

const whatsNew = (page) =>
  h("a", { href: page, onClick: (event) => (event.preventDefault(), api.openExternal(page).catch(() => {})) }, "What's new");

/** Runs an action; its errors normally arrive with the state, others are shown here. */
const act = (task) => () =>
  task().catch((error) => {
    latest = { ...latest, error: error.message };
    if (slot?.isConnected) draw(latest);
  });

const check = act(() => api.updates.check());
const install = act(() => api.updates.install());

/** The status line and the button for a state. */
const describe = (state) => {
  const { status, version, error } = state;
  if (status === "checking") return { text: "Checking…", control: button("Check now", check, { disabled: true }) };
  if (status === "downloading") {
    return { text: `Downloading ${version}… ${Math.round(state.progress * 100)}%`, control: button("Install and restart", install, { primary: true, disabled: true }) };
  }
  if (status === "installing") return { text: `Installing ${version}…`, control: button("Install and restart", install, { primary: true, disabled: true }) };
  if (version) {
    const how = state.canInstall ? "Widgetian quits, updates itself and opens again in a few seconds." : state.manualReason;
    return {
      text: [`Widgetian ${version} is available. ${how}`, error].filter(Boolean).join(" "),
      link: state.page,
      control: button(state.canInstall ? "Install and restart" : "Download", install, { primary: true }),
    };
  }
  if (error) return { text: error, control: button("Check now", check) };
  if (status === "current") return { text: `This is the latest version. Checked at ${timeOf(state.checkedAt)}.`, control: button("Check now", check) };
  return { text: "", control: button("Check now", check) };
};

function draw(state) {
  const { text, link, control } = describe(state);
  replace(
    slot,
    row(`Version ${state.current}`, control),
    text ? h("p", { class: "help", role: "status" }, text, link ? [" ", whatsNew(link)] : null) : null,
  );
}

api.updates.onChange((state) => {
  latest = state;
  if (slot?.isConnected) draw(state);
});

export const updatesGroup = (ctx) => {
  const own = h("div", { class: "updates" });
  slot = own;
  if (latest) draw(latest);
  api.updates
    .state()
    .then((state) => {
      latest = state;
      if (slot === own) draw(state);
    })
    .catch((error) => replace(own, h("p", { class: "help" }, `Couldn't read the update status: ${error.message}`)));
  return group(
    "Updates",
    row("Check for updates", toggle(ctx.config.general.checkForUpdates, (checkForUpdates) => updatePart(ctx, "general", { checkForUpdates })), {
      help: "Once a day, Widgetian asks GitHub whether there is a newer version. It sends nothing but its own version number.",
    }),
    own,
  );
};
