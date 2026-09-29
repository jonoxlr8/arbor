"use client";
import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { AreaChart, Area, ReferenceDot, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { formatContributionMoney, formatUsdQuote } from "@/lib/contributions";
import type { PortfolioHistory } from "@/lib/livePortfolio";
import { historyExtrema, historyRange, historyValue, supportedHistorySegment, type ChartCurrency } from "@/lib/portfolioHistory";
import { portfolioGraphState } from "@/lib/portfolioGraphState";

const ranges = [[1, "1D"], [7, "1W"], [30, "1M"], [365, "1Y"], [1826, "5Y"], [0, "All"]] as const;
const plotTop = 16, plotBottom = 8;
const money = (value: string, currency: ChartCurrency) => currency === "USD" ? formatUsdQuote(value) : formatContributionMoney(value, "PHP");
const dateLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-PH", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
});
const signedGain = (amount: string) => {
  const negative = amount.startsWith("-"), zero = /^-?0(?:\.0+)?$/.test(amount);
  return `${zero ? "" : negative ? "−" : "+"}${money(negative ? amount.slice(1) : amount, "PHP")}`;
};
const signedPercent = (percent: string | null) => percent === null ? "—" :
  /^-?0(?:\.0+)?$/.test(percent) ? "0%" : `${percent.startsWith("-") ? "−" : "+"}${Math.abs(Number(percent)).toFixed(2)}%`;

type GainTone = "positive" | "negative" | "zero" | "unknown";
type GainDisplay = { amount: string; percentage: string | null; text: string; tone: GainTone };
const unavailableGain = (message: string): GainDisplay => ({ amount: message, percentage: null, text: message, tone: "unknown" });
const displayedGain = (gain: string, pct: string | null | undefined): GainDisplay => {
  const tone = /^-?0(?:\.0+)?$/.test(gain) ? "zero" : gain.startsWith("-") ? "negative" : "positive";
  const amount = signedGain(gain), percentage = pct == null ? null : signedPercent(pct);
  return { amount, percentage, text: `${amount}${percentage ? ` · ${percentage}` : ""}`, tone };
};
export function historicalGainDisplay(point: PortfolioHistory) {
  if (!point.cost_context_captured) return unavailableGain("Gain/loss unavailable");
  if (!point.cost_complete || point.recorded_cost_php == null || point.recorded_gain_php == null)
    return unavailableGain("Recorded cost needed");
  return displayedGain(point.recorded_gain_php, point.recorded_gain_percentage);
}

type Props = { history: PortfolioHistory[]; knownValue?: string; currentUsdValue?: string | null;
  complete?: boolean; holdingsCount?: number; compact?: boolean;
  currentRecordedCostPhp?: string | null; currentGainPhp?: string | null; currentGainPercentage?: string | null };
export default function PortfolioHistoryChart({ history, knownValue = "0", currentUsdValue = null,
  complete = true, holdingsCount = history.length, compact = false,
  currentRecordedCostPhp = null, currentGainPhp = null, currentGainPercentage = null }: Props) {
  const gradient = useId(), section = useRef<HTMLElement>(null), plot = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; active: boolean; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const [range, setRange] = useState<number>(30), [currencyPreference, setCurrency] = useState<ChartCurrency>("PHP");
  const currency = currencyPreference === "USD" && complete && currentUsdValue != null ? "USD" : "PHP";
  const [selected, setSelected] = useState<number | null>(null);
  const state = portfolioGraphState({ history, knownValue, complete, holdingsCount });
  const allRangePoints = historyRange(state.history, range);
  const points = supportedHistorySegment(allRangePoints, currency);
  const partialUsd = currency === "USD" && allRangePoints.length > points.length;
  const inspectable = complete && points.length > 0;
  const extrema = historyExtrema(points, currency);
  const plotted = points.map(point => ({ timestamp: Date.parse(`${point.day}T00:00:00Z`), plotValue: Number(historyValue(point, currency)) }));
  const active = selected === null ? null : points[selected] ?? null;
  const currentGain = !holdingsCount ? null : !complete ? unavailableGain("Gain/loss unavailable") :
    currentRecordedCostPhp == null ? unavailableGain("Recorded cost needed") :
    currentGainPhp == null ? unavailableGain("Gain/loss unavailable") : displayedGain(currentGainPhp, currentGainPercentage);
  const selectedGain = active ? historicalGainDisplay(active) : currentGain;
  // Keep the graph's current accounting color stable while inspecting; only the
  // selected marker and headline adopt a historical point's gain/loss tone.
  const graphTone = currentGain?.tone ?? "unknown";
  const highValue = extrema ? Number(historyValue(extrema.high, currency)) : 0;
  const lowValue = extrema ? Number(historyValue(extrema.low, currency)) : 0;
  const spread = highValue - lowValue;
  // A minimum visual span keeps tiny genuine movements from looking dramatic.
  // This scale is also used for the high/low guide positions below.
  const minimumSpan = Math.max(100, Math.abs(highValue) * 0.08);
  const pad = Math.max(spread * 0.12, (minimumSpan - spread) / 2, 0);
  const domainMin = lowValue - pad, domainMax = highValue + pad;
  const guidePosition = (value: number) => `calc(${plotTop}px + (100% - ${plotTop + plotBottom}px) * ${(domainMax - value) / (domainMax - domainMin)})`;
  const showLow = spread > 0 && spread / (domainMax - domainMin) >= (compact ? 0.19 : 0.14);
  const displayedValue = active ? historyValue(active, currency) : currency === "USD" ? currentUsdValue : knownValue;

  useEffect(() => {
    const dismiss = (event: globalThis.PointerEvent) => {
      if (!section.current?.contains(event.target as Node)) setSelected(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      if (touch.current?.timer) clearTimeout(touch.current.timer);
    };
  }, []);
  const nearest = (clientX: number) => {
    if (!plot.current || !points.length) return;
    const rect = plot.current.getBoundingClientRect();
    const left = rect.left + 8, width = Math.max(1, rect.width - 16);
    const position = Math.max(0, Math.min(1, (clientX - left) / width));
    const first = plotted[0].timestamp, last = plotted[plotted.length - 1].timestamp;
    const target = first + (last - first) * position;
    let index = 0;
    for (let i = 1; i < plotted.length; i++)
      if (Math.abs(plotted[i].timestamp - target) < Math.abs(plotted[index].timestamp - target)) index = i;
    setSelected(index);
  };
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!inspectable || event.pointerType === "mouse") return;
    const target = event.currentTarget, pointerId = event.pointerId;
    const start = { x: event.clientX, y: event.clientY, active: false, timer: null as ReturnType<typeof setTimeout> | null };
    start.timer = setTimeout(() => { start.active = true; nearest(start.x);
      try { target.setPointerCapture(pointerId); } catch { /* cancelled touch */ }
    }, 350);
    touch.current = start;
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!inspectable) return;
    if (event.pointerType === "mouse") { nearest(event.clientX); return; }
    const gesture = touch.current;
    if (!gesture) return;
    if (!gesture.active && Math.abs(event.clientY - gesture.y) > 10 && gesture.timer) {
      clearTimeout(gesture.timer); gesture.timer = null;
    }
    if (gesture.active) nearest(event.clientX);
  };
  const pointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = touch.current;
    if (!gesture) return;
    if (gesture.timer) clearTimeout(gesture.timer);
    if (!gesture.active && Math.abs(event.clientX - gesture.x) < 10 && Math.abs(event.clientY - gesture.y) < 10)
      nearest(event.clientX);
    touch.current = null;
  };
  const changeRange = (days: number) => { setRange(days); setSelected(null); };
  const changeCurrency = (next: ChartCurrency) => { if (next === "PHP" || currentUsdValue != null && complete) {
    setCurrency(next); setSelected(null);
  } };
  const status = !complete ? state.summary : state.kind === "empty_zero" || state.kind === "current_only" ? null :
    !points.length ? currency === "USD" && partialUsd ? "Historical USD values need a captured exchange rate. PHP history remains available." :
      "No recorded portfolio value in this range. Current value is shown without a historical trend." :
    points.length === 1 ? "Not enough history in this range yet." : null;

  return <section ref={section} aria-label="Portfolio value graph" className={`portfolio-chart min-w-0${compact ? " compact-chart" : ""}`} data-gain={graphTone} data-currency={currency}>
    {!complete && <span className="chart-known-label">Known portfolio value</span>}
    <div className="chart-headline" id={`${gradient}-headline`} aria-live="polite" aria-atomic="true">
      <div className="chart-value-line"><strong className="chart-value value-number">{displayedValue === null ? "USD value unavailable" : money(displayedValue, currency)}</strong>
        <button type="button" className="chart-currency" aria-label={`Switch portfolio display to ${currency === "PHP" ? "USD" : "PHP"}`}
          disabled={currency === "PHP" && (!complete || currentUsdValue == null)}
          title={currency === "PHP" && (!complete || currentUsdValue == null) ? "USD view needs a complete portfolio and a valid USD/PHP rate" : undefined}
          onClick={() => changeCurrency(currency === "PHP" ? "USD" : "PHP")}>{currency} <span aria-hidden="true">⇄</span></button>
      </div>
      {selectedGain && <div className="chart-gain" data-gain={selectedGain.tone} aria-label={`Gain/loss against recorded PHP cost: ${selectedGain.text}`}>
        <span className="sr-only">Gain/loss against recorded cost</span><span>{selectedGain.amount}</span>
        {selectedGain.percentage && <strong>{selectedGain.percentage}</strong>}
        {currency === "USD" && <span className="chart-gain-currency" aria-hidden="true">PHP gain</span>}
      </div>}
      <div className="chart-selected-date" data-selected={active ? "true" : "false"} aria-hidden={!active}>
        {active ? <time dateTime={active.day}>{dateLabel(active.day)}</time> : "\u00a0"}
      </div>
    </div>
    {status && <p className="chart-status" role="status">{status}</p>}
    {partialUsd && !!points.length && <p className="chart-usd-limitation" role="status">USD history from {dateLabel(points[0].day)}<span className="sr-only">. Older PHP observations have no captured exchange rate and are not converted using today&apos;s rate.</span></p>}
    <div ref={plot} className="chart-plot min-w-0" tabIndex={inspectable ? 0 : undefined} role={inspectable ? "group" : undefined}
      aria-label={inspectable ? `Inspect ${points.length} genuine portfolio observations. Use left and right arrow keys.` : undefined}
      aria-describedby={active ? `${gradient}-headline` : undefined}
      onKeyDown={event => { if (!inspectable) return; if (event.key === "Escape") setSelected(null);
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); setSelected(Math.max(0, Math.min(points.length - 1, (selected ?? (event.key === "ArrowRight" ? -1 : points.length)) + (event.key === "ArrowRight" ? 1 : -1)))); } }}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { if (touch.current?.timer) clearTimeout(touch.current.timer); touch.current = null; }}
      onPointerLeave={event => { if (event.pointerType === "mouse") setSelected(null); }}>
      {!complete || state.kind === "empty_zero" || points.length === 0 ? <div className={`chart-no-history chart-no-history-${state.kind}`}><span className="chart-no-history-marker"/><span>{state.kind === "empty_zero" ? "No investments recorded yet. No portfolio history yet." : !complete ? "Complete portfolio value unavailable" : state.kind === "current_only" ? "Current value · No history yet" : "Current value · No history in this range"}</span></div> :
      points.length === 1 ? <div className="chart-single-observation"><span className="chart-single-dot" aria-hidden="true"/><time dateTime={points[0].day}>{dateLabel(points[0].day)}</time></div> :
      <><ResponsiveContainer width="100%" height="100%"><AreaChart data={plotted} margin={{ left: 8, right: 8, top: plotTop, bottom: plotBottom }}>
        <defs><linearGradient id={`${gradient}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity={0.18}/><stop offset="100%" stopColor="currentColor" stopOpacity={0.01}/></linearGradient></defs>
        <XAxis type="number" scale="time" domain={[plotted[0].timestamp, plotted[plotted.length - 1].timestamp]} dataKey="timestamp" hide />
        <YAxis type="number" domain={[domainMin, domainMax]} allowDataOverflow hide width={0}/>
        <Area type="monotone" fill={`url(#${gradient}-fill)`} dataKey="plotValue" stroke="currentColor" strokeWidth={2.5} dot={false} isAnimationActive={false}/>
        {active && <><ReferenceLine x={plotted[selected!].timestamp} stroke="var(--v3-muted)" strokeOpacity={0.8} strokeWidth={1.5}/>
          <ReferenceDot x={plotted[selected!].timestamp} y={plotted[selected!].plotValue} r={6}
            fill={`var(--chart-${selectedGain?.tone ?? "unknown"})`} stroke="var(--surface)" strokeWidth={2}/></>}
      </AreaChart></ResponsiveContainer>
      {extrema && !active && <div className="chart-extrema" aria-label={`Range high ${money(historyValue(extrema.high,currency)!,currency)}${showLow ? `; low ${money(historyValue(extrema.low,currency)!,currency)}` : ""}`}>
        <span className="chart-extreme-high" style={{ top: guidePosition(highValue) }}><span className="chart-extreme-text">{money(historyValue(extrema.high,currency)!,currency)}</span></span>
        {showLow && <span className="chart-extreme-low" style={{ top: guidePosition(lowValue) }}><span className="chart-extreme-text">{money(historyValue(extrema.low,currency)!,currency)}</span></span>}
      </div>}</>}
    </div>
    <div className="chart-range" role="group" aria-label="History range">{ranges.map(([days, label]) =>
      <button type="button" key={label} aria-pressed={range === days} aria-label={`${label} portfolio history`} onClick={() => changeRange(days)}>{label}</button>)}</div>
  </section>;
}
