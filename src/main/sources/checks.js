// Health checks for the "Service status" widget. Each check answers { tone, label, detail, url? }:
//   tone "good" | "wait" (warning / in progress) | "bad".
// Formats follow what monitoring tools already use, so existing endpoints work as they are:
//   http        status code, optional text, optional slow threshold (like Uptime Kuma / Gatus)
//   json        a field of a JSON health endpoint (Spring actuator "UP", IETF health+json "pass"…)
//   statuspage  Atlassian Statuspage /api/v2/status.json (GitHub, Cloudflare, OpenAI, Anthropic…)
//   tls         days until the certificate expires
//   tcp         port accepts connections
//   github      last GitHub Actions run of a repo / workflow
//   command     any shell command with Nagios plugin exit codes (0 OK, 1 WARNING, 2 CRITICAL)
import { execFile } from "node:child_process";
import net from "node:net";
import tls from "node:tls";
import { httpFetch } from "../http.js";

const TIMEOUT_MS = 10000;
const COMMAND_TIMEOUT_MS = 30000;
const DAY_MS = 24 * 60 * 60 * 1000;

const result = (tone, label, detail, extra = {}) => ({ tone, label, detail, ...extra });

const timed = async (request) => {
  const started = performance.now();
  const response = await request();
  return { response, ms: Math.round(performance.now() - started) };
};

const fetchWithTimeout = (url, options = {}) =>
  httpFetch(url, { ...options, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });

const unreachable = (label, error) =>
  result("bad", label, error?.name === "TimeoutError" ? "Timed out" : "No response");

/** "checks.db.status" → value inside a parsed JSON body. */
export const pickPath = (data, dotPath) =>
  String(dotPath ?? "")
    .split(".")
    .filter(Boolean)
    .reduce((value, key) => (value !== null && typeof value === "object" ? value[key] : undefined), data);

const HEALTHY_WORDS = ["up", "ok", "pass", "healthy", "true", "green"];
const WARNING_WORDS = ["warn", "degraded", "yellow"];

/** Tone of a health value. Without an explicit healthy value, common words are understood. */
export const toneOfHealthValue = (value, equals) => {
  const text = String(value).toLowerCase();
  if (equals) return text === String(equals).toLowerCase() ? "good" : "bad";
  if (HEALTHY_WORDS.includes(text)) return "good";
  return WARNING_WORDS.includes(text) ? "wait" : "bad";
};

const slowTone = (tone, ms, maxMs) => (tone === "good" && Number(maxMs) > 0 && ms > Number(maxMs) ? "wait" : tone);

const httpCheck = async (check) => {
  const label = check.label || "Web page";
  try {
    const { response, ms } = await timed(() => fetchWithTimeout(check.url, { redirect: "follow" }));
    const expected = Number(check.expectStatus) || 200;
    if (response.status !== expected) return result("bad", label, `HTTP ${response.status}`);
    if (check.contains && !(await response.text()).includes(check.contains)) {
      return result("bad", label, "Unexpected content");
    }
    const tone = slowTone("good", ms, check.maxMs);
    return result(tone, label, `${ms} ms${tone === "wait" ? " · slow" : ""}`);
  } catch (error) {
    return unreachable(label, error);
  }
};

const jsonCheck = async (check) => {
  const label = check.label || "Health endpoint";
  try {
    const { response, ms } = await timed(() =>
      fetchWithTimeout(check.url, { headers: { accept: "application/json, application/health+json" } }),
    );
    // Health endpoints often answer 503 with a body that says why: read it either way.
    const data = await response.json().catch(() => null);
    if (data === null) return result("bad", label, `HTTP ${response.status} · not JSON`);
    const value = check.path ? pickPath(data, check.path) : data.status;
    const expected = Number(check.expectStatus) || 200;
    const valueTone = value === undefined && !check.path ? "good" : toneOfHealthValue(value, check.equals);
    const tone = response.status !== expected ? "bad" : slowTone(valueTone, ms, check.maxMs);
    const shown = value === undefined ? `HTTP ${response.status}` : String(value);
    return result(tone, label, `${shown} · ${ms} ms`);
  } catch (error) {
    return unreachable(label, error);
  }
};

const STATUSPAGE_TONE = { none: "good", minor: "wait", maintenance: "wait", major: "bad", critical: "bad" };

const statuspageCheck = async (check) => {
  const label = check.label || "Status page";
  try {
    const base = String(check.url).replace(/\/+$/, "");
    const response = await fetchWithTimeout(`${base}/api/v2/status.json`);
    if (!response.ok) return result("bad", label, `HTTP ${response.status}`);
    const { status } = await response.json();
    return result(STATUSPAGE_TONE[status?.indicator] ?? "wait", label, status?.description ?? "Unknown", { url: base });
  } catch (error) {
    return unreachable(label, error);
  }
};

const socketCheck = (connect, onConnect, label) =>
  new Promise((resolve) => {
    const socket = connect();
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once(onConnect.event, () => finish(onConnect.result(socket)));
    socket.once("timeout", () => finish(result("bad", label, "Timed out")));
    socket.once("error", (error) => finish(result("bad", label, error.code ?? "No response")));
  });

const tlsCheck = (check) => {
  const host = String(check.host || "").trim();
  const label = check.label || `Certificate ${host}`;
  if (!host) return result("bad", label, "No host");
  const connect = () =>
    tls.connect({ host, port: Number(check.port) || 443, servername: host, rejectUnauthorized: false, timeout: TIMEOUT_MS });
  const evaluate = (socket) => {
    const certificate = socket.getPeerCertificate();
    if (!certificate?.valid_to) return result("bad", label, "No certificate");
    if (!socket.authorized) return result("bad", label, String(socket.authorizationError ?? "Not trusted"));
    const days = Math.floor((Date.parse(certificate.valid_to) - Date.now()) / DAY_MS);
    if (days < 0) return result("bad", label, "Expired");
    const tone = days < (Number(check.warnDays) || 14) ? "wait" : "good";
    return result(tone, label, `Expires in ${days} day${days === 1 ? "" : "s"}`);
  };
  return socketCheck(connect, { event: "secureConnect", result: evaluate }, label);
};

const tcpCheck = (check) => {
  const host = String(check.host || "").trim();
  const port = Number(check.port);
  const label = check.label || `${host}:${port}`;
  if (!host || !port) return result("bad", label, "No host or port");
  const started = performance.now();
  const connect = () => net.connect({ host, port, timeout: TIMEOUT_MS });
  const open = () => result("good", label, `Open · ${Math.round(performance.now() - started)} ms`);
  return socketCheck(connect, { event: "connect", result: open }, label);
};

export const relativeTime = (iso, now = Date.now()) => {
  const minutes = Math.round((now - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
};

const githubCheck = async (check) => {
  const repo = String(check.repo || "").trim();
  const label = check.label || "Last deploy";
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return result("bad", label, "Set the repository as owner/name");
  const workflow = String(check.workflow || "").trim();
  const runsPath = workflow ? `actions/workflows/${encodeURIComponent(workflow)}/runs` : "actions/runs";
  const headers = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
  if (check.token) headers.authorization = `Bearer ${check.token}`;
  try {
    const response = await fetchWithTimeout(`https://api.github.com/repos/${repo}/${runsPath}?per_page=1`, { headers });
    if (response.status === 403 || response.status === 429) return result("wait", label, "GitHub rate limit");
    if (!response.ok) return result("bad", label, `GitHub answered ${response.status}`);
    const run = (await response.json()).workflow_runs?.[0];
    if (!run) return result("wait", label, "No runs yet");
    const detail = `${relativeTime(run.created_at)} · ${run.head_sha.slice(0, 7)}`;
    if (run.status !== "completed") return result("wait", "Deploying", detail, { url: run.html_url, running: true });
    const ok = run.conclusion === "success";
    return result(ok ? "good" : "bad", ok ? label : `${label}: ${run.conclusion}`, detail, { url: run.html_url });
  } catch (error) {
    return unreachable(label, error);
  }
};

const NAGIOS_TONES = ["good", "wait", "bad"];

/** Exit code → tone, as Nagios plugins define it (3 = UNKNOWN reads as a warning). */
export const toneOfExitCode = (code) => (code === 3 ? "wait" : (NAGIOS_TONES[code] ?? "bad"));

const firstLineOf = (text) =>
  String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

const commandCheck = (check) =>
  new Promise((resolve) => {
    const label = check.label || "Command";
    const command = String(check.command || "").trim();
    if (!command) return resolve(result("bad", label, "No command"));
    // The user's login shell, so PATH matches their terminal (Homebrew, gcloud…).
    const shell = process.env.SHELL || "/bin/zsh";
    execFile(shell, ["-lc", command], { timeout: COMMAND_TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === "number" ? error.code : 2) : 0;
      const line = firstLineOf(stdout) ?? firstLineOf(stderr);
      const detail = error?.killed ? "Timed out" : (line?.slice(0, 80) ?? (code === 0 ? "OK" : `Exit ${code}`));
      resolve(result(error?.killed ? "bad" : toneOfExitCode(code), label, detail));
    });
  });

const RUNNERS = {
  http: httpCheck,
  json: jsonCheck,
  statuspage: statuspageCheck,
  tls: tlsCheck,
  tcp: tcpCheck,
  github: githubCheck,
  command: commandCheck,
};

export const runCheck = async (check) => {
  const runner = RUNNERS[check?.type];
  if (!runner) return result("bad", check?.label || "Check", `Unknown type "${check?.type}"`);
  const outcome = await runner(check);
  return check.link ? { ...outcome, url: check.link } : outcome;
};

/** @param {{ checks: object[] }} params */
export const readChecks = async ({ checks = [] }) => ({ checks: await Promise.all(checks.map(runCheck)) });
