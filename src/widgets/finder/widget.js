// Finder: the whole card is a button that opens the Desktop folder in a Finder window, so the files
// on the desktop stay at hand while widgets cover it.
import { h, icon } from "../../renderer/shared/dom.js";
import { ICONS } from "../../renderer/shared/ui.js";

const FOLDER = "M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2.2h7.4a2 2 0 0 1 2 2v7.3a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7.5Z";
const FAILED_MS = 4000;

export function mount(root, ctx) {
  const detail = h("small", { role: "status" }, "Open in Finder");
  let timer = null;

  const open = async () => {
    try {
      await ctx.api.openDesktopFolder();
    } catch {
      detail.textContent = "Couldn't open the folder";
      clearTimeout(timer);
      timer = setTimeout(() => {
        detail.textContent = "Open in Finder";
      }, FAILED_MS);
    }
  };

  root.append(
    h(
      "button",
      { type: "button", class: "glass finder", "aria-label": "Open the Desktop folder in Finder", onClick: open },
      h("span", { class: "folder" }, icon(FOLDER, { size: 22, stroke: 1.5 })),
      h("span", { class: "finder-text" }, h("strong", {}, "Desktop"), detail),
      h("span", { class: "go" }, icon(ICONS.external, { size: 14 })),
    ),
  );
  return () => clearTimeout(timer);
}
