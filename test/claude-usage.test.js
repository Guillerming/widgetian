import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { liveWindow, parseLiveUsage } from "../src/main/sources/claude-usage.js";

const NOW = Date.parse("2026-11-27T12:00:00Z");

describe("Claude's live usage", () => {
  test("reads utilisation and reset time of both windows", () => {
    const usage = parseLiveUsage(
      {
        five_hour: { utilization: 18.4, resets_at: "2026-11-27T12:39:59.861614+00:00" },
        seven_day: { utilization: 81, resets_at: "2026-11-28T02:59:59.861638+00:00" },
        seven_day_opus: null,
      },
      NOW,
    );
    assert.deepEqual(usage.fiveHour, { used: 18, resetsAt: "2026-11-27T12:39:59.861Z" });
    assert.deepEqual(usage.week, { used: 81, resetsAt: "2026-11-28T02:59:59.861Z" });
  });

  test("a window that has not started is full, one that is missing is unknown", () => {
    assert.deepEqual(liveWindow(null, NOW), { used: 0, resetsAt: null });
    assert.equal(liveWindow(undefined, NOW), null);
    assert.deepEqual(parseLiveUsage({}, NOW), { fiveHour: null, week: null });
  });

  test("a window whose reset already passed reads 0 used", () => {
    assert.deepEqual(liveWindow({ utilization: 90, resets_at: "2026-11-27T11:00:00Z" }, NOW), { used: 0, resetsAt: null });
  });
});
