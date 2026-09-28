import type { InvestmentEntry } from "./livePortfolio";

/** Dates and costs come only from the active ledger, never from current prices. */
export function datedActivity(entries: InvestmentEntry[]) {
  const days = new Map<string, { day: string; count: number; knownCost: bigint; unknownCount: number }>();
  for (const entry of new Map(entries.map(e => [e.id, e])).values()) {
    if (entry.voided_at) continue;
    const row = days.get(entry.investment_date) ?? { day: entry.investment_date, count: 0, knownCost: BigInt(0), unknownCount: 0 };
    row.count++;
    if (entry.amount_paid_php === null) row.unknownCount++;
    else {
      const [whole, fraction = ""] = entry.amount_paid_php.split(".");
      row.knownCost += BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0").slice(0, 2));
    }
    days.set(row.day, row);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day)).map(row => ({
    day: row.day, count: row.count, unknownCount: row.unknownCount,
    knownCost: `${row.knownCost / BigInt(100)}.${String(row.knownCost % BigInt(100)).padStart(2, "0")}`,
  }));
}
