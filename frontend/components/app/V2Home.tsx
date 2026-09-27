"use client";
import { useEffect, useState } from "react";
import type { PlanV2 } from "@/lib/types/planV2";
import { portfolioApi, type LivePortfolioData, type InvestmentEntry } from "@/lib/livePortfolio";
import { formatContributionMoney, SLEEVE_LABELS } from "@/lib/contributions";
import { useAccountAccess } from "../AccountAccess";
import { monthlyApi, monthLabel, checkinDate, type MonthlyState } from "@/lib/monthlyCheckin";
import PortfolioHistoryChart from "../portfolio/PortfolioHistoryChart";
import { DataAttribution } from "../portfolio/LivePortfolio";
import { planTargets } from "@/lib/planImplementation";
import { holdingsUpdatedAfter, recentLedgerActivity } from "@/lib/portfolioActivity";
import HomeGoal from "./HomeGoal";

export default function V2Home({ value, userId, onPlanChange }: { value: PlanV2; userId?: string; onPlanChange?: (value:PlanV2)=>void }) {
  const access = useAccountAccess();
  const available = access?.value?.availability?.live_portfolio === true && access.value.features.includes("live_portfolio");
  const implementationAllowed = value.plan.path === "long_term" && value.plan.readiness.actionable_contribution_guidance_allowed;
  const monthlyAllowed = access?.value?.availability?.monthly_checkin === true && access.value.features.includes("monthly_contribution_planner") && value.plan.path === "long_term" && value.plan.plan_basis === "user_selected" && value.plan.readiness.actionable_contribution_guidance_allowed;
  const [monthly, setMonthly] = useState<MonthlyState | null>(null);
  const [monthlyError, setMonthlyError] = useState(false);
  const [portfolio, setPortfolio] = useState<LivePortfolioData | null>(null);
  const [entries, setEntries] = useState<InvestmentEntry[]>([]);
  const [entriesError, setEntriesError] = useState(false);
  useEffect(() => {
    if (!available || !userId) return;
    const controller = new AbortController();
    portfolioApi.activity(userId, undefined, 0, controller.signal).then(result => { if (!controller.signal.aborted) { setEntries(result.entries); setEntriesError(false); } }).catch(() => { if (!controller.signal.aborted) setEntriesError(true); });
    return () => controller.abort();
  }, [available, userId, portfolio]);
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
    <div className="home-grid">
      {available && userId ? <HomePortfolio userId={userId} onLoaded={setPortfolio} /> : <section className="home-metric home-portfolio" aria-label="Portfolio overview"><header><h2>Portfolio</h2><span className="access-badge">{access?.value?.effective_tier === "free" ? "Plus" : "Preview"}</span></header>
        <div className="home-history-empty"><span aria-hidden="true">◷</span><strong>Your investments.<br/>One clear view.</strong><p>{!implementationAllowed ? "Your saved profile and current path are ready to review. Tracking stays separate from your plan." : access?.value?.effective_tier === "free" ? "Tracking is part of Arbor Plus. Explore ways to invest your plan on Free." : "Tracking isn’t available yet. Your chosen plan and ways to invest are ready to explore."}</p></div>
        <a className="entry-link" href="#portfolio">Explore your portfolio →</a>
      </section>}
      <HomeGoal value={value} portfolio={portfolio} userId={userId} onPlanChange={onPlanChange} monthly={
        <a className="home-metric home-monthly" aria-label={`Review monthly contribution: ${formatContributionMoney(currentMonthly?.current?.amount_php ?? String(value.profile.monthly_investment),"PHP")}`} href={value.plan.path === "short_term" || !value.plan.readiness.actionable_contribution_guidance_allowed ? "#portfolio/plan" : "#home/monthly"}><p>Monthly contribution</p><strong>{formatContributionMoney(currentMonthly?.current?.amount_php ?? String(value.profile.monthly_investment),"PHP")}</strong><span aria-hidden="true">›</span>{currentMonthly?.current && <small className="completed-label">Recorded for {monthLabel(currentMonthly.month).split(" ")[0]}</small>}</a>
      }/>
    </div>
    {currentMonthly?.current && portfolio && !holdingsUpdatedAfter(portfolio.holdings,currentMonthly.current.completed_at) && <div className="home-update-followup"><p>Contribution submitted. Update your holdings with what you actually received.</p><a className="entry-link" href="#portfolio">Update portfolio →</a></div>}
    <div className="home-bottom"><HomeActivity state={currentMonthly} error={monthlyError || entriesError} portfolio={portfolio} entries={entries}/><HomePlanContext value={value} /></div>
    {portfolio && <div className="home-data-attribution"><DataAttribution sources={portfolio.data_sources ?? []}/></div>}
  </div>;
}

export function HomePlanContext({ value }: { value: PlanV2 }) {
  const { plan } = value;
  const targets = planTargets(value);
  return <section className="home-plan">
    <header><h2 className="text-lg font-semibold">Your plan</h2><a href="#portfolio/plan" className="entry-link">View plan →</a></header>
    <strong>{plan.path === "short_term" ? "Short-term path" : plan.plan_basis === "user_selected" ? plan.selected_strategy : "Historical plan"}</strong>
    {targets.length > 0 && <p className="home-plan-targets">{targets.map(weight => `${SLEEVE_LABELS[weight.role]} ${weight.percentage_points}%`).join(" · ")}</p>}
    {plan.readiness.readiness !== "ready" && <p className="home-plan-caution">{plan.readiness.readiness === "foundation_first" ? "Contribution previews are paused while you review your financial foundation." : "Review your readiness before relying on contribution guidance."}</p>}
  </section>;
}

export function HomeActivity({state,error=false,portfolio=null,entries=[]}:{state:MonthlyState|null;error?:boolean;portfolio?:LivePortfolioData|null;entries?:InvestmentEntry[]}) {
  const events = recentLedgerActivity(entries,portfolio?.catalog ?? [],state);
  return <section className="home-activity"><header><h2>Recent activity</h2><a href="#portfolio/history" aria-label="View all recorded activity">View all →</a></header>
    {events.length ? <>{error && <p role="status">Some activity is temporarily unavailable.</p>}<ul>{events.map(row=><li key={row.key}><time className="activity-date" dateTime={new Date(row.at).toISOString()}><small>{new Date(row.at).toLocaleDateString("en-PH",{month:"short",timeZone:"UTC"})}</small>{new Date(row.at).getUTCDate()}</time><div><strong>{row.title}</strong><small>{row.detail}</small></div>{row.amount !== null && <span>{formatContributionMoney(row.amount,"PHP")}</span>}</li>)}</ul></>
      : <div className="activity-empty">{error ? <p role="status">Activity is temporarily unavailable. Open your monthly contribution to retry.</p> : <p>Your investment activity will appear here.</p>}</div>}
    {state?.current && <p className="activity-note">Recorded as invested {checkinDate(state.current.completed_at)}. Holdings are tracked separately.</p>}
  </section>;
}

function HomePortfolio({ userId, onLoaded }: { userId: string; onLoaded: (portfolio:LivePortfolioData|null)=>void }) {
  const [portfolio, setPortfolio] = useState<LivePortfolioData | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    portfolioApi.read(userId, controller.signal).then(p => { if (!controller.signal.aborted) {setPortfolio(p);onLoaded(p);} }).catch(() => { if (!controller.signal.aborted) {setError(true);onLoaded(null);} });
    return () => controller.abort();
  }, [userId, attempt, onLoaded]);
  if (error) return <section className="home-metric home-portfolio" aria-label="Portfolio overview"><p role="alert">We couldn’t load your portfolio.</p><button className="entry-secondary mt-3" onClick={() => { setError(false); setAttempt(n => n + 1); }}>Try again</button></section>;
  if (!portfolio) return <section className="home-metric home-portfolio arbor-skeleton" role="status"><span className="sr-only">Checking your recorded portfolio…</span><i/><i/></section>;
  return <section className="home-metric home-portfolio" aria-label="Portfolio overview"><header><h2>{portfolio.holdings.length ? portfolio.complete ? "Portfolio value" : "Known portfolio value" : "Portfolio"}</h2><a className="entry-link" href="#portfolio" aria-label="View portfolio">↗</a></header>
    {portfolio.holdings.length ? <>
      <strong>{formatContributionMoney(portfolio.known_value_php,"PHP")}</strong>
      <PortfolioHistoryChart history={portfolio.history} knownValue={portfolio.known_value_php} complete={portfolio.complete} holdingsCount={portfolio.holdings.length} compact/>
      {(!portfolio.complete || portfolio.stale_count > 0) && <a className="entry-link" href="#portfolio">{!portfolio.complete ? "Some values are unavailable · Review →" : "Cached values · Check dates →"}</a>}
    </> : <>
      <strong>{formatContributionMoney("0","PHP")}</strong>
      <PortfolioHistoryChart history={portfolio.history} knownValue="0" complete holdingsCount={0} compact/>
      <a className="entry-primary" href="#portfolio/add">+ Add Investment</a>
    </>}
  </section>;
}
