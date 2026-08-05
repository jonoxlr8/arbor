type QuestionProps = {
  step: number;
  name: string;
  setName: (value: string) => void;
  country: string;
  setCountry: (value: string) => void;
  age: string;
  setAge: (value: string) => void;
  investmentGoal: string;
  setInvestmentGoal: (value: string) => void;
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
  age,
  setAge,
  investmentGoal,
  setInvestmentGoal,
  investmentHorizon,
  setInvestmentHorizon,
  riskTolerance,
  setRiskTolerance,
}: QuestionProps) {
  return (
    <div className="mt-14">
      {step === 1 ? (
        <>
          <label className="mb-3 block text-lg font-semibold text-slate-900">
            What's your name?
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
            How old are you?
          </label>

          <input
            type="number"
            placeholder="Enter your age"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-5 py-4 text-lg text-slate-900 outline-none transition focus:border-green-600 focus:ring-4 focus:ring-green-100"
          />
        </>
            ) : step === 4 ? (
        <>
          <label className="mb-3 block text-lg font-semibold text-slate-900">
            What are you investing for?
          </label>

          <select
            value={investmentGoal}
            onChange={(e) => setInvestmentGoal(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-5 py-4 text-lg text-slate-900 outline-none transition focus:border-green-600 focus:ring-4 focus:ring-green-100"
          >
            <option value="">
              Select your goal
            </option>

            <option>
              Build long-term wealth
            </option>

            <option>
              Retirement
            </option>

            <option>
              Buy a home
            </option>

            <option>
              Financial independence
            </option>
          </select>
        </>
            ) : step === 5 ? (
        <>
          <label className="mb-3 block text-lg font-semibold text-slate-900">
            How long do you plan to invest?
          </label>

          <select
            value={investmentHorizon}
            onChange={(e) => setInvestmentHorizon(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-5 py-4 text-lg text-slate-900 outline-none transition focus:border-green-600 focus:ring-4 focus:ring-green-100"
          >
            <option value="">
              Select your investment horizon
            </option>

            <option value="5">
              Less than 5 years
            </option>

            <option value="10">
              5–10 years
            </option>

            <option value="15">
              10–20 years
            </option>

            <option value="20">
              20+ years
            </option>
          </select>
        </>
      ) : (
  <>
    <label className="mb-3 block text-lg font-semibold text-slate-900">
      How comfortable are you with investment risk?
    </label>

    <div className="space-y-4">

      <button
        type="button"
        onClick={() => setRiskTolerance("Conservative")}
        className={`w-full rounded-xl border p-5 text-left transition ${
          riskTolerance === "Conservative"
            ? "border-green-600 bg-green-50"
            : "border-slate-300 hover:border-green-400"
        }`}
      >
        <div className="text-lg font-semibold text-slate-900">
          Conservative
        </div>

        <div className="mt-1 text-slate-600">
          Protect my money with lower volatility.
        </div>
      </button>


      <button
        type="button"
        onClick={() => setRiskTolerance("Balanced")}
        className={`w-full rounded-xl border p-5 text-left transition ${
          riskTolerance === "Balanced"
            ? "border-green-600 bg-green-50"
            : "border-slate-300 hover:border-green-400"
        }`}
      >
        <div className="text-lg font-semibold text-slate-900">
          Balanced
        </div>

        <div className="mt-1 text-slate-600">
          Growth with some stability.
        </div>
      </button>


      <button
        type="button"
        onClick={() => setRiskTolerance("Aggressive")}
        className={`w-full rounded-xl border p-5 text-left transition ${
          riskTolerance === "Aggressive"
            ? "border-green-600 bg-green-50"
            : "border-slate-300 hover:border-green-400"
        }`}
      >
        <div className="text-lg font-semibold text-slate-900">
          Aggressive
        </div>

        <div className="mt-1 text-slate-600">
          Higher growth potential, bigger swings.
        </div>
      </button>

    </div>
  </>
)
    
    }
    </div>
  );
}