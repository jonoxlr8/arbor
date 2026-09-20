"use client";

import { useEffect, useRef } from "react";

export default function SignupPending({ email, loading, cooldown, resendDisabled, confirmation, error, onResend, onDifferentEmail }: {
  email: string; loading: boolean; cooldown: number; resendDisabled: boolean;
  confirmation: string; error: string; onResend: () => void; onDifferentEmail: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <section className="arbor-panel mx-auto w-full min-w-0 max-w-md" aria-labelledby="signup-pending-title">
    <h1 ref={heading} id="signup-pending-title" tabIndex={-1} className="text-3xl font-semibold tracking-tight text-slate-900 outline-none">Check your email</h1>
    <p className="mt-5 text-slate-600">We sent a confirmation link to:</p>
    <p className="mt-2 break-all font-semibold text-slate-900">{email}</p>
    <p className="mt-5 text-sm leading-6 text-slate-600">Open the email and select “Continue to email confirmation” to finish creating your Arbor account.</p>
    {confirmation && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{confirmation}</p>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <button type="button" disabled={resendDisabled} onClick={onResend} className="mt-6 min-h-12 w-full rounded-xl bg-forest px-4 py-3 font-semibold text-white disabled:opacity-50">
      {loading ? "Please wait…" : cooldown ? `Resend confirmation in ${cooldown}s` : "Resend confirmation email"}
    </button>
    <button type="button" disabled={loading} onClick={onDifferentEmail} className="entry-link mt-3 flex min-h-11 w-full items-center justify-center disabled:opacity-50">Use a different email</button>
  </section>;
}
