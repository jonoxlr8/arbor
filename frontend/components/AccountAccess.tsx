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
  return <section className="arbor-panel"><p className="text-xs font-semibold text-slate-500">Arbor Plus</p>
    <h2 className="mt-2 text-xl font-semibold text-slate-900">{title}</h2>
    <p className="mt-3 text-sm leading-6 text-slate-600">This ongoing planning tool is part of Plus. Your saved plan, basic planning assumptions and implementation education remain available on Free.</p>
    <a href="#settings" className="entry-secondary mt-4 inline-flex min-h-11 items-center">Explore Arbor Plus</a>
    {onBack && <button className="entry-link mt-3 min-h-11 w-full" onClick={onBack}>Back to your plan</button>}</section>;
}

export function ComparePlans({ value }: { value: Entitlements }) {
  return <section className="arbor-panel" aria-labelledby="compare-plans-title">
    <h2 id="compare-plans-title" className="text-xl font-semibold text-slate-900">Compare Arbor plans</h2>
    <p role="status" className="mt-3 font-medium text-slate-900">Current plan: {value.private_beta ? "Arbor Plus — Private Beta" : value.effective_tier === "plus" ? "Arbor Plus" : "Arbor Free"}</p>
    {value.private_beta && <p className="mt-2 text-sm leading-6 text-slate-600">All Plus features are unlocked free while Arbor is in private beta. Your feedback will help shape what goes into Free and Plus at launch.</p>}
    <div className="mt-6 grid gap-5 md:grid-cols-2">
      <article className="min-w-0 rounded-2xl border border-slate-200 p-4"><h3 className="font-semibold text-slate-900">Arbor Free — ₱0</h3>
        <p className="mt-2 text-sm text-slate-600">Build your investment plan and understand it.</p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-700"><li>Readiness and informational self-assessment</li><li>Choose and view a standardized plan</li><li>Basic planning assumptions and implementation education</li><li>10 Ask Arbor questions per month</li><li>Basic next-action guidance</li></ul></article>
      <article className="min-w-0 rounded-2xl border border-slate-200 p-4"><h3 className="font-semibold text-slate-900">Arbor Plus — ₱399/month</h3>
        <p className="mt-1 text-sm text-slate-500">Or ₱3,990/year at launch</p>
        <p className="mt-2 text-sm text-slate-600">Stay aligned with the plan you chose.</p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-700"><li>Everything in Free</li><li>Full Ask Arbor access under fair-use limits</li><li>Monthly Contribution Planner</li><li>Investment-profile editing and plan rebuild</li></ul></article>
    </div>
    <p className="mt-4 text-sm leading-6 text-slate-500">Prices are launch planning assumptions. No payment is collected here. Private beta is free, with no credit card, billing date or trial countdown.</p>
  </section>;
}

export function AccountPlans() {
  const access = useAccountAccess();
  return access?.value ? <ComparePlans value={access.value} /> : <AccessLoading />;
}
