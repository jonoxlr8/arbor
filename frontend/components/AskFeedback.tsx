"use client";
import { useEffect, useRef, useState } from "react";
import { askFeedback } from "@/lib/askFeedback";
import { FEEDBACK_REASONS, type FeedbackContext, type FeedbackReason } from "@/lib/askPresentation";
export default function AskFeedback({ id, context }: { id: string; context: FeedbackContext }) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [reason, setReason] = useState<FeedbackReason | "">("");
  const [savedReason, setSavedReason] = useState<FeedbackReason | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const send = async (helpful: boolean, optionalReason: FeedbackReason | null) => {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError("");
    try {
      const result = await askFeedback.save(id,{...context,helpful,reason:optionalReason},controller.signal);
      if (!controller.signal.aborted) {setSaved(result.helpful);setSavedReason(result.reason);setReason(result.reason ?? "");}
    } catch {if (!controller.signal.aborted) setError("Feedback could not be saved. You can retry; your answer stays available.");}
    finally {if (!controller.signal.aborted) {active.current = null;setBusy(false);}}
  };
  return <div className="ask-feedback" aria-label="Answer feedback">
    <div className="ask-feedback-votes"><span>Was this helpful?</span>
      <button type="button" disabled={busy} aria-pressed={saved === true} onClick={() => send(true,null)}>Helpful</button>
      <button type="button" disabled={busy} aria-pressed={saved === false} onClick={() => send(false,null)}>Not helpful</button>
    </div>
    {busy && <p role="status">Saving feedback…</p>}
    {saved !== null && !busy && <p role="status">Feedback saved.</p>}
    {error && <p role="alert">{error}</p>}
    {saved !== null && <details><summary>Add a reason (optional)</summary>
      <label>Reason<select aria-label="Optional feedback reason" value={reason} disabled={busy} onChange={e => setReason(e.target.value as FeedbackReason | "")}>
        <option value="">No reason</option>{Object.entries(FEEDBACK_REASONS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
      </select></label><button type="button" disabled={busy || (reason || null) === savedReason} onClick={() => send(saved,reason || null)}>Save reason</button>
    </details>}
    <details className="ask-feedback-privacy"><summary>What feedback saves</summary><p>Your vote, fixed-choice reason, topic and answer version are stored with your account ID, a random feedback ID and date. Your question, answer, financial figures and email are not included. Jonathan can review votes and topic totals without customer identity or portfolio access. Feedback is included in your account export and reviewed account erasure. It is eligible for manual cleanup after 90 days, subject to scoped support holds; removal may occur later.</p></details>
  </div>;
}
