import type { ExplicitCustomization, PlanV2, Strategy } from "@/lib/types/planV2";
import Allocation from "./portfolio/Allocation";
import { planTargets } from "@/lib/planImplementation";

export const CORE_CUSTOMIZATION: ExplicitCustomization = { technology_tilt: 0, bitcoin: 0 };
const CHOICES = [0, 5, 10] as const;

export function PlanCustomization({ approach, value, onChange, disabled = false }: {
  approach: Strategy; value: ExplicitCustomization; onChange: (value: ExplicitCustomization) => void; disabled?: boolean;
}) {
  return <section className="plan-customization" aria-labelledby="customize-heading">
    <p className="choice-eyebrow">Your {approach} approach</p>
    <h2 id="customize-heading" className="choice-heading">Customize your plan</h2>
    <p className="choice-intro">Your core plan is complete as-is. Keep it simple, or choose extra Technology or Bitcoin exposure.</p>
    <div className="satellite-options">
      <fieldset disabled={disabled} aria-describedby="technology-help">
        <legend><span className="satellite-icon satellite-tech" aria-hidden="true">✦</span>Technology <small>Optional</small></legend>
        <p id="technology-help">Your global equity investments may already own many technology companies. This gives that sector extra weight.</p>
        <div className="satellite-segments">{CHOICES.map(amount => <label key={amount}><input type="radio" name="technology-choice" value={amount} checked={value.technology_tilt === amount} onChange={() => onChange({ ...value, technology_tilt: amount })} /><span>{amount === 0 ? "None" : `${amount}%`}</span></label>)}</div>
      </fieldset>
      <fieldset disabled={disabled} aria-describedby="bitcoin-help">
        <legend><span className="satellite-icon satellite-bitcoin" aria-hidden="true">₿</span>Bitcoin <small>Optional</small></legend>
        <p id="bitcoin-help">Bitcoin can have much larger price swings. It is optional, not required for a complete long-term plan.</p>
        <div className="satellite-segments">{CHOICES.map(amount => <label key={amount}><input type="radio" name="bitcoin-choice" value={amount} checked={value.bitcoin === amount} onChange={() => onChange({ ...value, bitcoin: amount })} /><span>{amount === 0 ? "None" : `${amount}%`}</span></label>)}</div>
      </fieldset>
    </div>
    <p className="choice-note">Any exposure you add comes from Global Equity. Your Defensive target stays unchanged.</p>
  </section>;
}

export function FinalPlanReview({ value }: { value: PlanV2 }) {
  const choice = value.plan.customization;
  const added = [choice?.technology_tilt ? "Technology" : null, choice?.bitcoin ? "Bitcoin" : null].filter(Boolean);
  return <section className="final-plan-review" aria-labelledby="final-plan-heading">
    <p className="choice-eyebrow">Ready for your review</p>
    <h2 id="final-plan-heading" className="choice-heading">Your plan</h2>
    <p className="final-plan-name">{value.plan.path === "short_term" ? "Short-term planning" : value.plan.selected_strategy}</p>
    {value.plan.path === "long_term" ? <>
      <Allocation weights={planTargets(value)} />
      <p className="choice-confirmation">You chose this allocation.</p>
      <p className="choice-note">{added.length ? `${added.join(" and ")} ${added.length === 1 ? "was" : "were"} added by you.` : "Your core plan is unchanged. No Technology or Bitcoin was added."}</p>
    </> : <p className="choice-intro">A planning path for money you may need soon. No long-term investment allocation is active.</p>}
    {!value.plan.readiness.actionable_contribution_guidance_allowed && <p className="choice-note">Foundation First remains your next step. Contribution calculations stay paused while you review your financial readiness.</p>}
    <p className="choice-boundary">Arbor calculates and explains. You decide and invest through your provider.</p>
  </section>;
}
