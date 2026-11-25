import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { emptiestColumn, createWidget, insertWidget, normalizeConfig } from "../src/shared/config.js";
import { levelFor, planFor } from "../src/main/desktop-icons-plan.js";
import { widgetDisplays, widgetsBounds } from "../src/main/displays.js";
import { cleanRects, isInside } from "../src/main/hit-test.js";

const displays = [
  { id: 1, label: "Color LCD" },
  { id: 2, label: "LS24A600U" },
];
const idsFor = (general, list = displays) => widgetDisplays(list, 1, { display: "primary", displayId: 0, displayLabel: "", ...general }).map(({ id }) => id);

describe("widgetDisplays", () => {
  test("main, every or one display", () => {
    assert.deepEqual(idsFor({}), [1]);
    assert.deepEqual(idsFor({ display: "all" }), [1, 2]);
    assert.deepEqual(idsFor({ display: "one", displayId: 2, displayLabel: "LS24A600U" }), [2]);
  });

  test("a monitor that comes back with another id is found by its name", () => {
    assert.deepEqual(idsFor({ display: "one", displayId: 77, displayLabel: "LS24A600U" }), [2]);
    // The id now belongs to another monitor.
    assert.deepEqual(idsFor({ display: "one", displayId: 1, displayLabel: "LS24A600U" }), [2]);
  });

  test("the main display stands in for one that is not connected", () => {
    assert.deepEqual(idsFor({ display: "one", displayId: 2, displayLabel: "LS24A600U" }, [displays[0]]), [1]);
  });
});

describe("widgetsBounds", () => {
  test("goes from the menu bar to the bottom of the screen, behind the Dock", () => {
    const display = { bounds: { x: 0, y: 0, width: 1800, height: 1169 }, workArea: { x: 0, y: 39, width: 1800, height: 1066 } };
    assert.deepEqual(widgetsBounds(display), { x: 0, y: 39, width: 1800, height: 1130 });
  });

  test("works on a display above the main one and keeps clear of a side Dock", () => {
    const display = { bounds: { x: -351, y: -1440, width: 2560, height: 1440 }, workArea: { x: -281, y: -1415, width: 2490, height: 1415 } };
    assert.deepEqual(widgetsBounds(display), { x: -281, y: -1415, width: 2490, height: 1415 });
  });
});

describe("hit testing", () => {
  test("a point is inside a rectangle, edges included only at the start", () => {
    const rects = [{ x: 10, y: 10, width: 20, height: 20 }];
    assert.equal(isInside({ x: 10, y: 10 }, rects), true);
    assert.equal(isInside({ x: 30, y: 15 }, rects), false);
    assert.equal(isInside({ x: 15, y: 15 }, []), false);
  });

  test("malformed rectangles from a page are dropped", () => {
    assert.deepEqual(cleanRects("no"), []);
    assert.deepEqual(cleanRects([null, { x: 1 }, { x: 1, y: 1, width: NaN, height: 1 }]), []);
    assert.equal(cleanRects([{ x: 0, y: 0, width: 1, height: 1 }]).length, 1);
  });
});

describe("desktop icons", () => {
  test("the wallpaper goes over them only when they are to be hidden", () => {
    assert.equal(levelFor("wallpaper", { hideDesktopIcons: true }), "cover");
    assert.equal(levelFor("wallpaper", { hideDesktopIcons: false }), "wallpaper");
    assert.equal(levelFor("widgets", { hideDesktopIcons: true }), "widgets");
  });

  test("are hidden when wanted and shown again only if Widgetian hid them", () => {
    assert.equal(planFor({ wanted: true, hidden: false, ours: false }), "hide");
    assert.equal(planFor({ wanted: true, hidden: true, ours: false }), "nothing");
    assert.equal(planFor({ wanted: false, hidden: true, ours: true }), "show");
    assert.equal(planFor({ wanted: false, hidden: true, ours: false }), "nothing");
    assert.equal(planFor({ wanted: false, hidden: false, ours: true }), "nothing");
  });
});

describe("general and layout settings", () => {
  test("keep the chosen display and drop what no longer exists", () => {
    const config = normalizeConfig({ general: { display: "one", displayId: 2, displayLabel: "X", hideDesktopIcons: true }, layout: { minWidth: 500 } });
    assert.deepEqual([config.general.display, config.general.displayId, config.general.displayLabel], ["one", 2, "X"]);
    assert.equal(config.general.hideDesktopIcons, true);
    assert.equal(Object.hasOwn(config.layout, "minWidth"), false);
    assert.equal(normalizeConfig({ general: { hideDesktopIcons: "yes" } }).general.hideDesktopIcons, false);
  });

  test("a new widget goes where it is dropped, or to the emptiest column", () => {
    const config = normalizeConfig({
      layout: { columns: 2 },
      widgets: [{ id: "a", type: "clock", column: 1, order: 1 }, { id: "b", type: "todo", column: 1, order: 2 }],
    });
    assert.equal(emptiestColumn(config), 2);
    const inserted = insertWidget(config, createWidget("weather", 1, 1, "n"), 1, 1);
    const order = inserted.widgets.filter((widget) => widget.column === 1).sort((x, y) => x.order - y.order).map((widget) => widget.id);
    assert.deepEqual(order, ["a", "n", "b"]);
    assert.equal(insertWidget(config, createWidget("weather", 1, 1, "n"), 2).widgets.find((widget) => widget.id === "n").order, 1);
  });
});
