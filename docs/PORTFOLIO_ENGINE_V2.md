# Portfolio Engine 2.0 foundations (3O-A)

Canonical backend domain: `app.services.strategy_v2`. Nothing in the current
production request path imports it. No profile migration, endpoint, schema change,
frontend constants, products or ticker portfolios are introduced.

Use `get_base_strategy(StrategyType.BALANCED)` to retrieve the immutable canonical
definition. Allocations use integer percentage points summing to exactly 100;
global equity and defensive must always be explicit, including zero defensive.
The module is the single source of base allocations, planning returns and inflation.

Planning returns are **nominal annual effective** assumptions, not forecasts or
guarantees. Rates are available as exact Decimal fractions via
`planning_annual_rate`; future monthly calculations must derive
`(1 + annual_rate) ** (1 / 12) - 1`. Inflation is a separate annual assumption.
Do not pass these rates into the legacy annual-rate-divided-by-12 calculation and
assume it implements the v2 convention. Projection migration belongs to 3O-G.

## Separate concepts

- Base strategy: immutable canonical core allocation and planning return.
- Saved preferences: technology tilt and Bitcoin intent; no allocation or return.
- Effective target: separately validated output for the future policy/allocator.
  Satellites can only replace equity; defensive weight cannot change. Its planning
  return is derived from its base strategy, never a preference or satellite weight.
  This structural contract does not mean a target has been approved for guidance.
- Readiness: independent enum, not a strategy modifier or a decision engine yet.
- Strategy path: short term without a long-term strategy, or long term with one.
  No automatic default strategy and no horizon selection are implemented.

Future flow: readiness → risk/horizon → base strategy → preferences → contribution
practicality → implementation route. Only a resolved, permitted effective target
should eventually feed Health, comparison, rebalancing and contribution guidance.
Do not feed saved preferences or a raw base definition directly to those consumers.

3O-B must define readiness inputs/decisions and guidance permissions (Foundation
First can block actionable contributions; Getting Ready may restrict satellites)
without silently changing the underlying strategy. 3O-C owns short-term/horizon
selection. 3O-F owns preference allocation, including satellite limits. None of
these policies are inferred here. Implementation catalog versioning is separate
and deferred to 3P; strategy engine records explicitly use version `2.0`.

Legacy risk categories, historical Growth read handling, Supabase model rows,
ticker-based Health and 8% projections remain unchanged. Legacy Growth is not
automatically the new v2 Growth strategy. An explicit review/migration and API
integration will be needed before any existing user uses v2.
