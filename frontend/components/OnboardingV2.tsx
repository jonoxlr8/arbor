"use client";

import { useEffect, useRef, useState } from "react";
import Card from "./Card";
import Logo from "./Logo";
import ProgressBar from "./ProgressBar";
import { createV2Profile } from "@/lib/profileV2Api";
import { InvalidSessionError } from "@/lib/accountRecovery";
import { answerError, EMPTY_ANSWERS, ONBOARDING_STEPS, onboardingRequest, SAVINGS_OPTIONS, DEBT_OPTIONS, HORIZON_OPTIONS, RISK_OPTIONS, type Answers } from "@/lib/onboardingV2";
import type { AccountPlan } from "@/lib/types/planV2";
import { onboardingEnter } from "@/lib/onboardingKeyboard";

const QUESTIONS: Record<keyof Answers, string> = {
  full_name: "What’s your name?", country: "Where do you live?",
  emergency_savings: "How much emergency savings do you have?",
  high_interest_debt: "How is your high-interest debt?",
  goal_target: "Do you have a goal amount in mind?",
  current_portfolio_value: "What is your planning starting value?",
  monthly_investment: "How much would you plan to invest monthly?",
  horizon: "When might you need this money?",
  risk_response: "If your investments fell about 30%, what would you most likely do?",
};
const HELP: Partial<Record<keyof Answers, string>> = {
  emergency_savings: "Think about how many months of essential expenses your savings could cover.",
  high_interest_debt: "For example, credit-card balances or other expensive borrowing.",
  goal_target: "An optional amount in today’s PHP. You can choose Not yet.",
  current_portfolio_value: "A separate planning amount, not your recorded holdings. Starting from zero is fine.",
  monthly_investment: "A planning amount, not an order. Zero is fine.",
  country: "Your country sets your planning currency. This beta supports the Philippines.",
};
const OPTIONS: Partial<Record<keyof Answers, readonly (readonly [string, string])[]>> = {
  country: [["Philippines", "Philippines · PHP"], ["Other", "Other country"]],
  emergency_savings: SAVINGS_OPTIONS, high_interest_debt: DEBT_OPTIONS,
  horizon: HORIZON_OPTIONS, risk_response: RISK_OPTIONS,
};

export function OnboardingQuestionV2({ field, value, onChange }: {field: keyof Answers; value: string; onChange: (value: string) => void}) {
  const options = OPTIONS[field];
  const error = value ? answerError(field, value) : null;
  return <section aria-labelledby="onboarding-question">
    <h1 id="onboarding-question" className="text-2xl font-semibold text-slate-900">{QUESTIONS[field]}</h1>
    {HELP[field] && <p className="mt-3 text-sm leading-6 text-slate-600">{HELP[field]}</p>}
    {options ? <div role="group" aria-labelledby="onboarding-question" className="mt-6 space-y-3">
      {options.map(([code, label]) => <button key={code} type="button" data-onboarding-choice aria-pressed={value === code} onClick={() => onChange(code)}
        className={`min-h-12 w-full rounded-xl border p-4 text-left font-medium text-slate-900 focus-visible:outline-2 focus-visible:outline-emerald-600 ${value === code ? "border-green-600 bg-green-50" : "border-slate-300 hover:border-green-400"}`}>{label}</button>)}
    </div> : <div className="mt-6">
      <label className="sr-only" htmlFor={field}>{QUESTIONS[field]}</label>
      <input id={field} value={value} onChange={e => onChange(e.target.value)}
        type={field === "full_name" ? "text" : "number"} inputMode={field === "full_name" ? "text" : "decimal"}
        autoComplete={field === "full_name" ? "given-name" : "off"} maxLength={field === "full_name" ? 120 : undefined}
        min={field === "full_name" ? undefined : 0} step="any"
        aria-invalid={!!error} aria-describedby={error ? "answer-error" : undefined}
        className="min-h-14 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-4 py-3 text-xl text-slate-900" />
      {field !== "full_name" && <p className="mt-2 text-sm text-slate-500">Planning currency: PHP</p>}
    </div>}
    {error && <p id="answer-error" role="status" className="mt-3 text-sm text-slate-600">{error}</p>}
  </section>;
}

export default function OnboardingV2({ userId, onComplete, onSignOut, signingOut, logoutError }: {
  userId: string; onComplete: (plan: AccountPlan) => void; onSignOut: () => void; signingOut: boolean; logoutError: string;
}) {
  const [answers, setAnswers] = useState<Answers>({ ...EMPTY_ANSWERS });
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sessionFailed, setSessionFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  const field = ONBOARDING_STEPS[step];
  const valid = !answerError(field, answers[field]);
  async function next() {
    if (!valid || request.current || sessionFailed || signingOut) return;
    if (step < ONBOARDING_STEPS.length - 1) { setStep(step + 1); return; }
    const controller = new AbortController();
    request.current = controller;
    setSaving(true); setError("");
    try {
      const result = await createV2Profile(onboardingRequest(answers), userId, controller.signal);
      if (request.current === controller && !controller.signal.aborted) onComplete(result);
    } catch (failure) {
      if (request.current !== controller || controller.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : "We couldn’t save your plan. Please retry.");
      if (failure instanceof InvalidSessionError) setSessionFailed(true);
    } finally {
      if (request.current === controller) { request.current = null; setSaving(false); }
    }
  }
  return <main className="flex min-h-dvh justify-center bg-background px-4 py-6 sm:py-12">
    <div className="w-full min-w-0 max-w-xl"><Card>
      <Logo />
      <ProgressBar step={step + 1} totalSteps={ONBOARDING_STEPS.length} />
      <form onSubmit={e => { e.preventDefault(); void next(); }} onKeyDown={e => {
        const target = e.target as HTMLElement;
        onboardingEnter({ key: e.key, repeat: e.repeat, isComposing: e.nativeEvent.isComposing,
          tagName: target.tagName, choice: target.hasAttribute("data-onboarding-choice"),
          contentEditable: target.isContentEditable, preventDefault: () => e.preventDefault(),
        }, () => { if (valid && !saving && !signingOut && !sessionFailed) e.currentTarget.requestSubmit(); });
      }}>
        <fieldset disabled={saving || signingOut} className="min-w-0">
          <div className="my-3 min-h-11">{step > 0 && <button type="button" className="min-h-11 text-sm font-medium text-slate-600" onClick={() => setStep(step - 1)}>← Back</button>}</div>
          <OnboardingQuestionV2 field={field} value={answers[field]} onChange={value => setAnswers(previous => ({ ...previous, [field]: value }))} />
          {field === "goal_target" && <button type="button" onClick={() => { setAnswers(a => ({ ...a, goal_target: "" })); setStep(step + 1); }} className="mt-3 min-h-11 text-sm font-medium text-emerald-700">Not yet</button>}
          <button type="submit" disabled={!valid || sessionFailed} className="mt-6 min-h-12 w-full rounded-2xl bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-50">
            {saving ? "Saving your plan…" : step === ONBOARDING_STEPS.length - 1 ? (error ? "Retry saving my plan" : "Show my Arbor plan") : "Continue →"}
          </button>
        </fieldset>
      </form>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <button type="button" disabled={signingOut} onClick={onSignOut} className="mt-4 min-h-11 text-sm font-medium text-slate-600">{signingOut ? "Signing out…" : "Sign out"}</button>
      {logoutError && <p role="alert" className="text-sm text-red-700">{logoutError}</p>}
    </Card></div>
  </main>;
}
