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
    <div className="mt-3 min-h-44">
      {step === 1 ? (
        <>
          <label htmlFor="onboarding-answer" className="mb-3 block text-xl font-semibold text-slate-900">
            What&apos;s your name?
          </label>

          <input id="onboarding-answer"
            type="text"
            autoComplete="given-name" placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-5 py-4 text-lg text-slate-900 outline-none transition focus:border-green-600 focus:ring-4 focus:ring-green-100"
          />
        </>
      ) : step === 2 ? (
        <>
          <h1 className="mb-3 text-xl font-semibold text-slate-900">Where do you live?</h1>

          <p className="mb-4 text-sm text-slate-600">Country sets your planning currency—not your investments.</p>
          <div className="space-y-3" role="group" aria-label="Country">
            {[["Philippines", "PHP · Supported launch country"], ["Other", "More countries are coming"]].map(([value, description]) => (
              <button key={value} type="button" aria-pressed={country === value} onClick={() => setCountry(value)}
                className={`min-h-11 w-full rounded-xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-emerald-600 ${country === value ? "border-green-600 bg-green-50" : "border-slate-300 hover:border-green-400"}`}>
                <span className="block font-semibold text-slate-900">{value === "Other" ? "Other country" : value}</span>
                <span className="mt-1 block text-sm text-slate-600">{description}</span>
              </button>
            ))}
          </div>
          {country === "Other" && <p role="status" className="mt-4 text-sm text-slate-600">Arbor is launching in the Philippines first. Planning for other countries isn’t available in this beta yet.</p>}
        </>
      ) : step === 3 ? (
        <>
          <label htmlFor="onboarding-answer" className="mb-3 block text-xl font-semibold text-slate-900">
            What is your planning starting value?
          </label>

          <p className="mb-4 text-slate-600">
            Include your stocks, ETFs, crypto, and other investments.
          </p>

          <input id="onboarding-answer"
            type="number"
            min="0"
            max={MAX_MONEY}
            step="any"
            placeholder="0"
            value={currentPortfolioValue}
            onChange={(e) => setCurrentPortfolioValue(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-5 py-4 text-lg text-slate-900 outline-none transition focus:border-green-600 focus:ring-4 focus:ring-green-100"
          />

          <button
            type="button"
            onClick={() => setCurrentPortfolioValue("0")}
            className={`mt-3 min-h-11 text-sm font-medium ${
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
          <label htmlFor="onboarding-answer" className="mb-3 block text-xl font-semibold text-slate-900">
            How much can you invest each month?
          </label>

          <p className="mb-4 text-slate-600">
            Choose an amount you&apos;re comfortable investing regularly.
          </p>

          <input id="onboarding-answer"
            type="number"
            min="0"
            max={MAX_MONEY}
            step="any"
            placeholder="0"
            value={monthlyInvestment}
            onChange={(e) => setMonthlyInvestment(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-5 py-4 text-lg text-slate-900 outline-none transition focus:border-green-600 focus:ring-4 focus:ring-green-100"
          />

          <button
            type="button"
            onClick={() => setMonthlyInvestment("0")}
            className={`mt-3 min-h-11 text-sm font-medium ${
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
          <label htmlFor="onboarding-answer" className="mb-3 block text-xl font-semibold text-slate-900">
            How much money would you like to build?
          </label>

          <p className="mb-4 text-slate-600">
            Set the amount you&apos;d like Arbor to help you work toward.
          </p>

          <input id="onboarding-answer"
            type="number"
            min="0"
            max={MAX_MONEY}
            step="any"
            placeholder="e.g. 1,000,000"
            value={goalTarget}
            onChange={(e) => setGoalTarget(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-5 py-4 text-lg text-slate-900 outline-none transition focus:border-green-600 focus:ring-4 focus:ring-green-100"
          />
        </>
      ) : step === 6 ? (
        <>
          <label htmlFor="onboarding-answer" className="mb-3 block text-xl font-semibold text-slate-900">
            When do you want to reach your target?
          </label>

          <select id="onboarding-answer"
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
          <p id="risk-question" className="mb-3 block text-xl font-semibold text-slate-900">
            How comfortable are you with investment risk?
          </p>

          <div role="group" aria-labelledby="risk-question" className="space-y-3">
            {RISK_CATEGORIES.map(category => (
              <button key={category} type="button" aria-pressed={riskTolerance === category} onClick={() => setRiskTolerance(category)}
                className={`w-full rounded-xl border p-4 text-left transition ${riskTolerance === category ? "border-green-600 bg-green-50" : "border-slate-300 hover:border-green-400"}`}>
                <div className="text-lg font-semibold text-slate-900">{category}</div>
                <div className="mt-1 text-sm leading-5 text-slate-600">
                  {category === "Conservative" ? "I prefer smaller ups and downs." :
                    category === "Balanced" ? "I want a mix of growth and stability." :
                    "I'm comfortable with bigger swings for higher growth potential."}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      {step >= 3 && step <= 5 && <p className="mt-3 text-xs leading-5 text-slate-500">Planning currency: {currency ?? "Select a supported country"}. Separate from recorded holdings.</p>}
      {step >= 3 && step <= 5 && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {step === 3 ? currentPortfolioValue !== "" && numericError("current_portfolio_value", currentPortfolioValue) :
            step === 4 ? monthlyInvestment !== "" && numericError("monthly_investment", monthlyInvestment) : goalTarget !== "" && numericError("goal_target", goalTarget)}
        </p>
      )}
    </div>
  );
}
