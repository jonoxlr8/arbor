"use client";

import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import Card from "@/components/Card";
import Welcome from "@/components/Welcome";
import Question from "@/components/Question";
import ProgressBar from "@/components/ProgressBar";
import AuthForm from "@/components/AuthForm";
import { createProfile, getMyProfile } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import ResultsDashboard from "@/components/ResultsDashboard";
import type { Plan } from "@/lib/types/plan";

export default function Home() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(true);

  const [name, setName] = useState("");
  const [step, setStep] = useState(1);
  const [country, setCountry] = useState("");
  const [currentPortfolioValue, setCurrentPortfolioValue] = useState("");
  const [monthlyInvestment, setMonthlyInvestment] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [investmentHorizon, setInvestmentHorizon] = useState("");
  const [riskTolerance, setRiskTolerance] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(
    "Understanding your goals...",
  );

  useEffect(() => {
    async function initialize() {
      try {
        const user = await getCurrentUser();

        if (!user) {
          setAuthenticated(false);
          setCheckingProfile(false);
          return;
        }

        setAuthenticated(true);

        const savedProfile = await getMyProfile();

        console.log("Saved Arbor profile:", savedProfile);

        if (savedProfile) {
          setName(savedProfile.profile.full_name);
          setPlan(savedProfile);
        }
      } catch (error) {
        console.error("Failed to initialize Arbor:", error);
      } finally {
        setCheckingProfile(false);
      }
    }

    initialize();
  }, []);

  if (authenticated === null || checkingProfile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
        <Card>
          <Logo />

          <div className="mt-12 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />

            <p className="mt-6 text-slate-600">
              Loading Arbor...
            </p>
          </div>
        </Card>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <AuthForm
        onAuthenticated={() => {
          setAuthenticated(true);
          setCheckingProfile(true);

          getMyProfile()
            .then((savedProfile) => {
              console.log("Saved Arbor profile:", savedProfile);
            })
            .catch((error) => {
              console.error("Failed to load Arbor profile:", error);
            })
            .finally(() => {
              setCheckingProfile(false);
            });
        }}
      />
    );
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

  if (plan) {
    return <ResultsDashboard plan={plan} name={name} />;
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
        index++;

        if (index < messages.length) {
          setLoadingMessage(messages[index]);
        }
      }, 800);

      const result = await createProfile({
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
      });

      console.log("Frontend result:", result);

      setLoadingMessage("Your Arbor plan is ready 🌳");
      setPlan(result);
    } catch (error) {
      console.error(error);
      alert("Something went wrong. Please try again.");
    } finally {
      if (interval) {
        clearInterval(interval);
      }

      setLoading(false);
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
