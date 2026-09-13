import test from "node:test";
import assert from "node:assert/strict";
import { formatAxisTick } from "./axisFormat";

test("neighboring million-scale ticks keep distinct compact labels", () => {
  const values = [750000, 1000000, 1250000, 1500000, 2000000, 2250000];
  const labels = values.map(formatAxisTick);
  assert.deepEqual(labels, ["750k", "1m", "1.25m", "1.5m", "2m", "2.25m"]);
  assert.equal(new Set(labels).size, values.length);
});

test("formatting adapts to tick magnitude without unnecessary zeros", () => {
  assert.deepEqual([350000, 700000, 1050000, 1400000].map(formatAxisTick), ["350k", "700k", "1.05m", "1.4m"]);
  assert.deepEqual([0, 12.5, 1250, 1e9, 1.25e12].map(formatAxisTick), ["0", "12.5", "1.25k", "1b", "1.25t"]);
});

test("negative and tightly spaced ticks remain readable", () => {
  assert.equal(formatAxisTick(-1250000), "-1.25m");
  assert.equal(formatAxisTick(-750000), "-750k");
  assert.equal(formatAxisTick(-0), "0");
  assert.notEqual(formatAxisTick(1001000), formatAxisTick(1002000));
  assert.equal(formatAxisTick(NaN), "—");
  assert.equal(formatAxisTick(Infinity), "—");
});
