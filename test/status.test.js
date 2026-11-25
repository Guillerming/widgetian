import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createWidget, normalizeConfig } from "../src/shared/config.js";
import { SCRIPT_EXAMPLES } from "../src/shared/script-examples.js";
import { cardHero, normalizeView } from "../src/shared/status-view.js";
import { runCheck } from "../src/main/sources/checks.js";
import { runScript } from "../src/main/sources/script.js";
import { readStatusBlock, testScript } from "../src/main/sources/status.js";
import { hostFilter, latestSessions, visitsView } from "../src/main/sources/umami.js";

const statusSettings = (settings) => normalizeConfig({ widgets: [{ id: "s", type: "status", settings }] }).widgets[0].settings;

describe("status settings", () => {
  test("a new card has a working block", () => {
    const { blocks } = createWidget("status").settings;
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].checks[0].type, "statuspage");
  });

  test("settings from before blocks become a checks block and an Umami block", () => {
    const { blocks, ...rest } = statusSettings({ name: "Site", interval: 300, checks: [{ type: "tls", host: "a.com" }], umamiShareUrl: "https://u.example/share/x" });
    assert.deepEqual(blocks.map((block) => [block.type, block.every]), [["checks", 300], ["umami", 60]]);
    assert.equal(blocks[0].checks[0].host, "a.com");
    assert.equal(blocks[1].shareUrl, "https://u.example/share/x");
    assert.equal(rest.checks, undefined);
    assert.equal(rest.name, "Site");
  });

  test("blocks win over old settings that are still around", () => {
    const { blocks } = statusSettings({ checks: [{ type: "tls" }], blocks: [{ id: "mine", type: "script", code: "return {}" }] });
    assert.deepEqual(blocks.map((block) => block.id), ["mine"]);
  });

  test("an emptied card stays empty", () => {
    assert.deepEqual(statusSettings({ blocks: [] }).blocks, []);
  });

  test("ids are unique, unknown types become checks and intervals are kept in range", () => {
    const { blocks } = statusSettings({ blocks: [{ id: "a", type: "script", every: 1 }, { id: "a", type: "nope", every: "x" }, 5] });
    assert.equal(blocks.length, 2);
    assert.notEqual(blocks[0].id, blocks[1].id);
    assert.deepEqual(blocks.map((block) => block.every), [5, 60]);
    assert.equal(blocks[1].type, "checks");
  });

  test("normalising twice changes nothing", () => {
    const once = statusSettings({ blocks: [{ type: "umami", tab: "Users", hosts: "a.com" }, { type: "script", code: "x" }] });
    assert.deepEqual(statusSettings(once), once);
  });
});

describe("normalizeView", () => {
  test("keeps the order the keys were written in", () => {
    const { sections } = normalizeView({ chart: { values: [1, 2] }, text: "hi", rows: [{ label: "A" }] });
    assert.deepEqual(sections.map((section) => section.kind), ["chart", "text", "rows"]);
  });

  test("accepts text, arrays and nothing at all", () => {
    assert.equal(normalizeView("hello").sections[0].text, "hello");
    assert.deepEqual(normalizeView([{ text: "a" }, { text: "b" }]).sections.map((section) => section.text), ["a", "b"]);
    for (const nothing of [null, undefined, 0n, () => {}, {}, []]) assert.ok(Array.isArray(normalizeView(nothing).sections));
  });

  test("understands common words and booleans as tones", () => {
    const tones = ["ok", "warning", "failed", true, false, "purple", undefined];
    const [{ items }] = normalizeView({ rows: tones.map((tone) => ({ tone, label: "x" })) }).sections;
    assert.deepEqual(items.map((item) => item.tone), ["good", "wait", "bad", "good", "bad", "none", "none"]);
  });

  test("only web links survive", () => {
    const [{ items }] = normalizeView({ rows: [{ url: "javascript:alert(1)" }, { url: "file:///etc/passwd" }, { url: "https://a.com" }] }).sections;
    assert.deepEqual(items.map((item) => item.url), ["", "", "https://a.com"]);
  });

  test("drops charts without at least two values and lists with nothing to say", () => {
    assert.deepEqual(normalizeView({ chart: { values: [1] }, list: [], rows: [] }).sections, []);
    assert.equal(normalizeView({ list: { items: [], empty: "Nobody" } }).sections.length, 1);
  });

  test("tabs hold any section, but not without end", () => {
    const nest = (depth) => (depth === 0 ? { text: "deep" } : { tabs: [{ name: "t", ...nest(depth - 1) }] });
    const [tabs] = normalizeView({ tabs: [{ name: "A", live: true, rows: [{ label: "x" }] }, {}] }).sections;
    assert.deepEqual(tabs.items.map((tab) => [tab.name, tab.live, tab.sections.length]), [["A", true, 1], ["Tab 2", false, 0]]);
    assert.ok(!JSON.stringify(normalizeView(nest(20))).includes("deep"));
  });

  test("hero, refresh and live", () => {
    const view = normalizeView({ hero: { tone: "ok", title: "Up", progress: 4, action: "go" }, refresh: 0.1, live: true });
    assert.equal(view.hero.progress, 1);
    assert.equal(view.hero.action, "go");
    assert.equal(view.refresh, 2);
    assert.equal(view.live, true);
    assert.deepEqual(view.sections, []);
  });
});

describe("cardHero", () => {
  const rows = (...items) => normalizeView({ rows: items });

  test("the worst row of any block wins", () => {
    const hero = cardHero([rows({ tone: "good", label: "A" }), rows({ tone: "wait", label: "B" }, { tone: "bad", label: "C" })]);
    assert.deepEqual([hero.tone, hero.title], ["bad", "C failing"]);
    assert.equal(cardHero([rows({ tone: "good", label: "A" })]).title, "All systems OK");
    assert.equal(cardHero([rows({ tone: "wait", label: "Deploying", running: true })]).title, "Deploying…");
  });

  test("a block's own hero wins over the rows", () => {
    assert.equal(cardHero([rows({ tone: "bad", label: "A" }), normalizeView({ hero: { title: "Mine", tone: "ok" } })]).title, "Mine");
  });

  test("rows inside tabs count, rows without a tone do not", () => {
    assert.equal(cardHero([normalizeView({ tabs: [{ name: "T", rows: [{ tone: "bad", label: "X" }] }] })]).tone, "bad");
    assert.equal(cardHero([rows({ label: "Just information" })]), null);
    assert.equal(cardHero([]), null);
  });
});

describe("scripts", () => {
  test("return a value, with helpers, state and logs", async () => {
    const result = await runScript({
      code: `state.runs = (state.runs ?? 0) + 1; console.log("hi", { a: 1 }); return { text: await sh("echo out"), size: bytes(12400000), runs: state.runs, action };`,
      action: "go",
      state: { runs: 4 },
    });
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(result.value, { text: "out", size: "12.4 MB", runs: 5, action: "go" });
    assert.deepEqual(result.state, { runs: 5 });
    assert.deepEqual(result.logs, ["hi { a: 1 }"]);
  });

  test("errors name the line and never throw", async () => {
    const thrown = await runScript({ code: `const a = 1;\nconst b = 2;\nthrow new Error("boom");` });
    assert.equal(thrown.ok, false);
    assert.equal(thrown.error, "boom (line 3)");
    assert.match((await runScript({ code: "return {" })).error, /SyntaxError/);
    assert.match((await runScript({ code: `await sh("exit 3")` })).error, /exit 3/);
  });

  test("a script that never ends, or ends the process, is reported", async () => {
    assert.match((await runScript({ code: "while (true) {}", timeoutMs: 600 })).error, /Took longer/);
    assert.match((await runScript({ code: "process.exit(7)" })).error, /exit 7/);
  });

  test("a block keeps its state and reacts to actions", async () => {
    const block = { id: "b", type: "script", code: `if (action) state.last = action; return { text: state.last ?? "none" };` };
    const textOf = async (action) => (await readStatusBlock({ widgetId: "w", block, action })).view.sections[0].text;
    assert.equal(await textOf(""), "none");
    assert.equal(await textOf("backup"), "backup");
    assert.equal(await textOf(""), "backup");
  });

  test("a failing script shows as a failing row", async () => {
    const { view } = await readStatusBlock({ widgetId: "w", block: { id: "f", type: "script", code: `throw new Error("nope")` } });
    assert.deepEqual([view.sections[0].items[0].tone, view.sections[0].items[0].detail], ["bad", "nope (line 1)"]);
  });

  test("the Run button gets the value and the view", async () => {
    const result = await testScript(`return { rows: [{ tone: "ok", label: "Fine" }] }`);
    assert.equal(result.ok, true);
    assert.equal(result.view.sections[0].items[0].tone, "good");
    assert.match(result.value, /Fine/);
  });

  for (const example of SCRIPT_EXAMPLES) {
    test(`the example "${example.name}" is valid JavaScript`, () => {
      const AsyncFunction = (async () => {}).constructor;
      assert.doesNotThrow(() => new AsyncFunction("action", "state", "sh", "json", "ago", "bytes", "require", example.code));
    });
  }
});

describe("checks", () => {
  test("a check's own link is what its row opens", async () => {
    const row = await runCheck({ type: "command", label: "Errors", command: "echo 0 errors", link: "https://example.com/logs" });
    assert.deepEqual([row.tone, row.detail, row.url], ["good", "0 errors", "https://example.com/logs"]);
  });
});

describe("umami hosts", () => {
  test("become Umami's filter", () => {
    assert.equal(hostFilter({}), "");
    assert.equal(hostFilter({ hosts: "a.com, b.com" }), "eq.a.com,b.com");
    assert.equal(hostFilter({ excludeHosts: "a.com\nb.com" }), "neq.a.com,b.com");
    assert.equal(hostFilter({ hosts: "a.com", excludeHosts: "b.com" }), "eq.a.com");
  });

  test("sessions carry the shortened host", () => {
    const now = Date.parse("2026-11-24T20:00:00Z");
    const event = { __type: "pageview", sessionId: "1", createdAt: "2026-11-24T19:59:00Z", urlPath: "/x", hostname: "blog.example.com", country: "DE" };
    const [session] = latestSessions([event], now, ".example.com");
    assert.deepEqual([session.host, session.path, session.live], ["blog", "/x", true]);
  });

  test("the view shows hosts only when there are several", () => {
    const base = {
      url: "https://u.example/share/x",
      days: [{ date: "2026-11-23", visitors: 1, views: 2 }, { date: "2026-11-24", visitors: 3, views: 1 }],
      active: 1,
      sessions: [{ path: "/", host: "blog", country: "DE", seconds: 65, live: true }],
    };
    const view = normalizeView(visitsView({ ...base, showHosts: true }));
    assert.equal(view.live, true);
    assert.deepEqual(view.sections.map((section) => section.kind), ["chart", "list"]);
    assert.equal(view.sections[0].value, "4");
    assert.deepEqual([view.sections[1].items[0].icon, view.sections[1].items[0].label, view.sections[1].items[0].detail], ["🇩🇪", "blog", "1m 5s"]);
    assert.equal(normalizeView(visitsView({ ...base, showHosts: false })).sections[1].items[0].label, "");
  });
});
