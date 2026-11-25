import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, test } from "node:test";
import { CATALOG } from "../src/shared/catalog.js";
import { columnsOf, defaultConfig, moveWidget, normalizeConfig, updateWidgetSettings, uses12h } from "../src/shared/config.js";
import { buildQueue, shuffled } from "../src/widgets/music/queue.js";

describe("catalog", () => {
  for (const type of Object.keys(CATALOG)) {
    test(`${type} has its widget.js and widget.css`, () => {
      for (const file of ["widget.js", "widget.css"]) {
        assert.ok(fs.existsSync(new URL(`../src/widgets/${type}/${file}`, import.meta.url)), `missing ${type}/${file}`);
      }
    });
  }

  test("a new user gets the Finder widget", () => {
    assert.ok(defaultConfig().widgets.some((widget) => widget.type === "finder" && widget.enabled));
  });
});

describe("normalizeConfig", () => {
  test("returns the defaults for anything that is not an object", () => {
    for (const input of [null, undefined, 42, "x", []]) {
      const config = normalizeConfig(input);
      assert.deepEqual(config.general, defaultConfig().general);
      assert.equal(config.widgets.length, defaultConfig().widgets.length);
    }
  });

  test("drops unknown widget types and fills missing settings with defaults", () => {
    const config = normalizeConfig({
      widgets: [
        { id: "a", type: "clock", settings: { showSeconds: false } },
        { id: "b", type: "does-not-exist" },
      ],
    });
    assert.equal(config.widgets.length, 1);
    assert.equal(config.widgets[0].settings.showSeconds, false);
    assert.equal(config.widgets[0].settings.showDate, CATALOG.clock.defaults.showDate);
  });

  test("keeps an explicitly empty widget list", () => {
    assert.deepEqual(normalizeConfig({ widgets: [] }).widgets, []);
  });

  test("clamps columns and moves widgets beyond the last column into range", () => {
    const config = normalizeConfig({ layout: { columns: 99 }, widgets: [{ id: "a", type: "clock", column: 50 }] });
    assert.equal(config.layout.columns, 8);
    assert.equal(config.widgets[0].column, 8);
  });

  test("makes duplicate ids unique", () => {
    const config = normalizeConfig({ widgets: [{ id: "x", type: "clock" }, { id: "x", type: "todo" }] });
    assert.notEqual(config.widgets[0].id, config.widgets[1].id);
  });

  test("merges nested settings one level deep (weather location)", () => {
    const config = normalizeConfig({ widgets: [{ id: "w", type: "weather", settings: { location: { mode: "manual" } } }] });
    assert.deepEqual(config.widgets[0].settings.location, { mode: "manual", name: "", latitude: null, longitude: null });
  });

  test("rejects malformed wallpaper colours and unknown modes", () => {
    const config = normalizeConfig({ wallpaper: { mode: "video", customColors: ["red", "#000000"] } });
    assert.equal(config.wallpaper.mode, "gradient");
    assert.equal(config.wallpaper.customColors.length, 4);
  });

  test("does not mutate its input", () => {
    const input = { widgets: [{ id: "a", type: "clock", settings: {} }] };
    const copy = structuredClone(input);
    normalizeConfig(input);
    assert.deepEqual(input, copy);
  });
});

describe("layout helpers", () => {
  const config = normalizeConfig({
    layout: { columns: 3 },
    widgets: [
      { id: "a", type: "clock", column: 1, order: 1 },
      { id: "b", type: "weather", column: 1, order: 2 },
      { id: "c", type: "todo", column: 2, order: 1 },
      { id: "d", type: "power", column: 1, order: 3, enabled: false },
    ],
  });

  test("columnsOf lists enabled widgets per column in order", () => {
    assert.deepEqual(
      columnsOf(config).map((column) => column.map((widget) => widget.id)),
      [["a", "b"], ["c"], []],
    );
  });

  test("moveWidget moves across columns and renumbers both", () => {
    const moved = moveWidget(config, "a", 2, 1);
    const byId = Object.fromEntries(moved.widgets.map((widget) => [widget.id, widget]));
    assert.deepEqual([byId.c.order, byId.a.order], [1, 2]);
    assert.equal(byId.a.column, 2);
    assert.deepEqual([byId.b.order, byId.d.order], [1, 2]);
  });

  test("moveWidget reorders within a column", () => {
    const moved = moveWidget(config, "b", 1, 0);
    const order = moved.widgets
      .filter((widget) => widget.column === 1)
      .sort((x, y) => x.order - y.order)
      .map((widget) => widget.id);
    assert.deepEqual(order, ["b", "a", "d"]);
  });

  test("moveWidget ignores unknown ids", () => {
    assert.equal(moveWidget(config, "nope", 1, 0), config);
  });

  test("updateWidgetSettings replaces one widget's settings only", () => {
    const next = updateWidgetSettings(config, "c", (settings) => ({ ...settings, title: "Groceries" }));
    assert.equal(next.widgets.find((widget) => widget.id === "c").settings.title, "Groceries");
    assert.equal(config.widgets.find((widget) => widget.id === "c").settings.title, "To do");
  });

  test("uses12h follows General unless the widget overrides it", () => {
    assert.equal(uses12h({ timeFormat: "12h" }, "inherit"), true);
    assert.equal(uses12h({ timeFormat: "12h" }, "24h"), false);
    assert.equal(uses12h({ timeFormat: "24h" }), false);
  });
});

describe("music queue", () => {
  const tracks = [
    { id: "1", artist: "A" },
    { id: "2", artist: "B" },
    { id: "3", artist: "A" },
    { id: "4", artist: "C" },
  ];
  const fixedRandom = () => 0;

  test("in order, it wraps around from the current track", () => {
    assert.deepEqual(buildQueue(tracks, { shuffle: false, currentId: "3" }), ["3", "4", "1", "2"]);
  });

  test("shuffled, the current track stays first and every track appears once", () => {
    const queue = buildQueue(tracks, { shuffle: true, currentId: "2", random: fixedRandom });
    assert.equal(queue[0], "2");
    assert.deepEqual([...queue].sort(), ["1", "2", "3", "4"]);
  });

  test("an artist lock keeps only that artist", () => {
    assert.deepEqual(buildQueue(tracks, { shuffle: false, artist: "A", currentId: "3" }), ["3", "1"]);
  });

  test("without a current track it plays the whole pool", () => {
    assert.deepEqual(buildQueue(tracks, { shuffle: false }), ["1", "2", "3", "4"]);
  });

  test("shuffled() does not mutate its input", () => {
    const input = [1, 2, 3];
    shuffled(input);
    assert.deepEqual(input, [1, 2, 3]);
  });
});
