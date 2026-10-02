import test from "node:test";
import assert from "node:assert/strict";
import { currentVgtShares, needsShareBasis, shareBasisLabel } from "./shareBasis";
import { historyRange, portfolioPeriodGain, supportedHistoryPoints } from "./portfolioHistory";
import type { PortfolioHistory } from "./livePortfolio";

test("confirmation is limited to pre-split VGT and undated openings", () => {
  assert.equal(needsShareBasis("gotrade_vgt", "2026-04-20"), true);
  assert.equal(needsShareBasis("gotrade_vgt", "2026-04-21"), false);
  assert.equal(needsShareBasis("gotrade_vgt", "2026-09-30"), false);
  assert.equal(needsShareBasis("gotrade_vgt"), true);
  for (const product of ["gotrade_vt", "gotrade_bnd", "gcash_technology"]) assert.equal(needsShareBasis(product, "2026-04-20"), false);
  assert.match(shareBasisLabel(null), /not confirmed/);
});
test("review shares use exact conversion with no second adjustment of restated units", () => {
  assert.equal(currentVgtShares("1", "before_split"), "8");
  assert.equal(currentVgtShares("0.123456789123", "before_split"), "0.987654312984");
  assert.equal(currentVgtShares("8", "after_split"), "8");
});
test("all canonical ranges and PHP/USD retain split-neutral values and recorded-cost gains", () => {
  const points: PortfolioHistory[] = ["2026-04-20", "2026-04-21", "2026-04-22"].map(day => ({
    day, value_php: "40000.00", value_usd: "800.00", captured_at: null, origin: "reconstructed",
    recorded_cost_php: "40000.00", recorded_gain_php: "0.00", cost_complete: true, cost_context_captured: false,
  }));
  for (const days of [7, 30, 90, 180, 365, 1826, 0]) {
    const ranged = historyRange(points, days, "2026-04-22");
    for (const currency of ["PHP", "USD"] as const) assert.equal(supportedHistoryPoints(ranged, currency).length, 3);
    assert.equal(portfolioPeriodGain({history: points, days, today: "2026-04-22", currentGainPhp: "0.00", currentComplete: true}), days === 0 ? "0.00" : null);
  }
});
