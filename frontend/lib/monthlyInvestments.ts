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

/** Only exact supported, recordable planned pairs may scope the recording picker. */
export function plannedRecordingProducts(plan: MonthlyPlan | null, catalog: PortfolioProduct[]) {
  const products = recordingRows(plan, catalog).filter(row => row.product && row.product.sleeve === row.sleeve &&
    plan?.rows.some(source => source.sleeve === row.sleeve && (source.status === "ready" || source.status === "verify_minimum")));
  return products.flatMap(row => row.product ? [row.product] : [])
    .filter((product, index, all) => all.findIndex(other => other.product_id === product.product_id && other.provider === product.provider) === index);
}
