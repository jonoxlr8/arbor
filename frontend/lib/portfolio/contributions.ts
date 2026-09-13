import type { Holding } from "@/lib/api";
import type { PortfolioHolding } from "@/lib/types/plan";
import { calculatePortfolioSummary } from "./calculations";

export type ContributionAllocation = {
  ticker: string;
  target_allocation: number;
  contribution_amount: number;
  contribution_percentage: number;
  resulting_cost_basis: number;
  resulting_allocation: number;
};

export type ContributionPreview =
  | { available: false; reason: string; currency: string | null }
  | {
      available: true;
      currency: string;
      basis: "cost_basis";
      contribution: number;
      new_total_cost_basis: number;
      allocations: ContributionAllocation[];
    };

/** Preview a contribution without changing holdings or targets. */
export function allocateContribution(
  holdings: Holding[],
  targets: PortfolioHolding[],
  contribution: number,
): ContributionPreview {
  const summary = calculatePortfolioSummary(holdings);
  const currency = summary.currency;
  const unavailable = (reason: string): ContributionPreview => ({
    available: false, reason, currency,
  });

  if (!summary.available || !currency || summary.total_cost_basis === null) return unavailable(summary.reason ?? "Portfolio analysis is unavailable.");
  if (!Number.isFinite(contribution) || contribution <= 0) {
    return unavailable("Enter a contribution greater than zero.");
  }

  // The initial preview supports amounts in hundredths of the portfolio currency.
  const contributionCents = Math.round(contribution * 100);
  if (
    !Number.isSafeInteger(contributionCents) ||
    contributionCents <= 0 ||
    Math.abs(contribution * 100 - contributionCents) > 0.000001
  ) {
    return unavailable("Enter a contribution with at most two decimal places and a smaller amount if needed.");
  }
  const newTotal = summary.total_cost_basis + contribution;
  if (!Number.isFinite(newTotal)) {
    return unavailable("The portfolio amounts are too large to calculate a preview.");
  }

  const normalizedTargets = targets.map((target) => ({
    ...target, ticker: target.ticker.trim().toUpperCase(),
  }));
  const targetTotal = targets.reduce((sum, target) => sum + target.allocation, 0);
  if (
    targets.length === 0 ||
    normalizedTargets.some((target) => !target.ticker ||
      !Number.isFinite(target.allocation) || target.allocation < 0 || target.allocation > 100) ||
    new Set(normalizedTargets.map((target) => target.ticker)).size !== targets.length ||
    Math.abs(targetTotal - 100) > 0.01
  ) {
    return unavailable("Arbor targets must be valid, unique holdings totaling approximately 100%.");
  }

  const costByTicker = new Map<string, number>();
  for (const holding of summary.positions) {
    const ticker = holding.ticker.trim().toUpperCase();
    costByTicker.set(ticker, holding.cost_basis);
  }
  // Normalize tiny target-total rounding discrepancies, without modifying targets.
  const gaps = normalizedTargets.map((target) => {
    const existingCost = costByTicker.get(target.ticker) ?? 0;
    return {
      target,
      existingCost,
      shortfall: Math.max(0, (target.allocation / targetTotal) * newTotal - existingCost),
    };
  });
  const totalShortfall = gaps.reduce((sum, gap) => sum + gap.shortfall, 0);
  if (!Number.isFinite(totalShortfall) || totalShortfall <= 0) {
    return unavailable("No positive target shortfalls are available for this preview.");
  }

  const portions = gaps.map((gap, index) => {
    const exactCents = contributionCents * (gap.shortfall / totalShortfall);
    return { ...gap, index, cents: Math.floor(exactCents), remainder: exactCents % 1 };
  });
  // Largest fractional remainder first; target order breaks ties deterministically.
  const remainderOrder = [...portions].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index,
  );
  const remainingCents = contributionCents - portions.reduce((sum, row) => sum + row.cents, 0);
  for (let index = 0; index < remainingCents; index++) {
    remainderOrder[index].cents += 1;
  }

  return {
    available: true,
    currency,
    basis: "cost_basis",
    contribution: contributionCents / 100,
    new_total_cost_basis: newTotal,
    allocations: portions.filter((row) => row.cents > 0).map((row) => {
      const amount = row.cents / 100;
      return {
        ticker: row.target.ticker,
        target_allocation: row.target.allocation,
        contribution_amount: amount,
        contribution_percentage: (row.cents / contributionCents) * 100,
        resulting_cost_basis: row.existingCost + amount,
        resulting_allocation: ((row.existingCost + amount) / newTotal) * 100,
      };
    }),
  };
}
