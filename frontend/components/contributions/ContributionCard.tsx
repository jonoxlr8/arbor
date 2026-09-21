"use client";
import { useEffect, useState } from "react";
import type { PlanV2 } from "@/lib/types/planV2";
import type { ContributionMode, ContributionResult as Result, RouteId, Sleeve } from "@/lib/types/contributions";
import type { RequestState } from "@/lib/dashboardConsistency";
import { contributionRequest, createContributionController, EMPTY_VALUES, needsOwnershipReview, resultProducts, ROUTES, SLEEVE_LABELS } from "@/lib/contributions";
import { getContributionPlan, getContributionRecommendation } from "@/lib/contributionApi";
import ContributionResult from "./ContributionResult";

const inputClass = "mt-1 min-h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-900";

export default function ContributionCard({ value, userId }: { value: PlanV2; userId: string }) {
  const [mode, setMode] = useState<ContributionMode>("plan");
  const [amount, setAmount] = useState("");
  const [holdings, setHoldings] = useState({ ...EMPTY_VALUES });
  const [route, setRoute] = useState<RouteId | "">("");
  const [eligible, setEligible] = useState(false);
  const [ownershipMode, setOwnershipMode] = useState("review");
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [draftOwned, setDraftOwned] = useState<Record<string, boolean>>({});
  const [state, setState] = useState<RequestState<Result> | null>(null);
  const [inputError, setInputError] = useState("");
  const [controller] = useState(() => createContributionController(setState));
  useEffect(() => () => controller.dispose(), [controller]);
  const busy = state?.status === "loading";
  const result = state?.status === "ready" ? state.data : null;
  const review = result && ownershipMode === "review" && needsOwnershipReview(result, confirmed);
  function invalidate() { controller.invalidate(); setInputError(""); }
  async function submit(ownership = confirmed) {
    setInputError("");
    try {
      const request = contributionRequest(value, amount, holdings, route as RouteId,
        ownershipMode === "none" ? [] : Object.keys(ownership).filter(id => ownership[id]), eligible);
      await controller.run(signal => mode === "plan"
        ? getContributionPlan(request, userId, signal) : getContributionRecommendation(request, userId, signal));
    } catch (error) { setInputError(error instanceof Error ? error.message : "Check your inputs."); }
  }
  if (value.plan.path === "long_term" && !value.plan.preference_result?.effective_target) return <section className="arbor-panel"><h2 className="text-xl font-semibold text-slate-900">Invest this month</h2><p role="status" className="mt-3 text-sm text-slate-600">Your effective target is unavailable. Reload your saved plan before calculating a contribution.</p></section>;
  return <section className="arbor-panel w-full max-w-2xl">
    <h2 className="text-2xl font-semibold text-slate-900">Invest this month</h2>
    <p className="mt-2 text-sm text-slate-600">Enter the money available and review where your next contribution could go.</p>
    <div role="group" aria-label="Contribution mode" className="mt-4 grid grid-cols-2 gap-2">{(["plan", "recommendation"] as const).map(option => <button key={option} type="button" aria-pressed={mode === option}
      onClick={() => { invalidate(); setMode(option); }} className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold ${mode === option ? "border-forest bg-forest text-white" : "border-slate-300 text-slate-700"}`}>{option === "plan" ? "Monthly plan" : "Next purchase"}</button>)}</div>
    <form className="mt-5 space-y-5" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label className="block text-sm font-medium text-slate-700">Contribution amount ({value.profile.currency})<input className={inputClass} inputMode="decimal" type="text" required value={amount} placeholder="10000"
        onChange={event => { invalidate(); setAmount(event.target.value); }} /></label>
      <label className="block text-sm font-medium text-slate-700">Your implementation route<select className={inputClass} required value={route}
        onChange={event => { invalidate(); setRoute(event.target.value as RouteId); setConfirmed({}); setDraftOwned({}); setOwnershipMode("review"); setEligible(false); }}>
        <option value="">Choose a route</option>{Object.entries(ROUTES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      {route === "ibkr" && <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700"><input type="checkbox" checked={eligible} onChange={e => { invalidate(); setEligible(e.target.checked); setConfirmed({}); }} />My IBKR account is confirmed eligible for crypto</label>}
      <fieldset><legend className="font-semibold text-slate-900">Current portfolio · {value.profile.currency}</legend>
        <p className="mt-1 text-sm text-slate-600">Enter current market values, not purchase costs or your planning starting amount. Use one currency; Arbor does not convert currencies.</p>
        <button type="button" className="entry-link my-2 min-h-11 text-sm" onClick={() => { invalidate(); setHoldings({ global_equity: "0", defensive: "0", technology_tilt: "0", crypto: "0" }); }}>I have no investments yet — use zero</button>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">{(Object.keys(SLEEVE_LABELS) as Sleeve[]).map(sleeve => <label key={sleeve} className="block min-w-0 text-sm text-slate-700">{SLEEVE_LABELS[sleeve]}<input className={inputClass} inputMode="decimal" type="text" required value={holdings[sleeve]}
          onChange={event => { invalidate(); setHoldings({ ...holdings, [sleeve]: event.target.value }); }} /></label>)}</div>
      </fieldset>
      <fieldset><legend className="text-sm font-semibold text-slate-900">Product ownership</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700"><input type="radio" name="contribution-ownership" checked={ownershipMode === "review"} onChange={() => { invalidate(); setOwnershipMode("review"); setConfirmed({}); }} />Review the proposed products before calculating</label>
        <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700"><input type="radio" name="contribution-ownership" checked={ownershipMode === "none"} onChange={() => { invalidate(); setOwnershipMode("none"); setConfirmed({}); }} />I do not own any products on this route</label>
        <p className="text-xs text-slate-500">This determines first-purchase versus additional-purchase minimums. Your choices stay in this view only.</p>
      </fieldset>
      <button type="submit" disabled={busy} className="entry-primary w-full disabled:opacity-50">{busy ? "Building your plan…" : mode === "plan" ? "Build my contribution plan" : "Find my next purchase"}</button>
    </form>
    <ContributionFeedback loading={busy} error={inputError || (state?.status === "error" ? state.error : "")} />
    {review && result && <section className="mt-5 rounded-2xl border border-slate-200 p-4" aria-label="Confirm product ownership"><h3 className="font-semibold text-slate-900">Which of these products do you already own?</h3><p className="mt-2 text-sm text-slate-600">These are proposed products, not a final purchase plan. Leave unchecked for first purchases. We’ll calculate using your confirmed ownership.</p>
      {resultProducts(result).map(product => <label key={product.product_id} className="flex min-h-12 items-center gap-3 py-3 text-sm text-slate-700"><input type="checkbox" checked={draftOwned[product.product_id] ?? confirmed[product.product_id] ?? false}
        onChange={event => setDraftOwned({ ...draftOwned, [product.product_id]: event.target.checked })} /><span className="min-w-0 break-words">{product.display_name}<span className="block text-xs text-slate-500">{product.platform}</span></span></label>)}
      <button type="button" className="entry-primary mt-3 w-full" onClick={() => {
        const next = { ...confirmed }; for (const product of resultProducts(result)) next[product.product_id] = draftOwned[product.product_id] ?? confirmed[product.product_id] ?? false;
        setConfirmed(next); void submit(next);
      }}>Confirm ownership & calculate</button>
    </section>}
    {result && !review && <ContributionResult result={result} />}
  </section>;
}

export function ContributionFeedback({ loading, error }: { loading?: boolean; error: string }) {
  return <>{loading && <p role="status" className="mt-3 text-sm text-slate-600">Building your plan…</p>}{error && <p role="alert" className="mt-3 text-sm text-slate-700">{error}</p>}</>;
}
