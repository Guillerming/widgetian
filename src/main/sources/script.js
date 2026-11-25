// Runs the user's own JavaScript for a status card, each time in a fresh process
// (resources/script-runner.cjs) that is killed if it takes too long. The code only ever comes from
// config.json or from the settings window, like the shell commands of the checks.
import { fork } from "node:child_process";
import { resourceFile } from "../resources.js";

const TIMEOUT_MS = 30000;

/**
 * @param {{ code: string, action?: string, state?: object, timeoutMs?: number }} params
 * @returns {Promise<{ ok: boolean, value?: unknown, state?: object, error?: string, logs: string[] }>}
 */
export const runScript = ({ code, action = "", state = {}, timeoutMs = TIMEOUT_MS }) =>
  new Promise((resolve) => {
    const child = fork(resourceFile("script-runner.cjs"), [], {
      // fork() runs Electron's own binary; this makes it behave as plain Node.
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      execArgv: [],
    });
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, error: `Took longer than ${timeoutMs / 1000} s`, logs: [] }), timeoutMs);
    child.once("message", finish);
    child.once("error", (error) => finish({ ok: false, error: error.message, logs: [] }));
    child.once("exit", (exitCode) => finish({ ok: false, error: `The script ended early (exit ${exitCode})`, logs: [] }));
    child.send({ code, action, state });
  });
