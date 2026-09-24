import { formatContributionMoney as money, nonzero, SLEEVE_LABELS } from "@/lib/contributions";
import type { ContributionResult as Result, MappedContribution, MinimumCheck } from "@/lib/types/contributions";
import { sleeveColors } from "../AssetIdentity";

function ProductRow({ item, amount, minimum, currency }: { item: MappedContribution; amount: string; minimum: MinimumCheck | null; currency: string }) {
  return <div className="min-w-0 border-t border-slate-200 py-4">
    <p className="float-right ml-3 break-all text-xl font-semibold text-slate-900">{money(amount, currency)}</p>
    <p className="mt-1 font-semibold text-slate-900"><span aria-hidden="true" className="allocation-dot" style={{background:sleeveColors[item.sleeve]}}/> {SLEEVE_LABELS[item.sleeve]}</p>
    <details><summary className="min-h-11 text-sm text-slate-600">See where to invest</summary><p className="break-words text-sm text-slate-700">{item.product.display_name}</p>
    <p className="text-sm text-slate-500">{item.product.platform} · {item.match_quality === "broad" ? "Broad match" : item.match_quality === "unavailable" ? "Unavailable" : "Direct match"}</p>
    <p className="mt-2 text-sm font-semibold text-forest">{!item.actionable ? "Future preview" : minimum?.status === "ready" ? "Minimum check met" : minimum?.status === "below_minimum" ? "Waiting for the minimum" : "Check minimum"}</p>
    {minimum?.status === "below_minimum" && <p className="mt-1 text-sm text-slate-600">{minimum.amount_needed_to_minimum !== null && <>Difference to minimum: {money(minimum.amount_needed_to_minimum, currency)}. </>}
      {minimum.applicable_minimum !== null && minimum.minimum_currency && <>Provider minimum: {money(minimum.applicable_minimum, minimum.minimum_currency)}.</>}</p>}
    {minimum?.status === "verify_minimum" && <p className="mt-1 text-sm text-slate-600">Check the provider’s current minimum and eligibility before investing.
      {minimum.applicable_minimum !== null && minimum.minimum_currency && <> Catalog minimum: {money(minimum.applicable_minimum, minimum.minimum_currency)}. No currency or price conversion is assumed.</>}</p>}
    {item.match_quality === "broad" && <p className="mt-1 text-sm text-slate-500">Not a pure broad-market index equivalent.</p>}</details>
  </div>;
}

export default function ContributionResult({ result }: { result: Result }) {
  const data = result.data;
  const reserve = result.mode === "plan" ? result.data.status === "reserve" : result.data.action === "reserve";
  const notApplicable = data.state === "not_applicable" || data.path === "short_term";
  return <section aria-label="Contribution result" className="contribution-result mt-6 min-w-0">
    <p className="text-sm text-slate-600">Your contribution preview</p><h3 className="contribution-amount break-words">{money(data.contribution_amount, data.contribution_currency)}</h3>{result.mode !== "plan" && <p className="text-sm">Largest eligible target gap</p>}
    {reserve ? <><p className="mt-3 text-slate-700">Foundation First pauses investment allocations in this tool. This preview accounts for the full contribution as reserve, without a purchase allocation.</p><p className="mt-2 break-all text-2xl font-semibold text-slate-900">Reserve · {money(data.contribution_amount, data.contribution_currency)}</p></>
      : notApplicable ? <p className="mt-3 text-slate-600">Your current plan does not route this contribution into long-term investments. {money(data.contribution_amount, data.contribution_currency)} remains unallocated.</p>
      : result.mode === "plan" ? <>
        <dl className="my-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">{([
          ["Minimum check met", result.data.invested_amount], ["Check minimum", result.data.verify_minimum_amount],
          ["Waiting", result.data.unallocated_amount], ["Reserve", result.data.reserve_amount],
        ] as const).filter(([, amount]) => nonzero(amount)).map(([label, amount]) => <div key={label}><dt className="text-slate-600">{label}</dt><dd className="break-all font-semibold text-slate-900">{money(amount, data.contribution_currency)}</dd></div>)}</dl>
        {result.data.allocations.map((row, i) => <ProductRow key={`${row.implementation.product.product_id}-${i}`} item={row.implementation} amount={row.allocated_amount} minimum={row.minimum} currency={data.contribution_currency} />)}
        {nonzero(result.data.unallocated_amount) && <p className="mt-3 text-sm text-slate-600">{money(result.data.unallocated_amount, data.contribution_currency)} remains unallocated under this preview’s minimum constraints.</p>}
        {result.data.blocked_allocations.length > 0 && <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-700">Minimums to check</summary>{result.data.blocked_allocations.map((row, i) => <ProductRow key={i} item={row.implementation} amount={row.candidate_amount} minimum={row.minimum} currency={data.contribution_currency} />)}</details>}
      </> : <>
        <p className="mt-3 text-sm text-slate-600">Available: {money(data.contribution_amount, data.contribution_currency)}</p>
        {result.data.selected ? <><ProductRow item={result.data.selected} amount={result.data.action === "invest" ? result.data.recommended_amount : data.contribution_amount} minimum={result.data.minimum} currency={data.contribution_currency} />
          <p className="text-sm text-slate-600">{SLEEVE_LABELS[result.data.selected.sleeve]} has the largest eligible shortfall after this contribution.</p></>
          : <p className="mt-3 text-sm text-slate-600">No eligible target gap was identified for this contribution.</p>}
      </>}
    {data.warnings.length > 0 && <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-700">How this was calculated</summary><ul className="space-y-2 text-sm text-slate-600">{data.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
    <p className="mt-4 text-xs leading-5 text-slate-500">A hypothetical target-alignment calculation, not an instruction to buy or sell. You make your own investment decisions. No investment has been made. Provider fees and eligibility may still apply.</p>
  </section>;
}
