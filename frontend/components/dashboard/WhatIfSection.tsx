"use client";

import { useEffect, useState } from "react";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

import SectionHeader from "@/components/dashboard/SectionHeader";

import type { Plan, YearlyProjection } from "@/lib/types/plan";

type WhatIfSectionProps = {
  plan: Plan;
};

type ProjectionResponse = {
  projected_value: number;
  yearly_projection: YearlyProjection[];
};

export default function WhatIfSection({ plan }: WhatIfSectionProps) {
  const currentInvestment = plan.profile.monthly_investment;

  const [monthlyInvestment, setMonthlyInvestment] = useState(currentInvestment);

  const [projectedValue, setProjectedValue] = useState(
    plan.projection.projected_value,
  );

  const [yearlyProjection, setYearlyProjection] = useState<YearlyProjection[]>(
    plan.projection.yearly_projection,
  );

  const [loading, setLoading] = useState(false);

  const currency = plan.profile.currency;
  const goalAmount = plan.profile.goal_target;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);

  useEffect(() => {
    if (monthlyInvestment === currentInvestment) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);

        const response = await fetch("http://127.0.0.1:8000/projection", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            current_value: plan.profile.current_portfolio_value,
            monthly_investment: monthlyInvestment,
            years: plan.profile.investment_horizon,
            annual_return: plan.projection.assumed_return,
          }),
        });

        if (!response.ok) {
          throw new Error("Projection request failed");
        }

        const data: ProjectionResponse = await response.json();

        setProjectedValue(data.projected_value);
        setYearlyProjection(data.yearly_projection);
      } catch (error) {
        console.error("What If projection error:", error);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [
    monthlyInvestment,
    currentInvestment,
    plan.profile.current_portfolio_value,
    plan.profile.investment_horizon,
    plan.projection.assumed_return,
  ]);

  const projectedProgress =
    goalAmount > 0 ? Math.min((projectedValue / goalAmount) * 100, 100) : 0;

  const currentProjectedProgress =
    goalAmount > 0
      ? Math.min((plan.projection.projected_value / goalAmount) * 100, 100)
      : 0;

  const improvement = projectedValue - plan.projection.projected_value;

  const totalInvested =
    plan.profile.current_portfolio_value +
    monthlyInvestment * plan.profile.investment_horizon * 12;

  const investmentGrowth = projectedValue - totalInvested;

  const chartData = yearlyProjection.map((item) => {
    const currentPlanPoint = plan.projection.yearly_projection.find(
      (current) => current.year === item.year,
    );

    return {
      year: item.year,
      selected: item.value,
      current: currentPlanPoint?.value ?? 0,
      goal: goalAmount,
    };
  });

  const reachesGoal = projectedValue >= goalAmount;

  const remainingGap = Math.max(goalAmount - projectedValue, 0);

  return (
    <section className="mt-12">
      <SectionHeader
        eyebrow="What If?"
        title="Explore Your Investment Options"
        description="See how changing your monthly investment could affect your long-term wealth."
      />

      <div className="mt-8 rounded-3xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
        <div className="flex flex-col gap-6">
          <div>
            <p className="text-sm font-medium text-emerald-700">
              Monthly Investment
            </p>

            <p className="mt-2 text-4xl font-extrabold text-slate-900">
              {formatCurrency(monthlyInvestment)}
            </p>
          </div>

          <input
            type="range"
            min={currentInvestment}
            max={Math.max(
              5000,
              Math.ceil(plan.projection.required_monthly_investment / 500) *
                500,
            )}
            step={10}
            value={monthlyInvestment}
            onChange={(event) =>
              setMonthlyInvestment(Number(event.target.value))
            }
            className="w-full accent-emerald-600"
          />

          <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                🎯 Arbor&apos;s recommended contribution
              </p>

              <p className="mt-1 text-sm text-slate-500">
                {formatCurrency(
                  Math.round(plan.projection.required_monthly_investment),
                )}{" "}
                per month to reach your goal within{" "}
                {plan.profile.investment_horizon} years, assuming the same
                return.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setMonthlyInvestment(
                  Math.round(plan.projection.required_monthly_investment),
                )
              }
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Use recommended amount
            </button>
          </div>

          <div className="flex justify-between text-sm text-slate-500">
            <span>{formatCurrency(currentInvestment)}</span>

            <span>
              {formatCurrency(
                Math.max(
                  5000,
                  Math.ceil(plan.projection.required_monthly_investment / 500) *
                    500,
                ),
              )}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: "Current",
                value: currentInvestment,
              },
              {
                label: "2× Current",
                value: currentInvestment * 2,
              },
              {
                label: "3× Current",
                value: currentInvestment * 3,
              },
              {
                label: "Goal Target",
                value: Math.round(plan.projection.required_monthly_investment),
              },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => {
                  const sliderMax = Math.max(
                    5000,
                    Math.ceil(
                      plan.projection.required_monthly_investment / 500,
                    ) * 500,
                  );

                  setMonthlyInvestment(Math.min(option.value, sliderMax));
                }}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                  monthlyInvestment === option.value
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-emerald-400 hover:bg-emerald-50"
                }`}
              >
                <span className="block">{option.label}</span>

                <span className="mt-1 block text-xs font-normal opacity-80">
                  {formatCurrency(option.value)}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Projected Future Value</p>

              <p className="mt-2 text-3xl font-bold text-slate-900">
                {loading
                  ? "Calculating..."
                  : formatCurrency(Math.round(projectedValue))}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Goal Progress</p>

              <p className="mt-2 text-3xl font-bold text-emerald-600">
                {projectedProgress.toFixed(1)}%
              </p>

              <p className="mt-1 text-sm text-slate-500">
                of your {formatCurrency(goalAmount)} goal
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <p className="font-semibold text-slate-900">
              Your Money Breakdown
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-slate-500">Total Invested</p>

                <p className="mt-1 text-xl font-bold text-slate-900">
                  {formatCurrency(Math.round(totalInvested))}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Investment Growth</p>

                <p className="mt-1 text-xl font-bold text-emerald-600">
                  +{formatCurrency(Math.round(investmentGrowth))}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Future Value</p>

                <p className="mt-1 text-xl font-bold text-slate-900">
                  {formatCurrency(Math.round(projectedValue))}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-slate-900">
                  How Your Wealth Could Grow
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Compare your current plan with your selected contribution.
                </p>
              </div>

              <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                {formatCurrency(monthlyInvestment)} / month
              </div>
            </div>

            <div className="mt-6 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{
                    top: 10,
                    right: 20,
                    left: 10,
                    bottom: 5,
                  }}
                >
                  <XAxis
                    dataKey="year"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />

                  <YAxis
                    tickFormatter={(value) =>
                      new Intl.NumberFormat("en-US", {
                        notation: "compact",
                        maximumFractionDigits: 0,
                      }).format(value)
                    }
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12 }}
                  />

                  <Tooltip
                    formatter={(value, name) => [
                      formatCurrency(Number(value)),
                      name === "selected"
                        ? "Selected Plan"
                        : name === "current"
                          ? "Current Plan"
                          : "Goal",
                    ]}
                  />

                  <Line
                    type="monotone"
                    dataKey="selected"
                    stroke="#16a34a"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6 }}
                  />

                  <Line
                    type="monotone"
                    dataKey="current"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    dot={false}
                  />

                  <Line
                    type="monotone"
                    dataKey="goal"
                    stroke="#cbd5e1"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                Selected Plan
              </span>

              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                Current Plan
              </span>

              <span className="flex items-center gap-2">
                <span className="h-0.5 w-3 bg-slate-300" />
                Goal
              </span>
            </div>

            <div
              className={`mt-6 rounded-2xl p-4 ${
                reachesGoal ? "bg-emerald-50" : "bg-slate-50"
              }`}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {reachesGoal ? "🎯 Goal on track" : "Projected outcome"}
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    {formatCurrency(monthlyInvestment)} per month
                  </p>
                </div>

                <p
                  className={`text-2xl font-bold ${
                    reachesGoal ? "text-emerald-600" : "text-slate-900"
                  }`}
                >
                  {formatCurrency(Math.round(projectedValue))}
                </p>
              </div>

              <p className="mt-3 text-sm leading-6 text-slate-600">
                {reachesGoal
                  ? `This contribution is projected to reach your ${formatCurrency(
                      goalAmount,
                    )} goal within ${plan.profile.investment_horizon} years.`
                  : `This contribution is projected to reach ${projectedProgress.toFixed(
                      1,
                    )}% of your ${formatCurrency(goalAmount)} goal.`}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-900">
                Goal Progress Comparison
              </p>

              <p className="text-sm text-slate-500">
                Goal: {formatCurrency(goalAmount)}
              </p>
            </div>

            <div className="mt-6 space-y-6">
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-600">Current plan</span>

                  <span className="font-semibold text-slate-900">
                    {currentProjectedProgress.toFixed(1)}%
                  </span>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-slate-400"
                    style={{
                      width: `${currentProjectedProgress}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-600">Selected plan</span>

                  <span className="font-semibold text-emerald-600">
                    {projectedProgress.toFixed(1)}%
                  </span>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all"
                    style={{
                      width: `${projectedProgress}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div
            className={`rounded-2xl p-5 ${
              reachesGoal ? "bg-emerald-100" : "bg-purple-50"
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                reachesGoal ? "text-emerald-800" : "text-purple-800"
              }`}
            >
              {reachesGoal ? "🎯 Goal reached" : "🎯 Goal progress"}
            </p>

            <p className="mt-2 text-sm leading-6 text-slate-700">
              {reachesGoal
                ? `At ${formatCurrency(
                    monthlyInvestment,
                  )} per month, Arbor projects that you could reach your ${formatCurrency(
                    goalAmount,
                  )} goal within ${plan.profile.investment_horizon} years.`
                : `At ${formatCurrency(
                    monthlyInvestment,
                  )} per month, Arbor projects you would be approximately ${formatCurrency(
                    Math.round(remainingGap),
                  )} below your goal after ${plan.profile.investment_horizon} years. You can increase your contribution over time as your income grows.`}
            </p>
          </div>

          {improvement > 0 && (
            <div className="rounded-2xl bg-emerald-100 p-5">
              <p className="text-sm font-semibold text-emerald-800">
                Increasing your contribution could make a meaningful
                difference.
              </p>

              <p className="mt-1 text-sm text-emerald-700">
                At {formatCurrency(monthlyInvestment)} per month, Arbor
                projects approximately{" "}
                {formatCurrency(Math.round(improvement))} more wealth than
                your current plan.
              </p>
            </div>
          )}

          <p className="text-xs leading-5 text-slate-500">
            Estimates use the same{" "}
            {(plan.projection.assumed_return * 100).toFixed(0)}% annual return
            assumption as your current projection. Actual investment returns
            will vary.
          </p>
        </div>
      </div>
    </section>
  );
}
