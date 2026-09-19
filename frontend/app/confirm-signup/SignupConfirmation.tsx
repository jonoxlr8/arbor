"use client";

import { useEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";
import Link from "next/link";
import { emailRedirectTo } from "@/lib/authConfig";
import { signupConfirmationUrl } from "@/lib/signupConfirmation";

export default function SignupConfirmation() {
  const target = useRef<string | null>(null);
  const initialized = useRef(false);
  const navigating = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "invalid" | "leaving">("loading");
  useEffect(() => {
    let active = true;
    if (!initialized.current) {
      initialized.current = true;
      target.current = signupConfirmationUrl(window.location.hash, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", emailRedirectTo);
      // Drop all link information from this history entry before any interaction.
      window.history.replaceState(null, "", window.location.pathname);
    }
    queueMicrotask(() => { if (active) setStatus(target.current ? "ready" : "invalid"); });
    return () => { active = false; };
  }, []);

  function confirm() {
    if (!target.current || navigating.current) return;
    navigating.current = true;
    setStatus("leaving");
    // No verification request, prefetchable link or navigation exists before this click.
    window.location.assign(target.current);
  }

  return <main className="flex min-h-dvh justify-center bg-background px-5 py-12">
    <section className="arbor-panel h-fit w-full max-w-md">
      <Logo />
      <h1 className="mt-7 text-2xl font-semibold text-slate-900">Confirm your email address</h1>
      <p role="status" className="mt-4 text-sm leading-6 text-slate-600">
        {status === "loading" ? "Checking your confirmation link…" : status === "invalid"
          ? "This confirmation link is missing or invalid. Log in if you already confirmed, or request a new email."
          : "Select the button below to confirm your email with Supabase and continue to Arbor."}
      </p>
      {(status === "ready" || status === "leaving") && <button type="button" disabled={status === "leaving"} onClick={confirm}
        className="mt-6 min-h-12 w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-60">
        {status === "leaving" ? "Continuing…" : "Confirm email address"}
      </button>}
      <Link href="/#login" prefetch={false} className="entry-link mt-4 flex min-h-11 items-center justify-center">Log in or resend confirmation</Link>
    </section>
  </main>;
}
