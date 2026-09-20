# Portfolio Engine 2.0 foundations (3O-A)

Canonical backend domain: `app.services.strategy_v2`. The dedicated v2 profile
boundary now composes it for new onboarding (3O-E). Legacy profiles still use the
existing v1 engine. No products or ticker portfolios are introduced by v2.

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

This engine is not connected to legacy profiles or legacy guidance.
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
does not overwrite readiness permissions or saved preferences. Both evaluators
are composed only for the dedicated v2 profile flow, never for legacy profiles.
Base strategy composition is described below; no UI is added by these milestones.

## Base strategy plan model (3O-D)

`portfolio_plan_v2.build_portfolio_plan(risk_response, horizon, emergency_savings,
high_interest_debt)` takes the existing enum inputs and calls `select_strategy`
and `evaluate_readiness`. It does not reimplement either policy or accept caller-
supplied allocations/returns. The dedicated v2 profile service now consumes it.

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

Preference allocation (3O-F), projection
migration (3O-G), products/providers (3P), contribution allocation (3Q), Health
migration and legacy migration remain deferred. 3O-D itself required no migration.

## Onboarding/profile boundary (3O-E)

New authenticated users with no profile receive nine in-memory questions: Name,
Country, Emergency savings, High-interest debt, Goal amount, Starting amount,
Monthly contribution, Horizon bucket, Market-drop reaction. Goal amount is optional
and expressed in today's PHP. Starting/monthly amounts accept zero. Country is
Philippines-only; no country-specific investment products are implied.

`POST /v2/profiles` accepts `ProfileV2Create`, explicitly tagged with
`strategy_engine_version: "2.0"`. It validates existing domain enum values and
shared financial bounds. No caller-supplied user ID, strategy, allocation or
readiness result is accepted. The bearer token determines the owner and the
Supabase client uses that token under existing RLS. No service-role access added.

`GET /profiles/me` remains the single recovery endpoint. A null/1.0 version uses
the unchanged v1 response builder; 2.0 returns `{strategy_engine_version, profile,
plan, profile_warning}`. Unknown versions and invalid saved v2 data fail explicitly,
never as a missing profile. POST restores an existing row of either version rather
than overwriting it. Lost responses reconcile through one canonical read; uniqueness
must be enforced in the database. Legacy PUT rejects v2 rows. Legacy chat/Health
return unavailable for v2 instead of interpreting it through ticker-based rules.

The v2 `plan` DTO retains selection/readiness results. Rates are JSON numbers in
percentage units (`planning_return_pct`, `inflation_pct`), not Decimal strings.
Allocation rows use numeric `percentage_points`. Short-term allocation/strategy/
return remain null. Frontend validation checks the contract before rendering.

The v2 result screen is a strategic-plan entry, NOT the legacy dashboard. It shows
readiness, the canonical base allocation/return, and a cap explanation when returned
by the backend. Foundation First is a preview without actionable contribution
controls; short-term paths show no long-term allocation/return/guidance. No legacy
8% projections, ticker portfolio, chat or Health widgets are mounted for v2.

### Persistence and manual migration prerequisite

**Unapplied SQL:** `backend/migrations/3o_e_profiles_v2.sql`. Review and test on a
Supabase staging copy before applying manually. No application auto-migration.
Live schema/RLS constraints are not provable from this repository.

- Adds nullable `strategy_engine_version text` and `v2_inputs jsonb` to `profiles`.
- Shared existing columns retain name, country, PHP currency, optional goal,
  starting amount and monthly contribution. `v2_inputs` contains only emergency
  savings, debt, horizon bucket and market response; no duplicated derived plan.
- V2 writes explicit nulls for legacy risk/horizon fields. For existing NOT NULL
  rules on goal/risk/horizon columns, SQL replaces them with conditional checks
  preserving the same requirement on v1 rows. Other CHECK constraints are not
  removed: inspect them for compatibility first.
- Makes user_id NOT NULL and adds a unique index. Existing null/duplicate owners
  abort the transaction; no records are repaired/deleted automatically.
- Adds a version/payload check and an update trigger preventing implicit engine
  version changes. Existing v1 rows remain untagged; no backfilled v2 answers.
- Existing RLS/grants remain unchanged. Verify owner-only SELECT/INSERT/UPDATE/
  DELETE and rejection of cross-user inserts for two test accounts before release.

Release order: backup/inspect schema and policies → apply SQL manually in staging
and verify v1/v2 writes → apply approved migration → backend → frontend. New v2
creation cannot work without it. Keep the schema if rolling back application code;
do not roll back to an old reader that would reinterpret already-created v2 rows.

Inputs plus engine version are stored, not a snapshot: restore rebuilds via the
canonical 2.0 rules. Keep those rules version-stable; future semantic changes need
an explicit version/review path rather than silently changing saved plans. No
historical reinterpretation, legacy migration, or v2 profile-edit API is introduced.
The v2 DTO is a dedicated contract; it does not masquerade as a v1 investment plan.

Before release manually verify: v1 login/edit still restores the old dashboard;
new account completes all nine steps; retry/double submit produces one row; logout/
login restores v2; Foundation First preserves strategy; short term has no allocation/
return; unsupported country blocks; network/session failures offer recovery; and
mobile Light/Dark forms remain usable. Do not log onboarding answers or tokens.
