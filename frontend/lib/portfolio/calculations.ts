import type { Holding } from "@/lib/api";
import type { PortfolioHolding } from "@/lib/types/plan";

export type CalculatedHolding = Holding & {
  cost_basis: number;
  allocation: number;
};

export type PortfolioSummary = {
  holdings: CalculatedHolding[];
  total_cost_basis: number;
};

export function calculatePortfolioSummary(
  holdings: Holding[],
): PortfolioSummary {
  const holdingsWithValues = holdings.map((holding) => ({
    ...holding,
    cost_basis: holding.quantity * holding.average_cost,
  }));

  const totalCostBasis = holdingsWithValues.reduce(
    (total, holding) => total + holding.cost_basis,
    0,
  );

  const calculatedHoldings = holdingsWithValues.map((holding) => ({
    ...holding,
    allocation:
      totalCostBasis > 0
        ? (holding.cost_basis / totalCostBasis) * 100
        : 0,
  }));

  return {
    holdings: calculatedHoldings,
    total_cost_basis: totalCostBasis,
  };
}

export type PortfolioComparison = {
  ticker: string;
  asset_name: string;
  actual_allocation: number;
  target_allocation: number;
  difference: number;
};

export function comparePortfolio(
  actualHoldings: CalculatedHolding[],
  recommendedPortfolio: PortfolioHolding[],
): PortfolioComparison[] {
  return recommendedPortfolio.map((target) => {
    const actual = actualHoldings.find(
      (holding) => holding.ticker === target.ticker,
    );

    const actualAllocation = actual?.allocation ?? 0;
    const targetAllocation = target.allocation;

    return {
      ticker: target.ticker,
      asset_name: target.asset_name,
      actual_allocation: actualAllocation,
      target_allocation: targetAllocation,
      difference: actualAllocation - targetAllocation,
    };
  });
}