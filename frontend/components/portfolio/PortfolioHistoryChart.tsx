"use client";
import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { AreaChart, Area, ReferenceDot, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { formatContributionMoney, formatUsdQuote } from "@/lib/contributions";
import type { GainDisplayFx, PortfolioHistory } from "@/lib/livePortfolio";
import { currentGainFxRate, historicalGainFxRate, usdEquivalentOfPhpGain } from "@/lib/gainDisplayFx";
import GainInfo from "./GainInfo";
import { historicalEstimateSources } from "@/lib/historyEstimate";
import { historyChartSeries, historyExtrema, historyRange, historyRangeStart, historyValue, portfolioPeriodGain, supportedHistoryPoints, type ChartCurrency } from "@/lib/portfolioHistory";
import { portfolioGraphState } from "@/lib/portfolioGraphState";
import { roundedStepAfter } from "./roundedStepCurve";

const ranges = [[7, "1W"], [30, "1M"], [90, "3M"], [180, "6M"], [365, "1Y"], [1826, "5Y"], [0, "All"]] as const;
const rangeNames: Record<number, string> = { 7: "Past week", 30: "Past month", 90: "Past 3 months", 180: "Past 6 months", 365: "Past year", 1826: "Past 5 years", 0: "All time" };
const plotTop = 16, plotBottom = 8;
const money = (value: string, currency: ChartCurrency) => currency === "USD" ? formatUsdQuote(value) : formatContributionMoney(value, "PHP");
const dateLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-PH", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
});
const signedGain = (amount: string, currency: ChartCurrency = "PHP") => {
  const negative = amount.startsWith("-"), zero = /^-?0(?:\.0+)?$/.test(amount);
  return `${zero ? "" : negative ? "−" : "+"}${money(negative ? amount.slice(1) : amount, currency)}`;
};
const signedPercent = (percent: string | null) => percent === null ? "—" :
  /^-?0(?:\.0+)?$/.test(percent) ? "0%" : `${percent.startsWith("-") ? "−" : "+"}${Math.abs(Number(percent)).toFixed(2)}%`;

type GainTone = "positive" | "negative" | "zero" | "unknown";
type GainDisplay = { amount: string; percentage: string | null; text: string; tone: GainTone };
const unavailableGain = (message: string): GainDisplay => ({ amount: message, percentage: null, text: message, tone: "unknown" });
const displayedGain = (gain: string, pct: string | null | undefined, currency: ChartCurrency = "PHP"): GainDisplay => {
  const tone = /^-?0(?:\.0+)?$/.test(gain) ? "zero" : gain.startsWith("-") ? "negative" : "positive";
  const amount = signedGain(gain, currency), percentage = pct == null ? null : signedPercent(pct);
  return { amount, percentage, text: `${amount}${percentage ? ` · ${percentage}` : ""}`, tone };
};
export function historicalGainDisplay(point: PortfolioHistory) {
  if (point.origin !== "reconstructed" && !point.cost_context_captured) return unavailableGain("Gain/loss unavailable");
  if (!point.cost_complete || point.recorded_cost_php == null || point.recorded_gain_php == null)
    return unavailableGain("Recorded cost needed");
  return displayedGain(point.recorded_gain_php, point.recorded_gain_percentage);
}

type Props = { history: PortfolioHistory[]; knownValue?: string; currentUsdValue?: string | null;
  currentDisplayFx?: GainDisplayFx | null;
  complete?: boolean; holdingsCount?: number; compact?: boolean;
  currentRecordedCostPhp?: string | null; currentGainPhp?: string | null; currentGainPercentage?: string | null };
export default function PortfolioHistoryChart({ history, knownValue = "0", currentUsdValue = null,
  currentDisplayFx = null,
  complete = true, holdingsCount = history.length, compact = false,
  currentRecordedCostPhp = null, currentGainPhp = null, currentGainPercentage = null }: Props) {
  const gradient = useId(), section = useRef<HTMLElement>(null), plot = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; active: boolean; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const [range, setRange] = useState<number>(30), [currencyPreference, setCurrency] = useState<ChartCurrency>("PHP");
  const currency = currencyPreference === "USD" && complete && currentUsdValue != null ? "USD" : "PHP";
  const [selected, setSelected] = useState<number | null>(null);
  const state = portfolioGraphState({ history, knownValue, complete, holdingsCount });
  const allRangePoints = historyRange(state.history, range);
  const points = supportedHistoryPoints(allRangePoints, currency);
  const earliestRecorded = state.history.find(point => point.earliest_recorded_date)?.earliest_recorded_date;
  const coverageLimitation = range === 0 && earliestRecorded &&
    state.history[0]?.day > earliestRecorded ? `Complete history begins ${dateLabel(state.history[0].day)}. Earlier values are unavailable.` : null;
  const partialUsd = currency === "USD" && allRangePoints.length > points.length;
  const inspectable = complete && points.length > 0;
  const extrema = historyExtrema(points, currency);
  const plotted = historyChartSeries(state.history, range, currency, undefined,
    complete ? currency === "USD" ? currentUsdValue : knownValue : null);
  const axisStart = range ? Date.parse(`${historyRangeStart(range)}T00:00:00Z`) : plotted[0]?.timestamp ?? 0;
  const axisEnd = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const active = selected === null ? null : points[selected] ?? null;
  const estimateSources = active ? historicalEstimateSources(active) : [];
  const selectedPosition = active ? Math.max(0, Math.min(1,
    (Date.parse(`${active.day}T00:00:00Z`) - axisStart) / Math.max(1, axisEnd - axisStart))) : 0;
  const periodAmount = holdingsCount ? portfolioPeriodGain({ history: state.history, days: range,
    currentGainPhp, currentComplete: complete && currentRecordedCostPhp != null && currentGainPhp != null,
    selected: active }) : null;
  const displayPeriodAmount = currency === "USD" && periodAmount !== null ?
    usdEquivalentOfPhpGain(periodAmount, active ? historicalGainFxRate(active) : currentGainFxRate(currentDisplayFx)) : periodAmount;
  const selectedGain = !holdingsCount ? null :
    periodAmount === null ? unavailableGain("Period gain/loss unavailable") :
    displayPeriodAmount === null ? unavailableGain("USD gain equivalent unavailable") :
      displayedGain(displayPeriodAmount, range === 0 ? (active ? active.recorded_gain_percentage : currentGainPercentage) : null, currency);
  const idlePeriodAmount = portfolioPeriodGain({ history: state.history, days: range,
    currentGainPhp, currentComplete: complete && currentRecordedCostPhp != null && currentGainPhp != null });
  // Keep the line stable while scrubbing; the marker and headline reflect the selected point.
  const graphTone = idlePeriodAmount === null ? "unknown" : displayedGain(idlePeriodAmount, null).tone;
  const highValue = plotted.length ? Math.max(...plotted.map(point => point.plotValue)) : 0;
  const lowValue = plotted.length ? Math.min(...plotted.map(point => point.plotValue)) : 0;
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
    const first = axisStart, last = axisEnd;
    const target = first + (last - first) * position;
    let index = 0;
    for (let i = 1; i < points.length; i++)
      if (Math.abs(Date.parse(`${points[i].day}T00:00:00Z`) - target) < Math.abs(Date.parse(`${points[index].day}T00:00:00Z`) - target)) index = i;
    setSelected(index);
  };
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!inspectable || event.pointerType === "mouse" || !event.isPrimary) return;
    if (touch.current?.timer) clearTimeout(touch.current.timer);
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
    !points.length ? currency === "USD" && partialUsd ? "USD history is unavailable in this range. PHP history remains available." :
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
      {selectedGain && <div className="chart-gain" data-gain={selectedGain.tone} aria-label={`${rangeNames[range]} ${currency === "USD" ? "USD equivalent of PHP gain" : "gain/loss against recorded PHP cost"}: ${selectedGain.text}${currency === "USD" && selectedGain.percentage ? "; percentage based on PHP recorded cost" : ""}`}>
        <span className="sr-only">{`${rangeNames[range]} gain/loss against recorded PHP cost`}</span><span>{selectedGain.amount}</span>
        {selectedGain.percentage && <strong>{selectedGain.percentage}</strong>}
        <GainInfo currency={currency} fx={currentDisplayFx} point={active} coverage={[
          ...(coverageLimitation ? [coverageLimitation] : []),
          ...(partialUsd && points.length ? [`USD history from ${dateLabel(points[0].day)}. Some historical dates lack approved FX or captured FX context. Missing dates are not converted using today's rate.`] : []),
        ]}/>
      </div>}
      <div className="chart-selected-date" data-selected={active ? "true" : "false"} aria-hidden={!active}>
        {active ? <><time dateTime={active.day}>{dateLabel(active.day)}</time>
          {active.origin && <span> · {active.origin === "reconstructed" ? "Reconstructed" : "Observed"}</span>}</> : "\u00a0"}
      </div>
    </div>
    {status && <p className="chart-status" role="status">{status}</p>}
    <div ref={plot} className="chart-plot min-w-0" tabIndex={inspectable ? 0 : undefined} role={inspectable ? "group" : undefined}
      aria-label={inspectable ? `Inspect ${points.length} historical portfolio values. Use left and right arrow keys.` : undefined}
      aria-describedby={active ? `${gradient}-headline ${gradient}-inspection` : undefined}
      onKeyDown={event => { if (!inspectable) return; if (event.key === "Escape") setSelected(null);
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); setSelected(Math.max(0, Math.min(points.length - 1, (selected ?? (event.key === "ArrowRight" ? -1 : points.length)) + (event.key === "ArrowRight" ? 1 : -1)))); } }}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { if (touch.current?.timer) clearTimeout(touch.current.timer); touch.current = null; setSelected(null); }}
      onPointerLeave={event => { if (event.pointerType === "mouse") setSelected(null); }}>
      {!complete || state.kind === "empty_zero" || plotted.length === 0 ? <div className={`chart-no-history chart-no-history-${state.kind}`}><span className="chart-no-history-marker"/><span>{state.kind === "empty_zero" ? "No investments recorded yet. No portfolio history yet." : !complete ? "Complete portfolio value unavailable" : state.kind === "current_only" ? "Current value · No history yet" : "Current value · No history in this range"}</span></div> :
      plotted.length === 1 ? <div className="chart-single-observation"><span className="chart-single-dot" aria-hidden="true"/>{points[0] && <time dateTime={points[0].day}>{dateLabel(points[0].day)}</time>}</div> :
      <><ResponsiveContainer width="100%" height="100%"><AreaChart accessibilityLayer={false} data={plotted} margin={{ left: 8, right: 8, top: plotTop, bottom: plotBottom }}>
        <defs><linearGradient id={`${gradient}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity={0.14}/><stop offset="100%" stopColor="currentColor" stopOpacity={0.01}/></linearGradient></defs>
        <XAxis type="number" scale="time" domain={[axisStart, axisEnd]} dataKey="timestamp" hide />
        <YAxis type="number" domain={[domainMin, domainMax]} allowDataOverflow hide width={0}/>
        <Area type={roundedStepAfter} fill={`url(#${gradient}-fill)`} dataKey="plotValue" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" dot={false} activeDot={false} isAnimationActive={false}/>
        {active && <><ReferenceLine x={Date.parse(`${active.day}T00:00:00Z`)} stroke="var(--v3-muted)" strokeOpacity={0.8} strokeWidth={1.5}/>
          <ReferenceDot x={Date.parse(`${active.day}T00:00:00Z`)} y={Number(historyValue(active, currency))} r={6}
            fill={`var(--chart-${selectedGain?.tone ?? "unknown"})`} stroke="var(--surface)" strokeWidth={2}/></>}
      </AreaChart></ResponsiveContainer>
      {extrema && !active && <div className="chart-extrema" aria-label={`Range high ${money(historyValue(extrema.high,currency)!,currency)}${showLow ? `; low ${money(historyValue(extrema.low,currency)!,currency)}` : ""}`}>
        <span className="chart-extreme-high" style={{ top: guidePosition(highValue) }}><span className="chart-extreme-text">{money(historyValue(extrema.high,currency)!,currency)}</span></span>
        {showLow && <span className="chart-extreme-low" style={{ top: guidePosition(lowValue) }}><span className="chart-extreme-text">{money(historyValue(extrema.low,currency)!,currency)}</span></span>}
      </div>}</>}
      {active && <div id={`${gradient}-inspection`} role="tooltip" className="chart-inspection"
        style={{ left: `clamp(8px, calc(${selectedPosition * 100}% - 100px), calc(100% - 208px))` }}>
        <time dateTime={active.day}>{dateLabel(active.day)}</time>
        <strong>{money(historyValue(active, currency)!, currency)}</strong>
        {estimateSources.length > 0 && <span>Estimate · last available<br/>{estimateSources.join("; ")}</span>}
      </div>}
    </div>
    <div className="chart-range" role="group" aria-label="History range">{ranges.map(([days, label]) =>
      <button type="button" key={label} aria-pressed={range === days} aria-label={`${label} portfolio history`} onClick={() => changeRange(days)}>{label}</button>)}</div>
  </section>;
}
