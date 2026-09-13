import { RISK_CATEGORIES, numericError, MAX_MONEY } from "@/lib/profileValidation";
import { planningCurrency } from "@/lib/currency";

type QuestionProps = {
  step: number;
  name: string;
  setName: (value: string) => void;
  country: string;
  setCountry: (value: string) => void;
  currentPortfolioValue: string;
  setCurrentPortfolioValue: (value: string) => void;
  monthlyInvestment: string;
  setMonthlyInvestment: (value: string) => void;
  goalTarget: string;
  setGoalTarget: (value: string) => void;
  investmentHorizon: string;
  setInvestmentHorizon: (value: string) => void;
  riskTolerance: string;
  setRiskTolerance: (value: string) => void;
};

export default function Question({
  step,
  name,
  setName,
  country,
  setCountry,
  currentPortfolioValue,
  setCurrentPortfolioValue,
  monthlyInvestment,
  setMonthlyInvestment,
  goalTarget,
  setGoalTarget,
  investmentHorizon,
  setInvestmentHorizon,
  riskTolerance,
  setRiskTolerance,
}: QuestionProps) {
  const currency = planningCurrency(country);
  return (
    <div className="mt-14">
      {step >= 3 && step <= 5 && <p className="mb-3 text-sm text-slate-600">Planning currency: {currency ?? "Select a supported country"}. These amounts power projections, separately from recorded holdings cost basis.</p>}
      {step === 1 ? (
        <>
          <label className="mb-3 block text-lg font-semibold text-slate-900">
            What&apos;s your name?
          </label>

          <input
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-5 py-4 text-lg text-slate-900 outline-none transition focus:border-green-600 focus:ring-4 focus:ring-green-100"
          />
        </>
      ) : step === 2 ? (
        <>
          <label className="mb-3 block text-lg font-semibold text-slate-900">
            Where do you live?
          </label>

          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-5 py-4 text-lg text-slate-900 outline-none transition focus:border-green-600 focus:ring-4 focus:ring-green-100"
          >
            <option value="">Select your country</option>
            <option>Philippines</option>
            <option>New Zealand</option>
            <option>Australia</option>
            <option>United States</option>
          </select>
        </>
      ) : step === 3 ? (
        <>
          <label className="mb-3 block text-lg font-semibold text-slate-900">
            What is your planning starting value?
          </label>

          <p className="mb-4 text-slate-600">
            Include your stocks, ETFs, crypto, and other investments.
          </p>

          <input
            type="number"
            min="0"
            max={MAX_MONEY}
            step="any"
            placeholder="Enter your current portfolio value"
            value={currentPortfolioValue}
            onChange={(e) => setCurrentPortfolioValue(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-5 py-4 text-lg text-slate-900 outline-none transition focus:border-green-600 focus:ring-4 focus:ring-green-100"
          />

          <button
            type="button"
            onClick={() => setCurrentPortfolioValue("0")}
            className={`mt-3 text-sm font-medium ${
              currentPortfolioValue === "0"
                ? "text-emerald-700"
                : "text-slate-500 hover:text-emerald-700"
            }`}
          >
            I haven&apos;t invested yet
          </button>
        </>
      ) : step === 4 ? (
        <>
          <label className="mb-3 block text-lg font-semibold text-slate-900">
            How much can you invest each month?
          </label>

          <p className="mb-4 text-slate-600">
            Choose an amount you&apos;re comfortable investing regularly.
          </p>

          <input
            type="number"
            min="0"
            max={MAX_MONEY}
            step="any"
            placeholder="Enter your monthly investment"
            value={monthlyInvestment}
            onChange={(e) => setMonthlyInvestment(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-5 py-4 text-lg text-slate-900 outline-none transition focus:border-green-600 focus:ring-4 focus:ring-green-100"
          />

          <button
            type="button"
            onClick={() => setMonthlyInvestment("0")}
            className={`mt-3 text-sm font-medium ${
              monthlyInvestment === "0"
                ? "text-emerald-700"
                : "text-slate-500 hover:text-emerald-700"
            }`}
          >
            I don&apos;t invest regularly yet
          </button>
        </>
      ) : step === 5 ? (
        <>
          <label className="mb-3 block text-lg font-semibold text-slate-900">
            How much money would you like to build?
          </label>

          <p className="mb-4 text-slate-600">
            Set the amount you&apos;d like Arbor to help you work toward.
          </p>

          <input
            type="number"
            min="0"
            max={MAX_MONEY}
            step="any"
            placeholder="Enter your target amount"
            value={goalTarget}
            onChange={(e) => setGoalTarget(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-5 py-4 text-lg text-slate-900 outline-none transition focus:border-green-600 focus:ring-4 focus:ring-green-100"
          />
        </>
      ) : step === 6 ? (
        <>
          <label className="mb-3 block text-lg font-semibold text-slate-900">
            When do you want to reach your target?
          </label>

          <select
            value={investmentHorizon}
            onChange={(e) => setInvestmentHorizon(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-5 py-4 text-lg text-slate-900 outline-none transition focus:border-green-600 focus:ring-4 focus:ring-green-100"
          >
            <option value="">Select a timeframe</option>
            <option value="5">5 years</option>
            <option value="10">10 years</option>
            <option value="15">15 years</option>
            <option value="20">20 years</option>
            <option value="30">30 years</option>
          </select>
        </>
      ) : (
        <>
          <label className="mb-3 block text-lg font-semibold text-slate-900">
            How comfortable are you with investment risk?
          </label>

          <div className="space-y-4">
            {RISK_CATEGORIES.map(category => (
              <button key={category} type="button" onClick={() => setRiskTolerance(category)}
                className={`w-full rounded-xl border p-5 text-left transition ${riskTolerance === category ? "border-green-600 bg-green-50" : "border-slate-300 hover:border-green-400"}`}>
                <div className="text-lg font-semibold text-slate-900">{category}</div>
                <div className="mt-1 text-slate-600">
                  {category === "Conservative" ? "I prefer smaller ups and downs." :
                    category === "Balanced" ? "I want a mix of growth and stability." :
                    "I'm comfortable with bigger swings for higher growth potential."}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      {step >= 3 && step <= 5 && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {step === 3 ? numericError("current_portfolio_value", currentPortfolioValue) :
            step === 4 ? numericError("monthly_investment", monthlyInvestment) : numericError("goal_target", goalTarget)}
        </p>
      )}
    </div>
  );
}
