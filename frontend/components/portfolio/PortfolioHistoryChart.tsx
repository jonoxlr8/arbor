"use client";
import { useState } from "react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { formatContributionMoney } from "@/lib/contributions";
import type { PortfolioHistory } from "@/lib/livePortfolio";

export default function PortfolioHistoryChart({ history }: { history: PortfolioHistory[] }) {
  const [range, setRange] = useState(0);
  const newest = history.length ? Date.parse(history[history.length - 1].day) : 0;
  const points = history.filter(p => !range || Date.parse(p.day) >= newest - range * 86400000);
  return <section aria-label="Portfolio value history" className="arbor-panel min-w-0">
    <h3 className="text-lg font-semibold text-slate-900">Portfolio value over time</h3>
    {!history.length ? <p className="mt-3 text-sm text-slate-600">Your portfolio graph will appear as Arbor starts recording your portfolio value.</p> : <>
      {history.length > 1 && <div className="my-3 flex gap-2" aria-label="History range">{[[30, "1M"], [90, "3M"], [365, "1Y"], [0, "All"]].map(([days, label]) => <button type="button" key={label} aria-pressed={range === days} className="entry-secondary min-h-11 px-3" onClick={() => setRange(Number(days))}>{label}</button>)}</div>}
      {points.length === 1 && <p className="mt-3 text-sm text-slate-700">{formatContributionMoney(points[0].value_php, "PHP")} recorded {points[0].day}. More observations will form your chart.</p>}
      {points.length > 1 && <div className="h-48 min-w-0 text-forest" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><LineChart data={points.map(p => ({ ...p, plotValue: Number(p.value_php) }))} margin={{ left: 10, right: 10, top: 12, bottom: 0 }}><XAxis dataKey="day" tick={{ fontSize: 10 }} minTickGap={50} /><YAxis hide domain={[0, "auto"]} /><Tooltip formatter={(_, __, item) => formatContributionMoney(item.payload.value_php, "PHP")} /><Line type="linear" dataKey="plotValue" stroke="currentColor" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>}
      <details className="mt-3"><summary className="min-h-11 cursor-pointer text-sm text-slate-700">View recorded values ({points.length})</summary><dl className="text-sm text-slate-700">{points.map(p => <div className="flex flex-wrap justify-between gap-2 py-2" key={p.day}><dt>{p.day}</dt><dd>{formatContributionMoney(p.value_php, "PHP")}</dd></div>)}</dl></details>
      <p className="text-xs text-slate-500">First complete up-to-date valuation each day, including valid values entered by you. Changes include edits to your holdings; this is not an investment-return chart.</p>
    </>}
  </section>;
}
