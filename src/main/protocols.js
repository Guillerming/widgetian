// Two private URL schemes, so pages never load from file:// and never see a real path:
//   app://widgetian/<path>  → files under src/ (renderer, shared and widgets folders only)
//   media://<kind>/<token>  → a music, wallpaper or logo file a source registered (with Range support)
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { protocol } from "electron";
import { parseRange } from "./range.js";

const SOURCE_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const PUBLIC_FOLDERS = ["renderer", "shared", "widgets"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
};

const mimeOf = (file) => MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";

/** token → absolute path, per kind. Sources fill these; nothing else can be served. */
const mediaFiles = { track: new Map(), image: new Map(), logo: new Map() };

export const registerMedia = (kind, token, file) => mediaFiles[kind].set(token, file);
export const clearMedia = (kind) => mediaFiles[kind].clear();

export const registerSchemes = () => {
  protocol.registerSchemesAsPrivileged([
    { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
    { scheme: "media", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
};

const notFound = () => new Response("Not found", { status: 404 });

const serveApp = async (request) => {
  const url = new URL(request.url);
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const file = path.resolve(SOURCE_ROOT, relative);
  const inside = PUBLIC_FOLDERS.some((folder) => file.startsWith(path.join(SOURCE_ROOT, folder) + path.sep));
  if (url.host !== "widgetian" || !inside) return notFound();
  try {
    const body = await fs.promises.readFile(file);
    return new Response(body, { headers: { "content-type": mimeOf(file), "cache-control": "no-cache" } });
  } catch {
    return notFound();
  }
};

const serveMedia = async (request) => {
  const url = new URL(request.url);
  const files = mediaFiles[url.host];
  const file = files?.get(url.pathname.slice(1));
  if (!file) return notFound();
  let size;
  try {
    size = (await fs.promises.stat(file)).size;
  } catch {
    return notFound();
  }
  const headers = { "content-type": mimeOf(file), "accept-ranges": "bytes" };
  const range = parseRange(request.headers.get("range"), size);
  if (range) {
    const stream = fs.createReadStream(file, range);
    return new Response(Readable.toWeb(stream), {
      status: 206,
      headers: {
        ...headers,
        "content-length": String(range.end - range.start + 1),
        "content-range": `bytes ${range.start}-${range.end}/${size}`,
      },
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    headers: { ...headers, "content-length": String(size) },
  });
};

export const handleProtocols = () => {
  protocol.handle("app", serveApp);
  protocol.handle("media", serveMedia);
};

export const APP_URL = "app://widgetian";
