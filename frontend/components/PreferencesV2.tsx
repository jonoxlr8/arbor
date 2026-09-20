import type { PlanV2, PreferenceApplication } from "@/lib/types/planV2";

function Restriction({ result }: { result: PreferenceApplication }) {
  return <>{result.reasons.map(reason => <p key={reason} className="mt-1 text-sm text-slate-600">
    {reason === "strategy_cap" ? `Your strategy allows up to ${result.strategy_cap_percentage_points}% for this preference.`
      : reason === "readiness_restricted" ? "Currently paused by your readiness check. Your request is still saved."
      : "Saved only: long-term allocation does not apply to this short-term plan."}
  </p>)}</>;
}

export default function PreferencesV2({ value }: { value: PlanV2 }) {
  const requests = value.profile.saved_preferences ?? { technology_tilt: 0, bitcoin: 0 };
  const result = value.plan.preference_result;
  const target = value.plan.path === "long_term" ? result?.effective_target : null;
  const labels = { global_equity: "Global equity", defensive: "Defensive", technology_tilt: "Technology", crypto: "Bitcoin" };
  return <>
    <section className="arbor-panel">
      <h2 className="text-lg font-semibold text-slate-900">Your preferences</h2>
      <p className="mt-2 text-sm text-slate-600">Your requests, before any limits or readiness restrictions.</p>
      <dl className="mt-3 divide-y divide-slate-200">{(["technology_tilt", "bitcoin"] as const).map(key => <div key={key} className="py-3">
        <div className="flex items-center justify-between gap-3"><dt className="text-slate-600">{key === "bitcoin" ? "Bitcoin" : "Technology"}</dt><dd className="text-xl font-semibold text-slate-900">{requests[key]}%</dd></div>
        {result && <dd><Restriction result={result[key]} /></dd>}
      </div>)}</dl>
    </section>
    {value.plan.path === "long_term" ? <section className="arbor-panel">
      <h2 className="text-lg font-semibold text-slate-900">Effective target allocation</h2>
      <p className="mt-2 text-sm text-slate-600">{value.plan.readiness.actionable_contribution_guidance_allowed ? "Your strategy with the preferences Arbor can currently apply." : "Strategy preview only. Extra technology and Bitcoin allocations are paused."}</p>
      {target ? <dl className="mt-4 divide-y divide-slate-200">{target.allocation.weights.map(weight => <div key={weight.role} className="flex items-center justify-between gap-3 py-3">
        <dt className="text-slate-600">{labels[weight.role]}</dt><dd className="text-2xl font-semibold text-slate-900">{weight.percentage_points}%</dd>
      </div>)}</dl> : <p role="status" className="mt-3 text-sm text-slate-600">Effective target details are unavailable in this saved response. Your base strategy is shown above.</p>}
      <p className="mt-3 text-sm text-slate-500">Preferences do not increase your planning return.</p>
    </section> : <p className="text-sm text-slate-600">No effective long-term target applies to this short-term plan.</p>}
  </>;
}
