"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { readEntitlements, type AskUsage, type Entitlements } from "@/lib/entitlements";

type Access = { value: Entitlements | null; error: string; retry: () => void; updateUsage?: (usage: AskUsage) => void };
export const AccountAccessContext = createContext<Access | null>(null);
export const useAccountAccess = () => useContext(AccountAccessContext);

export function AccountAccessProvider({ userId, children }: { userId?: string; children: ReactNode }) {
  const [value, setValue] = useState<Entitlements | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const updateUsage = useCallback((usage: AskUsage) => setValue(previous => previous ? {...previous, ask_usage: usage} : previous), []);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    readEntitlements(userId, controller.signal).then(result => {
      if (!controller.signal.aborted) { setValue(result); setError(""); }
    }).catch(() => { if (!controller.signal.aborted) setError("We couldn’t check your Arbor access. Please retry."); });
    return () => controller.abort();
  }, [userId, attempt]);
  return <AccountAccessContext.Provider value={{ value, error, updateUsage, retry: () => { setError(""); setAttempt(n => n+1); } }}>{children}</AccountAccessContext.Provider>;
}

export function AccessLoading() {
  const access = useAccountAccess();
  return <div className="arbor-panel"><p role={access?.error ? "alert" : "status"} className="text-sm text-slate-600">{access?.error || "Checking your Arbor access…"}</p>
    {access?.error && <button className="entry-secondary mt-3 min-h-11" onClick={access.retry}>Retry</button>}</div>;
}

export function PlusFeature({ feature, title, children, onBack }: { feature: string; title: string; children?: ReactNode; onBack?: () => void }) {
  const access = useAccountAccess();
  if (!access?.value) return <AccessLoading />;
  if (access.value.features.includes(feature)) return children;
  return <section className="arbor-panel"><p className="eyebrow plus-eyebrow">Arbor Plus</p>
    <h2 className="mt-2 text-xl font-semibold text-slate-900">{title}</h2>
    <p className="mt-3 text-sm leading-6 text-slate-600">Explore this planning tool with Arbor Plus. Your saved plan and investment records remain available on Free.</p>
    <a href="#settings/plus" onClick={onBack} className="entry-secondary mt-4 inline-flex min-h-11 items-center">Explore Arbor Plus</a>
    {onBack && <button className="entry-link mt-3 min-h-11 w-full" onClick={onBack}>Back to your plan</button>}</section>;
}

export function accountPlanLabel(value:Entitlements){return value.effective_tier==="free"?"Arbor Free":value.status==="trial"?"Arbor Plus Trial":"Arbor Plus";}

export function ComparePlans({ value }: { value: Entitlements }) {
  return <section className="arbor-panel" aria-labelledby="compare-plans-title">
    <h2 id="compare-plans-title" className="text-xl font-semibold text-slate-900">Compare Arbor plans</h2>
    <p role="status" className="mt-3 font-medium text-slate-900">Current plan: {accountPlanLabel(value)}</p>
    {value.effective_tier==="plus"&&value.status==="trial"&&value.private_beta && <p className="mt-2 text-sm leading-6 text-slate-600">Plus Trial is included during private beta. There is no card or billing date.</p>}
    <div className="mt-6 grid gap-5 md:grid-cols-2">
      <article className={`min-w-0 rounded-2xl border border-slate-200 p-4 ${value.effective_tier==="free"?"account-current-plan":""}`}><h3 className="font-semibold text-slate-900">Free · Learn and track</h3>{value.effective_tier==="free"&&<span className="current-plan-badge">Current plan</span>}
        <p className="mt-2 text-sm text-slate-600">Choose your plan and keep an accurate record of what you own.</p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-700"><li>Readiness assessment and your explicit plan choice</li><li>Ways to invest and official provider links</li><li>Supported holdings, dated activity, current value and recorded-cost gain/loss</li><li>Truthful portfolio graph and actual goal progress</li><li>Limited Ask Arbor access is planned for public launch</li></ul></article>
      <article className={`min-w-0 rounded-2xl border border-slate-200 p-4 ${value.effective_tier==="plus"?"account-current-plan":""}`}><h3 className="font-semibold text-slate-900">Arbor Plus · Understand and plan</h3>{value.effective_tier==="plus"&&<span className="current-plan-badge">{value.status==="trial"?"Current trial":"Current plan"}</span>}
        <p className="mt-2 text-sm text-slate-600">Explore where you could be headed and compare holdings with your chosen targets.</p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-700"><li>Everything in Free</li><li>Allocation and Plan Alignment</li><li>Future projection and What If</li><li>Monthly contribution planning and follow-up</li><li>Change or rebuild your chosen plan</li><li>Expanded Ask Arbor support during private beta</li></ul></article>
    </div>
    <p className="mt-4 text-sm leading-6 text-slate-500">No payment is collected here. {value.effective_tier==="plus"&&value.status==="trial"&&value.private_beta?"Private beta Plus Trial has no credit card, billing date or trial countdown.":"No payment or subscription changes are made here."}</p>
  </section>;
}

export function AccountPlans() {
  const access = useAccountAccess();
  return access?.value ? <ComparePlans value={access.value} /> : <AccessLoading />;
}
