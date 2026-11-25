// Claude Code statusLine command: saves the plan's rate limits for Widgetian's AI usage widget.
//
// Claude Code pipes a JSON payload to its statusline on every update; `rate_limits` holds the
// 5-hour and weekly windows. This keeps only those numbers (no prompts, no tokens) and prints
// nothing, so the terminal shows no status line. It runs with Widgetian's own binary:
//   ELECTRON_RUN_AS_NODE=1 /Applications/Widgetian.app/Contents/MacOS/Widgetian claude-statusline.cjs <target.json>
const fs = require("node:fs");
const path = require("node:path");

const target = process.argv[2];

const readStdin = () =>
  new Promise((resolve) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      text += chunk;
    });
    process.stdin.on("end", () => resolve(text));
  });

const main = async () => {
  if (!target) return;
  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch {
    return;
  }
  const limits = payload?.rate_limits;
  // API-key sessions have no plan limits: keep the last subscription reading.
  if (!limits) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const draft = `${target}.${process.pid}.tmp`;
  // Write-then-rename so the widget never reads half a file.
  fs.writeFileSync(draft, JSON.stringify({ rateLimits: limits, savedAt: new Date().toISOString() }));
  fs.renameSync(draft, target);
};

main().catch(() => {});
