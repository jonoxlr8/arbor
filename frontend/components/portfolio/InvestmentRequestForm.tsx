"use client";
import { useEffect, useRef, useState } from "react";
import { requestText, validRequestText, submitInvestmentRequest, type InvestmentRequestDraft, type InvestmentRequestReceipt } from "@/lib/investmentRequests";

const inputClass = "mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900";
export default function InvestmentRequestForm({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<InvestmentRequestReceipt | null>(null);
  const pending = useRef(false);
  const draft = useRef<InvestmentRequestDraft | null>(null);
  const focus = useRef<HTMLInputElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => { focus.current?.focus(); }, []);
  useEffect(() => { if (error || receipt) feedback.current?.focus(); }, [error, receipt]);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    if (!validRequestText(name, 120) || !validRequestText(provider, 80)) { setError("Enter the investment name and provider."); return; }
    const investment_name = requestText(name), providerName = requestText(provider);
    if (!draft.current || draft.current.investment_name !== investment_name || draft.current.provider !== providerName)
      draft.current = { investment_name, provider: providerName, idempotency_key: crypto.randomUUID() };
    pending.current = true; setBusy(true); setError("");
    try { setReceipt(await submitInvestmentRequest(userId, draft.current)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "We couldn’t confirm your request. Please retry."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="investment-form space-y-4" aria-label="Request a missing investment">
    <h3 className="text-lg font-semibold">Request an investment</h3>
    <p className="text-sm text-slate-600">Tell us which investment is missing. Please don’t include account numbers or personal details.</p>
    {receipt ? <>
      <p ref={feedback} tabIndex={-1} role="status" className="text-sm font-semibold">{receipt.status === "already_received" ? "Your request is already received." : "Request received."}</p>
      <p className="text-sm text-slate-600">We’ll review {receipt.investment_name} from {receipt.provider}. This does not add a holding or confirm support.</p>
      <button type="button" className="entry-link min-h-11" onClick={onBack}>Back to investments</button>
    </> : <form className="space-y-4" onSubmit={event => void send(event)}>
      <label className="block text-sm">Investment or fund name<input ref={focus} className={inputClass} required maxLength={120} autoComplete="off" value={name} onChange={e => setName(e.target.value)} disabled={busy}/></label>
      <label className="block text-sm">Provider<input className={inputClass} required maxLength={80} autoComplete="off" value={provider} onChange={e => setProvider(e.target.value)} disabled={busy}/></label>
      {error && <p ref={feedback} tabIndex={-1} role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-3"><button type="submit" className="entry-primary min-h-11" disabled={busy}>{busy ? "Sending…" : error ? "Retry request" : "Send request"}</button><button type="button" className="entry-link min-h-11" disabled={busy} onClick={onBack}>Back to investments</button></div>
    </form>}
  </section>;
}
