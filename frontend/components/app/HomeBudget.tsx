"use client";
import { useRef, useState } from "react";
import type { PlanV2 } from "@/lib/types/planV2";
import { formatContributionMoney } from "@/lib/contributions";
import { saveBudget } from "@/lib/goalProjectionApi";
import { numericError } from "@/lib/profileValidation";
import Sheet from "../ui/Sheet";

export default function HomeBudget({ value, userId, onPlanChange }: { value: PlanV2; userId?: string; onPlanChange?: (plan: PlanV2) => void }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const saved = value.profile.monthly_investment;
  const invalid = amount.trim() === "" || !!numericError("monthly_investment", amount);
  async function save(clear = false) {
    if (pending.current || !userId || !onPlanChange || !value.revision || (!clear && invalid)) return;
    pending.current = true; setSaving(true); setError("");
    try {
      onPlanChange(await saveBudget(userId, { monthly_investment: clear ? null : Number(amount), expected_revision: value.revision }));
      setEditing(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We couldn’t save your budget."); }
    finally { pending.current = false; setSaving(false); }
  }
  return <section className="home-metric home-monthly" aria-label="Monthly contribution budget">
    <p className="eyebrow">Your monthly budget</p><h2>Monthly contribution</h2>
    <strong className="home-financial-amount">{saved === null ? "Not set yet" : formatContributionMoney(String(saved), "PHP")}</strong>
    <p>A planning amount you can edit later. It does not record an investment.</p>
    <button className="entry-link min-h-11" onClick={() => { setAmount(saved === null ? "" : String(saved)); setError(""); setEditing(true); }}>{saved === null ? "Set monthly contribution/budget →" : "Edit monthly contribution/budget →"}</button>
    {editing && <Sheet title="Monthly contribution budget" busy={saving} onClose={() => setEditing(false)}><div className="goal-form">
      <p>Choose a typical monthly amount in PHP. Zero means you currently plan no monthly contribution; Not set yet leaves this unanswered.</p>
      <label>Monthly budget (PHP)<input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label>
      <button className="entry-primary min-h-12" disabled={saving || invalid || !value.revision} onClick={() => void save()}>{saving ? "Saving…" : "Save monthly budget"}</button>
      <button className="entry-link min-h-11" disabled={saving} onClick={() => void save(true)}>Not set yet</button>
      <button className="entry-link min-h-11" disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
      {error && <p role="alert">{error}</p>}
    </div></Sheet>}
  </section>;
}
