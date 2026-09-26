"use client";
import { useState } from "react";
import { addUnitTexts, manilaInvestmentToday } from "@/lib/investmentEntries";
import { portfolioApi, supportsManualValue, validEntryDraft, type InvestmentEntryDraft, type LivePortfolioData, type PortfolioProduct } from "@/lib/livePortfolio";
import { investmentIdentity } from "@/lib/investmentIdentity";
import { decimalText, formatContributionMoney } from "@/lib/contributions";
import InvestmentCatalogue from "./InvestmentCatalogue";
import Sheet from "../ui/Sheet";
import AssetIdentity from "../AssetIdentity";
import ProviderBrand from "../ProviderBrand";

const field = "mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900";
const today = manilaInvestmentToday;
function fresh(product: PortfolioProduct): InvestmentEntryDraft {
  return { product_id: product.product_id, provider: product.provider, investment_date: today(), units: "",
    amount_paid_php: null, idempotency_key: crypto.randomUUID(), opening_units: null, opening_cost_php: null, confirm_conversion: false };
}

export default function DatedInvestmentFlow({ portfolio, userId, initialProduct, onClose, onSaved, onOpeningOnly }:
  { portfolio: LivePortfolioData; userId: string; initialProduct?: PortfolioProduct; onClose: () => void;
    onSaved: () => void; onOpeningOnly: (product: PortfolioProduct) => void }) {
  const [draft, setDraft] = useState<InvestmentEntryDraft | null>(initialProduct ? fresh(initialProduct) : null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const product = portfolio.catalog.find(p => p.product_id === draft?.product_id && p.provider === draft.provider);
  const existing = portfolio.holdings.find(h => h.product_id === draft?.product_id && h.provider === draft.provider);
  const converting = existing?.units === null;
  const prior = existing?.units ?? "0";
  let total = "";
  try { total = draft?.units ? addUnitTexts(converting ? draft.opening_units || "0" : prior, draft.units) : ""; } catch { /* invalid field is blocked below */ }
  const patch = (changes: Partial<InvestmentEntryDraft>) => {
    setDraft(d => d && { ...d, ...changes, idempotency_key: crypto.randomUUID() });
    setConfirm(false); setError("");
  };
  async function save() {
    if (!draft || busy || !validEntryDraft(draft, portfolio.catalog) || (converting && (!draft.confirm_conversion || !draft.opening_units))) return;
    setBusy(true); setError("");
    try { await portfolioApi.recordEntry(userId, draft); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t save this investment. Retry with the same details."); }
    finally { setBusy(false); }
  }
  return <Sheet title={!product ? "Add Investment" : existing ? `Add to ${investmentIdentity(product.product_id).shortName}` : `Add ${investmentIdentity(product.product_id).shortName}`} busy={busy} onClose={onClose}>
    {!product ? <InvestmentCatalogue catalog={portfolio.catalog} onSelect={p => { setDraft(fresh(p)); setError(""); }}/>
    : <div className="investment-form space-y-4">
      {!initialProduct && <button type="button" className="catalogue-back" onClick={() => { setDraft(null); setConfirm(false); }}>‹ All investments</button>}
      <div className="selected-investment"><AssetIdentity product={product.product_id} sleeve={product.sleeve}/><div><strong>{investmentIdentity(product.product_id).fullName}</strong><ProviderBrand provider={product.provider} name={product.provider_name}/></div></div>
      {supportsManualValue(product) && !existing && <button type="button" className="entry-link min-h-11" onClick={() => onOpeningOnly(product)}>Track an existing fund value without units instead</button>}
      <p className="text-sm text-slate-600">Record units actually received. Your investment date is not the time you recorded this in Arbor. No trade is placed.</p>
      <label className="block text-sm">Investment date<input type="date" className={field} max={today()} required value={draft!.investment_date} onChange={e => patch({ investment_date: e.target.value })}/></label>
      <label className="block text-sm">{investmentIdentity(product.product_id).category === "bitcoin" ? "BTC received" : product.price_kind === "nav" ? "Fund units received" : "Shares received"}<input className={field} inputMode="decimal" required value={draft!.units} onChange={e => patch({ units: e.target.value })}/></label>
      <label className="block text-sm">Actual total paid (PHP, optional)<input className={field} inputMode="decimal" value={draft!.amount_paid_php ?? ""} onChange={e => patch({ amount_paid_php: e.target.value || null })}/></label>
      {converting && <section className="arbor-panel space-y-3"><h3 className="font-semibold">Confirm your existing fund position</h3><p className="text-sm text-slate-600">You currently track this fund by a PHP value only. Enter units you already owned separately; Arbor will not infer them from NAV or treat them as a purchase today. The old whole-position value will clear because it cannot include this new addition; you can enter an updated current value if NAV is unavailable.</p>
        <label className="block text-sm">Units already owned<input className={field} inputMode="decimal" value={draft!.opening_units ?? ""} onChange={e => patch({ opening_units: e.target.value || null })}/></label>
        <label className="block text-sm">Known cost of those units (PHP, optional)<input className={field} inputMode="decimal" value={draft!.opening_cost_php ?? ""} onChange={e => patch({ opening_cost_php: e.target.value || null })}/></label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={!!draft!.confirm_conversion} onChange={e => patch({ confirm_conversion: e.target.checked })}/>I confirm these are existing units, not part of the new dated investment.</label>
      </section>}
      <dl className="detail-facts"><div><dt>Previously recorded</dt><dd>{converting ? `${draft!.opening_units || "—"} units to confirm` : `${decimalText(prior)} units`}</dd></div><div><dt>Adding</dt><dd>{draft!.units || "—"} units</dd></div><div><dt>New recorded total</dt><dd>{total || "—"} units</dd></div></dl>
      {!confirm ? <button type="button" className="entry-primary min-h-12 w-full" disabled={!validEntryDraft(draft!,portfolio.catalog) || !!converting && (!draft!.confirm_conversion || !draft!.opening_units)} onClick={() => setConfirm(true)}>Review investment</button>
      : <section className="arbor-panel space-y-3" aria-label="Confirm investment"><h3 className="font-semibold">Confirm dated addition</h3><p className="text-sm">{draft!.investment_date}: add {draft!.units} units to {product.display_name} at {product.provider_name}. {draft!.amount_paid_php === null ? "Actual PHP cost not recorded." : `Actual paid: ${formatContributionMoney(draft!.amount_paid_php,"PHP")}.`} New total: {total} units.</p><button type="button" className="entry-primary min-h-12 w-full" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Confirm and save"}</button><button type="button" className="entry-secondary min-h-11 w-full" onClick={() => setConfirm(false)}>Edit details</button></section>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>}
  </Sheet>;
}
