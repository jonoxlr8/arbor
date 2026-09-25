"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import AuthSurface from "@/components/AuthSurface";
import Link from "next/link";
import { captureRecoveryToken, verifyRecoveryToken, type RecoveryToken, endRecoverySession, passwordValidation, resetLinkMessage, updateRecoveryPassword } from "@/lib/passwordRecovery";

export default function ResetPassword() {
  const [status, setStatus] = useState<"checking" | "confirm" | "verifying" | "ready" | "invalid" | "saving" | "signout" | "success">("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const owner = useRef<string | null>(null);
  const busy = useRef(false);
  const token = useRef<RecoveryToken | null>(null);
  const initialized = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    if (!initialized.current) {
      initialized.current = true;
      token.current = captureRecoveryToken(window);
    }
    // No SDK import, session lookup or verification on load.
    queueMicrotask(() => { if (active) setStatus(token.current ? "confirm" : "invalid"); });
    return () => { active = false; mounted.current = false; };
  }, []);

  async function verify() {
    if (busy.current || !token.current || status !== "confirm") return;
    busy.current = true; setStatus("verifying");
    const input = token.current;
    token.current = null;
    try {
      const { supabase, passwordRecovery } = await import("@/lib/supabase");
      const userId = await verifyRecoveryToken(supabase, input);
      if (!mounted.current) return;
      owner.current = userId && passwordRecovery.getUserId() === userId ? userId : null;
      setStatus(owner.current ? "ready" : "invalid");
    } catch { if (mounted.current) setStatus("invalid"); }
    finally { busy.current = false; }
  }

  async function finish() {
    if (busy.current) return;
    busy.current = true;
    try {
      const { supabase } = await import("@/lib/supabase");
      const ended = await endRecoverySession(supabase);
      if (mounted.current) { setStatus(ended ? "success" : "signout"); setError(ended ? "" : "Your password changed, but sign-out couldn’t finish. Please try again."); }
    } catch { if (mounted.current) { setStatus("signout"); setError("Your password changed. Please retry sign-out."); } }
    finally { busy.current = false; }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || !owner.current || status !== "ready") return;
    const invalid = passwordValidation(password, confirmation);
    if (invalid) { setError(invalid); return; }
    busy.current = true; setStatus("saving"); setError("");
    try {
      const { supabase, passwordRecovery } = await import("@/lib/supabase");
      if (passwordRecovery.getUserId() !== owner.current) { if (mounted.current) setStatus("invalid"); return; }
      const message = await updateRecoveryPassword(supabase, owner.current, password, confirmation);
      if (!mounted.current) return;
      if (message) { setError(message); setStatus("ready"); return; }
      setPassword(""); setConfirmation("");
    } catch { if (mounted.current) { setError("We couldn’t confirm the password change. Try logging in or request another reset email."); setStatus("ready"); } return; }
    finally { busy.current = false; }
    await finish();
  }
  return <AuthSurface>
      <h1>{status === "success" ? "Password updated" : status === "invalid" ? "Request a new reset link" : "Choose a new password"}</h1>
      {status === "checking" && <p role="status" className="mt-4 text-slate-600">Checking your reset link…</p>}
      {(status === "confirm" || status === "verifying") && <>
        <p className="mt-4 text-sm text-slate-600">Verify your reset link to choose a new password.</p>
        <button type="button" disabled={status === "verifying"} onClick={() => void verify()} className="mt-6 min-h-12 w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-60">
          {status === "verifying" ? "Verifying…" : "Verify reset link"}
        </button>
      </>}
      {status === "invalid" && <p role="status" className="mt-4 text-slate-600">{resetLinkMessage}</p>}
      {status === "success" && <p role="status" className="mt-4 text-slate-600">Your password has changed. Log in with your new password.</p>}
      {(status === "ready" || status === "saving") && <form onSubmit={submit} className="mt-6 space-y-4">
        <p className="text-sm text-slate-600">Use at least 8 characters. A longer, unique password is best.</p>
        <label htmlFor="new-password" className="block text-sm font-medium text-slate-700">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" required minLength={8} value={password} disabled={status === "saving"} onChange={e => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900" />
        <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700">Confirm new password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} value={confirmation} disabled={status === "saving"} onChange={e => setConfirmation(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900" />
        <button disabled={status === "saving"} className="min-h-12 w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-60">{status === "saving" ? "Saving…" : "Change password"}</button>
      </form>}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      {status === "signout" && <button onClick={() => void finish()} className="entry-link min-h-11">Retry sign-out</button>}
      <Link href="/#login" prefetch={false} className="entry-link mt-4 flex min-h-11 items-center justify-center">Return to login</Link>
      {status !== "success" && <Link href="/forgot-password" prefetch={false} className="entry-link flex min-h-11 items-center justify-center">Request another password reset</Link>}
  </AuthSurface>;
}
