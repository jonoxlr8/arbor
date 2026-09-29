import type { PortfolioProduct, InvestmentEntry } from "./livePortfolio";
import type { MonthlyPlan } from "./monthlyPlan";

/** Plan rows are navigation context only. No planned amount enters an investment draft. */
export function recordingRows(plan: MonthlyPlan | null, catalog: PortfolioProduct[]) {
  return (plan?.rows ?? []).filter(row => /^\d+(?:\.\d+)?$/.test(row.amount) && /[1-9]/.test(row.amount))
    .map(row => ({ sleeve: row.sleeve, plannedAmount: row.amount,
      product: catalog.find(item => item.product_id === row.product_id && item.provider === row.provider_id) ?? null }));
}

export function investmentAction(entry: InvestmentEntry) {
  return entry.voided_at ? "Deleted" : entry.revision > 1 ? "Corrected" : "Recorded";
}
