// AI usage: what is left of the 5-hour and weekly windows of Claude Code and Codex, and whether
// each is thinking, working or idle right now. Local files only (see src/main/sources/ai-usage.js).
import { h, replace } from "../../renderer/shared/dom.js";
import { card, notice, ring } from "../../renderer/shared/ui.js";

const REFRESH_MS = 5000;
const HOUR_MS = 3600000;
const DAY_MS = 24 * HOUR_MS;
const LOW_AT = 25;
const CRITICAL_AT = 10;

const SERVICES = [
  { key: "claude", name: "Claude", mark: "C", missing: "Limits appear once the Claude Code statusline is on." },
  { key: "codex", name: "ChatGPT", mark: "G", missing: "Limits appear after the next Codex session." },
];
const ACTIVITY = { thinking: "Thinking", working: "Working", idle: "Idle" };

const toneFor = (left) => {
  if (left === null) return "unknown";
  if (left <= CRITICAL_AT) return "bad";
  return left <= LOW_AT ? "wait" : "normal";
};

export function mount(root, ctx) {
  const locale = ctx.locale ?? "en-GB";
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const shell = card({ eyebrow: "AI · left in plan", className: "ai" });
  root.append(shell.element);
  replace(shell.body, notice("One moment…"));

  const untilReset = (resetsAt) => {
    if (resetsAt === null) return "fresh";
    const left = Date.parse(resetsAt) - Date.now();
    if (left >= DAY_MS) return weekday.format(new Date(resetsAt));
    const hours = Math.floor(left / HOUR_MS);
    const minutes = Math.floor((left % HOUR_MS) / 60000);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const allowance = (label, window) => {
    const left = window === null ? null : 100 - window.used;
    const tone = toneFor(left);
    return h(
      "li",
      {
        class: "allowance",
        dataset: { tone },
        title: window?.resetsAt ? `Resets ${new Date(window.resetsAt).toLocaleString(locale)}` : null,
      },
      ring({
        percent: left,
        size: 44,
        tone: tone === "bad" ? "normal" : tone,
        children: h("b", {}, left === null ? "—" : `${left}%`),
      }),
      h("small", {}, window === null ? label : `${label} · ${untilReset(window.resetsAt)}`),
    );
  };

  const serviceRow = (service, status) => {
    const hasLimits = status.fiveHour !== null || status.week !== null;
    return h(
      "li",
      { class: "service", dataset: { activity: status.activity } },
      h("span", { class: "mark", dataset: { service: service.key }, "aria-hidden": "true" }, service.mark),
      h(
        "div",
        { class: "service-text" },
        h("strong", {}, service.name),
        h("span", { class: "activity" }, h("i", { "aria-hidden": "true" }), ACTIVITY[status.activity] ?? "Idle"),
        hasLimits ? null : h("small", { class: "hint" }, service.missing),
      ),
      h(
        "ul",
        { class: "allowances", "aria-label": `${service.name} remaining allowance` },
        allowance("5h", status.fiveHour),
        allowance("Week", status.week),
      ),
    );
  };

  ctx.every(REFRESH_MS, async () => {
    try {
      const usage = await ctx.api.source("ai", { widgetId: ctx.id });
      const rows = SERVICES.filter((service) => usage[service.key]).map((service) => serviceRow(service, usage[service.key]));
      replace(shell.body, rows.length ? h("ul", { class: "services" }, rows) : notice("Turn on Claude or ChatGPT in Settings."));
    } catch {
      replace(shell.body, notice("Couldn't read AI usage."));
    }
  });
}
