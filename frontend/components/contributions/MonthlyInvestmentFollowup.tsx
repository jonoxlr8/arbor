"use client";
import { useEffect, useRef, useState } from "react";
import { portfolioApi, type InvestmentEntry, type InvestmentEntryDraft, type LivePortfolioData, type PortfolioProduct } from "@/lib/livePortfolio";
import { manilaInvestmentToday } from "@/lib/investmentEntries";
import { investmentIdentity } from "@/lib/investmentIdentity";
import InvestmentIdentity from "../InvestmentIdentity";
import ProviderIdentity from "../ProviderIdentity";
import { monthlyMoney, type MonthlyPlan } from "@/lib/monthlyPlan";
import { monthLabel } from "@/lib/monthlyCheckin";
import { investmentAction, recordingRows } from "@/lib/monthlyInvestments";
import DatedInvestmentFlow from "../portfolio/DatedInvestmentFlow";

type Selection = { product: PortfolioProduct | null; plannedAmount?: string };

/** Investment dates use the Philippine calendar. Check-in months remain their own UTC authority. */
export function MonthlyInvestmentFollowup({ userId, plan, completed, recording=false, onRecordingClose }: { userId: string; plan: MonthlyPlan | null; completed: boolean;recording?:boolean;onRecordingClose?:()=>void }) {
  const [portfolio, setPortfolio] = useState<LivePortfolioData | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [saved, setSaved] = useState<InvestmentEntryDraft | null>(null);
  const [month, setMonth] = useState(() => manilaInvestmentToday().slice(0, 7));
  useEffect(() => {
    const controller = new AbortController();
    portfolioApi.read(userId, controller.signal).then(value => { if (!controller.signal.aborted) { setPortfolio(value); setError(""); } })
      .catch(() => { if (!controller.signal.aborted) setError("We couldn’t load your investments. Please retry before recording anything."); });
    return () => controller.abort();
  }, [userId, reload]);
  useEffect(() => {
    const changed = () => setReload(value => value + 1);
    window.addEventListener("arbor-investment-recorded", changed);
    return () => window.removeEventListener("arbor-investment-recorded", changed);
  }, []);
  function recorded(draft: InvestmentEntryDraft) {
    setSelection(null);
    onRecordingClose?.();
    setSaved(draft);
    setMonth(draft.investment_date.slice(0, 7));
    window.dispatchEvent(new Event("arbor-investment-recorded"));
  }
  const rows = recordingRows(plan, portfolio?.catalog ?? []);
  const directProduct=rows.length===1?rows[0].product:null;
  return <section id="monthly-record-investment" className="monthly-record" aria-label="Record actual investments">
    {completed && <header><h3>Record what you actually invested</h3><p>Enter the units shown by your provider. Arbor won’t estimate them from today’s price. Your check-in and investments are separate records.</p></header>}
    {saved && <div className="monthly-record-success" role="status"><strong>Investment recorded</strong><a className="entry-link min-h-11 inline-flex items-center" href="#portfolio/holdings">View in Portfolio →</a><div className="investment-line"><InvestmentIdentity product={saved.product_id}/><p>{investmentIdentity(saved.product_id).shortName} · {saved.units} {saved.product_id.endsWith("_btc") ? "BTC" : "units"}<br/><ProviderIdentity provider={saved.provider}/></p></div><div><button type="button" className="entry-secondary min-h-11" onClick={() => { setSaved(null); setSelection({ product: null }); }}>Record another</button><button type="button" className="entry-link min-h-11" onClick={() => setSaved(null)}>Done</button></div></div>}
    {error && <p role="alert" className="monthly-error">{error} <button type="button" className="entry-link min-h-11" onClick={() => { setError(""); setReload(value => value + 1); }}>Retry</button></p>}
    {!portfolio && !error && <p role="status">Loading supported investments…</p>}
    {completed && portfolio && <>
      {rows.length > 0 && <><p className="monthly-record-note">Current contribution preview, not a record of what you invested. You may record a different amount, date, or investment—or skip a line.</p><div className="monthly-record-list">{rows.map(row => {
        const product = row.product;
        return <article key={row.sleeve} className="monthly-record-row"><div className="investment-line">{product && <InvestmentIdentity product={product.product_id}/>}<div><strong>{product ? investmentIdentity(product.product_id).shortName : "Choose where you invested"}</strong>{product ? <ProviderIdentity provider={product.provider}/> : <small>No provider selected</small>}<small>Planned this month · {monthlyMoney(row.plannedAmount)}</small></div></div><button type="button" className="entry-secondary min-h-11" onClick={() => { setSaved(null); setSelection({ product, plannedAmount: row.plannedAmount }); }}>{product ? "Record investment" : "Choose investment"}</button></article>;
      })}</div></>}
      <button type="button" className="entry-link min-h-11" onClick={() => { setSaved(null); setSelection({ product: null }); }}>Record another supported investment</button>
    </>}
    {recording && portfolio && <DatedInvestmentFlow key="direct-recording" portfolio={portfolio} userId={userId} initialProduct={directProduct??undefined} allowProductChange monthly onClose={()=>onRecordingClose?.()} onSaved={recorded} onOpeningOnly={()=>{onRecordingClose?.();window.location.hash="#portfolio/add";}}/>}
    {!recording && selection && portfolio && <DatedInvestmentFlow key={`${selection.product?.product_id ?? "choose"}:${selection.product?.provider ?? ""}`} portfolio={portfolio} userId={userId} initialProduct={selection.product ?? undefined} plannedAmount={selection.plannedAmount} monthly onClose={() => setSelection(null)} onSaved={recorded} onOpeningOnly={() => { setSelection(null); window.location.hash = "#portfolio/add"; }} />}
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
  const visibleEntries = entries.filter(entry => !entry.voided_at);
  return <section className="monthly-investment-activity" aria-label="Investment activity by month"><header><div><h3>Recorded investment activity</h3><p>By investment date in the Philippines—not linked to a check-in.</p></div><label>Month<input type="month" aria-label="Investment activity month" value={month} onChange={event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) onMonthChange(event.target.value); }} /></label></header>
    {error && <p role="alert">{error}</p>}
    {!error && (loadedKey !== requestKey ? <p role="status">Loading recorded investments…</p> : visibleEntries.length ? <ul>{visibleEntries.map(entry => <li key={entry.id}><InvestmentIdentity product={entry.product_id}/><span><time dateTime={entry.investment_date}>{entry.investment_date}</time><strong>{investmentAction(entry)} {investmentIdentity(entry.product_id).shortName}</strong><small>{entry.units} {entry.product_id.endsWith("_btc") ? "BTC" : "units"}</small><ProviderIdentity provider={entry.provider}/></span></li>)}</ul> : <p>No investments recorded for {monthLabel(month)}.</p>)}
    {loadedKey === requestKey && hasMore && <button type="button" className="entry-secondary min-h-11" disabled={busy} onClick={() => void more()}>{busy ? "Loading…" : "Show more"}</button>}
  </section>;
}
