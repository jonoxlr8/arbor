"use client";
import { useId, useState } from "react";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { formatContributionMoney } from "@/lib/contributions";
import type { PortfolioHistory } from "@/lib/livePortfolio";
import { historyRange, portfolioValueChange, valueChangeDisclosure } from "@/lib/portfolioHistory";

export default function PortfolioHistoryChart({ history, compact = false, performance = false }: { history: PortfolioHistory[]; compact?: boolean; performance?: boolean }) {
  const gradient = useId();
  const [range, setRange] = useState(0);
  const ordered = historyRange(history, 0);
  const newest = ordered.length ? Date.parse(ordered[ordered.length - 1].day) : 0;
  const spanDays = ordered.length ? (newest - Date.parse(ordered[0].day)) / 86400000 : 0;
  const points = historyRange(history, range);
  const change = portfolioValueChange(points);
  return <section aria-label="Portfolio value history" className={`portfolio-chart min-w-0${compact ? " compact-chart" : ""}`}>
    <div className="chart-heading"><h3 className="text-sm font-medium text-slate-600">Portfolio value over time</h3>
      {!compact && spanDays >= 30 && <div className="chart-range" aria-label="History range">{[[30, "1M"], [90, "3M"], [365, "1Y"], [0, "All"]].filter(([days]) => Number(days) <= spanDays).map(([days, label]) => <button type="button" key={label} aria-pressed={range === days} className="entry-secondary min-h-11 px-3" onClick={() => setRange(Number(days))}>{label}</button>)}</div>}
    </div>
    {change && <div className="portfolio-change" data-direction={change.direction}>
      <p><span aria-hidden="true">{change.direction === "down" ? "↘" : change.direction === "up" ? "↗" : "—"}</span> {change.percentage === null ? "Percentage unavailable" : `${change.percentage.startsWith("-") ? "" : "+"}${change.percentage}%`} <span>{change.amount.startsWith("-") ? "−" : "+"}{formatContributionMoney(change.amount.replace("-", ""), "PHP")}</span></p>
      <small>Portfolio value change · {range ? `${range} days` : "All recorded history"}</small>
      {!compact && <details><summary>About this change</summary><p>{valueChangeDisclosure}</p></details>}
    </div>}
    {performance && <><p className="text-sm text-slate-600">Value change includes contributions and changes to recorded holdings.</p>{change && <dl className="performance-facts"><div><dt>First recorded value</dt><dd>{formatContributionMoney(change.first.value_php,"PHP")}</dd><small>{change.first.day}</small></div><div><dt>Latest recorded value</dt><dd>{formatContributionMoney(change.latest.value_php,"PHP")}</dd><small>{change.latest.day}</small></div></dl>}</>}
    {!history.length ? <div className="chart-empty"><span className="chart-empty-symbol" aria-hidden="true">◷</span><strong>A clearer picture, over time</strong><p>Your portfolio graph will appear as Arbor starts recording your portfolio value.</p></div> : <>
      {points.length === 1 && <div className="chart-empty"><span className="chart-empty-symbol" aria-hidden="true">◷</span><strong>{formatContributionMoney(points[0].value_php, "PHP")} recorded {new Date(`${points[0].day}T00:00:00Z`).toLocaleDateString("en-PH",{month:"short",day:"numeric",timeZone:"UTC"})}</strong><p>More observations will build your chart.</p></div>}
      {points.length > 1 && <div className="chart-plot min-w-0 text-forest" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><AreaChart data={points.map(p => ({ ...p, plotValue: Number(p.value_php) }))} margin={{ left: 10, right: 10, top: 12, bottom: 0 }}><defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity={0.28}/><stop offset="100%" stopColor="currentColor" stopOpacity={0.01}/></linearGradient></defs><XAxis tickFormatter={day => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-PH",{month:"short",day:"numeric",timeZone:"UTC"})} axisLine={false} tickLine={false} dataKey="day" tick={{ fontSize: 10 }} minTickGap={50} /><YAxis domain={["dataMin", "dataMax"]} hide={compact} orientation="right" width={66} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} tickFormatter={value => `₱${Number(value).toLocaleString("en-PH",{notation:"compact",maximumFractionDigits:1})}`} /><Tooltip contentStyle={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:12,color:"var(--foreground)"}} itemStyle={{color:"var(--foreground)"}} formatter={(_, __, item) => [formatContributionMoney(item.payload.value_php, "PHP"), "Recorded value"]} /><Area type="monotone" fill={`url(#${gradient})`} dataKey="plotValue" stroke="currentColor" strokeWidth={2.5} dot={false} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>}
      <details className="chart-history-details"><summary>Portfolio history</summary><dl className="text-sm text-slate-700">{points.map(p => <div className="flex flex-wrap justify-between gap-2 py-2" key={p.day}><dt>{p.day}</dt><dd>{formatContributionMoney(p.value_php, "PHP")}</dd></div>)}</dl><p className="text-xs text-slate-500">First complete up-to-date valuation each day, including valid values entered by you. Changes include edits to your holdings; this is not an investment-return chart.</p></details>
    </>}
  </section>;
}
