"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { signIn, signUp, resendConfirmation } from "@/lib/auth";
import type { AccountSession } from "@/lib/accountRecovery";
import { authErrorMessage } from "@/lib/authErrorMessage";
import { entryLinks } from "@/lib/publicEntry";

type AuthFormProps = {
  onAuthenticated: (session: AccountSession) => void;
  mode: "login" | "signup";
};

export default function AuthForm({ onAuthenticated, mode }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const isSignUp = mode === "signup";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const submitting = useRef(false);
  const [cooldown, setCooldown] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (submitting.current || cooldown || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return;
    submitting.current = true;
    setLoading(true); setError(""); setConfirmation(""); setCooldown(60);
    try {
      await resendConfirmation(email.trim());
      if (mounted.current) setConfirmation("If this address has an account awaiting confirmation, a new email has been requested. Check your inbox and spam folder.");
    } catch (error) {
      if (mounted.current) setError(authErrorMessage(error));
    } finally {
      submitting.current = false;
      if (mounted.current) setLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || !email || !password) return;
    submitting.current = true;
    setError("");
    setConfirmation("");
    setLoading(true);

    try {
      const result = isSignUp
        ? await signUp(email, password)
        : await signIn(email, password);

      if (result.error) {
        setError(authErrorMessage(result.error));
        return;
      }

      if (isSignUp && !result.data.session) {
        setConfirmation("Check your email to confirm your account. If you already have an account, you can log in.");
        setCooldown(60);
        return;
      }

      if (!result.data.session) {
        setError("We couldn’t complete sign-in. Please try again.");
        return;
      }
      onAuthenticated(result.data.session);
    } catch (error) {
      setError(authErrorMessage(error));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
      <section className="arbor-panel mx-auto w-full max-w-md">
        <p className="text-xs font-semibold uppercase tracking-wider text-forest">{isSignUp ? "Your next chapter" : "Your plan is waiting"}</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
          {isSignUp ? "Create your Arbor account" : "Welcome back"}
        </h1>

        <p className="mt-3 text-slate-600">
          {isSignUp
            ? "Save your investment plan and track your progress over time."
            : "Continue building your long-term wealth plan."}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label htmlFor="auth-email" className="block text-sm font-medium text-slate-700">Email address</label>
          <input
            id="auth-email"
            disabled={loading}
            aria-label="Email address"
            autoComplete="email"
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-5 py-4 text-slate-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-100"
          />

          <label htmlFor="auth-password" className="block text-sm font-medium text-slate-700">Password</label>
          <input
            id="auth-password"
            aria-label="Password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-5 py-4 text-slate-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-100"
          />

          {confirmation && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{confirmation}</p>}
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className={`w-full rounded-2xl py-4 text-lg font-semibold transition ${
              loading || !email || !password
                ? "cursor-not-allowed bg-slate-200 text-slate-400"
                : "bg-emerald-700 text-white hover:bg-emerald-800"
            }`}
          >
            {loading
              ? "Please wait..."
              : isSignUp
                ? "Create account"
                : "Log in"}
          </button>

          <button type="button" onClick={() => void handleResend()}
            disabled={loading || cooldown > 0 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
            className="min-h-11 w-full rounded-xl px-3 py-3 text-sm font-medium text-forest disabled:opacity-50">
            {cooldown ? `Resend confirmation in ${cooldown}s` : "Resend confirmation email"}
          </button>

          <a
            href={isSignUp ? entryLinks.login : entryLinks.signup}
            aria-disabled={loading}
            onClick={event => { if (loading) event.preventDefault(); }}
            className="entry-link flex w-full justify-center text-center"
          >
            {isSignUp
              ? "Already have an account? Log in"
              : "New to Arbor? Get started"}
          </a>
        </form>
      </section>
  );
}
