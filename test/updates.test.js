import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bundleOf, isNewer, isReadOnlyPlace, parseVersion, updateFrom } from "../src/main/update-release.js";

const SHA = "a".repeat(64);
const PREFIX = "https://github.com/Guillerming/widgetian/releases/download/";

const asset = (name, overrides = {}) => ({
  name,
  browser_download_url: `${PREFIX}v0.2.0/${name}`,
  digest: `sha256:${SHA}`,
  size: 1234,
  ...overrides,
});

const release = (overrides = {}) => ({
  tag_name: "v0.2.0",
  draft: false,
  prerelease: false,
  html_url: "https://github.com/Guillerming/widgetian/releases/tag/v0.2.0",
  body: "Notes",
  assets: [asset("Widgetian-0.2.0-arm64.dmg"), asset("Widgetian-0.2.0-arm64.zip"), asset("Widgetian-0.2.0-x64.zip")],
  ...overrides,
});

describe("versions", () => {
  test("parses plain versions with or without a v", () => {
    assert.deepEqual(parseVersion("v0.2.0"), [0, 2, 0]);
    assert.deepEqual(parseVersion("10.0.3"), [10, 0, 3]);
  });

  test("rejects pre-release tags and junk", () => {
    assert.equal(parseVersion("v0.2.0-beta.1"), null);
    assert.equal(parseVersion("latest"), null);
    assert.equal(parseVersion(undefined), null);
  });

  test("compares numerically, not as text", () => {
    assert.equal(isNewer("0.10.0", "0.9.9"), true);
    assert.equal(isNewer("1.0.0", "0.99.99"), true);
    assert.equal(isNewer("0.2.0", "0.2.0"), false);
    assert.equal(isNewer("0.1.9", "0.2.0"), false);
    assert.equal(isNewer("junk", "0.1.0"), false);
  });
});

describe("updateFrom", () => {
  test("offers the zip for this Mac's architecture with its SHA-256", () => {
    const update = updateFrom(release(), { current: "0.1.0", arch: "arm64" });
    assert.equal(update.version, "0.2.0");
    assert.equal(update.page, "https://github.com/Guillerming/widgetian/releases/tag/v0.2.0");
    assert.deepEqual(update.download, { url: `${PREFIX}v0.2.0/Widgetian-0.2.0-arm64.zip`, sha256: SHA, size: 1234 });
    assert.equal(updateFrom(release(), { current: "0.1.0", arch: "x64" }).download.url, `${PREFIX}v0.2.0/Widgetian-0.2.0-x64.zip`);
  });

  test("offers nothing when the release is not newer", () => {
    assert.equal(updateFrom(release(), { current: "0.2.0", arch: "arm64" }), null);
    assert.equal(updateFrom(release(), { current: "0.3.0", arch: "arm64" }), null);
  });

  test("ignores drafts, pre-releases and missing answers", () => {
    assert.equal(updateFrom(release({ draft: true }), { current: "0.1.0", arch: "arm64" }), null);
    assert.equal(updateFrom(release({ prerelease: true }), { current: "0.1.0", arch: "arm64" }), null);
    assert.equal(updateFrom(null, { current: "0.1.0", arch: "arm64" }), null);
  });

  test("without a zip for this Mac, the update is still announced but only as a download page", () => {
    const update = updateFrom(release({ assets: [asset("Widgetian-0.2.0-arm64.dmg")] }), { current: "0.1.0", arch: "arm64" });
    assert.equal(update.version, "0.2.0");
    assert.equal(update.download, null);
  });

  test("refuses a zip without a SHA-256 to check it against", () => {
    const unhashed = release({ assets: [asset("Widgetian-0.2.0-arm64.zip", { digest: null })] });
    assert.equal(updateFrom(unhashed, { current: "0.1.0", arch: "arm64" }).download, null);
  });

  test("refuses downloads from anywhere but the repository's releases", () => {
    const elsewhere = release({ assets: [asset("Widgetian-0.2.0-arm64.zip", { browser_download_url: "https://example.com/Widgetian.zip" })] });
    assert.equal(updateFrom(elsewhere, { current: "0.1.0", arch: "arm64" }).download, null);
    const local = updateFrom(
      release({ assets: [asset("Widgetian-0.2.0-arm64.zip", { browser_download_url: "http://127.0.0.1:8123/Widgetian-0.2.0-arm64.zip" })] }),
      { current: "0.1.0", arch: "arm64", downloadPrefix: "http://127.0.0.1:8123/" },
    );
    assert.equal(local.download.url, "http://127.0.0.1:8123/Widgetian-0.2.0-arm64.zip");
  });
});

describe("where the app runs", () => {
  test("finds the bundle from the executable", () => {
    assert.equal(bundleOf("/Applications/Widgetian.app/Contents/MacOS/Widgetian"), "/Applications/Widgetian.app");
    assert.equal(bundleOf("/Users/me/Apps/My Widgets.app/Contents/MacOS/Widgetian"), "/Users/me/Apps/My Widgets.app");
    assert.equal(bundleOf("/usr/local/bin/electron"), null);
  });

  test("knows the places an app cannot replace itself", () => {
    assert.equal(isReadOnlyPlace("/Volumes/Widgetian 0.1.0/Widgetian.app"), true);
    assert.equal(isReadOnlyPlace("/private/var/folders/xy/T/AppTranslocation/1234/d/Widgetian.app"), true);
    assert.equal(isReadOnlyPlace("/Applications/Widgetian.app"), false);
  });
});
