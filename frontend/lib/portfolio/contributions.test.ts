import assert from "node:assert/strict";
import test from "node:test";
import type { Holding } from "@/lib/api";
import { allocateContribution, type ContributionPreview } from "./contributions";

function holding(ticker: string, cost: number, currency = "USD"): Holding {
  return { id: 1, created_at: "", ticker, asset_name: ticker, asset_type: "ETF",
    quantity: 1, average_cost: cost, currency };
}
function target(ticker: string, allocation: number) {
  return { ticker, asset_name: ticker, allocation };
}
function available(result: ContributionPreview) {
  if (!result.available) throw new Error(result.reason);
  return result;
}
function unavailable(result: ContributionPreview) {
  assert.equal(result.available, false);
  if (result.available) throw new Error("Expected unavailable preview");
  assert.ok(result.reason.length > 0);
}
function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`);
}
const targets = [target("QQQM", 30), target("VOO", 30), target("SMH", 20), target("BTC", 15), target("ETH", 5)];
const holdings = [holding("QQQM", 4900), holding("SMH", 2100), holding("BTC", 2100), holding("ETH", 900)];

test("worked portfolio distributes 1000 across VOO and SMH using the new total", () => {
  const result = available(allocateContribution(holdings, targets, 1000));
  assert.equal(result.new_total_cost_basis, 11000);
  assert.equal(result.currency, "USD");
  assert.deepEqual(result.allocations.map((row) => [row.ticker, row.contribution_amount]), [
    ["VOO", 970.59], ["SMH", 29.41],
  ]);
  near(result.allocations[0].resulting_allocation, 970.59 / 11000 * 100);
  near(result.allocations[0].contribution_percentage, 97.059);
  assert.equal(result.allocations[0].target_allocation, 30);
  assert.equal(result.allocations[1].resulting_cost_basis, 2129.41);
});

test("exactly aligned holdings preserve target proportions", () => {
  const result = available(allocateContribution(
    [holding("A", 600), holding("B", 400)], [target("A", 60), target("B", 40)], 100,
  ));
  assert.deepEqual(result.allocations.map((row) => row.contribution_amount), [60, 40]);
  near(result.allocations[0].resulting_allocation, 60);
  near(result.allocations[1].resulting_allocation, 40);
});

test("missing recommended holding receives a contribution", () => {
  const result = available(allocateContribution([holding("A", 100)], [target("A", 50), target("B", 50)], 10));
  assert.deepEqual(result.allocations.map((row) => [row.ticker, row.contribution_amount]), [["B", 10]]);
});

test("several underweight holdings share funds according to shortfalls", () => {
  const result = available(allocateContribution(
    [holding("A", 800), holding("B", 100), holding("C", 100)],
    [target("A", 40), target("B", 30), target("C", 30)], 200,
  ));
  assert.deepEqual(result.allocations.map((row) => [row.ticker, row.contribution_amount]), [["B", 100], ["C", 100]]);
});

test("outside holdings stay in the denominator and receive no contribution", () => {
  const result = available(allocateContribution([holding("OTHER", 100)], [target("A", 100)], 100));
  assert.equal(result.new_total_cost_basis, 200);
  assert.deepEqual(result.allocations.map((row) => row.ticker), ["A"]);
  assert.equal(result.allocations[0].resulting_allocation, 50);
});

test("duplicate ticker matching ignores case and whitespace without mutating inputs", () => {
  const rows = [holding("a", 25), holding(" A ", 25), holding("B", 50)];
  const recommendations = [target(" a ", 50), target("B", 50)];
  const before = structuredClone({ rows, recommendations });
  const result = available(allocateContribution(rows, recommendations, 20));
  assert.deepEqual(result.allocations.map((row) => row.resulting_cost_basis), [60, 60]);
  assert.deepEqual({ rows, recommendations }, before);
});

for (const value of [0, -1, NaN, Infinity, -Infinity]) {
  test(`rejects invalid contribution ${value}`, () => {
    unavailable(allocateContribution(holdings, targets, value));
  });
}

test("empty holdings and zero cost basis are unavailable", () => {
  unavailable(allocateContribution([], targets, 100));
  unavailable(allocateContribution([holding("A", 0)], [target("A", 100)], 100));
});

test("mixed currencies are unavailable", () => {
  unavailable(allocateContribution([holding("A", 100, "USD"), holding("B", 100, "NZD")], targets, 100));
});

test("same non-USD currency is retained", () => {
  assert.equal(available(allocateContribution([holding("A", 100, "NZD")], [target("A", 100)], 10)).currency, "NZD");
});

test("invalid target totals, allocations, and duplicate targets are unavailable", () => {
  for (const invalid of [[], [target("A", 90)], [target("A", 101)],
    [target("A", -1), target("B", 101)], [target("A", NaN)],
    [target("A", Infinity)], [target("A", 50), target("a", 50)]]) {
    unavailable(allocateContribution(holdings, invalid, 100));
  }
});

test("approximately 100 percent targets are normalized for calculation", () => {
  const result = available(allocateContribution([holding("OTHER", 100)],
    [target("A", 33.333), target("B", 33.333), target("C", 33.333)], 3));
  assert.deepEqual(result.allocations.map((row) => row.contribution_amount), [1, 1, 1]);
});

test("rounding distributes cents deterministically with an exact monetary total", () => {
  const result = available(allocateContribution([holding("OTHER", 100)],
    [target("A", 33.333), target("B", 33.333), target("C", 33.334)], 0.02));
  assert.deepEqual(result.allocations.map((row) => [row.ticker, row.contribution_amount]), [["A", 0.01], ["C", 0.01]]);
  assert.equal(result.allocations.reduce((sum, row) => sum + Math.round(row.contribution_amount * 100), 0), 2);
});

test("rejects fractional cents, unsafe amounts, and invalid saved costs", () => {
  unavailable(allocateContribution(holdings, targets, 1.001));
  unavailable(allocateContribution(holdings, targets, Number.MAX_VALUE));
  unavailable(allocateContribution([holding("A", -1)], targets, 100));
  unavailable(allocateContribution([holding("A", NaN)], targets, 100));
});
