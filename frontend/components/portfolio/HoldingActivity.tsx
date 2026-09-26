"use client";
import { useEffect, useState } from "react";
import { portfolioApi, type InvestmentEntry, type PortfolioHolding } from "@/lib/livePortfolio";
import { decimalText, formatContributionMoney } from "@/lib/contributions";
import { manilaInvestmentToday } from "@/lib/investmentEntries";

const field = "mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900";
type Page = { entries: InvestmentEntry[]; page: number; has_more: boolean };

export default function HoldingActivity({ holding, userId, onChanged }: { holding: PortfolioHolding; userId: string; onChanged: () => void }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<InvestmentEntry | null>(null);
  const [voiding, setVoiding] = useState<InvestmentEntry | null>(null);
  const [date, setDate] = useState("");
  const [units, setUnits] = useState("");
  const [paid, setPaid] = useState("");
  const [review, setReview] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    portfolioApi.activity(userId, holding.id, 0, controller.signal).then(p => setPages([p]))
      .catch(() => { if (!controller.signal.aborted) setError("Investment activity is temporarily unavailable."); });
    return () => controller.abort();
  }, [userId, holding.id]);
  async function more() {
    setBusy(true);
    try { const next = await portfolioApi.activity(userId, holding.id, pages.length); setPages(p => [...p, next]); }
    catch { setError("Couldn’t load more entries."); } finally { setBusy(false); }
  }
  function start(entry: InvestmentEntry) {
    setEditing(entry); setDate(entry.investment_date); setUnits(entry.units); setPaid(entry.amount_paid_php ?? ""); setReview(false); setError("");
  }
  const valid = /^\d{1,12}(?:\.\d{1,12})?$/.test(units) && /[1-9]/.test(units) &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= manilaInvestmentToday() &&
    (paid === "" || /^\d{1,16}(?:\.\d{1,2})?$/.test(paid));
  async function saveEdit() {
    if (!editing || !valid || busy) return;
    setBusy(true); setError("");
    try { await portfolioApi.reviseEntry(userId, editing.id, editing.revision, {investment_date:date,units,amount_paid_php:paid || null}); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t correct this entry."); }
    finally { setBusy(false); }
  }
  async function saveVoid() {
    if (!voiding || busy) return;
    setBusy(true); setError("");
    try { await portfolioApi.voidEntry(userId, voiding.id, voiding.revision); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t void this entry."); }
    finally { setBusy(false); }
  }
  return <section className="holding-activity" aria-label="Investment activity">
    <h3 className="text-lg font-semibold">Investment activity</h3>
    <p className="mt-1 text-sm text-slate-600">These are dated additions you recorded in Arbor, not broker transactions.</p>
    {holding.opening_units && Number(holding.opening_units) > 0 && <div className="activity-entry"><strong>Opening recorded position</strong><small>Acquisition date unknown · {decimalText(holding.opening_units)} units · {holding.opening_cost_php == null ? "Cost unknown" : `Known cost ${formatContributionMoney(holding.opening_cost_php,"PHP")}`}</small></div>}
    {pages.flatMap(p => p.entries).map(entry => <div className="activity-entry" key={entry.id}>
      <strong>{entry.investment_date} · {entry.voided_at ? "Voided addition" : "Added investment"}</strong>
      <small>{decimalText(entry.units)} units · {entry.amount_paid_php === null ? "Actual paid not recorded" : formatContributionMoney(entry.amount_paid_php,"PHP")} · Recorded in Arbor {new Date(entry.recorded_at).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"})}</small>
      {!entry.voided_at && <div className="activity-actions"><button type="button" className="entry-link min-h-11" onClick={() => start(entry)}>Edit</button><button type="button" className="entry-link min-h-11" onClick={() => { setVoiding(entry); setEditing(null); setError(""); }}>Void</button></div>}
    </div>)}
    {!pages.flatMap(p => p.entries).length && <p className="mt-4 text-sm text-slate-600">No dated additions recorded yet.</p>}
    {pages.at(-1)?.has_more && <button type="button" className="entry-secondary mt-3 min-h-11 w-full" disabled={busy} onClick={() => void more()}>Show more activity</button>}
    {editing && <form className="activity-correction arbor-panel space-y-3" onSubmit={e => {e.preventDefault();if (!review) setReview(true); else void saveEdit();}}><h4 className="font-semibold">Correct dated addition</h4>
      <label className="block text-sm">Investment date<input type="date" className={field} max={manilaInvestmentToday()} value={date} onChange={e => {setDate(e.target.value);setReview(false);}}/></label>
      <label className="block text-sm">Units received<input className={field} inputMode="decimal" value={units} onChange={e => {setUnits(e.target.value);setReview(false);}}/></label>
      <label className="block text-sm">Actual paid (PHP, optional)<input className={field} inputMode="decimal" value={paid} onChange={e => {setPaid(e.target.value);setReview(false);}}/></label>
      {review && <p className="text-sm">Change {editing.investment_date} / {decimalText(editing.units)} units / {editing.amount_paid_php === null ? "cost unknown" : formatContributionMoney(editing.amount_paid_php,"PHP")} to {date} / {units} units / {paid === "" ? "cost unknown" : formatContributionMoney(paid,"PHP")}. The position total will be reconciled atomically.</p>}
      <button className="entry-primary min-h-11 w-full" disabled={!valid || busy}>{review ? "Confirm correction" : "Review correction"}</button>
      <button type="button" className="entry-link min-h-11" onClick={() => setEditing(null)}>Cancel</button></form>}
    {voiding && <div className="activity-correction arbor-panel space-y-3" role="group" aria-label="Confirm void"><h4 className="font-semibold">Void this Arbor entry?</h4><p className="text-sm">This removes {decimalText(voiding.units)} units from the recorded position and retains the dated entry as voided. It is not a sale at your provider.</p><button type="button" className="entry-primary min-h-11 w-full" disabled={busy} onClick={() => void saveVoid()}>Confirm void</button><button type="button" className="entry-link min-h-11" onClick={() => setVoiding(null)}>Cancel</button></div>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </section>;
}
