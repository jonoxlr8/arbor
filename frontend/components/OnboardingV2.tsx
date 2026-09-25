"use client";

import { useEffect, useRef, useState } from "react";
import Logo from "./Logo";
import ApproachSelection from "./ApproachSelection";
import PlanCreated from "./PlanCreated";
import { isPlanV2 } from "@/lib/planV2";
import { answerError, EMPTY_ANSWERS, ONBOARDING_STEPS, onboardingRequest, SAVINGS_OPTIONS, DEBT_OPTIONS, HORIZON_OPTIONS, RISK_OPTIONS, type Answers } from "@/lib/onboardingV2";
import type { AccountPlan, ProfileV2Input } from "@/lib/types/planV2";
import { onboardingEnter } from "@/lib/onboardingKeyboard";

const QUESTIONS: Record<keyof Answers, string> = {
  full_name: "What’s your name?", country: "Where do you live?",
  emergency_savings: "How much emergency savings do you have?",
  high_interest_debt: "How is your high-interest debt?",
  goal_target: "Do you have a goal amount in mind?",
  current_portfolio_value: "Where are you starting?",
  monthly_investment: "What could you set aside each month?",
  horizon: "When might you need this money?",
  risk_response: "If your investments fell about 30%, what would you most likely do?",
};
const HELP: Partial<Record<keyof Answers, string>> = {
  emergency_savings: "Think about how many months of essential expenses your savings could cover.",
  high_interest_debt: "For example, credit-card balances or other expensive borrowing.",
  goal_target: "An optional amount in today’s PHP. You can choose Not yet.",
  current_portfolio_value: "Enter a starting amount for your plan. Starting from zero is fine. You’ll record your actual investments separately.",
  monthly_investment: "A typical monthly amount for your plan, not a commitment. Zero is fine.",
  country: "Your country sets your planning currency. This beta supports the Philippines.",
  risk_response: "This helps describe your comfort with market swings. It does not choose your plan.",
};
const OPTIONS: Partial<Record<keyof Answers, readonly (readonly [string, string])[]>> = {
  country: [["Philippines", "Philippines · PHP"], ["Other", "Other country"]],
  emergency_savings: SAVINGS_OPTIONS, high_interest_debt: DEBT_OPTIONS,
  horizon: HORIZON_OPTIONS, risk_response: RISK_OPTIONS,
};

export function OnboardingQuestionV2({ field, value, onChange }: {field: keyof Answers; value: string; onChange: (value: string) => void}) {
  const options = OPTIONS[field];
  const error = value ? answerError(field, value) : null;
  return <section className="onboarding-question" aria-labelledby="onboarding-question">
    <p className="choice-eyebrow">{field === "full_name" || field === "country" ? "A little about you" : field === "emergency_savings" || field === "high_interest_debt" ? "Your financial foundation" : field === "risk_response" ? "Your comfort with change" : "Your long-term picture"}</p>
    <h1 id="onboarding-question" className="text-2xl font-semibold text-slate-900">{QUESTIONS[field]}</h1>
    {HELP[field] && <p className="mt-3 text-sm leading-6 text-slate-600">{HELP[field]}</p>}
    {options ? <div role="group" aria-labelledby="onboarding-question" className="mt-6 space-y-3">
      {options.map(([code, label]) => <button key={code} type="button" data-onboarding-choice aria-pressed={value === code} onClick={() => onChange(code)}
        className="onboarding-option"><span>{label}</span><span className="option-indicator" aria-hidden="true">{value === code ? "✓" : ""}</span></button>)}
    </div> : <div className="mt-6">
      <label className="sr-only" htmlFor={field}>{QUESTIONS[field]}</label>
      <div className={field === "full_name" ? "onboarding-name-input" : "onboarding-money-input"}>{field !== "full_name" && <span aria-hidden="true">₱</span>}<input id={field} value={value} onChange={e => onChange(e.target.value)}
        type={field === "full_name" ? "text" : "number"} inputMode={field === "full_name" ? "text" : "decimal"}
        autoComplete={field === "full_name" ? "given-name" : "off"} maxLength={field === "full_name" ? 120 : undefined}
        min={field === "full_name" ? undefined : 0} step="any"
        aria-invalid={!!error} aria-describedby={error ? "answer-error" : undefined}
        placeholder={field === "full_name" ? "Your first name" : "0"}
        className="min-h-14 w-full min-w-0" /></div>
      {field !== "full_name" && <p className="onboarding-currency">Philippine peso · PHP</p>}
    </div>}
    {error && <p id="answer-error" role="status" className="mt-3 text-sm text-slate-600">{error}</p>}
  </section>;
}

export default function OnboardingV2({ userId, onComplete, onSignOut, signingOut, logoutError }: {
  userId: string; onComplete: (plan: AccountPlan) => void; onSignOut: () => void; signingOut: boolean; logoutError: string;
}) {
  const [answers, setAnswers] = useState<Answers>({ ...EMPTY_ANSWERS });
  const [step, setStep] = useState(0);
  const [review, setReview] = useState<ProfileV2Input | null>(null);
  const [created, setCreated] = useState<AccountPlan | null>(null);
  const questionPanel = useRef<HTMLDivElement>(null);
  useEffect(() => { questionPanel.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [step]);
  const steps = ONBOARDING_STEPS;
  const field = steps[step];
  const valid = !answerError(field, answers[field]);
  function next() {
    if (!valid || signingOut || review) return;
    if (step < steps.length - 1) { setStep(step + 1); return; }
    setReview(onboardingRequest(answers));
  }
  if (isPlanV2(created)) return <PlanCreated value={created} onContinue={destination=>{window.location.hash=destination;onComplete(created);}}/>;
  if (review) return <main className="onboarding-consumer"><header className="onboarding-brand"><Logo /></header><ApproachSelection input={review} userId={userId} onComplete={plan=>{if(isPlanV2(plan))setCreated(plan);else onComplete(plan);}} onBack={() => setReview(null)} /></main>;
  return <main className="onboarding-consumer">
    <header className="onboarding-brand"><Logo /><span>Your next chapter</span></header>
    <div className="onboarding-panel" ref={questionPanel} tabIndex={-1}>
      <div className="onboarding-progress"><span>Getting to know you · {step + 1} of {steps.length}</span><div role="progressbar" aria-label="Getting to know you" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={step + 1}><i style={{width:`${(step + 1) / steps.length * 100}%`}}/></div></div>
      <form onSubmit={e => { e.preventDefault(); void next(); }} onKeyDown={e => {
        const target = e.target as HTMLElement;
        onboardingEnter({ key: e.key, repeat: e.repeat, isComposing: e.nativeEvent.isComposing,
          tagName: target.tagName, choice: target.hasAttribute("data-onboarding-choice"),
          contentEditable: target.isContentEditable, preventDefault: () => e.preventDefault(),
        }, () => { if (valid && !signingOut) e.currentTarget.requestSubmit(); });
      }}>
        <fieldset disabled={signingOut} className="min-w-0">
          <div className="my-3 min-h-11">{step > 0 && <button type="button" className="min-h-11 text-sm font-medium text-slate-600" onClick={() => setStep(step - 1)}>← Back</button>}</div>
          <OnboardingQuestionV2 field={field} value={answers[field]} onChange={value => setAnswers(previous => ({ ...previous, [field]: value }))} />
          {field === "goal_target" && <button type="button" onClick={() => { setAnswers(a => ({ ...a, goal_target: "" })); setStep(step + 1); }} className="mt-3 min-h-11 text-sm font-medium text-emerald-700">Not yet</button>}
          <div className="onboarding-continue"><button type="submit" disabled={!valid} className="entry-primary w-full disabled:opacity-50">
            {step === steps.length - 1 ? "See my investing profile" : "Continue →"}
          </button></div>
        </fieldset>
      </form>
      <button type="button" disabled={signingOut} onClick={onSignOut} className="mt-4 min-h-11 text-sm font-medium text-slate-600">{signingOut ? "Signing out…" : "Sign out"}</button>
      {logoutError && <p role="alert" className="text-sm text-red-700">{logoutError}</p>}
    </div>
  </main>;
}
