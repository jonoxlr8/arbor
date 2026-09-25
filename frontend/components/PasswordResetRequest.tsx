"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import AuthSurface from "./AuthSurface";
import Link from "next/link";
import { requestPasswordReset, resetRequestMessage } from "@/lib/passwordRecovery";

export default function PasswordResetRequest() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true; setStatus("sending"); setError("");
    try {
      const { supabase } = await import("@/lib/supabase");
      const message = await requestPasswordReset(supabase, email);
      if (mounted.current) { setError(message ?? ""); setStatus(message ? "idle" : "sent"); }
    } catch {
      if (mounted.current) { setError("We couldn’t request a reset email. Please try again later."); setStatus("idle"); }
    } finally { busy.current = false; }
  }
  return <AuthSurface>
      <h1>{status === "sent" ? "Check your email" : "Reset your password"}</h1>
      {status === "sent" ? <p role="status" className="mt-4 text-slate-600">{resetRequestMessage}</p> : <form onSubmit={submit} className="mt-6 space-y-4">
        <p className="text-sm text-slate-600">Enter your account email to request a secure reset link.</p>
        <label htmlFor="reset-email" className="block text-sm font-medium text-slate-700">Email address</label>
        <input id="reset-email" type="email" autoComplete="email" required value={email} disabled={status === "sending"} onChange={e => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900" />
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={status === "sending"} className="min-h-12 w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-60">{status === "sending" ? "Sending…" : "Send reset email"}</button>
      </form>}
      <Link href="/#login" prefetch={false} className="entry-link mt-4 flex min-h-11 items-center justify-center">Return to login</Link>
  </AuthSurface>;
}
