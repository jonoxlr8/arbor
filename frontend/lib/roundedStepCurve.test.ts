import test from "node:test";
import assert from "node:assert/strict";
import { area, line } from "victory-vendor/d3-shape";
import { roundedStepAfter } from "../components/portfolio/roundedStepCurve";
import { historyChartSeries, portfolioPeriodGain, supportedHistoryPoints } from "./portfolioHistory";
import type { PortfolioHistory } from "./livePortfolio";

test("soft step holds through gaps and starts each visual turn at the genuine timestamp", () => {
  const values: [number, number][] = [[0, 40], [40, 40], [100, 15], [160, 65], [220, 65]];
  const path = line<[number, number]>().x(point => point[0]).y(point => point[1]).curve(roundedStepAfter)(values)!;
  assert.match(path, /^M0,40L40,40L100,40Q/);
  assert.match(path, /L160,15Q/);
  assert.match(path, /L220,65$/);
  assert.equal((path.match(/Q/g) ?? []).length, 4, "only two genuine changes get rounded corners");
  assert.ok(!path.includes("C"), "there is no spline through missing dates");
  const fill = area<[number, number]>().x(point => point[0]).y0(90).y1(point => point[1]).curve(roundedStepAfter)(values)!;
  assert.match(fill, /^M0,40L40,40L100,40Q/);
  assert.match(fill, /Z$/, "the gradient area remains closed");
  assert.equal((fill.match(/Q/g) ?? []).length, 4);
  const finalChange = line<[number, number]>().x(point => point[0]).y(point => point[1]).curve(roundedStepAfter)([[0, 40], [100, 60]])!;
  assert.match(finalChange, /^M0,40L100,40Q/);
  assert.equal((finalChange.match(/Q/g) ?? []).length, 2, "today's genuine endpoint gets the same tiny rounded turn");
});

test("rounding cannot create history, hover targets, or change contribution-neutral gain", () => {
  const history: PortfolioHistory[] = [
    { day: "2026-09-01", value_php: "10000.00", value_usd: "200.00", captured_at: null, origin: "reconstructed", cost_complete: true, recorded_cost_php: "10000.00", recorded_gain_php: "0.00" },
    { day: "2026-09-08", value_php: "16000.00", value_usd: null, captured_at: null, origin: "reconstructed", cost_complete: true, recorded_cost_php: "16000.00", recorded_gain_php: "0.00" },
    { day: "2026-09-15", value_php: "15000.00", value_usd: "300.00", captured_at: null, origin: "reconstructed", cost_complete: true, recorded_cost_php: "16000.00", recorded_gain_php: "-1000.00" },
  ];
  const before = JSON.stringify(history);
  assert.deepEqual(supportedHistoryPoints(history, "USD").map(point => point.day), ["2026-09-01", "2026-09-15"]);
  assert.deepEqual(historyChartSeries(history, 30, "USD", "2026-09-30").map(point => new Date(point.timestamp).toISOString().slice(0, 10)),
    ["2026-09-01", "2026-09-15", "2026-09-30"]);
  assert.equal(portfolioPeriodGain({ history, days: 30, currentGainPhp: "-1000.00", currentComplete: true, today: "2026-09-30" }), null,
    "no pre-window baseline is invented");
  assert.equal(portfolioPeriodGain({ history, days: 0, currentGainPhp: "-1000.00", currentComplete: true, today: "2026-09-30" }), "-1000.00");
  assert.equal(JSON.stringify(history), before);
});
