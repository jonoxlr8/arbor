import { formatContributionMoney as money, nonzero, SLEEVE_LABELS } from "@/lib/contributions";
import type { ContributionResult as Result, MappedContribution, MinimumCheck } from "@/lib/types/contributions";

function ProductRow({ item, amount, minimum, currency }: { item: MappedContribution; amount: string; minimum: MinimumCheck | null; currency: string }) {
  return <div className="min-w-0 border-t border-slate-200 py-4">
    <p className="break-all text-xl font-semibold text-slate-900">{money(amount, currency)}</p>
    <p className="mt-1 font-semibold text-slate-900">{SLEEVE_LABELS[item.sleeve]}</p>
    <p className="break-words text-sm text-slate-700">{item.product.display_name}</p>
    <p className="text-sm text-slate-500">{item.product.platform} · {item.match_quality === "broad" ? "Broad match" : item.match_quality === "unavailable" ? "Unavailable" : "Direct match"}</p>
    <p className="mt-2 text-sm font-semibold text-forest">{!item.actionable ? "Future preview" : minimum?.status === "ready" ? "Ready to invest" : minimum?.status === "below_minimum" ? "Waiting for the minimum" : "Check minimum"}</p>
    {minimum?.status === "below_minimum" && <p className="mt-1 text-sm text-slate-600">{minimum.amount_needed_to_minimum !== null && <>You need {money(minimum.amount_needed_to_minimum, currency)} more. </>}
      {minimum.applicable_minimum !== null && minimum.minimum_currency && <>Provider minimum: {money(minimum.applicable_minimum, minimum.minimum_currency)}.</>}</p>}
    {minimum?.status === "verify_minimum" && <p className="mt-1 text-sm text-slate-600">Check the provider’s current minimum and eligibility before investing.
      {minimum.applicable_minimum !== null && minimum.minimum_currency && <> Catalog minimum: {money(minimum.applicable_minimum, minimum.minimum_currency)}. No currency or price conversion is assumed.</>}</p>}
    {item.match_quality === "broad" && <p className="mt-1 text-sm text-slate-500">Not a pure broad-market index equivalent.</p>}
  </div>;
}

export default function ContributionResult({ result }: { result: Result }) {
  const data = result.data;
  const reserve = result.mode === "plan" ? result.data.status === "reserve" : result.data.action === "reserve";
  const notApplicable = data.state === "not_applicable" || data.path === "short_term";
  return <section aria-label="Contribution result" className="mt-6 min-w-0 rounded-2xl border border-slate-200 p-4">
    <h3 className="break-words text-xl font-semibold text-slate-900">{result.mode === "plan" ? `Your ${money(data.contribution_amount, data.contribution_currency)} plan` : "Next purchase"}</h3>
    {reserve ? <><p className="mt-3 text-slate-700">Keep this contribution in your financial reserve for now.</p><p className="mt-2 break-all text-2xl font-semibold text-slate-900">Reserve · {money(data.contribution_amount, data.contribution_currency)}</p></>
      : notApplicable ? <p className="mt-3 text-slate-600">Your current plan does not route this contribution into long-term investments. {money(data.contribution_amount, data.contribution_currency)} remains unallocated.</p>
      : result.mode === "plan" ? <>
        <dl className="my-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">{([
          ["Ready to invest", result.data.invested_amount], ["Check minimum", result.data.verify_minimum_amount],
          ["Waiting", result.data.unallocated_amount], ["Reserve", result.data.reserve_amount],
        ] as const).filter(([, amount]) => nonzero(amount)).map(([label, amount]) => <div key={label}><dt className="text-slate-600">{label}</dt><dd className="break-all font-semibold text-slate-900">{money(amount, data.contribution_currency)}</dd></div>)}</dl>
        {result.data.allocations.map((row, i) => <ProductRow key={`${row.implementation.product.product_id}-${i}`} item={row.implementation} amount={row.allocated_amount} minimum={row.minimum} currency={data.contribution_currency} />)}
        {nonzero(result.data.unallocated_amount) && <p className="mt-3 text-sm text-slate-600">{money(result.data.unallocated_amount, data.contribution_currency)} is waiting. No executable allocation was available for this amount.</p>}
        {result.data.blocked_allocations.length > 0 && <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-700">Minimums to check</summary>{result.data.blocked_allocations.map((row, i) => <ProductRow key={i} item={row.implementation} amount={row.candidate_amount} minimum={row.minimum} currency={data.contribution_currency} />)}</details>}
      </> : <>
        <p className="mt-3 text-sm text-slate-600">Available: {money(data.contribution_amount, data.contribution_currency)}</p>
        {result.data.selected ? <><ProductRow item={result.data.selected} amount={result.data.action === "invest" ? result.data.recommended_amount : data.contribution_amount} minimum={result.data.minimum} currency={data.contribution_currency} />
          <p className="text-sm text-slate-600">{SLEEVE_LABELS[result.data.selected.sleeve]} has the largest eligible shortfall after this contribution.</p></>
          : <p className="mt-3 text-sm text-slate-600">No purchase is suggested for this contribution.</p>}
      </>}
    {data.warnings.length > 0 && <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-700">Notes for this result</summary><ul className="space-y-2 text-sm text-slate-600">{data.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
    <p className="mt-4 text-xs leading-5 text-slate-500">Guidance only. Nothing has been bought or saved. Provider fees and eligibility may still apply.</p>
  </section>;
}
