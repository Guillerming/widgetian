// Updates: asks GitHub once a day for the latest release and, when the user says so, downloads it,
// replaces the app and opens it again.
//
// Widgetian is not signed with an Apple Developer ID, so Electron's own updater (Squirrel.Mac) is not
// available. Instead the download is checked against the SHA-256 GitHub publishes for it, and the new
// bundle against its bundle id, its version and its code signature before anything is replaced.
import { execFile, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { app } from "electron";
import { httpFetch } from "./http.js";
import { DOWNLOAD_PREFIX, RELEASES_URL, SWAP_SCRIPT, bundleOf, isReadOnlyPlace, updateFrom } from "./update-release.js";

const run = promisify(execFile);
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
// Not while the app is starting; right away against a test feed.
const FIRST_CHECK_DELAY_MS = 60 * 1000;
const TEST_FIRST_CHECK_DELAY_MS = 0;
const PROGRESS_EVERY_MS = 250;
const BUNDLE_ID = "es.guillerming.widgetian";
const APP_NAME = "Widgetian.app";
const BUSY = new Set(["checking", "downloading", "installing"]);

let state = { status: "idle", update: null, error: "", progress: 0, checkedAt: 0 };
// A version that was installed but did not take (see checkPending): offered only as a download.
let failedVersion = "";
let notifiedVersion = "";
let options = null;

const pendingFile = () => path.join(app.getPath("userData"), "pending-update.json");

/** Where the installed app is, or why it cannot replace itself. */
const installTarget = () => {
  if (!app.isPackaged) return { problem: "Updates install only in the packaged app." };
  const bundle = bundleOf(process.execPath);
  if (!bundle || isReadOnlyPlace(bundle)) return { problem: "Move Widgetian to the Applications folder to update it from here." };
  try {
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
  } catch {
    return { problem: `Widgetian can't write to ${path.dirname(bundle)}.` };
  }
  return { bundle };
};

/** What pages see. */
export const updateState = () => {
  const { update } = state;
  const target = installTarget();
  const canInstall = Boolean(update?.download && !target.problem && update.version !== failedVersion);
  return {
    status: state.status,
    current: app.getVersion(),
    version: update?.version ?? "",
    page: update?.page ?? "",
    canInstall,
    // Why it has to be downloaded by hand, when there is an update.
    manualReason: update && !canInstall ? (target.problem ?? "Download it from the release page.") : "",
    error: state.error,
    progress: state.progress,
    checkedAt: state.checkedAt,
  };
};

const setState = (changes) => {
  state = { ...state, ...changes };
  options?.onChange(updateState());
};

export const checkForUpdates = async () => {
  if (BUSY.has(state.status)) return updateState();
  setState({ status: "checking", error: "" });
  try {
    const response = await httpFetch(options.feed, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": `Widgetian/${app.getVersion()}` },
      cache: "no-store",
    });
    // GitHub answers 404 while a repository has no releases.
    if (!response.ok && response.status !== 404) throw new Error(`GitHub answered ${response.status}.`);
    const release = response.ok ? await response.json() : null;
    const update = updateFrom(release, { current: app.getVersion(), arch: process.arch, downloadPrefix: options.downloadPrefix });
    setState({ status: update ? "available" : "current", update, checkedAt: Date.now() });
    if (update && update.version !== notifiedVersion) {
      notifiedVersion = update.version;
      options.onAvailable(update);
    }
  } catch (error) {
    setState({ status: "error", error: `Couldn't check for updates: ${error.message}`, checkedAt: Date.now() });
  }
  return updateState();
};

/** Downloads to `file`, hashing as it goes. */
const download = async ({ url, sha256 }, file) => {
  const response = await httpFetch(url, { cache: "no-store" });
  if (!response.ok || !response.body) throw new Error(`the download answered ${response.status}`);
  const total = Number(response.headers.get("content-length")) || 0;
  const hash = crypto.createHash("sha256");
  let received = 0;
  let reportedAt = 0;
  await pipeline(
    Readable.fromWeb(response.body),
    async function* measure(chunks) {
      for await (const chunk of chunks) {
        hash.update(chunk);
        received += chunk.length;
        if (total && Date.now() - reportedAt > PROGRESS_EVERY_MS) {
          reportedAt = Date.now();
          setState({ progress: Math.min(1, received / total) });
        }
        yield chunk;
      }
    },
    fs.createWriteStream(file),
  );
  if (hash.digest("hex") !== sha256) throw new Error("the download doesn't match the SHA-256 GitHub published");
};

/** The unzipped app must be Widgetian, the promised version, and intact. */
const checkBundle = async (bundle, version) => {
  const plist = path.join(bundle, "Contents", "Info.plist");
  const read = async (key) => (await run("/usr/bin/plutil", ["-extract", key, "raw", "-o", "-", plist])).stdout.trim();
  if ((await read("CFBundleIdentifier")) !== BUNDLE_ID) throw new Error("the download is not Widgetian");
  if ((await read("CFBundleShortVersionString")) !== version) throw new Error(`the download is not version ${version}`);
  await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", bundle]);
};

/**
 * Installs the available update and quits; the swap script opens the new version. Where the app
 * cannot replace itself, opens the release page instead.
 */
export const installUpdate = async () => {
  const { update } = state;
  if (!update) throw new Error("There is no update to install.");
  if (BUSY.has(state.status)) throw new Error("An update is already under way.");
  const target = installTarget();
  if (!updateState().canInstall) {
    await options.openPage(update.page);
    return "page";
  }
  setState({ status: "downloading", progress: 0, error: "" });
  const work = fs.mkdtempSync(path.join(app.getPath("temp"), "widgetian-update-"));
  try {
    const zip = path.join(work, "update.zip");
    await download(update.download, zip);
    setState({ status: "installing", progress: 1 });
    await run("/usr/bin/ditto", ["-x", "-k", zip, work]);
    fs.rmSync(zip);
    const fresh = path.join(work, APP_NAME);
    await checkBundle(fresh, update.version);
    fs.writeFileSync(pendingFile(), JSON.stringify({ version: update.version, from: app.getVersion() }));
    const args = [String(process.pid), target.bundle, fresh, work, ...options.relaunchArgs];
    spawn("/bin/sh", ["-c", SWAP_SCRIPT, "widgetian-update", ...args], { detached: true, stdio: "ignore" }).unref();
  } catch (error) {
    fs.rmSync(work, { recursive: true, force: true });
    setState({ status: "error", error: `The update failed: ${error.message}` });
    throw error;
  }
  app.quit();
  return "installing";
};

/**
 * After an update the new version starts with pending-update.json in place. If the running version
 * is not the one installed, the swap did not happen (macOS may refuse to let the app replace
 * itself): that version is then offered as a download.
 */
const checkPending = () => {
  const file = pendingFile();
  if (!fs.existsSync(file)) return;
  try {
    const { version } = JSON.parse(fs.readFileSync(file, "utf8"));
    if (version && version !== app.getVersion()) {
      failedVersion = version;
      state = { ...state, status: "error", error: `Widgetian couldn't replace itself with version ${version}. Download it from the release page.` };
    }
  } catch (error) {
    console.error("updater: unreadable pending-update.json:", error);
  } finally {
    fs.rmSync(file, { force: true });
  }
};

/**
 * @param {{
 *   isEnabled: () => boolean,
 *   onChange: (state: ReturnType<typeof updateState>) => void,
 *   onAvailable: (update: NonNullable<ReturnType<typeof updateFrom>>) => void,
 *   openPage: (url: string) => Promise<unknown>,
 *   feed?: string | null,
 *   relaunchArgs?: string[],
 *   installRightAway?: boolean,
 * }} settings A `feed` other than GitHub's is for testing: it may also serve the downloads.
 */
export const startUpdater = ({ feed, relaunchArgs = [], installRightAway = false, ...callbacks }) => {
  options = {
    ...callbacks,
    feed: feed ?? RELEASES_URL,
    downloadPrefix: feed ? `${new URL(feed).origin}/` : DOWNLOAD_PREFIX,
    relaunchArgs,
  };
  checkPending();
  // The development app (npm start) only checks when asked, unless it is given a test feed.
  if (!app.isPackaged && !feed) return;
  const tick = async () => {
    if (!options.isEnabled()) return;
    const result = await checkForUpdates();
    if (installRightAway && result.canInstall) installUpdate().catch((error) => console.error("updater:", error));
  };
  setTimeout(tick, feed ? TEST_FIRST_CHECK_DELAY_MS : FIRST_CHECK_DELAY_MS);
  setInterval(tick, CHECK_EVERY_MS);
};
