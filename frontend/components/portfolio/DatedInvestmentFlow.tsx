"use client";
import { useEffect, useRef, useState } from "react";
import { addUnitTexts, manilaInvestmentToday, normalizeInvestmentNumber } from "@/lib/investmentEntries";
import { entryDraftError, portfolioApi, supportsManualValue, validEntryDraft, type InvestmentEntryDraft, type LivePortfolioData, type PortfolioProduct } from "@/lib/livePortfolio";
import { investmentIdentity } from "@/lib/investmentIdentity";
import { decimalText, formatContributionMoney } from "@/lib/contributions";
import { needsShareBasis, currentVgtShares, shareBasisLabel } from "@/lib/shareBasis";
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

export default function DatedInvestmentFlow({ portfolio, userId, initialProduct, onClose, onSaved, onOpeningOnly, plannedAmount, monthly = false, allowProductChange=false }:
  { portfolio: LivePortfolioData; userId: string; initialProduct?: PortfolioProduct; onClose: () => void;
    onSaved: (draft: InvestmentEntryDraft) => void; onOpeningOnly: (product: PortfolioProduct) => void; plannedAmount?: string; monthly?: boolean;allowProductChange?:boolean }) {
  const [draft, setDraft] = useState<InvestmentEntryDraft | null>(initialProduct ? fresh(initialProduct) : null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const feedback = useRef<HTMLParagraphElement>(null);
  const confirmation = useRef<HTMLElement>(null);
  useEffect(() => { if (confirm) confirmation.current?.focus(); else if (error) feedback.current?.focus(); }, [confirm, error]);
  const product = portfolio.catalog.find(p => p.product_id === draft?.product_id && p.provider === draft.provider);
  const existing = portfolio.holdings.find(h => h.product_id === draft?.product_id && h.provider === draft.provider);
  const converting = existing?.units === null;
  const prior = existing?.product_id === "gotrade_vgt" ? existing.effective_units ?? "" : existing?.units ?? "0";
  const basis = needsShareBasis(draft?.product_id ?? "", draft?.investment_date) ? draft?.share_basis ?? "before_split" : null;
  let total = "";
  try { total = draft?.units ? prior || !existing ? addUnitTexts(converting ? draft.opening_units || "0" : prior || "0", basis ? currentVgtShares(draft.units, basis) : draft.units) : "" : ""; } catch { /* invalid field is blocked below */ }
  const patch = (changes: Partial<InvestmentEntryDraft>) => {
    setDraft(d => d && { ...d, ...changes, idempotency_key: crypto.randomUUID() });
    setConfirm(false); setError("");
  };
  function review() {
    if (!draft) return;
    const next = { ...draft, units: normalizeInvestmentNumber(draft.units),
      amount_paid_php: draft.amount_paid_php?.trim() ? normalizeInvestmentNumber(draft.amount_paid_php) : null,
      opening_units: draft.opening_units?.trim() ? normalizeInvestmentNumber(draft.opening_units) : null,
      share_basis: basis,
      opening_cost_php: draft.opening_cost_php?.trim() ? normalizeInvestmentNumber(draft.opening_cost_php) : null };
    const message = entryDraftError(next, portfolio.catalog, converting);
    setDraft(next);
    setError(message ?? "");
    setConfirm(!message);
    if (message) feedback.current?.focus();
  }
  async function save() {
    if (!draft || busy || !validEntryDraft(draft, portfolio.catalog) || (converting && (!draft.confirm_conversion || !draft.opening_units))) return;
    setBusy(true); setError("");
    try { await portfolioApi.recordEntry(userId, draft); onSaved(draft); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t save this investment. Retry with the same details."); }
    finally { setBusy(false); }
  }
  return <Sheet title={monthly ? !product ? "Record an investment" : `Record ${investmentIdentity(product.product_id).shortName} investment` : !product ? "Add Investment" : existing ? `Add to ${investmentIdentity(product.product_id).shortName}` : `Add ${investmentIdentity(product.product_id).shortName}`} busy={busy} onClose={onClose}>
    {!product ? <InvestmentCatalogue catalog={portfolio.catalog} onSelect={p => { setDraft(fresh(p)); setError(""); }}/>
    : <div className="investment-form space-y-4">
      {(!initialProduct||allowProductChange) && <button type="button" className="catalogue-back" onClick={() => { setDraft(null); setConfirm(false); }}>‹ All investments</button>}
      <div className="selected-investment"><AssetIdentity product={product.product_id} sleeve={product.sleeve}/><div><strong>{investmentIdentity(product.product_id).fullName}</strong><ProviderBrand provider={product.provider} name={product.provider_name}/></div></div>
      {!monthly && supportsManualValue(product) && !existing && <button type="button" className="entry-link min-h-11" onClick={() => onOpeningOnly(product)}>Track an existing fund value without units instead</button>}
      {!monthly&&<p className="text-sm text-slate-600">Record units actually received. Your investment date is not the time you recorded this in Arbor. No trade is placed.</p>}
      {monthly && <><p className="text-sm text-slate-600">Use the actual details from your provider. {plannedAmount ? `Planned contribution: ${formatContributionMoney(plannedAmount,"PHP")} (context only).` : ""}</p><details className="text-sm"><summary className="min-h-11 cursor-pointer py-2">Where do I find my units?</summary><p>Look for shares, fund units, or BTC in your provider’s transaction record. Arbor won’t estimate units from a planned amount or NAV. The investment date is when you invested, not when you recorded it here. No trade is placed; a check-in stays separate.</p></details></>}
      <label className="block text-sm">Investment date<input type="date" className={field} max={today()} required value={draft!.investment_date} onChange={e => patch({ investment_date: e.target.value, share_basis: null })}/></label>
      <label className="block text-sm">{monthly ? "Total units purchased" : investmentIdentity(product.product_id).category === "bitcoin" ? "BTC received" : product.price_kind === "nav" ? "Fund units received" : "Shares received"}<input className={field} inputMode="decimal" required value={draft!.units} onChange={e => patch({ units: e.target.value })}/></label>
      {needsShareBasis(product.product_id, draft!.investment_date) && <div className="space-y-2 text-sm">
        <p>Enter the original shares purchased, before any stock split.</p>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={basis === "after_split"} onChange={event => patch({share_basis: event.target.checked ? "after_split" : "before_split"})}/>This share count is already adjusted for the April 21, 2026 split.</label>
        <p className="text-slate-600">VGT split 8-for-1. Arbor keeps your entered shares and PHP cost, and converts the shares for valuation.</p>
      </div>}
      <div>
        <label className="block text-sm" htmlFor="investment-amount-paid">{monthly?"Total amount paid (PHP)":"Actual amount paid (PHP)"}</label>
        <input id="investment-amount-paid" className={field} inputMode="decimal" required aria-describedby="investment-amount-paid-help" value={draft!.amount_paid_php ?? ""} onChange={e => patch({ amount_paid_php: e.target.value || null })}/>
        <small id="investment-amount-paid-help" className="mt-1 block text-slate-600">{monthly?"Total paid for this purchase, not the price per unit. Check your provider’s record if you’re unsure.":"Enter the total PHP paid for this purchase, not the price per unit, as shown in your provider record. Return later if you don’t know it yet; Arbor won’t estimate it."}</small>
      </div>
      {converting && <section className="arbor-panel space-y-3"><h3 className="font-semibold">Confirm your existing fund position</h3><p className="text-sm text-slate-600">You currently track this fund by a PHP value only. Enter units you already owned separately; Arbor will not infer them from NAV or treat them as a purchase today. The old whole-position value will clear because it cannot include this new addition; you can enter an updated current value if NAV is unavailable.</p>
        <label className="block text-sm">Units already owned<input className={field} inputMode="decimal" value={draft!.opening_units ?? ""} onChange={e => patch({ opening_units: e.target.value || null })}/></label>
        <label className="block text-sm">Known cost of those units (PHP, optional)<input className={field} inputMode="decimal" value={draft!.opening_cost_php ?? ""} onChange={e => patch({ opening_cost_php: e.target.value || null })}/></label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={!!draft!.confirm_conversion} onChange={e => patch({ confirm_conversion: e.target.checked })}/>I confirm these are existing units, not part of the new dated investment.</label>
      </section>}
      {monthly?<details className="text-sm"><summary className="min-h-11 cursor-pointer py-2">How this changes your recorded units</summary><dl className="detail-facts"><div><dt>Previously recorded</dt><dd>{converting ? `${draft!.opening_units || "—"} units to confirm` : `${decimalText(prior)} units`}</dd></div><div><dt>Adding</dt><dd>{draft!.units || "—"} units</dd></div><div><dt>Current shares after this addition</dt><dd>{total || "—"} units</dd></div></dl></details>:(<dl className="detail-facts"><div><dt>Previously recorded</dt><dd>{converting ? `${draft!.opening_units || "—"} units to confirm` : `${decimalText(prior)} units`}</dd></div><div><dt>Adding</dt><dd>{draft!.units || "—"} units</dd></div><div><dt>Current shares after this addition</dt><dd>{total || "—"} units</dd></div></dl>)}
      {!confirm ? <button type="button" className="entry-primary min-h-12 w-full" disabled={busy} onClick={review}>Review investment</button>
      : <section ref={confirmation} tabIndex={-1} className="arbor-panel space-y-3" aria-label="Confirm investment"><h3 className="font-semibold">Review investment</h3><dl className="detail-facts"><div><dt>Investment</dt><dd>{investmentIdentity(product.product_id).shortName}</dd></div><div><dt>Provider</dt><dd>{product.provider_name}</dd></div><div><dt>Investment date</dt><dd>{draft!.investment_date}</dd></div><div><dt>Units received</dt><dd>{draft!.units} {investmentIdentity(product.product_id).category === "bitcoin" ? "BTC" : product.price_kind === "nav" ? "units" : "shares"}</dd></div>{basis && <div><dt>Share count basis</dt><dd>{shareBasisLabel(basis)}</dd></div>}<div><dt>Amount paid</dt><dd>{formatContributionMoney(draft!.amount_paid_php!,"PHP")}</dd></div></dl><p className="text-sm">This records the details you entered. It doesn’t place a trade or create a historical portfolio value.</p><button type="button" className="entry-primary min-h-12 w-full" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Confirm and save"}</button><button type="button" className="entry-secondary min-h-11 w-full" onClick={() => setConfirm(false)}>Edit details</button></section>}
      {error && <p ref={feedback} tabIndex={-1} role="alert" className="text-sm text-red-700">{error}</p>}
    </div>}
  </Sheet>;
}
