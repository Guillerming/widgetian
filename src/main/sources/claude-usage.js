// Claude's real plan usage, the same numbers Claude Code's /usage shows: asked to Anthropic with
// the login Claude Code keeps in the macOS Keychain. Opt-in (the AI usage widget's settings).
//
// The login is read through Apple's `security` tool, as Claude Code itself does, so macOS may ask
// once for permission. The token is kept in memory only for the request, sent only to Anthropic, and
// never refreshed here: refreshing would replace Claude Code's own login. When it has expired,
// Claude Code renews it the next time it runs.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { httpFetch } from "../http.js";
import { usageWindow } from "./ai-usage.js";

const run = promisify(execFile);
const KEYCHAIN_SERVICE = "Claude Code-credentials";
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const OAUTH_BETA = "oauth-2025-04-20";
export const LIVE_EVERY_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 15 * 1000;

/** The access token, or an error a person can act on. */
const readToken = async () => {
  let secret;
  try {
    const { stdout } = await run("/usr/bin/security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"], { timeout: TIMEOUT_MS });
    secret = JSON.parse(stdout);
  } catch {
    throw new Error("Sign in to Claude Code on this Mac to read Claude's usage.");
  }
  const oauth = secret?.claudeAiOauth;
  if (!oauth?.accessToken) throw new Error("Claude Code is signed in with an API key, which has no plan limits.");
  if (Number(oauth.expiresAt) <= Date.now()) throw new Error("Claude Code's login has expired: open Claude Code to renew it.");
  return oauth.accessToken;
};

/**
 * One window of the answer. A window that is null has not started (nothing used yet): it is full.
 * @param {{ utilization?: number, resets_at?: string } | null | undefined} window
 */
export const liveWindow = (window, now) => {
  if (window === null) return { used: 0, resetsAt: null };
  if (!window || typeof window !== "object") return null;
  return usageWindow(window.utilization, window.resets_at ?? null, now);
};

/** The usage answer → the widget's windows. */
export const parseLiveUsage = (body, now) => ({
  fiveHour: liveWindow(body?.five_hour, now),
  week: liveWindow(body?.seven_day, now),
});

export const fetchClaudeUsage = async () => {
  const token = await readToken();
  const response = await httpFetch(USAGE_URL, {
    headers: { Authorization: `Bearer ${token}`, "anthropic-beta": OAUTH_BETA, "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 401) throw new Error("Anthropic refused Claude Code's login: open Claude Code to renew it.");
  if (!response.ok) throw new Error(`Anthropic answered ${response.status}.`);
  return { ...parseLiveUsage(await response.json(), Date.now()), limitsAt: new Date().toISOString() };
};

// One reading shared by every widget, at most every LIVE_EVERY_MS, failures included (no retry storm).
let last = { at: 0, value: null, error: "" };
let pending = null;

/** The latest live reading: { value, error }. value stays from the last success while a later one fails. */
export const liveClaudeUsage = async () => {
  if (pending) return pending;
  if (Date.now() - last.at < LIVE_EVERY_MS) return last;
  pending = fetchClaudeUsage()
    .then((value) => ({ at: Date.now(), value, error: "" }))
    .catch((error) => ({ at: Date.now(), value: last.value, error: error.message }))
    .then((next) => {
      last = next;
      pending = null;
      return next;
    });
  return pending;
};
