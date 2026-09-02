"use client";

import { useState } from "react";
import { signIn, signUp } from "@/lib/auth";

type AuthFormProps = {
  onAuthenticated: () => void;
};

export default function AuthForm({ onAuthenticated }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    setLoading(true);

    try {
      const result = isSignUp
        ? await signUp(email, password)
        : await signIn(email, password);

      if (result.error) {
        setError(result.error.message);
        return;
      }

      if (isSignUp && !result.data.session) {
        setError("Account created. Please check your email to confirm your account.");
        return;
      }

      onAuthenticated();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
        <h1 className="text-3xl font-bold text-slate-900">
          Welcome to Arbor 🌳
        </h1>

        <p className="mt-3 text-slate-600">
          {isSignUp
            ? "Create your account to start building your investment strategy."
            : "Sign in to continue building your investment strategy."}
        </p>

        <div className="mt-8 space-y-4">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-5 py-4 text-slate-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-100"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-5 py-4 text-slate-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-100"
          />

          {error && (
            <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
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
                ? "Create Account"
                : "Sign In"}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError("");
            }}
            className="w-full py-2 text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            {isSignUp
              ? "Already have an account? Sign in"
              : "Don't have an account? Create one"}
          </button>
        </div>
      </div>
    </main>
  );
}
