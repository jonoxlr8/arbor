import type { PlanV2 } from "./types/planV2";
import type { Sleeve } from "./types/contributions";

/** Presentation-only projection of the supported backend catalog. No weights,
 * prices, ranking, eligibility decisions or provider selection live here. */
export const PLAN_OPTIONS: Record<Sleeve, readonly { product: string; provider: string }[]> = {
  global_equity: [
    { product: "dragonfi_global_equity", provider: "dragonfi" },
    { product: "gcash_global_equity", provider: "gcash" },
    { product: "gotrade_vt", provider: "gotrade" },
  ],
  technology_tilt: [
    { product: "dragonfi_technology", provider: "dragonfi" },
    { product: "gcash_technology", provider: "gcash" },
    { product: "gotrade_vgt", provider: "gotrade" },
  ],
  defensive: [
    { product: "dragonfi_defensive", provider: "dragonfi" },
    { product: "gcash_defensive", provider: "gcash" },
    { product: "gotrade_bnd", provider: "gotrade" },
  ],
  crypto: [
    { product: "coins_btc", provider: "coins_ph" },
    { product: "gcrypto_btc", provider: "gcrypto" },
    { product: "pdax_btc", provider: "pdax" },
  ],
};

/** Official public websites verified 2026-09-25. No affiliate parameters,
 * account data, supplied URLs or undocumented app deep links. */
const PROVIDER_DESTINATIONS: Record<string, string> = {
  gcash: "https://gcash.com/services/gfunds",
  gotrade: "https://www.heygotrade.com/",
  dragonfi: "https://www.dragonfi.ph/",
  gcrypto: "https://gcash.com/services/gcrypto",
  coins_ph: "https://www.coins.ph/en-ph",
  pdax: "https://pdax.ph/",
};
export function providerDestination(provider: string): string | null {
  return Object.hasOwn(PROVIDER_DESTINATIONS, provider) ? PROVIDER_DESTINATIONS[provider] : null;
}

export function planTargets(value: PlanV2) {
  if (value.plan.path !== "long_term") return [];
  const weights = value.plan.final_allocation ?? (value.plan.plan_basis === "user_selected" ? value.plan.base_allocation
    : value.plan.preference_result?.effective_target?.allocation.weights ?? value.plan.base_allocation);
  return weights.filter(weight => weight.percentage_points > 0);
}

export function implementationGroups(value: PlanV2) {
  if (!value.plan.readiness.actionable_contribution_guidance_allowed) return [];
  return planTargets(value).map(weight => ({ ...weight, options: PLAN_OPTIONS[weight.role] }));
}
