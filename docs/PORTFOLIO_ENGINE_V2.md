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

## 3O-F: requested preferences and effective target

`preferences_v2.py` owns the satellite caps and deterministic application. It
consumes the final horizon-capped strategy and canonical readiness permissions;
it does not select a strategy or reimplement readiness. Technology caps are
0/5/10/10 and Bitcoin caps 0/5/5/10 for Conservative/Balanced/Growth/Aggressive.
Satellites replace global equity only. Defensive allocation and the base-strategy
planning return never change. Locked combined caps always fit available equity;
an inconsistent future policy fails rather than inventing allocation priority.

`SavedPreferences` now stores requested **integer percentage points** (0–100 per
preference, strict, no booleans/fractions), defaulting to zero. The old boolean
placeholder was not wired to persistence or onboarding. Over-cap requests remain
saved as requested. Both requests can be 100; effective weights still respect
caps and total 100. `preference_result` exposes per-preference requested/effective
weights, strategy cap, and semantic `strategy_cap` / `readiness_restricted` reasons.
Multiple reasons may apply. Zero requests need no restriction explanation.

The composed plan keeps canonical `base_allocation` separate from
`preference_result.effective_target`. The latter uses existing `EffectiveTargetAllocation`
and four explicit role weights, including zeros; Bitcoin maps to `crypto`.
Short-term plans retain saved requests but have a null effective target, no
long-term return, and `short_term_path` reasons for nonzero requests.

The existing `/v2/profiles` request accepts optional `saved_preferences`:
`{"technology_tilt":10,"bitcoin":5}`. They are stored only under that key in
`v2_inputs`; no derived allocations are persisted. Reads accept the original four
answer keys with or without this optional key. Missing preferences mean zero;
requests omitting preferences keep the original four-key storage shape.
malformed preferences fail closed. Create retries do not overwrite existing requests.
The response adds `profile.saved_preferences` and `plan.preference_result` with
integer percentage-point weights; existing numeric planning-return/inflation DTOs
remain unchanged. No schema migration, backfill, v1 change, or live DB action.

The current frontend accepts additive response fields and continues showing the
base strategy. Preference controls/editing and effective-target presentation are
not added here. Health/comparison/rebalancing/contribution must eventually consume
the effective target, not base weights; their v2 integration remains deferred.
Rollback caution: once a row includes `saved_preferences`, pre-3O-F readers that
require exactly four v2 input keys will reject it. Keep a compatible reader when
rolling back; do not drop saved user preferences to accommodate old code.

## 3T-B: investment profile preview and confirmed edits

`POST /v2/profiles/preview` and `PUT /v2/profiles/me` accept `inputs` (the existing
profile answers), `proposed_approach` (null means keep), and `expected_revision`
from the last canonical profile response. Both authenticate and read only the
owner's row. Preview returns `{current, proposed}` without writing. Save rebuilds
the same canonical proposal, checks the revision, and atomically compares the
original `v2_inputs` JSONB before updating. A stale edit returns 409; an uncertain
write returns a recoverable error requiring a canonical reload.

The existing JSONB gains server-only `plan_state`: a revision nonce and, when
editing a historical plan, a historical plan snapshot. No SQL migration or
backfill is needed. Targets, owner IDs, preferences and internal metadata cannot
be edited through this request. The old approach-only endpoint uses the same
save path while continuing to ignore client financial answers.

Assessment and readiness recalculate from edited answers; selection never follows
assessment automatically. A selected long-term approach becomes dormant below
three years and returns when the horizon becomes long-term again. An explicitly
selected short-term path stays selected until the user chooses another approach.
Historical Keep freezes the original allocation and planning assumptions, while
updating readiness separately. Historical long-term allocations likewise pause
on a short horizon and resume from the snapshot, not recalculated preferences.
Explicit model selection uses the canonical standard model without satellites;
historical requests and snapshot remain available as historical reference.

The editor reuses onboarding questions and approach comparison. It presents
server-calculated before/after information, never an invented exact horizon or
projected balance. Only the final explicit Save writes. Cancel discards drafts.
Successful saves replace the canonical frontend plan. Existing plan-keyed chat
and contribution components clear conversations, scenarios and temporary product
acceptances; navigating away already resets these component-local selections.
This conservative session reset also occurs for metadata-only saved edits.

Release/rollback: deploy this compatible backend before the new frontend. Older
readers reject `plan_state`, and older frontend validators may reject dormant or
historical snapshot semantics. Once edits exist, retain this reader during a UI
rollback; do not remove saved metadata or roll back to an incompatible backend.
