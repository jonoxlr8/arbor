"use client";
import { useEffect, useRef, useState } from "react";
import type { PlanV2 } from "@/lib/types/planV2";
import { portfolioApi, validHolding, freshnessText, scenarioAvailability, type HoldingDraft, type LivePortfolioData, type PortfolioHolding } from "@/lib/livePortfolio";
import { decimalText, formatContributionMoney, SLEEVE_LABELS } from "@/lib/contributions";
import ContributionCard from "../contributions/ContributionCard";
import PortfolioHistoryChart from "./PortfolioHistoryChart";

const inputClass = "mt-1 min-h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white p-3 text-slate-900";
const blank = (): HoldingDraft => ({ provider: "", product_id: "", units: "", cost_basis_php: null });
const money = (v: string) => formatContributionMoney(v, "PHP");

export default function LivePortfolio({ value, userId }: { value: PlanV2; userId: string }) {
  const [portfolio, setPortfolio] = useState<LivePortfolioData | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [showContribution, setShowContribution] = useState(false);
  const pending = useRef(false);
  const [draft, setDraft] = useState<HoldingDraft | null>(null);
  const [editing, setEditing] = useState<string>();
  const [deleting, setDeleting] = useState<PortfolioHolding | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    portfolioApi.read(userId, controller.signal).then(async data => {
      if (controller.signal.aborted) return;
      setPortfolio(data);
      if (data.holdings.length && data.complete && !data.stale_count) {
        try {
          const result = await portfolioApi.capture(userId, controller.signal);
          if (!controller.signal.aborted && Array.isArray(result.history)) setPortfolio({ ...data, history: result.history });
        } catch { if (!controller.signal.aborted) setHistoryError(true); }
      }
    }).catch(() => { if (!controller.signal.aborted) setError("Portfolio records are temporarily unavailable. Please retry."); });
    return () => controller.abort();
  }, [userId, reload]);
  function refresh() { setPortfolio(null); setShowContribution(false); setError(""); setHistoryError(false); setReload(n => n + 1); }
  async function mutate(work: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await work(); setDraft(null); setDeleting(null); setEditing(undefined); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "We couldn’t update your record. Please retry."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="w-full max-w-3xl min-w-0 space-y-6">
    <header><h2 className="text-2xl font-semibold text-slate-900">Your portfolio</h2><p className="mt-2 text-sm text-slate-600">Record what you already own. Arbor tracks and compares; it does not hold money or execute trades.</p></header>
    {error && <div role="alert" className="arbor-panel text-sm text-slate-700">{error}<button disabled={busy} className="entry-link ml-3 min-h-11" onClick={refresh}>Retry</button></div>}
    {!portfolio && !error && <p role="status" className="text-slate-600">Loading your portfolio…</p>}
    {portfolio && <>
      <PortfolioSummary portfolio={portfolio} />
      <PortfolioHistoryChart history={portfolio.history} />
      {historyError && <p role="status" className="text-sm text-slate-600">Current values are available, but today’s history could not be recorded. Please retry later.</p>}
      <section className="arbor-panel min-w-0"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold text-slate-900">Where you invest</h3><button className="entry-secondary min-h-11" disabled={busy} onClick={() => { setDraft(blank()); setEditing(undefined); }}>Add holding</button></div>
        {!portfolio.holdings.length && <p className="mt-3 text-sm text-slate-600">Add your first holding. Tell Arbor what you already own so it can compare your portfolio with your selected plan.</p>}
        {[...new Set(portfolio.holdings.map(h => h.provider))].map(provider => <section key={provider} className="mt-5"><h4 className="inline-flex rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">{portfolio.holdings.find(h => h.provider === provider)!.provider_name}</h4>
          <p className="mt-2 text-sm text-slate-600">Known provider value: {money(portfolio.provider_values_php[provider] ?? "0")}{portfolio.holdings.some(h => h.provider === provider && h.value_php === null) ? " · incomplete" : ""}</p>
          {portfolio.holdings.filter(h => h.provider === provider).map(h => <div className="mt-2 border-b border-slate-200 py-3 text-sm" key={h.id}>
            <div className="flex flex-wrap justify-between gap-2"><p className="min-w-0 break-words font-semibold text-slate-900">{h.display_name}</p><p className="font-semibold text-slate-900">{h.value_php === null ? "Value unavailable" : money(h.value_php)}</p></div>
            <p className="mt-1 break-all text-slate-600">{decimalText(h.units)} {h.sleeve === "crypto" ? "BTC" : "units"}</p><p className="mt-1 text-xs text-slate-500">{freshnessText(h)}</p>
            <button className="entry-link min-h-11 pr-5" disabled={busy} aria-label={`Edit ${h.display_name}`} onClick={() => { setEditing(h.id); setDraft({ provider: h.provider, product_id: h.product_id, units: decimalText(h.units), cost_basis_php: h.cost_basis_php }); }}>Edit record</button>
            <button className="entry-link min-h-11" disabled={busy} aria-label={`Remove ${h.display_name}`} onClick={() => setDeleting(h)}>Remove record</button>
          </div>)}
        </section>)}
      </section>
      {draft && <form className="arbor-panel space-y-4" onSubmit={e => { e.preventDefault(); if (!validHolding(draft, portfolio.catalog)) { setError("Choose a supported investment and enter positive units (up to 12 decimal places). Cost basis is optional PHP with up to 2 decimal places."); return; } void mutate(() => portfolioApi.save(userId, draft, editing)); }}>
        <h3 className="text-lg font-semibold text-slate-900">{editing ? "Edit holding record" : "Add holding"}</h3>
        <label className="block text-sm text-slate-700">Provider<select className={inputClass} required disabled={busy || !!editing} value={draft.provider} onChange={e => setDraft({ ...draft, provider: e.target.value, product_id: "" })}><option value="">Choose provider</option>{[...new Map(portfolio.catalog.map(p => [p.provider, p.provider_name])).entries()].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className="block text-sm text-slate-700">Investment<select className={inputClass} required disabled={busy || !!editing} value={draft.product_id} onChange={e => setDraft({ ...draft, product_id: e.target.value })}><option value="">Choose investment</option>{portfolio.catalog.filter(p => p.provider === draft.provider).map(p => <option key={p.product_id} value={p.product_id}>{p.display_name}</option>)}</select></label>
        <label className="block text-sm text-slate-700">Units<input className={inputClass} inputMode="decimal" required disabled={busy} value={draft.units} onChange={e => setDraft({ ...draft, units: e.target.value })} /></label>
        <label className="block text-sm text-slate-700">Total cost basis (PHP, optional)<input className={inputClass} inputMode="decimal" disabled={busy} value={draft.cost_basis_php ?? ""} onChange={e => setDraft({ ...draft, cost_basis_php: e.target.value || null })} /></label>
        <p className="text-sm text-slate-600">This updates Arbor’s record only. It does not place a trade. Cost basis is saved for reference, not used as current value.</p>
        <button className="entry-primary min-h-11 w-full" disabled={busy}>{busy ? "Saving record…" : "Save holding record"}</button><button type="button" className="entry-link min-h-11" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
      </form>}
      {deleting && <section role="alertdialog" aria-label="Confirm removal" className="arbor-panel"><h3 className="font-semibold text-slate-900">Remove {deleting.display_name} from Arbor?</h3><p className="mt-2 text-sm text-slate-600">This removes the record, not the investment in your provider account. Recorded history stays unchanged.</p><button className="entry-primary mt-4 min-h-11" disabled={busy} onClick={() => void mutate(() => portfolioApi.remove(userId, deleting.id))}>Remove from Arbor</button><button className="entry-link ml-4 min-h-11" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button></section>}
      <PlanAlignment portfolio={portfolio} />
      {scenarioAvailability(value, portfolio) !== "plan_required" ? (
        scenarioAvailability(value, portfolio) === "prices_required" ? <p className="arbor-panel text-sm text-slate-600">Contribution scenarios are paused until complete, fresh reference values are available. Your records remain editable.</p> :
        showContribution ? <ContributionCard key={`${reload}:${portfolio.valued_at}`} value={value} userId={userId} portfolio={portfolio.holdings.length ? portfolio : undefined} /> :
        <button className="entry-primary min-h-11" onClick={() => setShowContribution(true)}>{portfolio.holdings.length ? "Review contribution" : "Explore a hypothetical contribution"}</button>
      ) : <p className="arbor-panel text-sm text-slate-600">Your holdings can be tracked independently. Long-term contribution scenarios need an explicitly selected active long-term plan. Review your plan for the current path.</p>}
      <button className="entry-link min-h-11" onClick={refresh} disabled={busy}>Refresh portfolio</button>
      <DataAttribution sources={portfolio.data_sources ?? []} />
      <p className="text-xs leading-5 text-slate-500">Reference valuations are not executable quotes and may exclude fees or spreads. Provider names and trademarks belong to their respective owners. Arbor is not affiliated with or endorsed by these providers unless explicitly stated.</p>
    </>}
  </div>;
}

export function DataAttribution({ sources }: { sources: string[] }) {
  const known = [
    ["coinranking", "Crypto data by Coinranking", "https://coinranking.com"],
    ["marketstack", "Market data by Marketstack", "https://marketstack.com"],
    ["exchangerate_api", "Rates By Exchange Rate API", "https://www.exchangerate-api.com"],
  ];
  return <div className="flex flex-wrap gap-x-4 text-xs text-slate-500">{known.filter(([key]) => sources.includes(key)).map(([key, label, href]) => <a key={key} className="inline-flex min-h-11 items-center underline" href={href} target="_blank" rel="noopener noreferrer">{label}</a>)}</div>;
}

export function PortfolioSummary({ portfolio: p }: { portfolio: LivePortfolioData }) {
  return <section className="arbor-panel"><p className="text-sm text-slate-600">{p.complete ? "Latest available value · PHP" : "Known portfolio value · PHP"}</p><p className="mt-2 break-words text-3xl font-semibold text-slate-900">{money(p.known_value_php)}</p>
    {p.unavailable_count > 0 && <p role="status" className="mt-2 text-sm text-slate-600">Plus {p.unavailable_count} unavailable holding(s). This is not the complete portfolio value.</p>}
    {p.stale_count > 0 && <p role="status" className="mt-2 text-sm text-slate-600">{p.stale_count} holding(s) use cached prices. Check the dates below.</p>}
  </section>;
}
export function PlanAlignment({ portfolio: p }: { portfolio: LivePortfolioData }) {
  return <section className="arbor-panel"><h3 className="text-lg font-semibold text-slate-900">Plan Alignment</h3><p className="mt-2 text-sm text-slate-600">Current allocation minus your saved target, in percentage points. This is a comparison, not a score or instruction to trade.</p>
    <dl className="mt-4 divide-y divide-slate-200">{p.sleeves.map(s => <div className="py-3" key={s.sleeve}><dt className="font-semibold text-slate-900">{SLEEVE_LABELS[s.sleeve]}</dt><dd className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600"><span>Target: {s.target_percentage === null ? "Not applicable" : `${s.target_percentage}%`}</span><span>Current: {s.current_percentage === null ? "Unavailable" : `${Number(s.current_percentage).toFixed(2)}%`}</span><span>Difference: {s.difference_pp === null ? "Unavailable" : `${Number(s.difference_pp).toFixed(2)}pp`}</span></dd></div>)}</dl>
  </section>;
}
