"use client";

import { useState } from "react";
import { updateMyProfile } from "@/lib/api";
import type { Plan } from "@/lib/types/plan";

type EditProfileFormProps = {
  plan: Plan;
  onUpdated: (updatedPlan: Plan) => void;
  onCancel: () => void;
};

export default function EditProfileForm({
  plan,
  onUpdated,
  onCancel,
}: EditProfileFormProps) {
  const [monthlyInvestment, setMonthlyInvestment] = useState(
    String(plan.profile.monthly_investment),
  );
  const [currentPortfolioValue, setCurrentPortfolioValue] = useState(
    String(plan.profile.current_portfolio_value),
  );
  const [goalTarget, setGoalTarget] = useState(
    String(plan.profile.goal_target),
  );
  const [investmentHorizon, setInvestmentHorizon] = useState(
    String(plan.profile.investment_horizon),
  );
  const [riskTolerance, setRiskTolerance] = useState(
    plan.profile.risk_tolerance,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");
    setLoading(true);

    try {
      const updatedPlan = await updateMyProfile({
        full_name: plan.profile.full_name,
        country: plan.profile.country,
        goal_target: Number(goalTarget),
        investment_horizon: Number(investmentHorizon),
        monthly_investment: Number(monthlyInvestment),
        current_portfolio_value: Number(currentPortfolioValue),
        risk_tolerance: riskTolerance,
        currency: plan.profile.currency,
      });

      onUpdated(updatedPlan);
    } catch (error) {
      console.error("Failed to update profile:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-bold text-slate-900">
        Edit Your Investment Profile
      </h2>

      <p className="mt-2 text-sm text-slate-600">
        Update your financial situation and Arbor will recalculate your
        investment strategy.
      </p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Current portfolio value
          </label>
          <input
            type="number"
            min="0"
            value={currentPortfolioValue}
            onChange={(e) => setCurrentPortfolioValue(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-100"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Monthly investment
          </label>
          <input
            type="number"
            min="0"
            value={monthlyInvestment}
            onChange={(e) => setMonthlyInvestment(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-100"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Goal target
          </label>
          <input
            type="number"
            min="0"
            value={goalTarget}
            onChange={(e) => setGoalTarget(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-100"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Investment horizon (years)
          </label>
          <input
            type="number"
            min="1"
            value={investmentHorizon}
            onChange={(e) => setInvestmentHorizon(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-100"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Risk tolerance
          </label>

          <select
            value={riskTolerance}
            onChange={(e) => setRiskTolerance(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-100"
          >
            <option value="Conservative">Conservative</option>
            <option value="Balanced">Balanced</option>
            <option value="Growth">Growth</option>
            <option value="Aggressive">Aggressive</option>
          </select>
        </div>
      </div>

      {error && (
        <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className={`rounded-xl px-5 py-3 font-semibold text-white transition ${
            loading
              ? "cursor-not-allowed bg-slate-300"
              : "bg-emerald-700 hover:bg-emerald-800"
          }`}
        >
          {loading ? "Rebuilding Your Plan..." : "Save Changes"}
        </button>

        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
