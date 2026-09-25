import type { PortfolioHistory } from "./livePortfolio";

// Snapshot values are PHP cents. Keep money and ratios out of binary floating point.
function cents(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match || /[1-9]/.test((match[2] ?? "").slice(2))) return null;
  return BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0").slice(0, 2));
}
function decimal(value: bigint) {
  const absolute = value < BigInt(0) ? -value : value;
  return `${value < BigInt(0) ? "-" : ""}${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, "0")}`;
}
export function historyRange(history: PortfolioHistory[], days = 0) {
  const sorted = [...history].sort((a, b) => a.day.localeCompare(b.day));
  const newest = sorted.length ? Date.parse(sorted[sorted.length - 1].day) : 0;
  return sorted.filter(p => !days || Date.parse(p.day) >= newest - days * 86400000);
}
export function portfolioValueChange(points: PortfolioHistory[]) {
  if (points.length < 2) return null;
  const first = cents(points[0].value_php), latest = cents(points[points.length - 1].value_php);
  if (first === null || latest === null) return null;
  const change = latest - first;
  // Round only the displayed percentage to two decimals (half-up). Never a return.
  const magnitude = change < BigInt(0) ? -change : change;
  const ratio = first ? (magnitude * BigInt(20000) + first) / (BigInt(2) * first) : null;
  return { amount: decimal(change), percentage: ratio === null ? null : decimal(change < BigInt(0) ? -ratio : ratio), direction: change < BigInt(0) ? "down" : change > BigInt(0) ? "up" : "flat", first: points[0], latest: points[points.length - 1] };
}
export const valueChangeDisclosure = "Change in recorded portfolio value over this period. Contributions and holding changes are included. This is not an investment return.";
