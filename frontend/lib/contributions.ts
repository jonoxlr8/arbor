import type { PlanV2 } from "./types/planV2";
import type { ContributionRequest, ContributionResult, ContributionProduct, RouteId, Sleeve } from "./types/contributions";
import { createLatestRequest, type RequestState } from "./dashboardConsistency";

export const SLEEVE_LABELS: Record<Sleeve, string> = { global_equity: "Global Equity", defensive: "Defensive", technology_tilt: "Technology", crypto: "Bitcoin" };
export const ROUTES: Record<RouteId, string> = { gcash: "GCash", dragonfi: "DragonFi", gotrade: "Gotrade", ibkr: "Interactive Brokers" };
export const EMPTY_VALUES: Record<Sleeve, string> = { global_equity: "", defensive: "", technology_tilt: "", crypto: "" };

// String operations only: no financial arithmetic or binary-float money conversion.
export function decimalText(value: string): string {
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value);
  if (!match || value.length > 200) throw new Error("Invalid monetary value");
  const exponent = Number(match[3] ?? 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 100) throw new Error("Invalid monetary value");
  const digits = match[1] + (match[2] ?? "");
  const position = match[1].length + exponent;
  const whole = (position <= 0 ? "0" : digits.slice(0, position).padEnd(position, "0")).replace(/^0+(?=\d)/, "");
  const fraction = (position < 0 ? "0".repeat(-position) + digits : digits.slice(Math.max(0, position))).replace(/0+$/, "");
  return whole + (fraction ? `.${fraction}` : "");
}
export const nonzero = (value: string) => decimalText(value) !== "0";
export function formatContributionMoney(value: string, currency: string) {
  const [whole, fraction] = decimalText(value).split(".");
  const prefix: Record<string, string> = { PHP: "₱", USD: "$", NZD: "NZ$", AUD: "A$", CAD: "C$", EUR: "€", GBP: "£" };
  return `${prefix[currency] ?? `${currency} `}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction}` : ""}`;
}
export function validInput(value: string, positive = false) {
  return value.length <= 80 && /^\d+(?:\.\d+)?$/.test(value) && (!positive || /[1-9]/.test(value));
}
export function contributionRequest(value: PlanV2, amount: string, holdings: Record<Sleeve, string>, route: RouteId,
  owned: string[], ibkrEligible: boolean): ContributionRequest {
  if (!validInput(amount, true) || !Object.values(holdings).every(v => validInput(v))) throw new Error("Check the contribution amount and all four portfolio values.");
  if (!Object.hasOwn(ROUTES, route)) throw new Error("Choose an implementation route.");
  const target = value.plan.preference_result?.effective_target;
  if (value.plan.path === "long_term" && !target) throw new Error("Your effective target is unavailable. Reload your saved plan before continuing.");
  return { contribution_amount: amount, contribution_currency: value.profile.currency,
    current_portfolio: { ...holdings, currency: value.profile.currency, owned_product_ids: [...owned] },
    context: { route_id: route, path: value.plan.path, effective_target_allocation: value.plan.path === "short_term" ? null : target!,
      readiness: value.plan.readiness, ibkr_crypto_eligible: route === "ibkr" ? ibkrEligible : null },
    readiness_inputs: { emergency_savings: value.profile.emergency_savings, high_interest_debt: value.profile.high_interest_debt } };
}
export function resultProducts(result: ContributionResult): ContributionProduct[] {
  const products = result.mode === "plan"
    ? [...result.data.allocations, ...result.data.blocked_allocations].map(row => row.implementation.product)
    : result.data.selected ? [result.data.selected.product] : [];
  return [...new Map(products.map(product => [product.product_id, product])).values()];
}
export function needsOwnershipReview(result: ContributionResult, confirmed: Record<string, boolean>) {
  return resultProducts(result).some(product => !Object.hasOwn(confirmed, product.product_id));
}
export function createContributionController(onState: (state: RequestState<ContributionResult> | null) => void) {
  const latest = createLatestRequest<ContributionResult>(onState);
  let pending = false, revision = 0;
  return {
    invalidate() { revision++; pending = false; latest.invalidate(); onState(null); },
    dispose() { revision++; pending = false; latest.dispose(); },
    async run(work: (signal: AbortSignal) => Promise<ContributionResult>) {
      if (pending) return;
      pending = true;
      const current = revision;
      try { return await latest.run(work); }
      finally { if (revision === current) pending = false; }
    },
  };
}
