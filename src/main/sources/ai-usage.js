// AI plan usage from local files only (no tokens, no network).
//   Codex writes its 5 h / weekly limits into its own session logs (~/.codex/sessions).
//   Claude Code hands them to its statusline; resources/claude-statusline.cjs saves them to a file.
//   Activity (thinking / working / idle) comes from the newest session log of each tool.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TAIL_BYTES = 256 * 1024;
// A session untouched this long is idle even if its last step was a tool call (e.g. a prompt waiting).
const STALE_AFTER_MS = 10 * 60 * 1000;
const RECENT_CODEX_FILES = 5;

const HOME = os.homedir();
const CODEX_SESSIONS = path.join(HOME, ".codex/sessions");
const CLAUDE_PROJECTS = path.join(HOME, ".claude/projects");

export const expandHome = (file) => (file.startsWith("~/") ? path.join(HOME, file.slice(2)) : file);

/** Parsed JSON lines from the end of a file (the first, possibly cut, line is skipped). */
export const tailEntries = (file) => {
  const { size } = fs.statSync(file);
  const length = Math.min(size, TAIL_BYTES);
  const buffer = Buffer.alloc(length);
  const handle = fs.openSync(file, "r");
  try {
    fs.readSync(handle, buffer, 0, length, size - length);
  } finally {
    fs.closeSync(handle);
  }
  const lines = buffer.toString("utf8").split("\n");
  return (size > TAIL_BYTES ? lines.slice(1) : lines).flatMap((line) => {
    try {
      return line.trim() ? [JSON.parse(line)] : [];
    } catch {
      return [];
    }
  });
};

const safeReaddir = (directory) => {
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
};

const withMtime = (file) => ({ file, mtime: fs.statSync(file).mtimeMs });

const descendingFolders = (directory) =>
  safeReaddir(directory)
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(directory, entry.name))
    .sort()
    .reverse();

/** Newest Codex rollouts: sessions/YYYY/MM/DD/rollout-*.jsonl, walking the newest days first. */
const newestCodexFiles = () => {
  const found = [];
  const days = descendingFolders(CODEX_SESSIONS)
    .flatMap(descendingFolders)
    .flatMap(descendingFolders);
  for (const day of days) {
    for (const entry of safeReaddir(day)) {
      if (entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) found.push(withMtime(path.join(day, entry.name)));
    }
    if (found.length >= RECENT_CODEX_FILES) break;
  }
  return found.sort((a, b) => b.mtime - a.mtime).slice(0, RECENT_CODEX_FILES);
};

const newestClaudeFile = () => {
  let newest = null;
  for (const project of descendingFolders(CLAUDE_PROJECTS)) {
    for (const entry of safeReaddir(project)) {
      if (!entry.name.endsWith(".jsonl")) continue;
      const candidate = withMtime(path.join(project, entry.name));
      if (!newest || candidate.mtime > newest.mtime) newest = candidate;
    }
  }
  return newest;
};

/** A limit window: used % and when it resets (ISO). A window that already rolled over reads 0. */
export const usageWindow = (used, resetsAt, now) => {
  if (used === null || used === undefined) return null;
  let resetMs = null;
  if (typeof resetsAt === "string") resetMs = Date.parse(resetsAt);
  else if (typeof resetsAt === "number") resetMs = resetsAt * 1000;
  if (resetMs !== null && resetMs <= now) return { used: 0, resetsAt: null };
  return { used: Math.round(used), resetsAt: resetMs === null ? null : new Date(resetMs).toISOString() };
};

export const codexActivity = (entries) => {
  const events = entries
    .filter((entry) => entry.type === "event_msg" && entry.payload && typeof entry.payload === "object")
    .map((entry) => entry.payload.type);
  const last = events.at(-1);
  if (!last || last === "task_complete" || last === "turn_aborted") return "idle";
  return last === "agent_reasoning" ? "thinking" : "working";
};

export const claudeActivity = (entries) => {
  const turns = entries.filter((entry) => entry.type === "user" || entry.type === "assistant");
  const last = turns.at(-1);
  if (!last) return "idle";
  const message = last.message ?? {};
  const blocks = Array.isArray(message.content)
    ? message.content.filter((block) => block && typeof block === "object").map((block) => block.type)
    : ["text"];
  if (last.type === "assistant") {
    if (message.stop_reason === "end_turn") return "idle";
    return blocks.at(-1) === "thinking" ? "thinking" : "working";
  }
  // A user entry is either a tool result (tools ran, the model continues) or a new prompt.
  return blocks.includes("tool_result") ? "working" : "thinking";
};

const readCodex = (now) => {
  const files = newestCodexFiles();
  const fresh = files.length > 0 && now - files[0].mtime < STALE_AFTER_MS;
  const activity = fresh ? codexActivity(tailEntries(files[0].file)) : "idle";
  for (const { file } of files) {
    for (const entry of tailEntries(file).reverse()) {
      const limits = entry.payload && typeof entry.payload === "object" ? entry.payload.rate_limits : null;
      if (!limits) continue;
      const primary = limits.primary ?? {};
      const secondary = limits.secondary ?? {};
      return {
        activity,
        limitsAt: entry.timestamp ?? null,
        fiveHour: usageWindow(primary.used_percent, primary.resets_at, now),
        week: usageWindow(secondary.used_percent, secondary.resets_at, now),
      };
    }
  }
  return { activity, limitsAt: null, fiveHour: null, week: null };
};

const readClaude = (now, limitsFile) => {
  const newest = newestClaudeFile();
  const fresh = newest !== null && now - newest.mtime < STALE_AFTER_MS;
  const result = { activity: fresh ? claudeActivity(tailEntries(newest.file)) : "idle", limitsAt: null, fiveHour: null, week: null };
  try {
    const saved = JSON.parse(fs.readFileSync(limitsFile, "utf8"));
    const limits = saved.rateLimits ?? {};
    result.fiveHour = usageWindow(limits.five_hour?.used_percentage, limits.five_hour?.resets_at, now);
    result.week = usageWindow(limits.seven_day?.used_percentage, limits.seven_day?.resets_at, now);
    result.limitsAt = saved.savedAt ?? null;
  } catch {
    // No statusline yet: the widget explains how to turn it on.
  }
  return result;
};

/** @param {{ claude?: boolean, codex?: boolean, claudeLimitsFile: string }} params */
export const readAiUsage = async ({ claude = true, codex = true, claudeLimitsFile }) => {
  const now = Date.now();
  return {
    claude: claude ? readClaude(now, expandHome(claudeLimitsFile)) : null,
    codex: codex ? readCodex(now) : null,
  };
};
