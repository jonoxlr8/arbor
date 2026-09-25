import { ArborMark } from "./Logo";
import type { PlanV2 } from "@/lib/types/planV2";
import Allocation from "./portfolio/Allocation";
import { planTargets } from "@/lib/planImplementation";

export default function PlanCreated({value,onContinue}:{value:PlanV2;onContinue:(destination:"home"|"portfolio/plan"|"portfolio/ways")=>void}) {
  const showWays=value.plan.path==="long_term"&&value.plan.plan_basis==="user_selected"&&value.plan.readiness.actionable_contribution_guidance_allowed;
  return <main className="plan-created flex min-h-dvh items-center justify-center bg-background p-4"><section className="arbor-panel max-w-xl" aria-labelledby="plan-created-title">
    <ArborMark className="created-mark"/>
    <h1 id="plan-created-title" className="text-3xl font-semibold">Your plan is ready</h1>
    {value.plan.path === "long_term" && value.plan.plan_basis === "user_selected" && <p className="created-choice">{value.plan.selected_strategy}</p>}
    {showWays && <><Allocation weights={planTargets(value)}/><h2 className="mt-6 text-xl font-semibold">Ways to invest your plan</h2><p className="mt-3 text-sm text-slate-600">Explore supported investments for each part of your plan. Invest through your provider, then return to record what you own.</p></>}
    <p className="mt-4">{value.plan.plan_basis!=="user_selected"?"Your existing historical plan remains saved.":value.plan.path==="short_term"?"You chose the short-term planning path.":`You chose the ${value.plan.selected_strategy} approach.`}</p>
    <p className="mt-3 text-sm text-slate-600">Arbor helps you understand your plan and organize your next step. Available tracking and contribution tools help you review it over time.</p>
    <p className="mt-3 text-sm text-slate-600">You make the investment decisions. Arbor does not place trades or move your money.</p>
    {!value.plan.readiness.actionable_contribution_guidance_allowed&&<p className="mt-3 text-sm text-slate-600">Your readiness check pauses contribution previews. Home will help you review your financial foundation first.</p>}
    <button className="entry-primary mt-6 min-h-11 w-full" onClick={()=>onContinue(showWays?"portfolio/ways":"home")}>{showWays?"See ways to invest":"Go to Home"}</button>
    <button className="entry-link mt-2 min-h-11" onClick={()=>onContinue("portfolio/plan")}>See your plan</button>
  </section></main>;
}
