import type { PortfolioHolding } from "./livePortfolio";
import type { MonthlyState } from "./monthlyCheckin";
import { investmentIdentity, providerName } from "./investmentIdentity";

export function recentPortfolioActivity(holdings: PortfolioHolding[], monthly: MonthlyState | null) {
  const events = holdings.flatMap(h => {
    const created = h.created_at ? Date.parse(h.created_at) : NaN;
    const updated = Date.parse(h.updated_at);
    const manual = h.manual_value_updated_at ? Date.parse(h.manual_value_updated_at) : NaN;
    const at = Math.max(Number.isFinite(created) ? created : 0, updated || 0, manual || 0);
    if (!at) return [];
    const action = manual === at && manual > created ? "Value updated" : created === at ? "Added" : "Updated";
    return [{ key:`holding:${h.id}`, at, title:`${action} ${investmentIdentity(h.product_id,h.display_name).shortName}`, detail:providerName(h.provider), amount:null as string | null }];
  });
  for (const row of monthly?.history ?? []) events.push({key:`monthly:${row.month}`,at:Date.parse(row.undone_at ?? row.completed_at),title:row.undone_at ? "Contribution undone" : "Contribution recorded",detail:"Monthly check-in",amount:row.amount_php});
  return events.sort((a,b)=>b.at-a.at).slice(0,4);
}

// A check-in is not a transaction. Only show a follow-up, never mutate holdings.
export function holdingsUpdatedAfter(holdings: PortfolioHolding[], completedAt: string) {
  return holdings.some(h => Date.parse(h.updated_at) > Date.parse(completedAt));
}
