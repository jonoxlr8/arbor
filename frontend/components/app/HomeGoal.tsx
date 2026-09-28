"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { PlanV2 } from "@/lib/types/planV2";
import type { LivePortfolioData } from "@/lib/livePortfolio";
import { goalProgress } from "@/lib/goalProgress";
import { formatContributionMoney } from "@/lib/contributions";
import { futureProjection, saveGoal, type FutureProjection } from "@/lib/goalProjectionApi";
import { useAccountAccess } from "../AccountAccess";
import Sheet from "../ui/Sheet";

const labels = ["Build wealth", "Home", "Emergency fund", "Education", "Retirement", "Something else"];
const money = (value: string | number) => formatContributionMoney(String(value), "PHP");
const signedMoney = (value: string) => value.startsWith("-") ? `−${money(value.slice(1))}` : `+${money(value)}`;

export default function HomeGoal({ value, portfolio, userId, onPlanChange, monthly, pending }: { value: PlanV2; portfolio: LivePortfolioData | null; userId?: string; onPlanChange?: (plan:PlanV2)=>void; monthly?: ReactNode; pending?: ReactNode }) {
  const access = useAccountAccess();
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(value.profile.goal_name ?? "");
  const [amount, setAmount] = useState(value.profile.goal_target ? String(value.profile.goal_target) : "");
  const [date, setDate] = useState(value.profile.goal_date ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const progress = goalProgress(value.profile.goal_target, portfolio);
  const plus = access?.value?.features.includes("future_projection") === true;
  const [projection, setProjection] = useState<FutureProjection | null>(null);
  const [projectionError, setProjectionError] = useState("");
  const [whatIf, setWhatIf] = useState(false);
  const [scenarioAmount, setScenarioAmount] = useState(String(value.profile.monthly_investment));
  const [scenarioDate, setScenarioDate] = useState(value.profile.goal_date ?? "");
  const [scenario, setScenario] = useState<FutureProjection | null>(null);
  const [scenarioError, setScenarioError] = useState("");
  const eligible = value.plan.path === "long_term" && value.plan.plan_basis === "user_selected" && value.plan.readiness.actionable_contribution_guidance_allowed;
  useEffect(() => {
    if (!plus || !eligible || !userId || !value.profile.goal_date || !portfolio?.complete) return;
    let active = true;
    futureProjection(userId).then(result => { if (active) { setProjection(result); setProjectionError(""); } }).catch(() => { if (active) setProjectionError("Projection temporarily unavailable."); });
    return () => { active = false; };
  }, [plus, eligible, userId, value.profile.goal_date, value.profile.monthly_investment, portfolio?.known_value_php, portfolio?.complete]);
  useEffect(() => {
    if (!whatIf || !userId || !/^\d+(?:\.\d{1,2})?$/.test(scenarioAmount) || !scenarioDate) return;
    let active = true;
    const timer = window.setTimeout(() => {
      futureProjection(userId,{monthly_contribution_php:Number(scenarioAmount),target_date:scenarioDate})
        .then(result => { if (active) { setScenario(result);setScenarioError(""); } })
        .catch(reason => { if (active) {setScenario(null);setScenarioError(reason instanceof Error ? reason.message : "Scenario unavailable.");} });
    }, 250);
    return () => { active = false;window.clearTimeout(timer); };
  }, [whatIf, userId, scenarioAmount, scenarioDate]);
  const canSave = !!userId && !!onPlanChange && !!value.revision && /^\d+(?:\.\d{1,2})?$/.test(amount) && Number(amount) > 0 && (!name || name.trim().length <= 80);
  function openGoal() { setName(value.profile.goal_name ?? "");setAmount(value.profile.goal_target ? String(value.profile.goal_target) : "");setDate(value.profile.goal_date ?? "");setStep(0);setError("");setEditing(true); }
  function openDate() { openGoal();setStep(value.profile.goal_target ? 2 : 0); }
  async function confirm(targetDate = date) {
    if (!canSave || !userId || !value.revision || !onPlanChange) return;
    setSaving(true);setError("");
    try { onPlanChange(await saveGoal(userId,{goal_target:Number(amount),goal_name:name.trim() || null,goal_date:targetDate || null,expected_revision:value.revision}));setEditing(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "We couldn’t save your goal."); }
    finally { setSaving(false); }
  }
  return <>
    <section className="home-goal" aria-labelledby="home-goal-title"><header><div><p className="eyebrow">Your goal</p><h2 id="home-goal-title">{value.profile.goal_name || "Your goal"}</h2></div><button className="entry-link min-h-11" onClick={openGoal}>{progress ? "Edit goal" : "Set a goal"}</button></header>
      {progress ? <><p className="goal-amount">{money(progress.knownValue)} <span>of {money(progress.target)}</span></p>{progress.complete ? <><p>{progress.percent}% complete</p><div className="goal-track" role="progressbar" aria-label="Goal progress" aria-valuenow={Number(progress.percent)} aria-valuemin={0} aria-valuemax={Math.max(100,Number(progress.percent))}><span style={{width:`${progress.barPercent}%`}}/></div></> : <p role="status">Known progress. Some investments need an updated value before Arbor can calculate complete progress.</p>}</>
        : value.profile.goal_target ? <p>{money(value.profile.goal_target)} target saved. {portfolio ? "Current progress is unavailable." : "Checking your recorded portfolio before showing progress."}</p>
        : <p>One amount to work toward. Add a goal to see your actual progress here.</p>}
    </section>
    {monthly}
    {pending}
    <section className="home-projection" aria-labelledby="home-projection-title"><p className="eyebrow">{plus ? "Arbor Plus" : "Plan ahead"}</p><h2 id="home-projection-title">{plus ? "Where you could be headed" : "See where your plan could take you"}</h2>
      {!plus ? <><p>Explore future projections and monthly planning with Arbor Plus.</p><a className="entry-secondary min-h-11 inline-flex items-center" href="#settings/plus">Explore Arbor Plus</a></>
      : !eligible ? <p>{value.plan.path === "short_term" ? "A long-term projection is not shown for your short-term path." : "Review your long-term approach and readiness before exploring a projection."}</p>
      : !value.profile.goal_date ? <><p>Add a target date to see where your plan could be headed.</p><button className="entry-secondary min-h-11" onClick={openDate}>Add target date</button></>
      : portfolio && !portfolio.complete ? <p>Update unavailable investment values before Arbor can project from your complete portfolio.</p>
      : projection ? <><strong className="projection-value">{money(projection.projected_value_php)}</strong><p>by {new Date(`${projection.target_date}T00:00:00Z`).toLocaleDateString("en-PH",{month:"short",year:"numeric",timeZone:"UTC"})}</p><p className="projection-basis">From {money(projection.starting_value_php)} currently recorded</p><dl className="projection-facts"><div><dt>Monthly contribution</dt><dd>{money(projection.monthly_contribution_php)}</dd></div><div><dt>Planning assumption</dt><dd>{Number(projection.annual_planning_rate_pct).toFixed(1)}% per year</dd></div></dl><button className="entry-primary min-h-11" onClick={() => {setScenario(null);setScenarioAmount(String(value.profile.monthly_investment));setScenarioDate(value.profile.goal_date ?? "");setWhatIf(true);}}>Explore What If</button><p className="projection-disclosure">Illustrative planning projection, not a guaranteed result.</p><details><summary>How this works</summary><p>Arbor uses your current complete recorded portfolio, {projection.whole_months} whole end-of-month contributions, and your chosen plan’s nominal planning assumption. The 3% inflation assumption is separate; amounts shown are nominal. Contributions and market outcomes may differ.</p></details></>
      : <p role="status">{projectionError || "Calculating your illustration…"}</p>}
    </section>
    {editing && <Sheet title="Your goal" busy={saving} onClose={() => setEditing(false)}><div className="goal-form">
      {step === 0 && <><h3>What are you investing toward?</h3><div className="goal-labels">{labels.map(label => <button key={label} type="button" aria-pressed={name === label} onClick={() => setName(label === "Something else" ? "" : label)}>{label}</button>)}</div><label>Goal name<input value={name} maxLength={80} onChange={e=>setName(e.target.value)} placeholder="Your goal"/></label><button className="entry-primary min-h-12" onClick={() => setStep(1)}>Continue</button></>}
      {step === 1 && <><h3>How much would you like to reach?</h3><label>Target amount (PHP)<input type="text" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="500000"/></label><button className="entry-primary min-h-12" disabled={!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0} onClick={() => setStep(2)}>Continue</button></>}
      {step === 2 && <><h3>When would you like to reach it?</h3><label>Target date (optional)<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button className="entry-primary min-h-12" disabled={!canSave || saving} onClick={() => void confirm()}>{saving ? "Saving…" : "Save goal"}</button><button className="entry-link min-h-11" disabled={!canSave || saving} onClick={() => void confirm("")}>Skip date for now</button></>}
      {step > 0 && <button className="entry-link min-h-11" onClick={() => setStep(step-1)}>Back</button>}{error && <p role="alert">{error}</p>}
    </div></Sheet>}
    {whatIf && <Sheet title="Explore What If" onClose={() => setWhatIf(false)}><div className="goal-form"><p>Illustrative only. Changes here do not save to your plan or goal.</p><label>Monthly contribution (PHP)<input inputMode="decimal" value={scenarioAmount} onChange={e=>{setScenarioAmount(e.target.value);setScenario(null);}}/></label><label>Target date<input type="date" value={scenarioDate} onChange={e=>{setScenarioDate(e.target.value);setScenario(null);}}/></label><button className="entry-secondary min-h-11" onClick={() => {setScenarioAmount(String(value.profile.monthly_investment));setScenarioDate(value.profile.goal_date ?? "");setScenario(null);}}>Reset to saved values</button>{scenario && <div role="status"><p>Projected value</p><strong className="projection-value">{money(scenario.projected_value_php)}</strong>{scenario.goal_target_php && scenario.difference_to_goal_php && <p>Saved goal: {money(scenario.goal_target_php)} · Difference: {signedMoney(scenario.difference_to_goal_php)}</p>}</div>}{scenarioError && <p role="alert">{scenarioError}</p>}<p className="projection-disclosure">Illustrative planning projection, not a guaranteed result.</p></div></Sheet>}
  </>;
}
