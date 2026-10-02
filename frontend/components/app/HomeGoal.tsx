"use client";
import { useRef, useState, type ReactNode } from "react";
import type { PlanV2 } from "@/lib/types/planV2";
import type { LivePortfolioData } from "@/lib/livePortfolio";
import { numericError } from "@/lib/profileValidation";
import { goalProgress } from "@/lib/goalProgress";
import { formatContributionMoney } from "@/lib/contributions";
import { saveGoal } from "@/lib/goalProjectionApi";
import Sheet from "../ui/Sheet";

const labels = ["Build wealth", "Home", "Emergency fund", "Education", "Retirement", "Something else"];
const money = (value: string | number) => formatContributionMoney(String(value), "PHP");

export default function HomeGoal({ value, portfolio, userId, onPlanChange, monthly }: { value: PlanV2; portfolio: LivePortfolioData | null; userId?: string; onPlanChange?: (plan:PlanV2)=>void; monthly?: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(value.profile.goal_name ?? "");
  const [amount, setAmount] = useState(value.profile.goal_target ? String(value.profile.goal_target) : "");
  const [date, setDate] = useState(value.profile.goal_date ?? "");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const progress = goalProgress(value.profile.goal_target, portfolio);
  const goalDate=value.profile.goal_date?new Date(`${value.profile.goal_date}T00:00:00Z`):null;
  const targetDate=goalDate&&!Number.isNaN(goalDate.getTime())?new Intl.DateTimeFormat("en",{month:"short",year:"numeric",timeZone:"UTC"}).format(goalDate):null;
  const canSave = !!userId && !!onPlanChange && !!value.revision && /^\d+(?:\.\d{1,2})?$/.test(amount) && Number(amount) > 0 && !numericError("goal_target", amount) && (!name || name.trim().length <= 80);
  function openGoal() { setName(value.profile.goal_name ?? "");setAmount(value.profile.goal_target ? String(value.profile.goal_target) : "");setDate(value.profile.goal_date ?? "");setStep(0);setError("");setEditing(true); }
  async function confirm(targetDate = date) {
    if (pending.current || !canSave || !userId || !value.revision || !onPlanChange) return;
    pending.current = true;setSaving(true);setError("");
    try { onPlanChange(await saveGoal(userId,{goal_target:Number(amount),goal_name:name.trim() || null,goal_date:targetDate || null,expected_revision:value.revision}));setEditing(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "We couldn’t save your goal."); }
    finally { pending.current = false;setSaving(false); }
  }
  return <>
    <div className="home-utility-stack">
    <section className="home-goal" aria-labelledby="home-goal-title"><header><div><p className="eyebrow">Your goal</p><h2 id="home-goal-title">{value.profile.goal_name || "Your goal"}</h2></div><button className="entry-link home-goal-action min-h-11" onClick={openGoal}>{value.profile.goal_target ? "Edit goal →" : "Set a goal →"}</button></header>
      <div className="home-goal-progress">{progress ? <><div className="goal-amount"><strong className="home-financial-amount">{money(progress.knownValue)}</strong><span className="home-financial-target">of {money(progress.target)}</span></div>{progress.complete ? <><div className="goal-track" role="progressbar" aria-label="Goal progress" aria-valuenow={Number(progress.percent)} aria-valuemin={0} aria-valuemax={Math.max(100,Number(progress.percent))}><span style={{width:`${progress.barPercent}%`}}/></div><div className="home-goal-footer"><p><strong>{progress.percent}% of target</strong> · recorded value</p>{targetDate&&<p>Target date · {targetDate}</p>}</div></> : <p role="status">Known progress. Some investments need an updated value before Arbor can calculate complete progress.</p>}</>
        : value.profile.goal_target ? <><strong className="home-financial-target">{money(value.profile.goal_target)} target</strong><p>{portfolio ? "Current progress is unavailable." : "Checking your recorded portfolio before showing progress."}</p></>
        : <p>One amount to work toward. Add a goal to see your actual progress here.</p>}</div>
    </section>
    {monthly}
    </div>
    {editing && <Sheet title="Your goal" busy={saving} onClose={() => setEditing(false)}><div className="goal-form">
      {step === 0 && <><h3>What are you investing toward?</h3><div className="goal-labels">{labels.map(label => <button key={label} type="button" aria-pressed={name === label} onClick={() => setName(label === "Something else" ? "" : label)}>{label}</button>)}</div><label>Goal name<input value={name} maxLength={80} onChange={e=>setName(e.target.value)} placeholder="Your goal"/></label><button className="entry-primary min-h-12" onClick={() => setStep(1)}>Continue</button></>}
      {step === 1 && <><h3>How much would you like to reach?</h3><p>Enter the PHP amount you want to have in the future, without adjusting it to today’s purchasing power.</p><label>Target amount (future PHP)<input type="text" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="500000"/></label><button className="entry-primary min-h-12" disabled={!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || !!numericError("goal_target", amount)} onClick={() => setStep(2)}>Continue</button></>}
      {step === 2 && <><h3>When would you like to reach it?</h3><label>Target date (optional)<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button className="entry-primary min-h-12" disabled={!canSave || saving} onClick={() => void confirm()}>{saving ? "Saving…" : "Save goal"}</button><button className="entry-link min-h-11" disabled={!canSave || saving} onClick={() => void confirm("")}>Skip date for now</button></>}
      {step > 0 && <button className="entry-link min-h-11" onClick={() => setStep(step-1)}>Back</button>}{error && <p role="alert">{error}</p>}
    </div></Sheet>}

  </>;
}
