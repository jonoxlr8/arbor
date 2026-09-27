"use client";
import { useEffect, useRef, useState } from "react";
import { portfolioApi, type InvestmentEntry, type InvestmentEntryDraft, type LivePortfolioData, type PortfolioProduct } from "@/lib/livePortfolio";
import { manilaInvestmentToday } from "@/lib/investmentEntries";
import { investmentIdentity, providerName } from "@/lib/investmentIdentity";
import { monthlyMoney, type MonthlyPlan } from "@/lib/monthlyPlan";
import { monthLabel } from "@/lib/monthlyCheckin";
import { investmentAction, recordingRows } from "@/lib/monthlyInvestments";
import DatedInvestmentFlow from "../portfolio/DatedInvestmentFlow";
import PendingRecordingResume from "./PendingRecordingResume";
import { pendingApi, pendingChanged, type PendingRecording } from "@/lib/pendingRecordings";

type Selection = { product: PortfolioProduct | null; plannedAmount?: string; pendingId?: string };

/** Investment dates use the Philippine calendar. Check-in months remain their own UTC authority. */
export function MonthlyInvestmentFollowup({ userId, plan, completed }: { userId: string; plan: MonthlyPlan | null; completed: boolean }) {
  const [portfolio, setPortfolio] = useState<LivePortfolioData | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [saved, setSaved] = useState<InvestmentEntryDraft | null>(null);
  const [resolutionFailed, setResolutionFailed] = useState("");
  const [month, setMonth] = useState(() => manilaInvestmentToday().slice(0, 7));
  useEffect(() => {
    const controller = new AbortController();
    portfolioApi.read(userId, controller.signal).then(value => { if (!controller.signal.aborted) { setPortfolio(value); setError(""); } })
      .catch(() => { if (!controller.signal.aborted) setError("We couldn’t load your investments. Please retry before recording anything."); });
    return () => controller.abort();
  }, [userId, reload]);
  function recorded(draft: InvestmentEntryDraft) {
    const pendingId = selection?.pendingId;
    setSelection(null);
    setSaved(draft);
    setMonth(draft.investment_date.slice(0, 7));
    setReload(value => value + 1);
    if (pendingId) void pendingApi.resolve(userId, pendingId, "recorded")
      .then(() => { setResolutionFailed(""); pendingChanged(); })
      .catch(() => setResolutionFailed(pendingId));
  }
  function recordPending(item: PendingRecording) {
    const product = portfolio?.catalog.find(row => row.product_id === item.product_id && row.provider === item.provider);
    if (!product) { setError("This investment is unavailable in the current catalogue. You can dismiss its reminder without changing your holdings."); return; }
    setSaved(null); setResolutionFailed(""); setSelection({ product, pendingId: item.id });
  }
  const rows = recordingRows(plan, portfolio?.catalog ?? []);
  return <section id="monthly-record-investment" className="monthly-record" aria-label="Record actual investments">
    <PendingRecordingResume userId={userId} onRecord={recordPending}/>
    {completed && <header><h3>Record what you actually invested</h3><p>Enter the units shown by your provider. Arbor won’t estimate them from today’s price. Your check-in and investments are separate records.</p></header>}
    {completed && saved && <div className="monthly-record-success" role="status"><strong>Investment recorded</strong><p>{investmentIdentity(saved.product_id).shortName} · {saved.units} {saved.product_id.endsWith("_btc") ? "BTC" : "units"} · {providerName(saved.provider)}</p><div><button type="button" className="entry-secondary min-h-11" onClick={() => { setSaved(null); setSelection({ product: null }); }}>Record another</button><button type="button" className="entry-link min-h-11" onClick={() => setSaved(null)}>Done</button></div></div>}
    {resolutionFailed && <p role="alert" className="monthly-error">Your investment was saved, but its reminder could not be cleared. Do not record the investment again. <button type="button" className="entry-link min-h-11" onClick={() => void pendingApi.resolve(userId, resolutionFailed, "recorded").then(() => { setResolutionFailed(""); pendingChanged(); }).catch(() => setError("The reminder is still waiting. Retry or choose ‘I already recorded this’."))}>Retry clearing reminder</button></p>}
    {error && <p role="alert" className="monthly-error">{error} <button type="button" className="entry-link min-h-11" onClick={() => { setError(""); setReload(value => value + 1); }}>Retry</button></p>}
    {!portfolio && !error && <p role="status">Loading supported investments…</p>}
    {completed && portfolio && <>
      {rows.length > 0 && <><p className="monthly-record-note">Current contribution preview, not a record of what you invested. You may record a different amount, date, or investment—or skip a line.</p><div className="monthly-record-list">{rows.map(row => {
        const product = row.product;
        return <article key={row.sleeve} className="monthly-record-row"><div><strong>{product ? investmentIdentity(product.product_id).shortName : "Choose where you invested"}</strong><small>{product ? providerName(product.provider) : "No provider selected"}</small><small>Planned this month · {monthlyMoney(row.plannedAmount)}</small></div><button type="button" className="entry-secondary min-h-11" onClick={() => { setSaved(null); setSelection({ product, plannedAmount: row.plannedAmount }); }}>{product ? "Record investment" : "Choose investment"}</button></article>;
      })}</div></>}
      <button type="button" className="entry-link min-h-11" onClick={() => { setSaved(null); setSelection({ product: null }); }}>Record another supported investment</button>
    </>}
    {selection && portfolio && <DatedInvestmentFlow key={`${selection.product?.product_id ?? "choose"}:${selection.product?.provider ?? ""}`} portfolio={portfolio} userId={userId} initialProduct={selection.product ?? undefined} plannedAmount={selection.plannedAmount} monthly onClose={() => setSelection(null)} onSaved={recorded} onOpeningOnly={() => { setSelection(null); window.location.hash = "#portfolio/add"; }} />}
    <MonthlyInvestmentActivity userId={userId} month={month} onMonthChange={setMonth} reload={reload} />
  </section>;
}

export function MonthlyInvestmentActivity({ userId, month, onMonthChange, reload }: { userId: string; month: string; onMonthChange: (month: string) => void; reload: number }) {
  const [entries, setEntries] = useState<InvestmentEntry[]>([]);
  const [loadedKey, setLoadedKey] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestKey = `${userId}:${month}:${reload}`;
  const currentKey = useRef(requestKey);
  useEffect(() => {
    currentKey.current = requestKey;
    const controller = new AbortController();
    portfolioApi.activity(userId, undefined, 0, controller.signal, { month }).then(result => {
      if (!controller.signal.aborted) { setEntries(result.entries); setPage(0); setHasMore(result.has_more); setError(""); setLoadedKey(requestKey); }
    }).catch(() => { if (!controller.signal.aborted) { setError("Investment activity is temporarily unavailable."); setLoadedKey(requestKey); } });
    return () => controller.abort();
  }, [userId, month, reload, requestKey]);
  async function more() {
    if (busy) return;
    setBusy(true); setError("");
    try { const result = await portfolioApi.activity(userId, undefined, page + 1, undefined, { month }); if (currentKey.current !== requestKey) return; setEntries(current => [...current, ...result.entries]); setPage(page + 1); setHasMore(result.has_more); }
    catch { if (currentKey.current === requestKey) setError("Couldn’t load more investment activity."); }
    finally { setBusy(false); }
  }
  return <section className="monthly-investment-activity" aria-label="Investment activity by month"><header><div><h3>Recorded investment activity</h3><p>By investment date in the Philippines—not linked to a check-in.</p></div><label>Month<input type="month" aria-label="Investment activity month" value={month} onChange={event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) onMonthChange(event.target.value); }} /></label></header>
    {error && <p role="alert">{error}</p>}
    {!error && (loadedKey !== requestKey ? <p role="status">Loading recorded investments…</p> : entries.length ? <ul>{entries.map(entry => <li key={entry.id}><time dateTime={entry.investment_date}>{entry.investment_date}</time><span><strong>{investmentAction(entry)} {investmentIdentity(entry.product_id).shortName}</strong><small>{entry.units} {entry.product_id.endsWith("_btc") ? "BTC" : "units"} · {providerName(entry.provider)}</small></span></li>)}</ul> : <p>No investments recorded for {monthLabel(month)}.</p>)}
    {loadedKey === requestKey && hasMore && <button type="button" className="entry-secondary min-h-11" disabled={busy} onClick={() => void more()}>{busy ? "Loading…" : "Show more"}</button>}
  </section>;
}
