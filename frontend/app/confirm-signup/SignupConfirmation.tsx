"use client";

import { useEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";
import Link from "next/link";
import { emailRedirectTo } from "@/lib/authConfig";
import { parseSignupToken, confirmSignupToken, type SignupToken } from "@/lib/signupConfirmation";

export default function SignupConfirmation() {
  const token = useRef<SignupToken | null>(null);
  const initialized = useRef(false);
  const busy = useRef(false);
  const mounted = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "invalid" | "verifying" | "failed">("loading");
  useEffect(() => {
    let active = true;
    mounted.current = true;
    if (!initialized.current) {
      initialized.current = true;
      const fragment = window.location.hash;
      window.history.replaceState(null, "", window.location.pathname);
      token.current = parseSignupToken(fragment);
    }
    queueMicrotask(() => { if (active) setStatus(token.current ? "ready" : "invalid"); });
    return () => { active = false; mounted.current = false; };
  }, []);

  async function confirm() {
    if (!token.current || busy.current) return;
    busy.current = true;
    setStatus("verifying");
    const input = token.current;
    token.current = null;
    const success = await confirmSignupToken(input, async values => {
      // Load the existing browser client only after the fragment is cleared and
      // the visitor explicitly confirms. No automatic redemption on page load.
      const { supabase } = await import("@/lib/supabase");
      return supabase.auth.verifyOtp(values);
    });
    if (!mounted.current) return;
    if (success) window.location.replace(emailRedirectTo);
    else { busy.current = false; setStatus("failed"); }
  }

  return <main className="flex min-h-dvh justify-center bg-background px-5 py-12">
    <section className="arbor-panel h-fit w-full max-w-md">
      <Logo />
      <h1 className="mt-7 text-2xl font-semibold text-slate-900">Confirm your email address</h1>
      <p role="status" className="mt-4 text-sm leading-6 text-slate-600">
        {status === "loading" ? "Checking your confirmation link…" : status === "invalid"
          ? "This confirmation link is missing or invalid. Log in if you already confirmed, or request a new email."
          : status === "failed"
          ? "We couldn’t confirm this link. It may have expired or already been used, or your connection may have been interrupted. Try logging in or request a new confirmation email."
          : status === "verifying" ? "Confirming your email…"
          : "Select the button below to confirm your email and continue to Arbor."}
      </p>
      {(status === "ready" || status === "verifying") && <button type="button" disabled={status === "verifying"} onClick={confirm}
        className="mt-6 min-h-12 w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-60">
        {status === "verifying" ? "Confirming…" : "Confirm email address"}
      </button>}
      <Link href="/#login" prefetch={false} className="entry-link mt-4 flex min-h-11 items-center justify-center">Log in or resend confirmation</Link>
    </section>
  </main>;
}
