import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { normalizeConfig } from "../src/shared/config.js";
import { DEFAULT_THEME_ID, gradientOf, gradientsOf } from "../src/shared/wallpaper-themes.js";

const wallpaperOf = (wallpaper) => normalizeConfig({ wallpaper }).wallpaper;
const COLORS = ["#2c90dd", "#2931a8", "#3a2682", "#5d8dcb"];

describe("wallpaper modes", () => {
  test('"off" from older versions becomes "system"', () => {
    assert.equal(wallpaperOf({ mode: "off" }).mode, "system");
    assert.equal(wallpaperOf({ mode: "system" }).mode, "system");
  });
});

describe("custom gradients", () => {
  test("the single custom gradient of older versions becomes one named Custom, still in use", () => {
    const wallpaper = wallpaperOf({ theme: "custom", customColors: COLORS });
    assert.deepEqual(wallpaper.customThemes, [{ id: "custom", name: "Custom", colors: COLORS }]);
    assert.equal(wallpaper.theme, "custom");
    assert.equal(gradientOf(wallpaper, "custom").colors, wallpaper.customThemes[0].colors);
  });

  test("keeps several, drops broken ones and duplicates", () => {
    const wallpaper = wallpaperOf({
      theme: "custom-b",
      customThemes: [
        { id: "custom-a", name: "  Sea ", colors: COLORS },
        { id: "custom-b", name: "", colors: COLORS },
        { id: "custom-a", name: "Again", colors: COLORS },
        { id: "custom-c", name: "Bad", colors: ["red"] },
        { id: "../evil", name: "Bad id", colors: COLORS },
      ],
    });
    assert.deepEqual(wallpaper.customThemes.map(({ id, name }) => [id, name]), [["custom-a", "Sea"], ["custom-b", "Custom"]]);
    assert.equal(wallpaper.theme, "custom-b");
  });

  test("a theme that no longer exists falls back to the default", () => {
    assert.equal(wallpaperOf({ theme: "custom-gone", customThemes: [] }).theme, DEFAULT_THEME_ID);
  });
});

describe("hidden gradients", () => {
  test("only known ids are kept, once", () => {
    const wallpaper = wallpaperOf({ hiddenThemes: ["dark", "dark", "nope", "custom-a"], customThemes: [{ id: "custom-a", name: "A", colors: COLORS }] });
    assert.deepEqual(wallpaper.hiddenThemes, ["dark", "custom-a"]);
    const listed = gradientsOf(wallpaper);
    assert.equal(listed.find((theme) => theme.id === "dark").hidden, true);
    assert.equal(listed.find((theme) => theme.id === "custom-a").hidden, true);
    assert.equal(listed.find((theme) => theme.id === DEFAULT_THEME_ID).hidden, false);
  });
});

describe("images", () => {
  test("breathing blur is on unless turned off", () => {
    assert.equal(wallpaperOf({}).imageBreathing, true);
    assert.equal(wallpaperOf({ imageBreathing: false }).imageBreathing, false);
  });
});
