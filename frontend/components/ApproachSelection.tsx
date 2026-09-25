"use client";
import { useEffect, useRef, useState } from "react";
import { approachRequest, createV2Profile, isAccountPlan, isMatchingPlanPreview } from "@/lib/profileV2Api";
import type { AccountPlan, ExplicitCustomization, PlanV2, ProfileV2Input, Strategy } from "@/lib/types/planV2";
import { InvalidSessionError } from "@/lib/accountRecovery";
import { HORIZON_OPTIONS } from "@/lib/onboardingV2";
import { sleeveColors } from "./AssetIdentity";
import { CORE_CUSTOMIZATION, FinalPlanReview, PlanCustomization } from "./PlanCustomization";

const PROFILE_DESCRIPTION: Record<Strategy, string> = {
  Conservative: "Your answers suggest you prefer smaller ups and downs and place more importance on stability.",
  Balanced: "Your answers suggest you are comfortable balancing some market growth with a steadier approach.",
  Growth: "Your answers suggest you are comfortable with larger ups and downs over a long time horizon.",
  Aggressive: "Your answers suggest you are comfortable with substantial ups and downs over a long time horizon.",
};
export function InvestingProfileSummary({ input, assessment }: { input: ProfileV2Input; assessment: Options["assessment"] }) {
  return <section aria-labelledby="investing-profile-heading">
    <p className="choice-eyebrow">A little clarity about you</p>
    <h2 id="investing-profile-heading" className="choice-heading">Your investing profile</h2>
    <div className="profile-assessment"><strong>{assessment.requested_strategy}</strong><p>{PROFILE_DESCRIPTION[assessment.requested_strategy]}</p></div>
    <p className="choice-intro">This summary is informational. No plan has been selected for you. You choose your approach next.</p>
    <ul className="profile-context"><li>{HORIZON_OPTIONS.find(([code]) => code === input.horizon)?.[1]}</li><li>₱{input.monthly_investment.toLocaleString("en-PH")} monthly plan</li><li>Goal: {input.goal_target == null ? "Not set yet" : `₱${input.goal_target.toLocaleString("en-PH")}`}</li></ul>
  </section>;
}

type Option = { strategy: Strategy; allocation: { role: string; percentage_points: number }[]; planning_return_pct: number };
type Options = { assessment: { requested_strategy: Strategy; is_short_term: boolean }; approaches: Option[] };
export function validApproaches(value: unknown): value is Options {
  if (!value || typeof value !== "object") return false;
  const v = value as Options;
  const names = ["Conservative", "Balanced", "Growth", "Aggressive"];
  return !!v.assessment && names.includes(v.assessment.requested_strategy) && typeof v.assessment.is_short_term === "boolean" &&
    Array.isArray(v.approaches) && v.approaches.length === 4 &&
    v.approaches.every(o => o && names.includes(o.strategy) && Number.isFinite(o.planning_return_pct) && Array.isArray(o.allocation) && o.allocation.length === 2 &&
      o.allocation.every(w => w && ["global_equity", "defensive"].includes(w.role) && Number.isInteger(w.percentage_points) && w.percentage_points >= 0 && w.percentage_points <= 100) && new Set(o.allocation.map(w => w.role)).size === 2 && o.allocation.reduce((sum,w)=>sum+w.percentage_points,0) === 100) && new Set(v.approaches.map(o => o.strategy)).size === 4;
}
export function ApproachOptions({ options, selected, onSelect }: { options: Options; selected: string; onSelect: (value: Strategy | "short_term") => void }) {
  return <section aria-labelledby="approach-heading">
    <p className="choice-eyebrow">Your choice, your direction</p>
    <h2 id="approach-heading" className="choice-heading">Choose your approach</h2>
    {options.assessment.is_short_term ? <><p className="choice-intro">For money needed in less than 3 years, Arbor offers a short-term planning path without a long-term allocation.</p><button type="button" aria-pressed={selected === "short_term"} onClick={() => onSelect("short_term")} className="approach-option mt-5 w-full"><strong>Short-term planning</strong><small>No long-term allocation</small></button></>
      : <><p className="choice-intro">Compare the same core approaches available to every long-term user. Your informational profile is not a plan selection.</p>
        <div className="approach-options">{options.approaches.map(option => <button type="button" key={option.strategy} aria-pressed={selected === option.strategy} onClick={() => onSelect(option.strategy)} className="approach-option">
          <strong>{option.strategy}</strong>{selected === option.strategy && <span className="approach-selected" aria-hidden="true">✓</span>}
          <span className="approach-bar" aria-hidden="true">{option.allocation.map(w => <span key={w.role} style={{ width: `${w.percentage_points}%`, background: sleeveColors[w.role as "global_equity" | "defensive"] }} />)}</span>
          <small>{option.allocation.map(w => `${w.percentage_points}% ${w.role === "global_equity" ? "global equity" : "defensive"}`).join(" · ")}</small>
        </button>)}</div>
        <details className="approach-details"><summary>About these approaches</summary><p>More equity means more exposure to stock-market fluctuations. Defensive investments also carry risk. These are long-term models, not short-term cash plans.</p><p className="mt-3">Projections are hypothetical, not forecasts. Past performance does not guarantee future results.</p><p className="mt-3">Annual planning assumptions: {options.approaches.map(o => `${o.strategy} ${o.planning_return_pct.toFixed(1)}%`).join(" · ")}.</p></details></>}
    <p className="choice-note">Nothing is selected for you. Technology and Bitcoin are optional choices in the next step.</p>
  </section>;
}

type Stage = "profile" | "approach" | "customize" | "review";
export default function ApproachSelection({ input, userId, existing, onComplete, onBack }: {
  input: ProfileV2Input; userId: string; existing?: boolean; onComplete: (plan: AccountPlan) => void; onBack: () => void;
}) {
  const [options, setOptions] = useState<Options | null>(null);
  const [selected, setSelected] = useState<Strategy | "short_term" | "">("");
  const [stage, setStage] = useState<Stage>(existing ? "approach" : "profile");
  const [customization, setCustomization] = useState<ExplicitCustomization>({ ...CORE_CUSTOMIZATION });
  const [preview, setPreview] = useState<PlanV2 | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const owner = useRef<AbortController | null>(null), pending = useRef(false), panel = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const controller = new AbortController(); owner.current = controller;
    approachRequest("approaches", input, userId, controller.signal).then(value => {
      if (!validApproaches(value)) throw Error();
      if (!controller.signal.aborted) setOptions(value);
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof InvalidSessionError ? "Your session has expired. Return and sign in again." : "We couldn’t load the approaches. Please retry."); });
    return () => { controller.abort(); owner.current?.abort(); owner.current = null; };
  }, [input, userId, retry]);
  useEffect(() => { panel.current?.focus({ preventScroll: true }); panel.current?.scrollIntoView({ block: "start", behavior: "instant" }); }, [stage]);
  function payload(): ProfileV2Input {
    return { ...input, selected_approach: selected || null, explicit_customization: selected === "short_term" ? null : customization };
  }
  async function review() {
    if (!selected || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    const controller = new AbortController(); owner.current = controller;
    try {
      const request = payload();
      const result = await approachRequest("plan-preview", request, userId, controller.signal);
      if (!isMatchingPlanPreview(result, request)) throw new Error("The plan preview did not match your choices. Please retry.");
      if (!controller.signal.aborted) { setPreview(result); setStage("review"); }
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "We couldn’t preview your plan. Please retry."); }
    finally { pending.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  async function save() {
    if (!selected || !preview || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    const controller = new AbortController(); owner.current = controller;
    try {
      const result = existing ? await approachRequest("profiles/approach", payload(), userId, controller.signal) : await createV2Profile(payload(), userId, controller.signal);
      if (!isAccountPlan(result)) throw Error();
      if (!controller.signal.aborted) onComplete(result);
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof InvalidSessionError ? "Your session has expired. Return and sign in again." : "We couldn’t confirm your saved selection. Retry or reload your plan; your choices are still here."); }
    finally { pending.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  function back() {
    setError("");
    if (stage === "profile" || (existing && stage === "approach")) onBack();
    else if (stage === "approach") setStage("profile");
    else if (stage === "customize") setStage("approach");
    else { setPreview(null); setStage(selected === "short_term" ? "approach" : "customize"); }
  }
  return <section ref={panel} tabIndex={-1} className="plan-choice" aria-label="Choose your plan">
    <div className="choice-navigation"><button type="button" disabled={busy} onClick={back} className="entry-link">← Back</button><small>{stage === "profile" ? "Understand" : stage === "approach" ? "Choose" : stage === "customize" ? "Customize" : "Confirm"}</small></div>
    {!options && !error && <p role="status">Loading approaches…</p>}
    {options && <fieldset disabled={busy} className="min-w-0">
      {stage === "profile" && <InvestingProfileSummary input={input} assessment={options.assessment} />}
      {stage === "approach" && <ApproachOptions options={options} selected={selected} onSelect={choice => { setSelected(choice); setPreview(null); setError(""); }} />}
      {stage === "customize" && selected && selected !== "short_term" && <PlanCustomization approach={selected} value={customization} onChange={value => { setCustomization(value); setPreview(null); setError(""); }} disabled={busy} />}
      {stage === "review" && preview && <FinalPlanReview value={preview} />}
      <div className="choice-actions">
        {stage === "profile" && <button type="button" className="entry-primary" onClick={() => setStage("approach")}>Compare approaches</button>}
        {stage === "approach" && <button type="button" disabled={!selected} className="entry-primary disabled:opacity-50" onClick={() => selected === "short_term" ? void review() : setStage("customize")}>{busy ? "Preparing your plan…" : selected === "short_term" ? "Review my plan" : "Continue"}</button>}
        {stage === "customize" && <button type="button" className="entry-primary" onClick={() => void review()}>{busy ? "Preparing your plan…" : "Review my plan"}</button>}
        {stage === "review" && <><button type="button" className="entry-primary" onClick={() => void save()}>{busy ? "Saving your plan…" : "Use this as my plan"}</button><button type="button" className="entry-link" onClick={back}>Change choices</button></>}
      </div>
    </fieldset>}
    {error && <p role="alert" className="mt-4 text-sm text-slate-700">{error}</p>}
    {!options && error && <button type="button" className="entry-primary mt-4" onClick={() => { setError(""); setRetry(retry + 1); }}>Retry</button>}
  </section>;
}
