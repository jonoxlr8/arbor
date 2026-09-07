import assert from "node:assert/strict";
import test from "node:test";
import {
  getPortfolioAlignmentInterpretation,
  type PortfolioComparison,
} from "./calculations";

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
