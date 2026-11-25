import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseRange } from "../src/main/range.js";
import { claudeActivity, codexActivity, usageWindow } from "../src/main/sources/ai-usage.js";
import { pickPath, relativeTime, toneOfExitCode, toneOfHealthValue } from "../src/main/sources/checks.js";
import { parseAccessories, parseBattery, parseBluetooth } from "../src/main/sources/power.js";
import { latestSessions, parseShareUrl } from "../src/main/sources/umami.js";
import { placeLabel, positionArgument } from "../src/main/sources/place-name.js";
import { summarize } from "../src/main/sources/weather.js";

describe("power", () => {
  test("a charged MacBook on power", () => {
    const output = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1234567)\t100%; charged; 0:00 remaining present: true\n";
    assert.deepEqual(parseBattery(output), { percent: 100, charging: false, plugged: true, charged: true, minutesLeft: null });
  });

  test("discharging with an estimate", () => {
    const output = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t83%; discharging; 6:12 remaining present: true\n";
    assert.deepEqual(parseBattery(output), { percent: 83, charging: false, plugged: false, charged: false, minutesLeft: 372 });
  });

  test("charging while macOS is still estimating", () => {
    const output = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t41%; charging; (no estimate) present: true\n";
    assert.equal(parseBattery(output).charging, true);
    assert.equal(parseBattery(output).minutesLeft, null);
  });

  test("a desktop Mac has no battery", () => {
    assert.equal(parseBattery("Now drawing from 'AC Power'\n"), null);
  });

  test("accessory levels skip the Mac's own battery", () => {
    const output = " -InternalBattery-0 (id=1)\t100%; charged; 0:00 remaining\n -Example Mouse (id=7654321)\t72%; \n";
    assert.deepEqual(parseAccessories(output), { "Example Mouse": 72 });
  });

  test("Bluetooth devices take the lowest bud and fall back to accessory levels", () => {
    const json = {
      SPBluetoothDataType: [
        {
          device_connected: [
            { "AirPods Pro": { device_minorType: "Headphones", device_batteryLevelLeft: "80%", device_batteryLevelRight: "64%" } },
            { "Example Mouse": { device_minorType: "Mouse" } },
            { Speaker: { device_minorType: "Speaker" } },
          ],
        },
      ],
    };
    assert.deepEqual(parseBluetooth(json, { "Example Mouse": 55 }), [
      { name: "AirPods Pro", kind: "headphones", percent: 64 },
      { name: "Example Mouse", kind: "mouse", percent: 55 },
      { name: "Speaker", kind: "speaker", percent: null },
    ]);
  });
});

describe("AI usage", () => {
  const now = Date.parse("2026-11-22T20:00:00Z");

  test("a window that already reset reads as fresh", () => {
    assert.deepEqual(usageWindow(80, "2026-11-22T19:00:00Z", now), { used: 0, resetsAt: null });
  });

  test("epoch seconds and ISO strings both work", () => {
    const resets = Date.parse("2026-11-22T22:00:00Z");
    assert.deepEqual(usageWindow(41.6, resets / 1000, now), { used: 42, resetsAt: "2026-11-22T22:00:00.000Z" });
    assert.equal(usageWindow(null, null, now), null);
  });

  test("Codex activity follows its last event", () => {
    const event = (type) => ({ type: "event_msg", payload: { type } });
    assert.equal(codexActivity([event("agent_reasoning")]), "thinking");
    assert.equal(codexActivity([event("exec_command_begin")]), "working");
    assert.equal(codexActivity([event("agent_reasoning"), event("task_complete")]), "idle");
    assert.equal(codexActivity([]), "idle");
  });

  test("Claude activity follows the last turn", () => {
    const assistant = (blocks, stop = null) => ({
      type: "assistant",
      message: { stop_reason: stop, content: blocks.map((type) => ({ type })) },
    });
    assert.equal(claudeActivity([assistant(["thinking"])]), "thinking");
    assert.equal(claudeActivity([assistant(["tool_use"])]), "working");
    assert.equal(claudeActivity([assistant(["text"], "end_turn")]), "idle");
    assert.equal(claudeActivity([{ type: "user", message: { content: [{ type: "tool_result" }] } }]), "working");
    assert.equal(claudeActivity([{ type: "user", message: { content: "hello" } }]), "thinking");
  });
});

describe("checks", () => {
  test("pickPath reads nested fields", () => {
    assert.equal(pickPath({ checks: { db: { status: "UP" } } }, "checks.db.status"), "UP");
    assert.equal(pickPath({ a: 1 }, "a.b.c"), undefined);
  });

  test("health words are understood without configuration", () => {
    assert.equal(toneOfHealthValue("UP"), "good");
    assert.equal(toneOfHealthValue("pass"), "good");
    assert.equal(toneOfHealthValue("warn"), "wait");
    assert.equal(toneOfHealthValue("DOWN"), "bad");
    assert.equal(toneOfHealthValue("green", "ok"), "bad");
    assert.equal(toneOfHealthValue("OK", "ok"), "good");
  });

  test("Nagios exit codes", () => {
    assert.deepEqual([0, 1, 2, 3, 127].map(toneOfExitCode), ["good", "wait", "bad", "wait", "bad"]);
  });

  test("relative times", () => {
    const now = Date.parse("2026-11-22T20:00:00Z");
    assert.equal(relativeTime("2026-11-22T19:59:40Z", now), "just now");
    assert.equal(relativeTime("2026-11-22T19:15:00Z", now), "45 min ago");
    assert.equal(relativeTime("2026-11-20T20:00:00Z", now), "2 days ago");
  });
});

describe("umami", () => {
  test("share links for Umami Cloud and self-hosted", () => {
    assert.equal(parseShareUrl("https://cloud.umami.is/share/abc123/example.com").id, "abc123");
    assert.ok(parseShareUrl("https://cloud.umami.is/share/abc123").apis[0].includes("umami.is"));
    assert.deepEqual(parseShareUrl("https://stats.example.com/share/xyz").apis, ["https://stats.example.com/api"]);
    assert.throws(() => parseShareUrl("https://example.com/"));
  });

  test("latest sessions: newest first, live ones counting until now", () => {
    const now = Date.parse("2026-11-22T20:00:00Z");
    const events = [
      { __type: "pageview", sessionId: "s1", createdAt: "2026-11-22T19:40:00Z", urlPath: "/", country: "DE" },
      { __type: "pageview", sessionId: "s1", createdAt: "2026-11-22T19:42:00Z", urlPath: "/pricing", country: "DE" },
      { __type: "pageview", sessionId: "s2", createdAt: "2026-11-22T19:58:00Z", urlPath: "/blog", country: "FR" },
      { __type: "event", sessionId: "s3", createdAt: "2026-11-22T19:59:00Z" },
    ];
    assert.deepEqual(latestSessions(events, now), [
      { path: "/blog", host: "", country: "FR", seconds: 120, live: true },
      { path: "/pricing", host: "", country: "DE", seconds: 120, live: false },
    ]);
  });
});

describe("place name", () => {
  test("prefers the city, then the county, then the region", () => {
    assert.equal(placeLabel({ city: "Springfield", county: "Example County", region: "Example Region" }), "Springfield");
    assert.equal(placeLabel({ city: "", county: "Example County", region: "Example Region" }), "Example County");
    assert.equal(placeLabel({ region: "Example Region" }), "Example Region");
    assert.equal(placeLabel({}), "");
  });

  test("rounds the position to about 1 km before it leaves the app", () => {
    assert.equal(positionArgument({ latitude: 51.50735, longitude: -0.12776 }), "[51.51,-0.13]");
  });

  test("rejects anything that is not a position", () => {
    assert.throws(() => positionArgument({ latitude: "x; rm", longitude: 1 }));
    assert.throws(() => positionArgument({}));
  });
});

describe("weather", () => {
  test("Open-Meteo's answer becomes today plus the following days", () => {
    const data = {
      current: { temperature_2m: 14.6, weather_code: 3, is_day: 0 },
      daily: {
        time: ["2026-11-22", "2026-11-23"],
        weather_code: [3, 61],
        temperature_2m_max: [16.2, 12.4],
        temperature_2m_min: [7.5, 6.1],
        precipitation_probability_max: [10, 80],
      },
    };
    assert.deepEqual(summarize(data), {
      temperature: 15,
      code: 3,
      isDay: false,
      high: 16,
      low: 8,
      rainChance: 10,
      days: [{ date: "2026-11-23", code: 61, high: 12, low: 6, rainChance: 80 }],
    });
  });
});

describe("media ranges", () => {
  test("open, closed and suffix ranges", () => {
    assert.deepEqual(parseRange("bytes=0-", 1000), { start: 0, end: 999 });
    assert.deepEqual(parseRange("bytes=100-199", 1000), { start: 100, end: 199 });
    assert.deepEqual(parseRange("bytes=-100", 1000), { start: 900, end: 999 });
    assert.deepEqual(parseRange("bytes=900-5000", 1000), { start: 900, end: 999 });
  });

  test("absent or unsatisfiable ranges", () => {
    assert.equal(parseRange(undefined, 1000), null);
    assert.equal(parseRange("bytes=-", 1000), null);
    assert.equal(parseRange("bytes=2000-", 1000), null);
    assert.equal(parseRange("items=0-1", 1000), null);
  });
});
