import type { Holding } from "@/lib/api";
import type { PortfolioHolding } from "@/lib/types/plan";
import { normalizeCurrency, normalizeTicker } from "../currency";

export type CalculatedHolding = Holding & {
  cost_basis: number;
  allocation: number | null;
};

export type PortfolioSummary = {
  holdings: CalculatedHolding[];
  positions: CalculatedHolding[];
  total_cost_basis: number | null;
  currency: string | null;
  available: boolean;
  status: "empty" | "available" | "zero_basis" | "mixed_currency" | "invalid_currency" | "invalid_holding";
  reason: string | null;
};

export function calculatePortfolioSummary(
  holdings: Holding[],
): PortfolioSummary {
  const holdingsWithValues = holdings.map((holding) => ({
    ...holding,
    cost_basis: holding.quantity * holding.average_cost,
  }));

  const currencies = new Set(holdings.map(h => normalizeCurrency(h.currency)));
  const currency = currencies.size === 1 ? [...currencies][0] : null;
  const totalCostBasis = holdingsWithValues.reduce(
    (total, holding) => total + holding.cost_basis,
    0,
  );

  let status: PortfolioSummary["status"] = "available";
  let reason: string | null = null;
  if (!holdings.length) {
    status = "empty";
    reason = "Add holdings to calculate your recorded portfolio.";
  } else if (currencies.has(null)) {
    status = "invalid_currency";
    reason = "Correct missing or unsupported holding currencies to enable portfolio analysis.";
  } else if (currencies.size > 1) {
    status = "mixed_currency";
    reason = "Portfolio analysis is unavailable for mixed currencies. Arbor does not convert currencies.";
  } else if (!Number.isFinite(totalCostBasis) || holdings.some(h =>
    !normalizeTicker(h.ticker) || !Number.isFinite(h.quantity) || h.quantity < 0 ||
    !Number.isFinite(h.average_cost) || h.average_cost < 0
  )) {
    status = "invalid_holding";
    reason = "Correct invalid holding quantities, costs or tickers to enable analysis.";
  } else if (totalCostBasis === 0) {
    status = "zero_basis";
    reason = "Allocation analysis requires a positive recorded cost basis.";
  }
  const available = status === "available";
  const calculatedHoldings = holdingsWithValues.map((holding) => ({
    ...holding,
    allocation:
      available
        ? (holding.cost_basis / totalCostBasis) * 100
        : null,
  }));

  const positions = new Map<string, CalculatedHolding>();
  if (available) for (const holding of calculatedHoldings) {
    const ticker = normalizeTicker(holding.ticker);
    const existing = positions.get(ticker);
    const cost_basis = (existing?.cost_basis ?? 0) + holding.cost_basis;
    positions.set(ticker, { ...holding, ticker, cost_basis, allocation: cost_basis / totalCostBasis * 100 });
  }

  return {
    holdings: calculatedHoldings,
    positions: [...positions.values()],
    total_cost_basis: available || status === "zero_basis" ? totalCostBasis : null,
    available, status, reason, currency,
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
  if (actualHoldings.some(h => h.allocation === null)) return [];
  return recommendedPortfolio.map((target) => {
    const actualAllocation = actualHoldings.filter(h => normalizeTicker(h.ticker) === normalizeTicker(target.ticker))
      .reduce((sum, h) => sum + (h.allocation ?? 0), 0);
    const targetAllocation = target.allocation;

    return {
      ticker: normalizeTicker(target.ticker),
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
          `${comparison.ticker} (${comparison.difference.toFixed(1)} percentage points above target)`,
      )}.`,
    );
  }

  if (underAllocated.length > 0) {
    interpretation.push(
      `It has less in ${describeAllocation(
        underAllocated,
        (comparison) =>
          `${comparison.ticker} (${Math.abs(comparison.difference).toFixed(1)} percentage points below target)`,
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
