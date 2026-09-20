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
- Readiness: independent enum with an isolated evaluator in `readiness_v2`, not a
  strategy modifier.
- Strategy path: short term without a long-term strategy, or long term with one.
  Selection is isolated in `strategy_selection_v2`; no automatic default strategy.

Future flow: readiness → risk/horizon → base strategy → preferences → contribution
practicality → implementation route. Only a resolved, permitted effective target
should eventually feed Health, comparison, rebalancing and contribution guidance.
Do not feed saved preferences or a raw base definition directly to those consumers.

3O-F owns preference allocation, including satellite limits; these policies are
not inferred here. Implementation catalog versioning is separate
and deferred to 3P; strategy engine records explicitly use version `2.0`.

Legacy risk categories, historical Growth read handling, Supabase model rows,
ticker-based Health and 8% projections remain unchanged. Legacy Growth is not
automatically the new v2 Growth strategy. An explicit review/migration and API
integration will be needed before any existing user uses v2.

## Readiness engine (3O-B)

`readiness_v2.evaluate_readiness(emergency_savings, high_interest_debt)` accepts
the typed savings/debt options and returns a frozen `ReadinessResult`. Missing or
unknown answers fail validation; they are never treated as ready.

Precedence: difficult-to-manage debt always means Foundation First. Otherwise,
at least three months of savings AND no high-interest debt means Ready. Every
other valid combination means Getting Ready.

| Readiness | Show core strategy | Actionable contributions | Technology eligible | Bitcoin eligible | Required message |
|---|---|---|---|---|---|
| Ready | Yes | Yes | Yes | Yes | None |
| Getting Ready | Yes | Core, with caution | Potentially | No | Readiness caution |
| Foundation First | Preview only | No | No | No | Foundation First |

Satellite readiness eligibility is only a permission gate, not final approval or
an allocation. Later strategy-specific rules must also permit it. Message values
are semantic codes, not UI prose. The evaluator accepts no strategy, horizon,
target or saved preferences and cannot overwrite any of them. An Aggressive
strategy can therefore coexist with Foundation First readiness.

This engine is not connected to legacy profiles, production onboarding or guidance.
No persistence or schema migration was added. Risk/horizon selection remains
separate, preserving these readiness permissions without reclassifying strategy.

## Risk and horizon selection (3O-C)

`strategy_selection_v2.select_strategy(risk_response, horizon)` validates the two
enum inputs and returns an immutable result. No readiness evaluation is called.

| Response to an approximately 30% decline | Requested strategy |
|---|---|
| `sell_all` | Conservative |
| `sell_some` | Balanced |
| `hold` | Growth |
| `continue_investing` | Aggressive |
| `invest_more` | Aggressive |

| Horizon bucket | Maximum long-term strategy |
|---|---|
| `less_than_3_years` | None: distinct short-term path |
| `three_to_five_years` | Balanced |
| `five_to_ten_years` | Growth |
| `ten_plus_years` | Aggressive |

The selected long-term strategy is the lower-risk of the requested strategy and
the horizon maximum, comparing global-equity weights from canonical base definitions.
Horizon can only reduce risk, never increase it. No fifth strategy exists.
For example, Aggressive + 3–5 years becomes Balanced; Aggressive + 5–10 years becomes
Growth; Conservative + 10+ years stays Conservative; Balanced + 5–10 stays Balanced.

The result retains `requested_strategy`, `horizon_maximum_strategy`, and the existing
`StrategyPath`. Derived output fields expose `selected_strategy`, `is_short_term`,
`cap_applied`, and a semantic `reason`. Short-term results retain the risk response's
requested tier for explanation only: the horizon maximum and selected strategy are
null, `cap_applied` is false, and reason is `short_term_path`. This is not Conservative
and supplies no portfolio, product or projection assumption. Numeric years are not
classified here; the caller supplies an explicit horizon bucket.

Readiness remains independent: Aggressive + Foundation First is valid. Selection
does not overwrite readiness permissions or saved preferences. Neither evaluator
is wired into production onboarding, profiles, recommendations or API contracts.
Base strategy composition is described below; no UI is added by these milestones.

## Base strategy plan model (3O-D)

`portfolio_plan_v2.build_portfolio_plan(risk_response, horizon, emergency_savings,
high_interest_debt)` takes the existing enum inputs and calls `select_strategy`
and `evaluate_readiness`. It does not reimplement either policy or accept caller-
supplied allocations/returns. No existing module or production API imports it.

`PortfolioPlan` is a discriminated union of frozen `LongTermPortfolioPlan` and
`ShortTermPortfolioPlan`, with an explicit `path` and engine version. Both contain:

- `selection`: the complete canonical selection result (requested strategy,
  horizon, maximum, cap flag and semantic reason).
- `readiness`: the complete canonical state/message/permission result.
- `inflation_annual_rate`: derived from the central v2 inflation assumption.

Long-term output adds `selected_strategy`, `base_allocation`, and
`planning_annual_rate`, derived directly from `get_base_strategy`. These are
read-only presentation fields, not independently stored financial assumptions.
Short-term output constrains all three to null, and rejects long-term selection
data. It provides neither a short-term portfolio nor a return (including 0%).

Readiness never changes the selected strategy: Aggressive + Foundation First is
still Aggressive, with actionable contributions blocked. Short-term readiness
permissions remain readiness-only gates, not permission to use the long-term
engine; consumers must inspect `path`. No effective target is published here.

`model_dump(mode="json")` includes derived presentation fields; Decimal rates
serialize as exact strings. For model round-tripping use Pydantic's
`model_dump_json(round_trip=True)` to exclude derived fields. This is an output
domain contract, not a new profile persistence or public API contract.

3O-E owns onboarding v2 UI integration. Preference allocation (3O-F), projection
migration (3O-G), products/providers (3P), contribution allocation (3Q), Health
migration and legacy migration remain deferred. No schema migration is needed.
