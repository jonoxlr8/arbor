"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { PlanV2 } from "@/lib/types/planV2";
import { HORIZON_OPTIONS } from "@/lib/onboardingV2";
import { portfolioApi, type LivePortfolioData } from "@/lib/livePortfolio";
import { formatContributionMoney } from "@/lib/contributions";
import { useAccountAccess } from "../AccountAccess";
import Allocation from "../portfolio/Allocation";
import { monthlyApi, monthLabel, checkinDate, type MonthlyState } from "@/lib/monthlyCheckin";
import PortfolioHistoryChart from "../portfolio/PortfolioHistoryChart";
import { DataAttribution } from "../portfolio/LivePortfolio";
import { planTargets } from "@/lib/planImplementation";

export default function V2Home({ value, userId, nextAction }: { value: PlanV2; userId?: string; nextAction?: ReactNode }) {
  const access = useAccountAccess();
  const available = access?.value?.availability?.live_portfolio === true && access.value.features.includes("live_portfolio");
  const implementationAllowed = value.plan.path === "long_term" && value.plan.readiness.actionable_contribution_guidance_allowed;
  const monthlyAllowed = access?.value?.availability?.monthly_checkin === true && access.value.features.includes("monthly_contribution_planner") && value.plan.path === "long_term" && value.plan.plan_basis === "user_selected" && value.plan.readiness.actionable_contribution_guidance_allowed;
  const [monthly, setMonthly] = useState<MonthlyState | null>(null);
  const [monthlyError, setMonthlyError] = useState(false);
  useEffect(() => {
    if (!monthlyAllowed || !userId) return;
    let current = new AbortController();
    const read = () => {
      current.abort(); current = new AbortController(); const signal = current.signal;
      monthlyApi(userId, signal).then(state => { if (!signal.aborted) { setMonthly(state);setMonthlyError(false); } }).catch(() => { if (!signal.aborted) setMonthlyError(true); });
    };
    read();
    const visible = () => { if (document.visibilityState === "visible") read(); };
    let month = new Date().toISOString().slice(0,7);
    const timer = setInterval(() => { const next = new Date().toISOString().slice(0,7);if (next !== month) { month=next;read(); } },60000);
    window.addEventListener("arbor-monthly-changed",read);document.addEventListener("visibilitychange",visible);
    return () => { current.abort();clearInterval(timer);window.removeEventListener("arbor-monthly-changed",read);document.removeEventListener("visibilitychange",visible); };
  }, [monthlyAllowed,userId]);
  const currentMonthly = monthlyAllowed && !monthlyError ? monthly : null;
  return <div className="space-y-6">
    {nextAction}
    <div className="home-grid">
      {available && userId ? <HomePortfolio userId={userId} /> : <section className="home-metric home-portfolio" aria-label="Portfolio overview"><header><h2>Portfolio</h2><span className="access-badge">{access?.value?.effective_tier === "free" ? "Plus" : "Preview"}</span></header>
        <div className="home-history-empty"><span aria-hidden="true">◷</span><strong>Your investments.<br/>One clear view.</strong><p>{!implementationAllowed ? "Your saved profile and current path are ready to review. Tracking stays separate from your plan." : access?.value?.effective_tier === "free" ? "Tracking is part of Arbor Plus. Explore ways to invest your plan on Free." : "Tracking isn’t available yet. Your chosen plan and ways to invest are ready to explore."}</p></div>
        <a className="entry-link" href="#portfolio">Explore your portfolio →</a>
      </section>}
      <a className="home-metric" href={value.plan.path === "short_term" || !value.plan.readiness.actionable_contribution_guidance_allowed ? "#portfolio/plan" : "#home/monthly"}><p>Monthly contribution</p><strong>{formatContributionMoney(currentMonthly?.current?.amount_php ?? String(value.profile.monthly_investment),"PHP")}</strong><small className={currentMonthly?.current ? "completed-label" : ""}>{currentMonthly?.current ? `✓ Recorded for ${monthLabel(currentMonthly.month).split(" ")[0]}` : "Your planned amount · Review →"}</small></a>
      <a className="home-metric" href="#settings/investment"><p>Investment profile</p><strong>{value.plan.path === "short_term" ? "Short term" : value.plan.selected_strategy}</strong><small>{value.plan.path === "short_term" ? "Long-term selection stays saved" : value.plan.plan_basis === "user_selected" ? "Your selected approach →" : "Historical plan →"}</small></a>
    </div>
    <div className="home-bottom"><HomePlanContext value={value} /><HomeActivity state={currentMonthly} available={monthlyAllowed} error={monthlyError}/></div>
  </div>;
}

export function HomePlanContext({ value }: { value: PlanV2 }) {
  const { profile, plan } = value;
  const status = plan.readiness.readiness === "foundation_first" ? "Financial foundation first" : plan.path === "short_term" ? "Your short-term path is active" : plan.readiness.readiness === "getting_ready" ? "Getting ready" : "Your plan is ready to review";
  return <section className="home-plan">
    <header><h2 className="text-lg font-semibold">Your plan</h2><a href="#portfolio/plan" className="entry-link">View plan →</a></header>
    {plan.path === "long_term" && <Allocation weights={planTargets(value)}/>}
    {(plan.path === "short_term" || plan.readiness.readiness !== "ready") && <p className="text-sm font-medium">{status}</p>}
    <details><summary className="text-sm">About your plan</summary><p className="mt-2 text-sm text-slate-600">{plan.readiness.readiness === "foundation_first" ? "Contribution previews are paused while your profile indicates difficult-to-manage high-interest debt." : "Your assessment is informational. Your saved plan changes only when you confirm a choice."}</p><dl className="mt-5 grid gap-5 sm:grid-cols-2 text-sm">
      <div><dt className="text-slate-500">Time horizon</dt><dd className="mt-1 font-medium">{HORIZON_OPTIONS.find(([id]) => id === profile.horizon)?.[1]}</dd></div>
      <div><dt className="text-slate-500">Planned monthly contribution</dt><dd className="mt-1 font-medium">{formatContributionMoney(String(profile.monthly_investment), "PHP")}</dd></div>
      {profile.goal_target !== null && <div><dt className="text-slate-500">Planning goal</dt><dd className="mt-1 font-medium">{formatContributionMoney(String(profile.goal_target), "PHP")}</dd></div>}
    </dl>
    <p className="mt-4 text-xs text-slate-500">Planning assumptions, not recorded holdings or a guaranteed outcome.</p>
    </details>
  </section>;
}

export function HomeActivity({state,available,error=false}:{state:MonthlyState|null;available:boolean;error?:boolean}) {
  return <section className="home-activity"><header><h2>Recent activity</h2><a href={available ? "#home/monthly" : "#portfolio/plan"} aria-label={available ? "View monthly activity" : "View your plan"}>↗</a></header>
    {state?.history.length ? <ul>{state.history.slice(0,3).map(row=><li key={row.month}><span className="activity-date" aria-hidden="true"><small>{new Date(row.completed_at).toLocaleDateString("en-PH",{month:"short",timeZone:"UTC"})}</small>{new Date(row.completed_at).getUTCDate()}</span><div><strong>{row.undone_at ? "Check-in undone" : "Contribution recorded"}</strong><small>{monthLabel(row.month)}</small></div><span>{formatContributionMoney(row.amount_php,"PHP")}</span></li>)}</ul>
      : <div className="activity-empty"><span aria-hidden="true">◷</span><h3>{error ? "Activity is temporarily unavailable" : "A little progress, over time"}</h3><p>{error ? "Open your monthly contribution to retry." : available ? "Your recorded monthly check-ins will appear here." : "Monthly history isn’t available yet. Your saved plan is ready to review."}</p></div>}
    {state?.current && <p className="activity-note">Recorded as invested {checkinDate(state.current.completed_at)}. Holdings are tracked separately.</p>}
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
  if (error) return <section className="home-metric home-portfolio" aria-label="Portfolio overview"><p role="alert">We couldn’t load your portfolio.</p><button className="entry-secondary mt-3" onClick={() => { setError(false); setAttempt(n => n + 1); }}>Try again</button></section>;
  if (!portfolio) return <section className="home-metric home-portfolio arbor-skeleton" role="status"><span className="sr-only">Checking your recorded portfolio…</span><i/><i/></section>;
  return <section className="home-metric home-portfolio" aria-label="Portfolio overview"><header><h2>{portfolio.holdings.length ? portfolio.complete ? "Portfolio value" : "Known portfolio value" : "Portfolio"}</h2><a className="entry-link" href="#portfolio" aria-label="View portfolio">↗</a></header>
    {portfolio.holdings.length ? <>
      <strong>{formatContributionMoney(portfolio.known_value_php,"PHP")}</strong>
      <PortfolioHistoryChart history={portfolio.history} compact/>
      <a className="entry-link" href="#portfolio">{!portfolio.complete ? "Some values are unavailable · Review →" : portfolio.stale_count ? "Cached values · Check dates →" : "View portfolio →"}</a>
      <div className="home-data-attribution"><DataAttribution sources={portfolio.data_sources ?? []}/></div>
    </> : <>
      <div className="home-history-empty"><span aria-hidden="true">◷</span><strong>No investments<br/>recorded yet.</strong><p>Record your first investment to start building your portfolio history.</p></div>
      <a className="entry-primary" href="#portfolio/add">+ Add Investment</a>
    </>}
  </section>;
}
