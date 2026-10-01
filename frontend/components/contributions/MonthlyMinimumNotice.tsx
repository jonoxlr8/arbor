import { monthlyMoney as money, type MonthlyRow } from "@/lib/monthlyPlan";
import { providerName } from "@/lib/investmentIdentity";
import { SLEEVE_LABELS } from "@/lib/contributions";

export default function MonthlyMinimumNotice({ row }: { row: MonthlyRow }) {
  const practicalInitial = row.provider_id === "gotrade" && row.minimum?.purchase_type === "initial"
    && row.minimum.kind === "order" && row.minimum.minimum_currency === "PHP";
  return <>
    {row.status === "below_minimum" ? <div className="monthly-minimum">
      <strong>Save toward the minimum before investing</strong>
      <p>{practicalInitial ? "Arbor practical initial minimum" : "Initial minimum"}: {row.minimum?.applicable_minimum && row.minimum.minimum_currency === "PHP" ? money(row.minimum.applicable_minimum) : "Check with your provider"}. Keep this {money(row.amount)} for a future contribution.</p>
      <small>This is a planning amount you retain. Arbor does not hold or carry it forward automatically.</small>
    </div> : row.status === "verify_minimum" ? <p>Check the minimum with {providerName(row.provider_id ?? "")} before investing. Arbor has not verified a minimum for this purchase.</p>
      : row.status === "choose_investment" ? <p>This amount remains assigned to {SLEEVE_LABELS[row.sleeve]}. You choose the investment and provider.</p>
        : row.status === "no_amount" ? <p>No new amount is assigned here in this breakdown.</p>
          : <p className="minimum-met">✓ {practicalInitial ? "Arbor practical initial minimum met" : "Minimum met"}</p>}
    {practicalInitial && <p>Arbor uses a PHP100 practical initial minimum per product. Gotrade’s separate provider order minimum is US$1. Verify additional-purchase minimums in app.</p>}
  </>;
}
