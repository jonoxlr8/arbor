import type { PortfolioHolding, InvestmentEntry } from "./livePortfolio";
import type { MonthlyState } from "./monthlyCheckin";
import { investmentIdentity, providerName } from "./investmentIdentity";
import { decimalText, formatContributionMoney } from "./contributions";

// The API pages active entries by investment date, recorded time, then ID.
export function datedInvestmentEntries(entries: InvestmentEntry[]) {
  return entries.filter(entry => !entry.voided_at).sort((a, b) =>
    b.investment_date.localeCompare(a.investment_date) ||
    b.recorded_at.localeCompare(a.recorded_at) || b.id.localeCompare(a.id));
}

export function investmentEntryUnits(entry: InvestmentEntry) {
  return `${decimalText(entry.units)} ${entry.product_id.endsWith("_btc") ? "BTC" : "units"}`;
}

export function investmentEntryCost(entry: InvestmentEntry) {
  return entry.amount_paid_php === null ? "Actual cost not recorded" : formatContributionMoney(entry.amount_paid_php, "PHP");
}

export function investmentEntryAction(entry: InvestmentEntry) {
  return entry.revision > 1 ? "Corrected" : "Added";
}

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

export function recentLedgerActivity(entries: InvestmentEntry[]) {
  return datedInvestmentEntries(entries).slice(0, 4).map(entry => {
    const label = investmentIdentity(entry.product_id).shortName;
    const action = investmentEntryAction(entry);
    return { key: `entry:${entry.id}`, date: entry.investment_date,
      title: `${action === "Added" ? "Added to" : action} ${label}`,
      detail: `${investmentEntryUnits(entry)} · ${investmentEntryCost(entry)} · ${providerName(entry.provider)}`,
      product_id: entry.product_id, provider: entry.provider };
  });
}

// A check-in is not a transaction. Only show a follow-up, never mutate holdings.
export function holdingsUpdatedAfter(holdings: PortfolioHolding[], completedAt: string) {
  return holdings.some(h => Date.parse(h.updated_at) > Date.parse(completedAt));
}
