// One block of a "Service status" card → { checkedAt, view } (see shared/status-view.js).
import { normalizeView } from "../../shared/status-view.js";
import { readChecks } from "./checks.js";
import { runScript } from "./script.js";
import { readUmami } from "./umami.js";

/** "<widget>/<block>" → the object its script keeps between runs. In memory only. */
const scriptStates = new Map();

const failure = (label, detail) => ({ rows: [{ tone: "bad", label, detail }] });

const checksView = async ({ checks }) => ({ rows: (await readChecks({ checks })).checks });

const umamiView = async (block) => {
  if (!block.shareUrl) return { text: "Add an Umami share link in Settings." };
  // The share API is undocumented: if it fails, the card goes on without the chart.
  return readUmami(block).catch(() => ({ text: "Umami is not answering." }));
};

const scriptView = async ({ code }, { stateKey, action }) => {
  if (!code.trim()) return { text: "Write the script in Settings." };
  const result = await runScript({ code, action, state: scriptStates.get(stateKey) ?? {} });
  if (!result.ok) return failure("Script failed", result.error);
  scriptStates.set(stateKey, result.state);
  return result.value;
};

const VIEWS = { checks: checksView, umami: umamiView, script: scriptView };

/** @param {{ widgetId: string, block: object, action?: string }} params */
export const readStatusBlock = async ({ widgetId, block, action = "" }) => {
  const raw = await VIEWS[block.type](block, { stateKey: `${widgetId}/${block.id}`, action });
  return { checkedAt: new Date().toISOString(), view: normalizeView(raw) };
};

/** The settings window's Run button: what the script returns, as data and as the card would show it. */
export const testScript = async (code) => {
  const started = Date.now();
  const result = await runScript({ code: String(code ?? "") });
  return {
    ok: result.ok,
    error: result.error ?? "",
    logs: result.logs,
    ms: Date.now() - started,
    value: result.ok ? JSON.stringify(result.value, null, 2) : "",
    view: result.ok ? normalizeView(result.value) : null,
  };
};
