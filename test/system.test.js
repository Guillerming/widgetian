import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  chipName,
  coreKinds,
  cpuLoad,
  cpuTemperature,
  cpuTimes,
  parseSwapAndPressure,
  parseVmStat,
  sortVolumes,
} from "../src/main/sources/system.js";

const GB = 1024 ** 3;
const core = (user, sys, idle) => ({ times: { user, nice: 0, sys, idle, irq: 0 } });

describe("system: CPU", () => {
  test("load is the busy share of the ticks between two samples", () => {
    const before = cpuTimes([core(100, 0, 900), core(0, 0, 1000)]);
    const after = cpuTimes([core(150, 25, 925), core(10, 0, 1090)]);
    assert.deepEqual(cpuLoad(before, after), { percent: 43, cores: [75, 10] });
  });

  test("no ticks in between reads as idle, never as NaN", () => {
    const sample = cpuTimes([core(1, 1, 1)]);
    assert.deepEqual(cpuLoad(sample, sample), { percent: 0, cores: [0] });
  });

  test("efficiency cores come first on Apple silicon; Intel has one kind", () => {
    assert.deepEqual(coreKinds(4, 2), ["efficiency", "efficiency", "performance", "performance"]);
    assert.deepEqual(coreKinds(2, 0), ["performance", "performance"]);
  });

  test("temperature averages the die sensors and ignores the rest", () => {
    const sensors = [
      { name: "PMU tdie1", celsius: 50 },
      { name: "PMU tdie2", celsius: 55 },
      { name: "gas gauge battery", celsius: 30 },
      { name: "PMU tdie3", celsius: -1 },
    ];
    assert.equal(cpuTemperature(sensors), 52.5);
  });

  test("the first M1 names its CPU sensors differently", () => {
    const sensors = [
      { name: "pACC MTR Temp Sensor2", celsius: 40 },
      { name: "eACC MTR Temp Sensor0", celsius: 36 },
      { name: "GPU MTR Temp Sensor1", celsius: 90 },
    ];
    assert.equal(cpuTemperature(sensors), 38);
  });

  test("no die sensors (Intel) means no temperature", () => {
    assert.equal(cpuTemperature([{ name: "gas gauge battery", celsius: 30 }]), null);
  });

  test("chip names lose the vendor noise", () => {
    assert.equal(chipName("Apple M2 Max\n"), "M2 Max");
    assert.equal(chipName("Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz"), "Intel Core i7-9750H");
  });
});

describe("system: memory", () => {
  const VM_STAT = [
    "Mach Virtual Memory Statistics: (page size of 16384 bytes)",
    "Pages free:                                5000.",
    "Pages wired down:                         65536.",
    "Pages purgeable:                           1024.",
    "File-backed pages:                        32768.",
    "Anonymous pages:                         132096.",
    "Pages occupied by compressor:             65536.",
  ].join("\n");

  test("used counts app memory, wired and compressed, like Activity Monitor", () => {
    const memory = parseVmStat(VM_STAT, 16 * GB);
    assert.equal(memory.app, 2 * GB);
    assert.equal(memory.wired, 1 * GB);
    assert.equal(memory.compressed, 1 * GB);
    assert.equal(memory.used, 4 * GB);
    assert.equal(memory.cached, 0.5 * GB + 16 * 1024 ** 2);
  });

  test("used never exceeds the RAM", () => {
    assert.equal(parseVmStat(VM_STAT, 2 * GB).used, 2 * GB);
  });

  test("swap and memory pressure", () => {
    const output = "total = 3072.00M  used = 2674.25M  free = 397.75M  (encrypted)\n2\n";
    assert.deepEqual(parseSwapAndPressure(output), { swapUsed: Math.round(2674.25 * 1024 ** 2), swapTotal: 3 * GB, pressure: "warn" });
  });

  test("no swap and an unknown level read as normal", () => {
    assert.deepEqual(parseSwapAndPressure("total = 0.00M  used = 0.00M  free = 0.00M\n9\n"), { swapUsed: 0, swapTotal: 0, pressure: "normal" });
  });
});

describe("system: disks", () => {
  test("the startup disk first, then the rest by name", () => {
    const volumes = [{ name: "Photos", path: "/Volumes/Photos" }, { name: "Macintosh HD", path: "/" }, { name: "Backup", path: "/Volumes/Backup" }];
    assert.deepEqual(sortVolumes(volumes).map(({ name }) => name), ["Macintosh HD", "Backup", "Photos"]);
  });
});
