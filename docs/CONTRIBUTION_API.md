# Contribution calculation API — 3R-A

Two additive authenticated POST endpoints expose the existing pure services:

- `/contributions/recommendation`: one next purchase (3Q-A).
- `/contributions/plan`: full monthly allocation plan (3Q-B).

Both use the existing `get_current_user_id` JWT dependency. Supply
`Authorization: Bearer <access token>`. Token verification may use the existing
Supabase JWKS mechanism; the calculation routes do not load profiles or holdings,
call providers, or read/write the database. These are explicit-input hypothetical
calculations, not confirmation that inputs match the authenticated user's saved
plan. Do not treat this API as trade authorization or authoritative portfolio storage.

## Shared request

`ContributionAPIRequest` reuses the existing `ContributionRequest` fields and
validation. No alternative shorthand target or sleeve format is accepted.
Canonical product-language technology/Bitcoin roles are `technology_tilt`/`crypto`.
All four market-value fields and explicit `owned_product_ids` are required.
Values must share a supported valuation currency; there is no FX conversion.

Example for either endpoint (change the contribution amount as desired):

```json
{
  "contribution_amount": "12000",
  "contribution_currency": "PHP",
  "current_portfolio": {
    "currency": "PHP",
    "global_equity": "58000",
    "defensive": "19000",
    "technology_tilt": "8000",
    "crypto": "3000",
    "owned_product_ids": []
  },
  "context": {
    "route_id": "gcash",
    "path": "long_term",
    "ibkr_crypto_eligible": null,
    "effective_target_allocation": {
      "strategy_engine_version": "2.0",
      "base_strategy": "Growth",
      "allocation": {
        "weights": [
          {"role": "global_equity", "percentage_points": 65},
          {"role": "defensive", "percentage_points": 20},
          {"role": "technology_tilt", "percentage_points": 10},
          {"role": "crypto", "percentage_points": 5}
        ]
      }
    },
    "readiness": {
      "readiness": "ready",
      "core_strategy_can_be_shown": true,
      "actionable_contribution_guidance_allowed": true,
      "technology_satellite_readiness_eligible": true,
      "bitcoin_satellite_readiness_eligible": true,
      "message_requirement": "none"
    }
  },
  "readiness_inputs": {
    "emergency_savings": "three_to_six_months",
    "high_interest_debt": "none"
  }
}
```

Use canonical upstream target/readiness outputs, not client-derived strategy rules.
The existing domain validator verifies readiness consistency against its inputs.
For short-term requests, `context.path` is `short_term` and the effective target is
null. No `user_id`, raw brokerage positions or symbol-to-sleeve classification is
accepted. Ownership is product-specific; another product in the same sleeve does
not establish additional-purchase eligibility.

## Response contract

Responses retain the domain's semantic structure, with public product DTOs:

- Recommendation: action, available/recommended amounts, currency, route, path,
  readiness, state, execution status, reason, totals and warnings. `selected`
  contains sleeve, target percentage, public `product`, match quality and crypto
  fallback metadata. `selected_calculation` contains current value/percentage,
  target post-contribution value and deficit. `minimum` contains purchase type,
  kind, applicable value/currency, status and amount needed. Non-applicable fields
  remain null; empty-portfolio current percentage remains null.
- Plan: status, contribution/totals, route/readiness/path, allocations, blocked
  allocations, calculations and warnings. Each allocation has `implementation`
  (sleeve, target and public product), `calculation`, allocated/candidate amounts,
  `minimum`, stage and reason. `invested_amount`, `verify_minimum_amount`,
  `unallocated_amount` and `reserve_amount` reconcile exactly to the contribution.

Public product fields are explicitly allow-listed: identity, display name,
provider/platform, sleeve, match quality, currency, buy minimums and their status,
fractional/availability flags, eligibility notes and last verification date.
Partnership, affiliate, compensation and fee metadata are not exposed. Response
schema names in OpenAPI are `ContributionRecommendationResponse` and
`ContributionPlanResponse`.

### Decimal values

Pydantic serializes Decimal amounts, monetary deficits and minimums as JSON
**strings**, e.g. `"5000"` or `"12345.67890123456789"`. No intermediate float
conversion is used. Whole target percentage points remain JSON integers. Clients
may submit decimal strings (preferred for precision) or JSON numbers supported by
the existing validators. This contract applies only to these new endpoints.

### Uncertainty and safety

For the example above, the monthly GCash plan contains executable global 7,000,
technology 2,000 and defensive 1,000, plus Bitcoin 2,000 requiring minimum
verification. The API does not override the planner's confirmed-first ordering.
Gotrade PHP versus USD minima, GCrypto quantity minima and unresolved IBKR minima
remain `verify_minimum`, never silently `ready`.

Foundation First produces reserve/no purchase; short-term remains not applicable.
`invested_amount` denotes a planned executable amount, not an executed transaction.
There is no persistence, transaction history, trade execution, or live valuation.
See [Contribution Engine](CONTRIBUTION_ENGINE.md) for the unchanged algorithms.

## Errors

- 401: missing/invalid/expired authentication, using the existing shared behavior.
- 422: malformed bodies, enums, negative/nonfinite amounts, invalid totals,
  currencies, ownership or contradictory readiness/path/target inputs. Existing
  domain validation is reused, not silently repaired.
- 400: expected domain `ValueError` after request validation, with concise sanitized
  copy rather than internal exception text.

Unexpected failures are not reclassified as invalid user input. No custom auth,
profile orchestration, database/schema changes or financial logging is added.
