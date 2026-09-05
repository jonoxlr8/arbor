import type { Holding } from "@/lib/api";

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