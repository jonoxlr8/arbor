import test from "node:test";
import assert from "node:assert/strict";
import type { Holding } from "../api";
import { calculatePortfolioSummary, comparePortfolio } from "./calculations";
import { allocateContribution } from "./contributions";

const holding = (ticker: string, cost: number, currency: unknown = "USD") => ({
  id: 1, created_at: "", ticker, asset_name: ticker, asset_type: "ETF", quantity: 1,
  average_cost: cost, currency,
}) as Holding;
const targets = [{ ticker: "QQQM", asset_name: "QQQM", allocation: 100 }];

test("single currency summaries use recorded units independent of planning currency", () => {
  for (const currency of ["USD", "PHP"]) {
    const summary = calculatePortfolioSummary([holding("QQQM", 200, currency)]);
    assert.equal(summary.currency, currency);
    assert.equal(summary.total_cost_basis, 200);
    assert.equal(summary.positions[0].allocation, 100);
  }
});
test("unavailable states do not create allocations or contribution previews", () => {
  const cases: [Holding[], string][] = [
    [[], "empty"], [[holding("QQQM", 0)], "zero_basis"],
    [[holding("QQQM", 100, "PHP"), holding("VOO", 100)], "mixed_currency"],
    [[holding("QQQM", 100, undefined)], "invalid_currency"],
    [[holding("QQQM", 100, "???")], "invalid_currency"],
    [[holding("QQQM", Infinity)], "invalid_holding"],
  ];
  // Explicitly missing saved data, rather than the fixture default.
  cases[3][0][0].currency = undefined as unknown as string;
  for (const [rows, status] of cases) {
    const summary = calculatePortfolioSummary(rows);
    assert.equal(summary.status, status);
    assert.equal(summary.available, false);
    assert.equal(summary.positions.length, 0);
    assert.ok(summary.holdings.every(h => h.allocation === null));
    assert.equal(allocateContribution(rows, targets, 10).available, false);
  }
});
test("duplicates aggregate and outside targets reconcile without receiving contributions", () => {
  const rows = [holding(" qqqm ", 100, " usd "), holding("QQQM", 100), holding("OTHER", 150)];
  const summary = calculatePortfolioSummary(rows);
  assert.equal(summary.holdings.length, 3);
  assert.equal(summary.positions.length, 2);
  const comparison = comparePortfolio(summary.positions, targets);
  assert.equal(comparison[0].actual_allocation, 200 / 350 * 100);
  assert.equal(comparison[0].actual_allocation + summary.positions[1].allocation!, 100);
  const preview = allocateContribution(rows, targets, 10);
  assert.ok(preview.available);
  assert.deepEqual(preview.allocations.map(a => a.ticker), ["QQQM"]);
});
