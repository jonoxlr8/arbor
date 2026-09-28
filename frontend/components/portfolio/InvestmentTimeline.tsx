"use client";
import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { portfolioApi, type InvestmentEntry, type LivePortfolioData } from "@/lib/livePortfolio";
import { datedActivity } from "@/lib/datedActivity";
import { formatContributionMoney } from "@/lib/contributions";
import PortfolioHistoryChart from "./PortfolioHistoryChart";

export default function InvestmentTimeline({ userId, portfolio, compact = false }: { userId: string; portfolio: LivePortfolioData; compact?: boolean }) {
  const [view, setView] = useState<"activity" | "value">("activity");
  const [entries, setEntries] = useState<InvestmentEntry[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    portfolioApi.activity(userId, undefined, 0, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setEntries(result.entries); setPage(0); setHasMore(result.has_more); setError(false); setBusy(false);
    }).catch(() => { if (!controller.signal.aborted) { setError(true); setBusy(false); } });
    return () => controller.abort();
  }, [userId, portfolio, attempt]);
  async function more() {
    setBusy(true);
    try {
      const next = await portfolioApi.activity(userId, undefined, page + 1);
      setEntries(old => [...old, ...next.entries]); setPage(page + 1); setHasMore(next.has_more); setError(false);
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  const days = datedActivity(entries);
  return <div className="investment-timeline">
    <div className="chart-range" role="group" aria-label="Chart view">
      <button type="button" className="entry-secondary min-h-11" aria-pressed={view === "activity"} onClick={() => setView("activity")}>Investment dates</button>
      <button type="button" className="entry-secondary min-h-11" aria-pressed={view === "value"} onClick={() => setView("value")}>Recorded value</button>
    </div>
    {view === "value" ? <><PortfolioHistoryChart history={portfolio.history} knownValue={portfolio.known_value_php} complete={portfolio.complete} holdingsCount={portfolio.holdings.length} compact={compact}/><p className="timeline-note">Values start when Arbor observes them. Earlier investment dates do not create past valuations.</p></> :
      <section className={`portfolio-chart${compact ? " compact-chart" : ""}`} aria-label="Dated investment activity graph">
        <h3 className="text-sm font-medium text-slate-600">Investments by date</h3>
        <p className="timeline-note">Number of additions on the investment dates you entered. This is activity, not portfolio value or investment return.</p>
        {error && <p role="alert" className="timeline-note">Couldn’t load investment activity. <button type="button" disabled={busy} className="entry-link" onClick={() => { setBusy(true); setAttempt(n => n + 1); }}>Retry</button></p>}
        {busy && <p role="status" className="timeline-note">Loading investment dates…</p>}
        {!busy && !error && !days.length && <p className="timeline-note">No active dated investments recorded yet. Existing opening balances have no investment date.</p>}
        {!!days.length && <div className="chart-plot text-forest" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><BarChart data={days} margin={{ top: 20, right: 12, left: 0, bottom: 8 }}><XAxis dataKey="day" axisLine={false} tickLine={false} minTickGap={24} tick={{ fontSize: 10 }} tickFormatter={day => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" })}/><YAxis allowDecimals={false} domain={[0, (max: number) => Math.max(1, max)]} width={28} tick={{ fontSize: 10 }} axisLine={false} tickLine={false}/><Tooltip labelFormatter={label => `Investment date: ${label}`}/><Bar dataKey="count" name="Additions" fill="currentColor" maxBarSize={40} radius={[6, 6, 0, 0]} isAnimationActive={false}/></BarChart></ResponsiveContainer></div>}
        {hasMore && <p className="timeline-note">Showing active investments from {entries.length} loaded records. Older records may add to these dates. <button type="button" className="entry-link min-h-11" disabled={busy} onClick={() => void more()}>Show older dates</button></p>}
        {!!days.length && <details className="chart-history-details"><summary>Investment dates and amounts paid</summary><dl className="text-sm">{days.map(day => <div className="activity-entry" key={day.day}><dt>{day.day} · {day.count} {day.count === 1 ? "addition" : "additions"}</dt><dd>{day.unknownCount === day.count ? "Amount paid not recorded" : `${formatContributionMoney(day.knownCost, "PHP")} recorded paid`}{day.unknownCount > 0 && day.unknownCount < day.count ? ` · ${day.unknownCount} with amount not recorded` : ""}</dd></div>)}</dl><p className="timeline-note">Voided entries, undated opening balances and monthly check-ins are excluded. Recorded amounts are not historical market values.</p></details>}
      </section>}
  </div>;
}
