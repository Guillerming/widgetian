// Runs one "Service status" script in its own process, so a script that hangs or crashes never
// takes Widgetian with it. Started by src/main/sources/script.js, which talks to it over IPC:
//   in   { code, action, state }
//   out  { ok: true, value, state, logs } | { ok: false, error, logs }
const { execFile } = require("node:child_process");
const { createRequire } = require("node:module");
const os = require("node:os");
const path = require("node:path");
const { inspect } = require("node:util");

// Commands the script starts must not think they are Electron running as Node.
delete process.env.ELECTRON_RUN_AS_NODE;

const SHELL_TIMEOUT_MS = 25000;
const MAX_OUTPUT = 4 * 1024 * 1024;
const MAX_LOGS = 50;
const AsyncFunction = (async () => {}).constructor;

const logs = [];
const log = (...args) => {
  if (logs.length < MAX_LOGS) logs.push(args.map((arg) => (typeof arg === "string" ? arg : inspect(arg, { depth: 4 }))).join(" ").slice(0, 2000));
};

/** Runs a command with the user's login shell (so PATH is the terminal's) and returns what it printed. */
const sh = (command, { timeout = SHELL_TIMEOUT_MS, cwd = os.homedir() } = {}) =>
  new Promise((resolve, reject) => {
    execFile(process.env.SHELL || "/bin/zsh", ["-lc", command], { timeout, cwd, maxBuffer: MAX_OUTPUT }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout.trim());
      const reason = error.killed ? "timed out" : stderr.trim().split("\n").pop() || `exit ${error.code}`;
      return reject(Object.assign(new Error(reason), { code: error.code, stdout, stderr }));
    });
  });

/** fetch() that fails on HTTP errors and returns the parsed JSON body. */
const json = async (url, options = {}) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), ...options });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
  return response.json();
};

/** "3 min ago" for a date, an ISO text or a timestamp. */
const ago = (date) => {
  const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
};

/** "12.4 MB" */
const bytes = (count) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = count > 0 ? Math.min(units.length - 1, Math.floor(Math.log10(count) / 3)) : 0;
  return `${(count / 1000 ** power).toFixed(power > 1 ? 1 : 0)} ${units[power]}`;
};

const answer = (message) => process.send(message, () => process.exit(0));

/** The line of the user's code an error comes from (the wrapper adds two lines before it). */
const lineOf = (error) => {
  const match = /<anonymous>:(\d+):\d+/.exec(String(error?.stack ?? ""));
  return match ? Number(match[1]) - 2 : null;
};

process.once("message", async ({ code, action, state }) => {
  const scope = {
    action,
    state,
    sh,
    json,
    ago,
    bytes,
    require: createRequire(path.join(os.homedir(), "widgetian-script.js")),
    console: { log, info: log, warn: log, error: log, debug: log },
  };
  try {
    const run = new AsyncFunction(...Object.keys(scope), code);
    const value = await run(...Object.values(scope));
    // Through JSON, so functions, cycles and other things a card cannot show fail here, with a message.
    answer({ ok: true, value: JSON.parse(JSON.stringify(value ?? null)), state: JSON.parse(JSON.stringify(state ?? {})), logs });
  } catch (error) {
    const line = lineOf(error);
    const name = error?.name && error.name !== "Error" ? `${error.name}: ` : "";
    answer({ ok: false, error: `${name}${error?.message ?? error}${line > 0 ? ` (line ${line})` : ""}`, logs });
  }
});

process.once("disconnect", () => process.exit(0));
