import type { PortfolioHistory } from "./livePortfolio";

// History values are PHP cents. Keep money and ratios out of binary floating point.
function cents(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match || /[1-9]/.test((match[2] ?? "").slice(2))) return null;
  return BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0").slice(0, 2));
}
function decimal(value: bigint) {
  const absolute = value < BigInt(0) ? -value : value;
  return `${value < BigInt(0) ? "-" : ""}${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, "0")}`;
}
export function historyRangeStart(days: number, today = new Date().toISOString().slice(0, 10)) {
  const end = Date.parse(`${today}T00:00:00Z`);
  const start = new Date(end);
  if (days === 1826) start.setUTCFullYear(start.getUTCFullYear() - 5);
  return days === 1826 ? start.toISOString().slice(0, 10) : new Date(end - (days - 1) * 86400000).toISOString().slice(0, 10);
}
export function historyRange(history: PortfolioHistory[], days = 0, today = new Date().toISOString().slice(0, 10)) {
  const sorted = [...history].sort((a, b) => a.day.localeCompare(b.day));
  const start = days ? historyRangeStart(days, today) : null;
  return sorted.filter(p => start === null || (p.day >= start && p.day <= today));
}
export type ChartCurrency = "PHP" | "USD";
export const historyValue = (point: PortfolioHistory, currency: ChartCurrency) => currency === "PHP" ? point.value_php : point.value_usd ?? null;
// Both charts draw/inspect only genuine supported observations. The step curve
// handles visual hold-forward; it never creates an intermediate value.
export function supportedHistoryPoints(points: PortfolioHistory[], currency: ChartCurrency) {
  return currency === "PHP" ? points : points.filter(point => point.value_usd != null);
}
// Display coordinates only. Boundary holds are never history or gain inputs.
export function historyChartSeries(history: PortfolioHistory[], days: number, currency: ChartCurrency,
  today = new Date().toISOString().slice(0, 10), currentValue?: string | null) {
  const supported = supportedHistoryPoints(historyRange(history, 0, today), currency);
  const start = days ? historyRangeStart(days, today) : supported[0]?.day;
  if (!start) return [];
  const prior = supported.findLast(point => point.day < start);
  const inside = supported.filter(point => point.day >= start);
  const coordinates = [
    ...(prior ? [{ day: start, value: historyValue(prior, currency)! }] : []),
    ...inside.map(point => ({ day: point.day, value: historyValue(point, currency)! })),
  ];
  if (coordinates.length && coordinates[coordinates.length - 1].day < today)
    coordinates.push({ day: today, value: currentValue ?? coordinates[coordinates.length - 1].value });
  return coordinates.map(point => ({ timestamp: Date.parse(`${point.day}T00:00:00Z`), plotValue: Number(point.value) }));
}
export type ChartInspection = { kind: "history"; day: string; value: string; point: PortfolioHistory }
  | { kind: "current"; day: string; value: string };
// An explicitly supplied current endpoint is selectable, but never a snapshot.
// Today's supported record already owns its coordinate: do not duplicate it.
export function chartInspectionPoints(history: PortfolioHistory[], days: number, currency: ChartCurrency,
  today = new Date().toISOString().slice(0, 10), currentValue?: string | null): ChartInspection[] {
  const points: ChartInspection[] = supportedHistoryPoints(historyRange(history, days, today), currency)
    .map(point => ({ kind: "history", day: point.day, value: historyValue(point, currency)!, point }));
  const plotted = historyChartSeries(history, days, currency, today, currentValue);
  const end = plotted.at(-1);
  if (currentValue != null && /^\d+(?:\.\d+)?$/.test(currentValue) && Number.isFinite(Number(currentValue)) &&
    end?.timestamp === Date.parse(`${today}T00:00:00Z`) && end.plotValue === Number(currentValue) &&
    !points.some(point => point.day === today)) {
    points.push({ kind: "current", day: today, value: currentValue });
  }
  return points;
}
export function historicalRecordedGain(point: PortfolioHistory): string | null {
  return (point.origin === "reconstructed" || point.cost_context_captured) && point.cost_complete &&
    point.recorded_cost_php != null && point.recorded_gain_php != null ? point.recorded_gain_php : null;
}
function subtractDecimal(end: string, baseline: string): string | null {
  const pattern = /^(-?)(\d+)(?:\.(\d+))?$/;
  const left = pattern.exec(end), right = pattern.exec(baseline);
  if (!left || !right) return null;
  const scale = Math.max(left[3]?.length ?? 0, right[3]?.length ?? 0, 2);
  const units = (parts: RegExpExecArray) => (parts[1] ? -BigInt(1) : BigInt(1)) *
    (BigInt(parts[2]) * BigInt(10) ** BigInt(scale) + BigInt((parts[3] ?? "").padEnd(scale, "0")));
  const difference = units(left) - units(right);
  const absolute = difference < BigInt(0) ? -difference : difference;
  const fraction = String(absolute % BigInt(10) ** BigInt(scale)).padStart(scale, "0").replace(/0+$/, "");
  return `${difference < BigInt(0) ? "-" : ""}${absolute / BigInt(10) ** BigInt(scale)}${fraction ? `.${fraction}` : ""}`;
}
export function portfolioPeriodGain(input: { history: PortfolioHistory[]; days: number;
  currentGainPhp: string | null; currentComplete: boolean; selected?: PortfolioHistory | null; today?: string }): string | null {
  const { history, days, currentGainPhp, currentComplete, selected = null,
    today = new Date().toISOString().slice(0, 10) } = input;
  const endGain = selected ? historicalRecordedGain(selected) : currentComplete ? currentGainPhp : null;
  if (endGain === null) return null;
  if (days === 0) return endGain;
  const boundary = historyRangeStart(days, today);
  // PHP recorded gain is independent of the chart's display currency. A PHP-only
  // point can be the accounting baseline even when its USD value is unavailable.
  const baseline = historyRange(history, 0, today)
    .findLast(point => point.day < boundary && historicalRecordedGain(point) !== null);
  const baselineGain = baseline ? historicalRecordedGain(baseline) : null;
  return baselineGain === null ? null : subtractDecimal(endGain, baselineGain);
}
export function portfolioGainForDisplay(input: Parameters<typeof portfolioPeriodGain>[0]) {
  const period = portfolioPeriodGain(input);
  if (period !== null) return { amount: period, fallback: false };
  // Same canonical endpoint/cost context as All; never invent an inception date,
  // zero baseline, or today's gain beside an older selected value.
  const total = portfolioPeriodGain({ ...input, days: 0 });
  return { amount: total, fallback: total !== null };
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
