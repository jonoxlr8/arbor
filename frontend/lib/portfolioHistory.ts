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
export function historyRange(history: PortfolioHistory[], days = 0, today = new Date().toISOString().slice(0, 10)) {
  const sorted = [...history].sort((a, b) => a.day.localeCompare(b.day));
  const end = Date.parse(`${today}T00:00:00Z`);
  const start = new Date(end);
  if (days === 1826) start.setUTCFullYear(start.getUTCFullYear() - 5);
  return sorted.filter(p => !days || Date.parse(`${p.day}T00:00:00Z`) >= (days === 1826 ? start.getTime() : end - (days - 1) * 86400000) && p.day <= today);
}
export type ChartCurrency = "PHP" | "USD";
export const historyValue = (point: PortfolioHistory, currency: ChartCurrency) => currency === "PHP" ? point.value_php : point.value_usd ?? null;
// A missing historical FX observation breaks the USD series. Never bridge the gap.
export function supportedHistorySegment(points: PortfolioHistory[], currency: ChartCurrency) {
  if (currency === "PHP") return points;
  const lastMissing = points.findLastIndex(point => point.value_usd == null);
  return points.slice(lastMissing + 1);
}
function valueChange(firstPoint: PortfolioHistory, lastPoint: PortfolioHistory, currency: ChartCurrency) {
  const firstValue = historyValue(firstPoint, currency), lastValue = historyValue(lastPoint, currency);
  if (firstValue === null || lastValue === null) return null;
  const first = cents(firstValue), latest = cents(lastValue);
  if (first === null || latest === null) return null;
  const change = latest - first;
  // Round only the displayed percentage to two decimals (half-up). Never a return.
  const magnitude = change < BigInt(0) ? -change : change;
  const ratio = first ? (magnitude * BigInt(20000) + first) / (BigInt(2) * first) : null;
  return { amount: decimal(change), percentage: ratio === null ? null : decimal(change < BigInt(0) ? -ratio : ratio), direction: change < BigInt(0) ? "down" : change > BigInt(0) ? "up" : "flat", first: firstPoint, latest: lastPoint };
}
export function portfolioValueChange(points: PortfolioHistory[], currency: ChartCurrency = "PHP") {
  return points.length < 2 ? null : valueChange(points[0], points[points.length - 1], currency);
}
export function portfolioValueChangeFromStart(points: PortfolioHistory[], index: number, currency: ChartCurrency = "PHP") {
  return points.length && points[index] ? valueChange(points[0], points[index], currency) : null;
}
export function historyExtrema(points: PortfolioHistory[], currency: ChartCurrency = "PHP") {
  if (points.length < 2) return null;
  let high = points[0], low = points[0];
  for (const point of points.slice(1)) {
    const value = historyValue(point, currency), highest = historyValue(high, currency), lowest = historyValue(low, currency);
    if (value === null || highest === null || lowest === null) return null;
    if (cents(value)! > cents(highest)!) high = point;
    if (cents(value)! < cents(lowest)!) low = point;
  }
  return { high, low };
}
export const valueChangeDisclosure = "Change in recorded portfolio value over this period. Contributions and holding changes are included. This is not an investment return.";
