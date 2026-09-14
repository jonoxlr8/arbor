type WealthJourneyCardProps = {
  name: string;
  currentValue: number;
  projectedValue: number;
  years: number;
  goalAmount: number;
  currency: string;
  requiredMonthlyInvestment: number;
  monthlyInvestment: number;
};

export default function WealthJourneyCard({
  currentValue,
  projectedValue,
  years,
  goalAmount,
  currency,
  requiredMonthlyInvestment,
  monthlyInvestment,
}: WealthJourneyCardProps) {

  const target = goalAmount;

  const progress =
    target > 0 ? Math.min((currentValue / target) * 100, 100) : 0;

  const projectedProgress =
    target > 0 ? Math.min((projectedValue / target) * 100, 100) : 0;

  const projectedGap = Math.max(target - projectedValue, 0);

  const monthlyContributionGap = Math.max(
    requiredMonthlyInvestment - monthlyInvestment,
    0,
  );

  const formatCurrency = (value: number) => formatPlanningMoney(value, currency);


  return <section className="arbor-panel">
    <h2 className="text-xl font-semibold">Goal progress</h2>
    <div className="mt-4 flex flex-wrap justify-between gap-3">
      <p className="text-xl font-semibold">{formatCurrency(target)} <span className="text-sm font-normal text-slate-500">goal</span></p>
      <p className="font-semibold text-forest">{projectedProgress.toFixed(1)}% modeled progress</p>
    </div>
    <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-leaf" style={{width: `${projectedProgress}%`}} /></div>
    <p className="mt-3 text-sm text-slate-700">{projectedValue >= target ? "Projected goal reached." : `Projected shortfall: ${formatCurrency(Math.round(projectedGap))}.`}</p>
    <p className="mt-3 text-sm text-slate-600">Modeled contribution to reach this goal: <strong>{formatCurrency(Math.ceil(requiredMonthlyInvestment))} / month</strong> over {years} years. Affordability has not been assessed.</p>
    <details className="mt-3">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-forest">Planning inputs and assumptions</summary>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt>Planning starting value</dt><dd>{formatCurrency(currentValue)} · {progress.toFixed(1)}% of goal</dd></div>
        <div><dt>Planned contribution</dt><dd>{formatCurrency(Math.round(monthlyInvestment))} / month</dd></div>
        {monthlyContributionGap > 0 && <div><dt>Modeled monthly gap</dt><dd>{formatCurrency(Math.round(monthlyContributionGap))}</dd></div>}
      </dl>
      <p className="mt-3 text-xs leading-5 text-slate-500">Planning starting value is separate from recorded holdings cost basis. Projections assume 8% annual return; actual returns vary.</p>
    </details>
  </section>;
}
import { formatPlanningMoney } from "@/lib/format";
