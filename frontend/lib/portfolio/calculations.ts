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

export type PortfolioAlignmentStatus =
  | "Well aligned"
  | "Moderately different"
  | "Needs attention";

export type PortfolioHoldingAlignment =
  | "On target"
  | "Overweight"
  | "Underweight";

const meaningfulAllocationDifference = 5;

export function getPortfolioHoldingAlignment(
  difference: number,
): PortfolioHoldingAlignment {
  if (difference > meaningfulAllocationDifference) {
    return "Overweight";
  }

  if (difference < -meaningfulAllocationDifference) {
    return "Underweight";
  }

  return "On target";
}

export function getMeaningfulAllocationGaps(
  comparisons: PortfolioComparison[],
): PortfolioComparison[] {
  return comparisons
    .filter(
      (comparison) =>
        Math.abs(comparison.difference) > meaningfulAllocationDifference,
    )
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
}

export function getPortfolioAlignmentStatus(
  comparisons: PortfolioComparison[],
): PortfolioAlignmentStatus {
  if (comparisons.length === 0) {
    return "Well aligned";
  }

  const largestDifference = Math.max(
    ...comparisons.map((comparison) =>
      Math.abs(comparison.difference),
    ),
  );

  if (largestDifference <= meaningfulAllocationDifference) {
    return "Well aligned";
  }

  if (largestDifference <= 15) {
    return "Moderately different";
  }

  return "Needs attention";
}

function describeAllocation(
  comparisons: PortfolioComparison[],
  description: (comparison: PortfolioComparison) => string,
): string {
  return comparisons.slice(0, 2).map(description).join(" and ");
}

export function getPortfolioAlignmentInterpretation(
  comparisons: PortfolioComparison[],
): string {
  const missingHoldings = comparisons.filter(
    (comparison) =>
      comparison.actual_allocation === 0 &&
      comparison.target_allocation > meaningfulAllocationDifference,
  );

  const overAllocated = comparisons
    .filter(
      (comparison) =>
        comparison.difference > meaningfulAllocationDifference &&
        !missingHoldings.includes(comparison),
    )
    .sort((a, b) => b.difference - a.difference);

  const underAllocated = comparisons
    .filter(
      (comparison) =>
        comparison.difference < -meaningfulAllocationDifference &&
        !missingHoldings.includes(comparison),
    )
    .sort((a, b) => a.difference - b.difference);

  const interpretation: string[] = [];

  if (overAllocated.length > 0) {
    interpretation.push(
      `Your portfolio is more heavily weighted toward ${describeAllocation(
        overAllocated,
        (comparison) =>
          `${comparison.ticker} (${comparison.difference.toFixed(1)}% above target)`,
      )}.`,
    );
  }

  if (underAllocated.length > 0) {
    interpretation.push(
      `It has less in ${describeAllocation(
        underAllocated,
        (comparison) =>
          `${comparison.ticker} (${Math.abs(comparison.difference).toFixed(1)}% below target)`,
      )}.`,
    );
  }

  if (missingHoldings.length > 0) {
    interpretation.push(
      `It does not currently include ${describeAllocation(
        missingHoldings,
        (comparison) =>
          `${comparison.ticker} (${comparison.target_allocation.toFixed(1)}% target)`,
      )}.`,
    );
  }

  if (interpretation.length === 0) {
    return "Your current allocations are close to Arbor's target.";
  }

  return interpretation.join(" ");
}
