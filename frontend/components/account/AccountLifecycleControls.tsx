"use client";
import { useEffect, useRef, useState } from 'react';
import { accountLifecycle, type AccountLifecycle, type LifecycleAction } from '@/lib/accountLifecycle';
export default function AccountLifecycleControls({ userId, initial, onChange }: { userId: string; initial?: AccountLifecycle; onChange?: (value: AccountLifecycle) => void }) {
 const [status, setStatus] = useState<AccountLifecycle | null>(initial ?? null);
 const [confirmation, setConfirmation] = useState<LifecycleAction | null>(null);
 const [busy, setBusy] = useState(false); const [error, setError] = useState('');
 const active = useRef<AbortController | null>(null);
 const operation = useRef<{ action: LifecycleAction; id: string } | null>(null);
 useEffect(() => { const c = new AbortController(); if (!initial) void accountLifecycle(userId,'status',undefined,undefined,undefined,c.signal).then(setStatus).catch(e => { if (!c.signal.aborted) setError(e instanceof Error ? e.message : 'Account status is unavailable.'); }); return () => { c.abort(); active.current?.abort(); }; }, [userId, initial]);
 async function run(action: LifecycleAction) {
  if (active.current || !status) return;
  if (operation.current?.action !== action) operation.current = { action, id: crypto.randomUUID() };
  const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
  try {
   const next = await accountLifecycle(userId,action,status.version,operation.current.id,undefined,controller.signal);
   if (controller.signal.aborted) return;
   setStatus(next); setConfirmation(null); operation.current = null;
   if (onChange) onChange(next); else window.location.reload();
  } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Account action is unavailable.'); }
  finally { if (active.current === controller) { active.current = null; setBusy(false); } }
 }
 const cancel = confirmation === 'cancel_deletion'; const deletion = confirmation === 'request_deletion';
 return <section className="mt-6 space-y-3" aria-label="Account status controls">
  {!status && !error && <p role="status">Checking account status…</p>}
  {status?.state === 'active' && status.access_allowed && <><button type="button" className="entry-link min-h-11" disabled={busy} onClick={() => { operation.current = null; setConfirmation('deactivate'); }}>Deactivate account</button><button type="button" className="entry-link min-h-11 block" disabled={busy} onClick={() => { operation.current = null; setConfirmation('request_deletion'); }}>Request account deletion</button></>}
  {status?.state === 'deletion_pending' && <><p>Your deletion request is pending. Signing in has not cancelled it. Your data has not been erased.</p><p>Jonathan Isidoro reviews requests. Our operating targets are acknowledgment within two business days, assessment within seven calendar days, and ordinary completion within 30 calendar days after identity verification. Delays or justified retention will be explained; these are targets, not guaranteed deadlines.</p>{status.processing && <p role="status">{status.processing.held ? 'A scoped retention hold needs review. We will explain the affected information and next step.' : `Identity reviewed. Ordinary completion target: ${new Date(status.processing.completion_target).toLocaleDateString()}.`}</p>}<a className="entry-link min-h-11 inline-flex items-center" href="/account-deletion">How account deletion works</a><button type="button" className="entry-link min-h-11" disabled={busy} onClick={() => { operation.current = null; setConfirmation('cancel_deletion'); }}>Cancel deletion request and return to Arbor</button></>}
  {status && status.in_flight_reminders > 0 && <p>A reminder already in progress may still arrive. Further reminders are suppressed.</p>}
  {confirmation && <div className="rounded-xl border border-current p-4" role="group" aria-label="Confirm account action">
   <h2 className="text-lg font-semibold">{cancel ? 'Cancel your deletion request?' : deletion ? 'Request deletion of your account?' : 'Deactivate your account?'}</h2>
   <p className="mt-2">{cancel ? 'This withdraws your request and restores normal account access. It is unavailable after erasure begins.' : deletion ? 'Normal account use and future reminders stop while your request is reviewed. Submitting the request does not immediately erase data. You can explicitly cancel until irreversible erasure starts; signing in does not cancel it. No additional support message is required after submitting here.' : 'Your recorded investments stay saved. Normal account use and future reminders stop. A fresh sign-in can reopen your account.'}</p>
   <p className="mt-2">You may download your data first. A download is optional.</p>
   <div className="mt-4 flex flex-wrap gap-3"><button type="button" className="entry-primary min-h-11" disabled={busy} onClick={() => void run(confirmation)}>{busy ? 'Please wait…' : cancel ? 'Confirm cancellation and return' : deletion ? 'Confirm deletion request' : 'Confirm deactivation'}</button><button type="button" className="entry-link min-h-11" disabled={busy} onClick={() => { setConfirmation(null); operation.current = null; }}>Keep current status</button></div>
  </div>}
  {error && <p role="alert">{error}</p>}
 </section>;
}
