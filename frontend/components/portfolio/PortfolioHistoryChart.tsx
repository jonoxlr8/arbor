"use client";
import { useId, useState } from "react";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { formatContributionMoney } from "@/lib/contributions";
import type { PortfolioHistory } from "@/lib/livePortfolio";
import { historyRange, portfolioValueChange, valueChangeDisclosure } from "@/lib/portfolioHistory";
import { portfolioGraphState } from "@/lib/portfolioGraphState";

export default function PortfolioHistoryChart({ history, knownValue = "0", complete = true, holdingsCount = history.length, compact = false, performance = false }: { history: PortfolioHistory[]; knownValue?: string; complete?: boolean; holdingsCount?: number; compact?: boolean; performance?: boolean }) {
  const gradient = useId();
  const [range, setRange] = useState(0);
  const state = portfolioGraphState({ history, knownValue, complete, holdingsCount });
  const ordered = historyRange(history, 0);
  const newest = ordered.length ? Date.parse(ordered[ordered.length - 1].day) : 0;
  const spanDays = ordered.length ? (newest - Date.parse(ordered[0].day)) / 86400000 : 0;
  const points = state.kind === "historical" ? historyRange(history, range) : state.history;
  const change = state.kind === "historical" ? portfolioValueChange(points) : null;
  const flat = state.kind !== "historical";
  const plotted = points.map(p => ({ x: p.day, value_php: p.value_php, plotValue: Number(p.value_php) }));
  return <section aria-label="Portfolio value graph" className={`portfolio-chart min-w-0${compact ? " compact-chart" : ""}`}>
    <div className="chart-heading">{(compact || state.kind !== "current_only" && state.kind !== "empty_zero") && <h3 className="text-sm font-medium text-slate-600">{state.kind === "historical" ? "Portfolio value over time" : state.kind === "single_recorded" ? "Current recorded value" : state.kind === "current_only" ? "Current value" : state.kind === "incomplete" ? "Known portfolio value" : "Portfolio value"}</h3>}
      {state.kind === "historical" && <div className="chart-range" aria-label="History range">{[[30, "1M"], [90, "3M"], [365, "1Y"], [0, "All"]].filter(([days]) => Number(days) === 0 || (Number(days) <= spanDays && historyRange(history, Number(days)).length >= 2)).map(([days, label]) => <button type="button" key={label} aria-pressed={range === days} className="entry-secondary min-h-11 px-3" onClick={() => setRange(Number(days))}>{label}</button>)}</div>}
    </div>
    {change && <div className="portfolio-change" data-direction={change.direction}>
      <p><span aria-hidden="true">{change.direction === "down" ? "↘" : change.direction === "up" ? "↗" : "—"}</span> {change.percentage === null ? "Percentage unavailable" : `${change.percentage.startsWith("-") ? "" : "+"}${change.percentage}%`} <span>{change.amount.startsWith("-") ? "−" : "+"}{formatContributionMoney(change.amount.replace("-", ""), "PHP")}</span></p>
      <small>Portfolio value change · {range ? `${range} days` : "All recorded history"}</small>
      {!compact && <details><summary>About this change</summary><p>{valueChangeDisclosure}</p></details>}
    </div>}
    {performance && <><p className="text-sm text-slate-600">Value change includes contributions and changes to recorded holdings.</p>{change && <dl className="performance-facts"><div><dt>First recorded value</dt><dd>{formatContributionMoney(change.first.value_php,"PHP")}</dd><small>{change.first.day}</small></div><div><dt>Latest recorded value</dt><dd>{formatContributionMoney(change.latest.value_php,"PHP")}</dd><small>{change.latest.day}</small></div></dl>}</>}
    <p className="text-sm text-slate-600" role="status">{state.kind === "single_recorded" && !compact ? `${formatContributionMoney(state.value, "PHP")} · ` : ""}{state.summary}</p>
    <div className="chart-plot min-w-0 text-forest" aria-hidden="true">{flat ? <svg className="chart-flat-line" viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="1.3" vectorEffect="non-scaling-stroke"/></svg> : <ResponsiveContainer width="100%" height="100%"><AreaChart data={plotted} margin={{ left: 10, right: 10, top: 12, bottom: 0 }}><defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity={0.28}/><stop offset="100%" stopColor="currentColor" stopOpacity={0.01}/></linearGradient></defs><XAxis tickFormatter={day => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-PH",{month:"short",day:"numeric",timeZone:"UTC"})} axisLine={false} tickLine={false} dataKey="x" tick={{ fontSize: 10 }} minTickGap={50} /><YAxis domain={["dataMin", "dataMax"]} hide={compact} orientation="right" width={66} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} tickFormatter={value => `₱${Number(value).toLocaleString("en-PH",{notation:"compact",maximumFractionDigits:1})}`} /><Area type="monotone" fill={`url(#${gradient})`} dataKey="plotValue" stroke="currentColor" strokeWidth={2.5} dot={false} isAnimationActive={false} /></AreaChart></ResponsiveContainer>}</div>
    {!!state.history.length && <details className="chart-history-details"><summary>Portfolio history</summary><dl className="text-sm text-slate-700">{state.history.map(p => <div className="flex flex-wrap justify-between gap-2 py-2" key={p.day}><dt>{p.day}</dt><dd>{formatContributionMoney(p.value_php, "PHP")}</dd></div>)}</dl><p className="text-xs text-slate-500">Only genuine recorded observations appear here. Changes include contributions and holding edits; this is not an investment-return chart.</p></details>}
  </section>;
}
