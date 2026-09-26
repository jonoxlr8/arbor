"use client";
import { useEffect, useRef, useState } from "react";
import type { PlanV2 } from "@/lib/types/planV2";
import { portfolioApi, portfolioReadError, validHolding, freshnessText, supportsManualValue, validManualValue, type HoldingDraft, type LivePortfolioData, type PortfolioHolding, type PortfolioProduct } from "@/lib/livePortfolio";
import { decimalText, formatContributionMoney, SLEEVE_LABELS } from "@/lib/contributions";
import PortfolioHistoryChart from "./PortfolioHistoryChart";
import ProviderBrand from "../ProviderBrand";
import AssetIdentity, { sleeveColors } from "../AssetIdentity";
import Sheet from "../ui/Sheet";
import Allocation from "./Allocation";
import InvestmentCatalogue from "./InvestmentCatalogue";
import { investmentIdentity, providerName } from "@/lib/investmentIdentity";
import { ArborMark } from "../Logo";
import PlanImplementation from "./PlanImplementation";
import DatedInvestmentFlow from "./DatedInvestmentFlow";
import HoldingActivity from "./HoldingActivity";
import InvestmentHistory from "./InvestmentHistory";

const inputClass = "mt-1 min-h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white p-3 text-slate-900";
const blank = (): HoldingDraft => ({ provider: "", product_id: "", units: null, cost_basis_php: null, manual_value_php: null });
const money = (v: string) => formatContributionMoney(v, "PHP");
const recordedGain = (h: PortfolioHolding) => {
  if (h.recorded_gain_php == null) return "Recorded cost needed";
  const negative = h.recorded_gain_php.startsWith("-");
  const amount = money(negative ? h.recorded_gain_php.slice(1) : h.recorded_gain_php);
  const percentage = h.recorded_gain_percentage == null ? "" : ` · ${Number(h.recorded_gain_percentage).toFixed(1)}%`;
  return `${negative ? "−" : "+"}${amount}${percentage} vs recorded cost`;
};

export default function LivePortfolio({ value, userId, section = "", onPlanChange }: { value: PlanV2; userId: string; section?: string; onPlanChange?: (value:PlanV2)=>void }) {
  const [portfolio, setPortfolio] = useState<LivePortfolioData | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [captureOnRead, setCaptureOnRead] = useState(true);
  const [busy, setBusy] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [detail, setDetail] = useState<PortfolioHolding | null>(null);
  const [tab, setTab] = useState("holdings");
  const pending = useRef(false);
  const [draft, setDraft] = useState<HoldingDraft | null>(null);
  const [editing, setEditing] = useState<string>();
  const [deleting, setDeleting] = useState<PortfolioHolding | null>(null);
  const [manual, setManual] = useState<{ holding: PortfolioHolding; value: string } | null>(null);
  const [entryProduct, setEntryProduct] = useState<PortfolioProduct | null | undefined>(section === "add" ? null : undefined);
  const [opening, setOpening] = useState<{ holding: PortfolioHolding; units: string; cost: string } | null>(null);
  const portfolioLoaded = portfolio !== null;
  useEffect(() => {
    if (section === "holdings") document.getElementById("section-holdings")?.scrollIntoView({ block: "start" });
  }, [portfolioLoaded, section]);
  useEffect(() => {
    const controller = new AbortController();
    portfolioApi.read(userId, controller.signal).then(async data => {
      if (controller.signal.aborted) return;
      setPortfolio(data);
      if (captureOnRead && data.holdings.length && data.complete && !data.stale_count) {
        try {
          const result = await portfolioApi.capture(userId, controller.signal);
          if (!controller.signal.aborted && Array.isArray(result.history)) setPortfolio({ ...data, history: result.history });
        } catch { if (!controller.signal.aborted) setHistoryError(true); }
      }
    }).catch(error => { if (!controller.signal.aborted) setError(portfolioReadError(error).message); });
    return () => controller.abort();
  }, [userId, reload, captureOnRead]);
  function refresh() { setCaptureOnRead(true); setPortfolio(null); setError(""); setHistoryError(false); setReload(n => n + 1); }
  // Error recovery is read-only. Normal entry and post-edit snapshot behavior remain unchanged.
  function retryRead() { setCaptureOnRead(false); setPortfolio(null); setError(""); setHistoryError(false); setReload(n => n + 1); }
  async function mutate(work: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await work(); setDraft(null); setDeleting(null); setManual(null); setOpening(null); setEntryProduct(undefined); setDetail(null); setEditing(undefined); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "We couldn’t update your record. Please retry."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="w-full min-w-0 space-y-6">
    <header className="portfolio-toolbar"><span className="portfolio-context">Your investments, together</span><div className="portfolio-actions"><button type="button" className="refresh-control" aria-label="Refresh portfolio" title="Refresh portfolio" onClick={refresh} disabled={busy}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20 7v5h-5M4 17v-5h5M19 12a7 7 0 0 0-12-5L4 10m16 4-3 3A7 7 0 0 1 5 12"/></svg></button><button className="entry-primary portfolio-add" disabled={busy || !portfolio} onClick={() => setEntryProduct(null)}>+ Add Investment</button></div></header>
    {error && <div role="alert" className="arbor-panel text-sm text-slate-700">{error}<button disabled={busy} className="entry-link ml-3 min-h-11" onClick={retryRead}>Retry</button></div>}
    {!portfolio && !error && <div role="status" className="portfolio-skeleton"><span className="sr-only">Loading your portfolio…</span><div/><div/><div/></div>}
    {portfolio && <>
      <div className="portfolio-tabs" role="group" aria-label="Portfolio sections">{["holdings", "performance", "allocation", "history"].map(item => <button key={item} className="min-h-11" aria-pressed={tab === item} onClick={() => setTab(item)}>{({holdings:"Holdings",performance:"Performance",allocation:"Allocation",history:"History"} as Record<string,string>)[item]}</button>)}</div>
      {historyError && <p role="status" className="text-sm text-slate-600">Current values are available, but today’s history could not be recorded. Please retry later.</p>}
      {tab === "holdings" && <section id="section-holdings" aria-label="Holdings">
        {!portfolio.holdings.length ? <>
          {value.plan.path === "long_term" && value.plan.readiness.actionable_contribution_guidance_allowed ? <PlanImplementation value={value} userId={userId} onPlanChange={onPlanChange} onRecord={() => setEntryProduct(null)}/>
          : <div className="portfolio-empty"><span className="companion-mark mx-auto mb-5"><ArborMark className="h-8 w-8"/></span><h3>No investments recorded yet</h3><p>You can record investments you already own. Your plan’s current readiness and horizon guidance remain unchanged.</p></div>}
        </> : <div className="holdings-list">{portfolio.holdings.map(h => <button type="button" className="holding-row" key={h.id} aria-label={`View ${h.display_name}`} onClick={() => setDetail(h)}>
          <AssetIdentity product={h.product_id} sleeve={h.sleeve}/><span className="holding-copy"><strong>{investmentIdentity(h.product_id,h.display_name).shortName}</strong>{investmentIdentity(h.product_id).category === "etf" && <span className="holding-full-name">{investmentIdentity(h.product_id).fullName}</span>}<span className="mt-1 block"><ProviderBrand provider={h.provider} name={h.provider_name}/></span><small>{h.units === null ? "Units not recorded" : `${decimalText(h.units)} ${h.sleeve === "crypto" ? "BTC" : supportsManualValue(h) ? "units" : "shares"}`} · {h.unit_price && h.unit_price_currency ? `${h.unit_price_currency === "USD" ? "US$" : "₱"}${decimalText(h.unit_price)} per unit` : "Unit price unavailable"}</small></span><span className="holding-money">{h.value_php === null ? "Value unavailable" : money(h.value_php)}<small>{recordedGain(h)}</small></span><span className="row-chevron" aria-hidden="true">›</span>
        </button>)}</div>}
        {!!portfolio.holdings.length && <details className="provider-totals"><summary className="min-h-11 cursor-pointer text-sm text-slate-600">Value by provider</summary><dl className="detail-facts">{Object.entries(portfolio.provider_values_php).map(([provider, value]) => <div key={provider}><dt>{providerName(provider)}</dt><dd>{money(value)}{portfolio.holdings.some(h => h.provider === provider && h.value_php === null) ? " · incomplete" : ""}</dd></div>)}</dl></details>}
      </section>}
      {!!portfolio.holdings.length && <div className="portfolio-value"><PortfolioSummary portfolio={portfolio} /><PortfolioHistoryChart key={tab === "performance" ? "performance" : "overview"} history={portfolio.history} performance={tab === "performance"}/></div>}
      {tab === "allocation" && <>{portfolio.complete && portfolio.sleeves.some(s => s.current_percentage !== null) && <Allocation weights={portfolio.sleeves.filter(s => s.current_percentage !== null).map(s => ({role:s.sleeve, percentage_points:Number(s.current_percentage)}))} label="Current allocation"/>}<PlanAlignment portfolio={portfolio}/></>}
      {tab === "performance" && <p className="performance-note">The chart compares real recorded portfolio values, not investment returns. Dated additions are listed separately; Arbor does not attribute portfolio changes to deposits or market movement.</p>}
      {tab === "history" && <section className="portfolio-history-list"><h3 className="text-lg font-semibold">Your recorded history</h3><p className="mt-2 text-sm text-slate-600">Real portfolio observations only. <a className="entry-link" href="#home/monthly">Monthly check-ins</a> are recorded separately.</p><dl className="detail-facts">{[...portfolio.history].reverse().map(point => <div key={point.day}><dt>{point.day}</dt><dd>{money(point.value_php)}</dd></div>)}</dl>{!portfolio.history.length && <p className="mt-4 text-sm text-slate-600">No portfolio observations recorded yet.</p>}<InvestmentHistory userId={userId}/></section>}
      {detail && <Sheet title={detail.display_name} onClose={() => setDetail(null)}>
        <div className="flex items-center gap-3"><AssetIdentity product={detail.product_id} sleeve={detail.sleeve}/><ProviderBrand provider={detail.provider} name={detail.provider_name}/></div>
        <p className="mt-6 text-4xl font-semibold">{detail.value_php === null ? "Value unavailable" : money(detail.value_php)}</p><p className="mt-2 text-sm text-slate-600">{freshnessText(detail)}</p>
        <dl className="detail-facts"><div><dt>Units</dt><dd>{detail.units === null ? "Not recorded" : decimalText(detail.units)}</dd></div><div><dt>Current unit price</dt><dd>{detail.unit_price && detail.unit_price_currency ? `${detail.unit_price_currency === "USD" ? "US$" : "₱"}${decimalText(detail.unit_price)}` : "Unavailable"}</dd></div><div><dt>Recorded cost</dt><dd>{detail.cost_basis_php === null ? "Recorded cost needed" : money(detail.cost_basis_php)}</dd></div><div><dt>Plan sleeve</dt><dd>{SLEEVE_LABELS[detail.sleeve]}</dd></div></dl>
        {detail.units === null && <p className="text-sm text-slate-600">Arbor uses the value you entered. Add your fund units to enable automatic NAV-based tracking when a usable NAV is available.</p>}
        <div className="mt-6 space-y-3">
        <button className="entry-primary min-h-12 w-full" onClick={() => { setEntryProduct(portfolio.catalog.find(p => p.product_id === detail.product_id && p.provider === detail.provider)); setDetail(null); }}>Add more</button>
        {supportsManualValue(detail) && <button className="entry-primary w-full" onClick={() => { setManual({holding:detail,value:detail.manual_value_php ?? ""}); setDetail(null); }}>{detail.manual_value_php ? "Update current value" : "Add current value"}</button>}
        {detail.opening_units && Number(detail.opening_units) > 0 && <button className="entry-secondary min-h-11 w-full" onClick={() => { setOpening({holding:detail,units:detail.opening_units ?? "0",cost:detail.opening_cost_php ?? ""}); setDetail(null); }}>Correct opening position</button>}
        {!detail.has_entries && <button className="entry-link min-h-11" aria-label={`Remove ${detail.display_name}`} onClick={() => {setDeleting(detail);setDetail(null);}}>Remove opening position</button>}</div>
        <HoldingActivity holding={detail} userId={userId} onChanged={() => { setDetail(null); refresh(); }}/>
      </Sheet>}
      {opening && <Sheet title="Correct opening position" busy={busy} onClose={() => setOpening(null)}><form className="space-y-4" onSubmit={e => {e.preventDefault(); void mutate(() => portfolioApi.correctOpening(userId,opening.holding.id,opening.holding.updated_at,opening.units,opening.cost || null));}}>
        <p className="text-sm text-slate-600">This corrects units you already owned before dated additions were recorded. It does not create a purchase or invent an acquisition date.</p>
        <label className="block text-sm">Opening units<input className={inputClass} inputMode="decimal" required value={opening.units} onChange={e => setOpening({...opening,units:e.target.value})}/></label>
        <label className="block text-sm">Known opening cost (PHP, optional)<input className={inputClass} inputMode="decimal" value={opening.cost} onChange={e => setOpening({...opening,cost:e.target.value})}/></label>
        <p className="text-sm">Previously: {decimalText(opening.holding.opening_units ?? "0")} units. Corrected opening: {opening.units || "—"} units. Later dated additions remain separate.</p>
        <button className="entry-primary min-h-11 w-full" disabled={busy || !/^\d{1,12}(?:\.\d{1,12})?$/.test(opening.units) || opening.cost !== "" && !/^\d{1,16}(?:\.\d{1,2})?$/.test(opening.cost)}>Confirm correction</button>
      </form></Sheet>}
      {entryProduct !== undefined && <DatedInvestmentFlow portfolio={portfolio} userId={userId} initialProduct={entryProduct ?? undefined} onClose={() => setEntryProduct(undefined)} onSaved={() => { setEntryProduct(undefined); refresh(); }} onOpeningOnly={p => { setEntryProduct(undefined); setDraft({...blank(),product_id:p.product_id,provider:p.provider}); }}/>}
      {manual && <Sheet title="Current fund value" busy={busy} onClose={() => setManual(null)}><form className="arbor-panel min-w-0 space-y-4" onSubmit={e => { e.preventDefault(); if (!validManualValue(manual.value)) { setError("Enter a positive PHP value with up to 2 decimal places."); return; } void mutate(() => portfolioApi.manualValue(userId, manual.holding.id, manual.value)); }}>
        <h3 className="font-semibold text-slate-900">{manual.holding.display_name}</h3>
        <p className="text-sm text-slate-600">Enter the current value shown in {manual.holding.provider === "gcash" ? "GFunds" : "DragonFi"}. This is the whole holding’s value, not a unit price.</p>
        <label className="block text-sm text-slate-700">Current value (PHP)<input required inputMode="decimal" className={inputClass} disabled={busy} value={manual.value} onChange={e => setManual({ ...manual, value: e.target.value })} /></label>
        <p className="text-sm text-slate-600">Your value is used for seven days. Arbor has not independently verified it. A usable NAV takes priority only when fund units are recorded.</p>
        <button disabled={busy} className="entry-primary min-h-11 w-full">{busy ? "Saving value…" : "Save current value"}</button>
        {manual.holding.manual_value_php && (manual.holding.units !== null ? <button type="button" disabled={busy} className="entry-secondary min-h-11 w-full" onClick={() => void mutate(() => portfolioApi.manualValue(userId, manual.holding.id, null))}>Clear current value — keep holding</button> : <p className="text-sm text-slate-600">To clear this value, first add fund units in Edit record. Otherwise, remove the holding.</p>)}
        <button type="button" disabled={busy} className="entry-link min-h-11" onClick={() => setManual(null)}>Cancel</button>
      {error && <p role="alert" className="text-sm">{error}</p>}</form></Sheet>}
      {draft && <Sheet title={editing ? "Edit opening position" : draft.product_id ? `Track existing ${investmentIdentity(draft.product_id).shortName}` : "Track existing fund"} busy={busy} onClose={() => setDraft(null)}>{!draft.product_id ? <InvestmentCatalogue catalog={portfolio.catalog} onSelect={p => { setDraft({...blank(),provider:p.provider,product_id:p.product_id});setError(""); }}/> : <form className="investment-form space-y-4" onSubmit={e => { e.preventDefault(); if (!validHolding(draft, portfolio.catalog)) { setError("For a fund, enter a positive PHP current value or fund units. ETFs and Bitcoin require positive units. PHP amounts support up to 2 decimal places."); return; } void mutate(() => portfolioApi.save(userId, draft, editing)); }}>
        {!editing && <button type="button" className="catalogue-back" onClick={() => {setDraft(blank());setError("");}}>‹ All investments</button>}
        <div className="selected-investment"><AssetIdentity product={draft.product_id} sleeve={portfolio.catalog.find(p=>p.product_id===draft.product_id)?.sleeve ?? "global_equity"}/><div><strong>{investmentIdentity(draft.product_id).fullName}</strong>{investmentIdentity(draft.product_id).unitClass && <small>{investmentIdentity(draft.product_id).unitClass}</small>}<ProviderBrand provider={draft.provider}/></div></div>
        {supportsManualValue(draft) && <><label className="block text-sm text-slate-700">Current value (PHP)<span className="peso-input"><span aria-hidden="true">₱</span><input aria-label="Current value (PHP)" className={inputClass} inputMode="decimal" disabled={busy} value={draft.manual_value_php ?? ""} onChange={e => setDraft({ ...draft, manual_value_php: e.target.value || null })} /></span></label><p className="text-sm text-slate-600">Enter the current value shown in {draft.provider === "gcash" ? "GFunds" : "DragonFi"}. Update it every seven days.</p></>}
        {supportsManualValue(draft) ? <details open={!!draft.units}><summary className="min-h-11 cursor-pointer text-sm text-slate-700">I know my fund units</summary><label className="block text-sm text-slate-700">Units (optional)<input className={inputClass} inputMode="decimal" disabled={busy} value={draft.units ?? ""} onChange={e => setDraft({ ...draft, units: e.target.value || null })} /></label><p className="mt-2 text-sm text-slate-600">Recorded units enable automatic valuation when a usable fund NAV is available. You can also track with units alone.</p></details> : <label className="block text-sm text-slate-700">{investmentIdentity(draft.product_id).category === "bitcoin" ? "Bitcoin amount (BTC)" : "Shares"}<input className={inputClass} inputMode="decimal" required disabled={busy} value={draft.units ?? ""} onChange={e => setDraft({ ...draft, units: e.target.value || null })} /></label>}
        <details><summary className="min-h-11 cursor-pointer text-sm">More details (optional)</summary><label className="block text-sm text-slate-700">Total cost basis (PHP, optional)<input className={inputClass} inputMode="decimal" disabled={busy} value={draft.cost_basis_php ?? ""} onChange={e => setDraft({ ...draft, cost_basis_php: e.target.value || null })} /></label>
        <p className="text-sm text-slate-600">This is an existing opening position, not a dated purchase. Cost is saved for reference, never used as current value.</p></details>
        <p className="form-footnote">Arbor records what you already own. No purchase date is invented and no trade is placed.</p><button className="entry-primary min-h-11 w-full" disabled={busy}>{busy ? "Saving…" : "Save opening position"}</button><button type="button" className="entry-link min-h-11" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
      {error && <p role="alert" className="text-sm">{error}</p>}</form>}</Sheet>}
      {deleting && <Sheet title="Remove holding" busy={busy} onClose={() => setDeleting(null)}><section aria-label="Confirm removal"><h3 className="font-semibold text-slate-900">Remove {deleting.display_name} from Arbor?</h3><p className="mt-2 text-sm text-slate-600">This removes the record, not the investment in your provider account. Recorded history stays unchanged.</p><button className="entry-primary mt-4 min-h-11" disabled={busy} onClick={() => void mutate(() => portfolioApi.remove(userId, deleting.id))}>Remove from Arbor</button><button className="entry-link ml-4 min-h-11" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button>{error && <p role="alert">{error}</p>}</section></Sheet>}
      {!!portfolio.holdings.length && value.plan.path === "long_term" && value.plan.readiness.actionable_contribution_guidance_allowed && <details className="portfolio-ways-details" open={section==="ways"}><summary>Ways to invest your plan</summary><PlanImplementation value={value} intro={false} userId={userId} onPlanChange={onPlanChange} onRecord={() => setEntryProduct(null)}/></details>}
      <footer className="portfolio-data"><details><summary>About prices &amp; data</summary><p>Reference values may exclude fees or spreads. A value entered by you is not an official fund NAV. Provider names belong to their owners; Arbor is not affiliated with or endorsed by them.</p></details><DataAttribution sources={portfolio.data_sources ?? []} /></footer>
    </>}
  </div>;
}

export function DataAttribution({ sources }: { sources: string[] }) {
  const known = [
    ["coinranking", "Crypto data by Coinranking", "https://coinranking.com"],
    ["marketstack", "Market data by Marketstack", "https://marketstack.com"],
    ["exchangerate_api", "Rates By Exchange Rate API", "https://www.exchangerate-api.com"],
    ["toap", "NAV data by TOAP / UITF.com.ph", "https://uitf.com.ph"],
  ];
  return <div className="flex flex-wrap gap-x-4 text-xs text-slate-500">{known.filter(([key]) => sources.includes(key)).map(([key, label, href]) => <a key={key} className="inline-flex min-h-11 items-center underline" href={href} target="_blank" rel="noopener noreferrer">{label}</a>)}</div>;
}

export function PortfolioSummary({ portfolio: p }: { portfolio: LivePortfolioData }) {
  return <section><p className="text-sm text-slate-600">{p.complete ? "Portfolio value" : "Known portfolio value · PHP"}</p><p className="value-number mt-2 break-words font-semibold text-slate-900">{money(p.known_value_php)}</p>
    {p.unavailable_count > 0 && <p role="status" className="mt-2 text-sm text-slate-600">Plus {p.unavailable_count} unavailable holding(s). This is not the complete portfolio value.</p>}
    {p.stale_count > 0 && <p role="status" className="mt-2 text-sm text-slate-600">{p.stale_count} holding(s) use cached prices. Check the dates below.</p>}
  </section>;
}
export function PlanAlignment({ portfolio: p }: { portfolio: LivePortfolioData }) {
  return <section className="mt-8"><h3 className="text-lg font-semibold text-slate-900">Plan Alignment</h3><p className="mt-2 text-sm text-slate-600">Compare what you’ve recorded with the targets you chose. This is a comparison, not a score or instruction to trade.</p>
    {!p.complete && <p role="status" className="mt-3 text-sm text-slate-600">Current allocation needs a usable value for every holding. Review {p.holdings.filter(h => h.value_php === null).map(h => investmentIdentity(h.product_id,h.display_name).shortName).join(", ") || "your recorded investments"} in Holdings. Unavailable values are not counted as zero.</p>}
    <dl className="mt-4 divide-y divide-slate-200">{p.sleeves.map(s => <div className="py-3" key={s.sleeve}><dt className="font-semibold text-slate-900">{SLEEVE_LABELS[s.sleeve]}</dt><dd className="mt-2">{s.current_percentage !== null && <div className="alignment-track" aria-hidden="true"><span style={{background:sleeveColors[s.sleeve],width:`${Math.min(100, Math.max(0, Number(s.current_percentage)))}%`}}/></div>}<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600"><span>Target: {s.target_percentage === null ? "Not applicable" : `${s.target_percentage}%`}</span><span>Current: {s.current_percentage === null ? "Unavailable" : `${Number(s.current_percentage).toFixed(2)}%`}</span><span>{s.difference_pp === null ? "Comparison unavailable" : Number(s.difference_pp) === 0 ? "At your target" : `${Math.abs(Number(s.difference_pp)).toFixed(2)} percentage points ${Number(s.difference_pp) < 0 ? "below" : "above"} your target`}</span></div></dd></div>)}</dl>
  </section>;
}
