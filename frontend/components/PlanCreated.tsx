import type { PlanV2 } from "@/lib/types/planV2";

export default function PlanCreated({value,onContinue}:{value:PlanV2;onContinue:(destination:"home"|"portfolio/plan")=>void}) {
  return <main className="flex min-h-dvh items-center justify-center bg-background p-4"><section className="arbor-panel max-w-xl" aria-labelledby="plan-created-title">
    <h1 id="plan-created-title" className="text-3xl font-semibold">Your plan is ready</h1>
    <p className="mt-4">{value.plan.plan_basis!=="user_selected"?"Your existing historical plan remains saved.":value.plan.path==="short_term"?"You chose the short-term planning path.":`You chose the ${value.plan.selected_strategy} approach.`}</p>
    <p className="mt-3 text-sm text-slate-600">Arbor helps you understand your plan and organize your next step. Available tracking and contribution tools help you review it over time.</p>
    <p className="mt-3 text-sm text-slate-600">You make the investment decisions. Arbor does not place trades or move your money.</p>
    {!value.plan.readiness.actionable_contribution_guidance_allowed&&<p className="mt-3 text-sm text-slate-600">Your readiness check pauses contribution scenarios. Home will help you review your financial foundation first.</p>}
    <button className="entry-primary mt-6 min-h-11 w-full" onClick={()=>onContinue("home")}>Go to Home</button>
    <button className="entry-link mt-2 min-h-11" onClick={()=>onContinue("portfolio/plan")}>See your plan</button>
  </section></main>;
}
