"use client";

import { useEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";
import Card from "@/components/Card";
import Welcome from "@/components/Welcome";
import Question from "@/components/Question";
import ProgressBar from "@/components/ProgressBar";
import AuthForm from "@/components/AuthForm";
import { createProfile, getMyProfile } from "@/lib/api";
import { getCurrentUser, signOut } from "@/lib/auth";
import ResultsDashboard from "@/components/ResultsDashboard";
import { createAccountRecovery, withDeadline, type AccountState } from "@/lib/accountRecovery";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [account, setAccount] = useState<AccountState>({ status: "checking" });
  const recovery = useRef<ReturnType<typeof createAccountRecovery> | null>(null);
  const [logoutError, setLogoutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const [name, setName] = useState("");
  const [step, setStep] = useState(1);
  const [country, setCountry] = useState("");
  const [currentPortfolioValue, setCurrentPortfolioValue] = useState("");
  const [monthlyInvestment, setMonthlyInvestment] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [investmentHorizon, setInvestmentHorizon] = useState("");
  const [riskTolerance, setRiskTolerance] = useState("");
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(
    "Understanding your goals...",
  );

  useEffect(() => {
    const coordinator = createAccountRecovery({
      getUser: getCurrentUser,
      getProfile: getMyProfile,
      onState: setAccount,
      onIdentityChange: () => {
        setName("");
        setStep(1);
        setCountry("");
        setCurrentPortfolioValue("");
        setMonthlyInvestment("");
        setGoalTarget("");
        setInvestmentHorizon("");
        setRiskTolerance("");
        setStarted(false);
        setLoading(false);
        setLogoutError("");
      },
    });
    recovery.current = coordinator;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Do not return/await SDK work inside Supabase's notification callback.
      void coordinator.authChanged(event, session);
    });
    void coordinator.restore();
    return () => {
      subscription.unsubscribe();
      coordinator.dispose();
      recovery.current = null;
    };
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    setLogoutError("");
    try {
      await signOut();
      recovery.current?.signedOut();
    } catch {
      setLogoutError("We couldn’t sign you out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  };

  if (account.status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
        <Card>
          <Logo />
          <h1 className="mt-8 text-2xl font-bold text-slate-900">Let’s reconnect your account</h1>
          <p role="alert" className="mt-4 text-slate-600">{account.message}</p>
          {logoutError && <p role="alert" className="mt-4 text-red-700">{logoutError}</p>}
          <div className="mt-6 flex gap-4">
            <button disabled={signingOut} onClick={() => void recovery.current?.restore()} className="rounded-xl bg-emerald-700 px-5 py-3 text-white">Retry</button>
            <button disabled={signingOut} onClick={handleSignOut} className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">{signingOut ? "Signing out…" : "Sign out"}</button>
          </div>
        </Card>
      </main>
    );
  }

  if (account.status === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
        <Card>
          <Logo />

          <div className="mt-12 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />

            <p className="mt-6 text-slate-600">Loading Arbor...</p>
          </div>
        </Card>
      </main>
    );
  }

  if (account.status === "unauthenticated") {
    return <AuthForm onAuthenticated={(session) => void recovery.current?.authenticated(session)} />;
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
        <Card>
          <Logo />

          <div className="mt-12 text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />

            <h2 className="mt-8 text-2xl font-bold text-slate-900">
              Arbor is building your plan 🌳
            </h2>

            <p className="mt-4 text-slate-600">{loadingMessage}</p>

            <p className="mt-3 text-sm text-slate-500">
              Creating your personalized global investment strategy...
            </p>
          </div>
        </Card>
      </main>
    );
  }

  if (account.status === "ready") {
    return (
      <>
        <div className="flex justify-end bg-slate-100 px-6 pt-6">
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Sign Out
          </button>
        </div>

        {logoutError && <p role="alert" className="bg-slate-100 px-6 text-right text-red-700">{logoutError}</p>}
        <ResultsDashboard key={account.userId} plan={account.plan} name={account.plan.profile.full_name} />
      </>
    );
  }

  const canContinue =
    step === 1
      ? name.trim()
      : step === 2
        ? country
        : step === 3
          ? currentPortfolioValue !== ""
          : step === 4
            ? monthlyInvestment !== ""
            : step === 5
              ? goalTarget !== ""
              : step === 6
                ? investmentHorizon !== ""
                : riskTolerance;

  const handleNext = async () => {
    if (step < 7) {
      setStep(step + 1);
      return;
    }

    let interval: ReturnType<typeof setInterval> | undefined;
    const isCurrent = recovery.current?.guard() ?? (() => false);

    try {
      setLoading(true);

      const messages = [
        "Understanding your goals...",
        "Evaluating your risk profile...",
        "Selecting global investments...",
        "Building your personalized portfolio...",
        "Preparing your wealth roadmap...",
      ];

      let index = 0;

      interval = setInterval(() => {
        if (!isCurrent()) return;
        index++;

        if (index < messages.length) {
          setLoadingMessage(messages[index]);
        }
      }, 800);

      const result = await withDeadline(createProfile({
        full_name: name,
        country,
        goal_target: Number(goalTarget),
        investment_horizon: Number(investmentHorizon),
        risk_tolerance: riskTolerance,
        currency:
          country === "New Zealand"
            ? "NZD"
            : country === "Philippines"
              ? "PHP"
              : "USD",
        monthly_investment: Number(monthlyInvestment),
        current_portfolio_value: Number(currentPortfolioValue),
      }));

      if (!isCurrent()) return;
      setLoadingMessage("Your Arbor plan is ready 🌳");
      recovery.current?.completeProfile(account.userId, result);
    } catch (error) {
      if (!isCurrent()) return;
      console.error(error);
      alert("Something went wrong. Please try again.");
    } finally {
      if (interval) {
        clearInterval(interval);
      }

      if (isCurrent()) setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
      {!started && (
        <Card>
          <Logo />

          <h1 className="mt-8 text-4xl font-bold text-slate-900">
            Your Personal AI-Powered Investment Strategy
          </h1>

          <p className="mt-4 text-slate-600">
            Create a personalized investment strategy based on your goals,
            timeline, and risk profile.
          </p>

          <button
            onClick={() => setStarted(true)}
            className="mt-10 w-full rounded-2xl bg-emerald-700 py-5 text-lg font-semibold text-white shadow-lg transition-all duration-200 hover:-translate-y-1 hover:bg-emerald-800 hover:shadow-xl"
          >
            Build My Investment Strategy →
          </button>
        </Card>
      )}

      {started && (
        <div
          onKeyDown={(event) => {
            if (event.key === "Enter" && canContinue) {
              handleNext();
            }
          }}
        >
          <Card>
            <Logo />

            <ProgressBar step={step} totalSteps={7} />

            <Welcome step={step} name={name} />

            <Question
              step={step}
              name={name}
              setName={setName}
              country={country}
              setCountry={setCountry}
              currentPortfolioValue={currentPortfolioValue}
              setCurrentPortfolioValue={setCurrentPortfolioValue}
              monthlyInvestment={monthlyInvestment}
              setMonthlyInvestment={setMonthlyInvestment}
              goalTarget={goalTarget}
              setGoalTarget={setGoalTarget}
              investmentHorizon={investmentHorizon}
              setInvestmentHorizon={setInvestmentHorizon}
              riskTolerance={riskTolerance}
              setRiskTolerance={setRiskTolerance}
            />

            <button
              onClick={handleNext}
              disabled={!canContinue}
              className={`mt-10 w-full rounded-2xl py-5 text-lg font-semibold shadow-lg transition-all duration-200 ${
                canContinue
                  ? "bg-emerald-700 text-white hover:-translate-y-1 hover:bg-emerald-800 hover:shadow-xl"
                  : "cursor-not-allowed bg-slate-200 text-slate-400 shadow-none"
              }`}
            >
              {step === 7 ? "Create My Plan →" : "Next →"}
            </button>
          </Card>
        </div>
      )}
    </main>
  );
}
