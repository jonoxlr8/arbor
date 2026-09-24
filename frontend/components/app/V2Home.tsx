"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { PlanV2 } from "@/lib/types/planV2";
import { HORIZON_OPTIONS } from "@/lib/onboardingV2";
import { portfolioApi, type LivePortfolioData } from "@/lib/livePortfolio";
import { formatContributionMoney } from "@/lib/contributions";
import { useAccountAccess } from "../AccountAccess";
import { PortfolioSummary, DataAttribution } from "../portfolio/LivePortfolio";
import PortfolioHistoryChart from "../portfolio/PortfolioHistoryChart";
import ProviderBrand from "../ProviderBrand";

export default function V2Home({ value, userId, nextAction }: { value: PlanV2; userId?: string; nextAction?: ReactNode }) {
  const access = useAccountAccess();
  const available = access?.value?.availability?.live_portfolio === true && access.value.features.includes("live_portfolio");
  return <div className="max-w-3xl space-y-6">
    {available && userId ? <HomePortfolio userId={userId} /> : <div className="py-2"><p className="text-sm text-slate-500">Your saved plan</p><h2 className="mt-2 text-3xl font-semibold">{value.plan.path === "short_term" ? "A short-term path" : value.plan.selected_strategy}</h2><p className="mt-2 text-sm text-slate-600">A little clarity about where you are and what comes next.</p></div>}
    {nextAction}
    <HomePlanContext value={value} />
  </div>;
}

export function HomePlanContext({ value }: { value: PlanV2 }) {
  const { profile, plan } = value;
  const status = plan.readiness.readiness === "foundation_first" ? "Financial foundation first" : plan.path === "short_term" ? "Your short-term path is active" : plan.readiness.readiness === "getting_ready" ? "Getting ready" : "Your plan is ready to review";
  return <section className="border-t border-slate-200 pt-5">
    <h2 className="text-lg font-semibold">{status}</h2>
    <p className="mt-2 text-sm text-slate-600">{plan.readiness.readiness === "foundation_first" ? "Contribution scenarios are paused while your profile indicates difficult-to-manage high-interest debt." : "Your assessment is informational. Your saved plan changes only when you confirm a choice."}</p>
    <dl className="mt-5 grid gap-5 sm:grid-cols-2 text-sm">
      <div><dt className="text-slate-500">Time horizon</dt><dd className="mt-1 font-medium">{HORIZON_OPTIONS.find(([id]) => id === profile.horizon)?.[1]}</dd></div>
      <div><dt className="text-slate-500">Planned monthly contribution</dt><dd className="mt-1 font-medium">{formatContributionMoney(String(profile.monthly_investment), "PHP")}</dd></div>
      {profile.goal_target !== null && <div><dt className="text-slate-500">Planning goal</dt><dd className="mt-1 font-medium">{formatContributionMoney(String(profile.goal_target), "PHP")}</dd></div>}
    </dl>
    <p className="mt-4 text-xs text-slate-500">Planning assumptions, not recorded holdings or a guaranteed outcome.</p>
    <a href="#portfolio/plan" className="entry-link mt-2">Review your plan</a>
  </section>;
}

function HomePortfolio({ userId }: { userId: string }) {
  const [portfolio, setPortfolio] = useState<LivePortfolioData | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    portfolioApi.read(userId, controller.signal).then(p => { if (!controller.signal.aborted) setPortfolio(p); }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [userId, attempt]);
  if (error) return <section className="arbor-panel"><p role="alert">We couldn’t load your portfolio.</p><button className="entry-secondary mt-3" onClick={() => { setError(false); setAttempt(n => n + 1); }}>Try again</button></section>;
  if (!portfolio) return <section className="arbor-panel animate-pulse" role="status">Checking your recorded portfolio…</section>;
  if (!portfolio.holdings.length) return <section><h2 className="text-2xl font-semibold">Your plan is a starting point</h2><p className="mt-2 text-sm text-slate-600">No holdings are recorded yet. Your targets describe a plan, not investments you own.</p></section>;
  return <div className="space-y-5"><PortfolioSummary portfolio={portfolio} /><PortfolioHistoryChart history={portfolio.history} />
    <div className="flex flex-wrap gap-2" aria-label="Recorded providers">{[...new Map(portfolio.holdings.map(h => [h.provider, h.provider_name])).entries()].map(([id, name]) => <ProviderBrand key={id} provider={id} name={name} />)}</div>
    <DataAttribution sources={portfolio.data_sources ?? []} />
  </div>;
}
