import assert from "node:assert/strict";
import test from "node:test";
import {
  getMeaningfulAllocationGaps,
  getPortfolioHoldingAlignment,
  getPortfolioAlignmentStatus,
  getPortfolioAlignmentInterpretation,
  type PortfolioComparison,
} from "./calculations";

function comparison(ticker: string, difference: number): PortfolioComparison {
  return {
    ticker,
    asset_name: ticker,
    actual_allocation: 30 + difference,
    target_allocation: 30,
    difference,
  };
}

test("ranks overweight and underweight gaps largest first without changing input", () => {
  const comparisons = [
    comparison("BTC", 6),
    comparison("VOO", -30),
    comparison("QQQM", 19),
  ];
  const original = structuredClone(comparisons);

  assert.deepEqual(getMeaningfulAllocationGaps(comparisons), [
    comparisons[1], comparisons[2], comparisons[0],
  ]);
  assert.deepEqual(comparisons, original);
});

test("excludes gaps up to exactly plus and minus five points", () => {
  const comparisons = [
    comparison("A", 4.99),
    comparison("B", -4.99),
    comparison("C", 0),
    comparison("D", 5),
    comparison("E", -5),
    comparison("F", 5.01),
    comparison("G", -5.01),
  ];

  assert.deepEqual(getMeaningfulAllocationGaps(comparisons), [
    comparisons[5], comparisons[6],
  ]);
});

test("includes a missing recommended holding with zero actual allocation", () => {
  const missing = comparison("VOO", -30);

  assert.equal(missing.actual_allocation, 0);
  assert.deepEqual(getMeaningfulAllocationGaps([missing]), [missing]);
});

test("returns no gaps for empty or all-aligned input", () => {
  assert.deepEqual(getMeaningfulAllocationGaps([]), []);
  assert.deepEqual(
    getMeaningfulAllocationGaps([comparison("A", 4), comparison("B", -4)]),
    [],
  );
});

test("labels a positive difference of more than five points as overweight", () => {
  assert.equal(getPortfolioHoldingAlignment(19), "Overweight");
  assert.equal(getPortfolioHoldingAlignment(5.01), "Overweight");
});

test("labels a negative difference of more than five points as underweight", () => {
  assert.equal(getPortfolioHoldingAlignment(-30), "Underweight");
  assert.equal(getPortfolioHoldingAlignment(-5.01), "Underweight");
});

test("labels a difference within five percentage points as on target", () => {
  assert.equal(getPortfolioHoldingAlignment(0.9), "On target");
});

test("uses on-target labels at the inclusive five-point boundaries", () => {
  assert.equal(getPortfolioHoldingAlignment(5), "On target");
  assert.equal(getPortfolioHoldingAlignment(-5), "On target");
});

test("overall status is well aligned through five points and moderate just beyond", () => {
  for (const difference of [5, -5]) {
    assert.equal(
      getPortfolioAlignmentStatus([comparison("VOO", difference)]),
      "Well aligned",
    );
  }
  for (const difference of [5.01, -5.01, 15, -15]) {
    assert.equal(
      getPortfolioAlignmentStatus([comparison("VOO", difference)]),
      "Moderately different",
    );
  }
  assert.equal(
    getPortfolioAlignmentStatus([comparison("VOO", 15.01)]),
    "Needs attention",
  );
});

test("interpretation treats exactly plus and minus five points as aligned", () => {
  for (const difference of [5, -5]) {
    assert.equal(
      getPortfolioAlignmentInterpretation([comparison("VOO", difference)]),
      "Your current allocations are close to Arbor's target.",
    );
  }
});

test("interpretation includes gaps just beyond five points", () => {
  assert.equal(
    getPortfolioAlignmentInterpretation([comparison("QQQM", 5.01)]),
    "Your portfolio is more heavily weighted toward QQQM (5.0% above target).",
  );
  assert.equal(
    getPortfolioAlignmentInterpretation([comparison("VOO", -5.01)]),
    "It has less in VOO (5.0% below target).",
  );
});

test("missing recommended holdings follow the same inclusive five-point boundary", () => {
  const missing = {
    ticker: "ETH",
    asset_name: "Ethereum",
    actual_allocation: 0,
    target_allocation: 5,
    difference: -5,
  };
  assert.equal(
    getPortfolioAlignmentInterpretation([missing]),
    "Your current allocations are close to Arbor's target.",
  );
  assert.deepEqual(getMeaningfulAllocationGaps([missing]), []);
  assert.equal(
    getPortfolioAlignmentInterpretation([
      { ...missing, target_allocation: 5.01, difference: -5.01 },
    ]),
    "It does not currently include ETH (5.0% target).",
  );
});

test("explains meaningful overweights and missing target holdings", () => {
  const comparisons: PortfolioComparison[] = [
    {
      ticker: "QQQM",
      asset_name: "Invesco NASDAQ 100 ETF",
      actual_allocation: 49,
      target_allocation: 30,
      difference: 19,
    },
    {
      ticker: "VOO",
      asset_name: "Vanguard S&P 500 ETF",
      actual_allocation: 0,
      target_allocation: 30,
      difference: -30,
    },
    {
      ticker: "SMH",
      asset_name: "VanEck Semiconductor ETF",
      actual_allocation: 20.9,
      target_allocation: 20,
      difference: 0.9,
    },
    {
      ticker: "BTC",
      asset_name: "Bitcoin",
      actual_allocation: 21,
      target_allocation: 15,
      difference: 6,
    },
    {
      ticker: "ETH",
      asset_name: "Ethereum",
      actual_allocation: 9,
      target_allocation: 5,
      difference: 4,
    },
  ];

  assert.equal(
    getPortfolioAlignmentInterpretation(comparisons),
    "Your portfolio is more heavily weighted toward QQQM (19.0% above target) and BTC (6.0% above target). It does not currently include VOO (30.0% target).",
  );
});

test("explains a meaningful under-allocation that is not a missing holding", () => {
  const comparisons: PortfolioComparison[] = [
    {
      ticker: "VOO",
      asset_name: "Vanguard S&P 500 ETF",
      actual_allocation: 10,
      target_allocation: 30,
      difference: -20,
    },
  ];

  assert.equal(
    getPortfolioAlignmentInterpretation(comparisons),
    "It has less in VOO (20.0% below target).",
  );
});

test("uses a reassuring message when allocations are close to target", () => {
  const comparisons: PortfolioComparison[] = [
    {
      ticker: "QQQM",
      asset_name: "Invesco NASDAQ 100 ETF",
      actual_allocation: 31,
      target_allocation: 30,
      difference: 1,
    },
  ];

  assert.equal(
    getPortfolioAlignmentInterpretation(comparisons),
    "Your current allocations are close to Arbor's target.",
  );
});
