// Local media for the music widget and the image wallpaper. Files are exposed to pages only as
// media://track/<token> and media://image/<token>, never as paths (see protocols.js).
//
// Song tags are read once with music-metadata and cached in music-library.json by path + mtime,
// so rescanning a large folder only reads new or changed files.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { parseFile } from "music-metadata";
import { clearMedia, registerMedia } from "../protocols.js";
import { expandHome } from "./ai-usage.js";

const AUDIO = new Set([".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg", ".opus"]);
const IMAGES = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);
const LOGOS = new Set([...IMAGES, ".svg"]);
const MAX_FILES = 20000;
const TAG_READS_IN_PARALLEL = 8;

const tokenOf = (file) => createHash("sha1").update(file).digest("hex").slice(0, 16);

/** Files under `folder` (recursive) whose extension is in `extensions`, sorted by path. */
export const listFiles = async (folder, extensions) => {
  const root = path.resolve(expandHome(folder));
  const entries = await fs.promises.readdir(root, { recursive: true });
  return entries
    .filter((entry) => extensions.has(path.extname(entry).toLowerCase()) && !path.basename(entry).startsWith("."))
    .slice(0, MAX_FILES)
    .map((entry) => path.join(root, entry))
    .sort((a, b) => a.localeCompare(b));
};

const cacheFile = () => path.join(app.getPath("userData"), "music-library.json");

const readCache = () => {
  try {
    return new Map(JSON.parse(fs.readFileSync(cacheFile(), "utf8")).map((track) => [track.path, track]));
  } catch {
    return new Map();
  }
};

const titleFromName = (file) => path.basename(file, path.extname(file)).replace(/_+/g, " ");

const readTags = async (file, stat) => {
  try {
    const { common, format } = await parseFile(file, { skipCovers: true, duration: false });
    return {
      path: file,
      mtime: stat.mtimeMs,
      title: common.title || titleFromName(file),
      artist: common.artist || common.albumartist || "",
      album: common.album || "",
      duration: format.duration ?? 0,
    };
  } catch {
    return { path: file, mtime: stat.mtimeMs, title: titleFromName(file), artist: "", album: "", duration: 0 };
  }
};

/** Runs `task` over `items` with at most `limit` in flight. */
const mapLimited = async (items, limit, task) => {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

const scans = new Map();

const scanLibrary = async (folder) => {
  const files = await listFiles(folder, AUDIO);
  const cache = readCache();
  const tracks = await mapLimited(files, TAG_READS_IN_PARALLEL, async (file) => {
    const stat = await fs.promises.stat(file);
    const cached = cache.get(file);
    return cached && cached.mtime === stat.mtimeMs ? cached : readTags(file, stat);
  });
  await fs.promises.writeFile(cacheFile(), JSON.stringify(tracks));
  return tracks;
};

/** @param {{ folder: string }} params → { tracks: [{ id, title, artist, album, duration }] } */
export const readMusicLibrary = async ({ folder }) => {
  if (!folder) return { tracks: [], error: "Choose a music folder in Settings." };
  if (!scans.has(folder)) scans.set(folder, scanLibrary(folder).finally(() => scans.delete(folder)));
  let tracks;
  try {
    tracks = await scans.get(folder);
  } catch (error) {
    return { tracks: [], error: error.code === "ENOENT" ? "The music folder does not exist." : "Can't read the music folder." };
  }
  clearMedia("track");
  return {
    tracks: tracks.map((track) => {
      const id = tokenOf(track.path);
      registerMedia("track", id, track.path);
      return { id, title: track.title, artist: track.artist, album: track.album, duration: track.duration };
    }),
  };
};

/** A logo may be a picture anywhere on this Mac. @param {{ file: string }} params → { url } */
export const readLogo = async ({ file }) => {
  const resolved = path.resolve(expandHome(file));
  if (!LOGOS.has(path.extname(resolved).toLowerCase())) throw new Error("Not an image");
  const id = tokenOf(resolved);
  registerMedia("logo", id, resolved);
  return { url: `media://logo/${id}` };
};

/** How many pictures a folder has, for the settings window. */
export const countImages = async ({ folder }) => {
  try {
    return { images: (await listFiles(folder, IMAGES)).length };
  } catch (error) {
    return { images: 0, error: error.code === "ENOENT" ? "That folder does not exist." : "Can't read that folder." };
  }
};

/** @param {{ folder: string }} params → { images: [{ id, name }] } */
export const readWallpaperImages = async ({ folder }) => {
  if (!folder) return { images: [] };
  try {
    const files = await listFiles(folder, IMAGES);
    clearMedia("image");
    return {
      images: files.map((file) => {
        const id = tokenOf(file);
        registerMedia("image", id, file);
        return { id, name: path.basename(file) };
      }),
    };
  } catch {
    return { images: [], error: "Can't read the wallpaper folder." };
  }
};
