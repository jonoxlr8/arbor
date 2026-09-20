# Contribution Engine V1 — 3Q-A

`app.services.contributions.engine.recommend_next_contribution(request)` is a
pure backend service. It selects **one next contribution**, not a new strategy,
route, portfolio, or execution order. No HTTP endpoint, persistence, network,
prices, FX, sales, or broker execution is introduced.

## Contract

`ContributionRequest` contains:

- `contribution_amount`: finite, nonnegative Decimal; zero is allowed.
- `contribution_currency`: existing supported currency code.
- `current_portfolio`: complete caller-supplied **market values**, one currency,
  explicit `global_equity`, `defensive`, `technology_tilt`, `crypto` values and
  `owned_product_ids` (an explicit empty set means no catalog products owned).
- `context`: existing 3P `MappingInput`: effective target, canonical readiness
  result, path, user-selected route and optional strict IBKR crypto eligibility.
- `readiness_inputs`: existing canonical readiness inputs, used solely to validate
  that the supplied result agrees with `evaluate_readiness`. No readiness decision
  rules are copied into 3Q.

All sleeve values are required. Missing data is not interpreted as an empty
portfolio. All-zero values explicitly describe an empty portfolio. Product IDs
must be catalog IDs. Owning a sleeve on another platform does not prove ownership
of the selected product: supply actual product ownership, not an inferred ticker
or sleeve match. Existing cost-basis holdings must **not** be passed as market
values without an explicit future integration decision.

Canonical role names remain `technology_tilt` and `crypto` (technology/Bitcoin in
product language). Existing target validation rejects negative, malformed or
non-100% allocations. Contradictory readiness/target data fails validation rather
than silently rewriting the target. Preference caps are not re-applied.

`ContributionRecommendation` returns action, available contribution, recommended
amount, currency, route, readiness, path/mapping state, execution status, semantic
reason, totals, and per-sleeve calculation records. `selected` is the existing 3P
`MappedSleeve`, retaining product metadata, exact percentage, warnings and crypto
fallback metadata. `selected_calculation` holds current value/percentage, target
value and deficit. `minimum` contains purchase type, kind, value/unit, status,
reason and comparable amount still needed.

`recommended_amount` is the whole contribution for `invest` or `reserve`, and
zero for `wait`/`no_action`. The available `contribution_amount` is always retained;
a wait result still identifies the selected product and deficit. It does not
present an unverified amount as ready to execute. Decimal JSON values follow the
existing domain serialization convention (strings); no public API DTO is added.

## Selection

For every positive-weight mapped sleeve:

```
post_total = sum(current sleeve values) + contribution_amount
target_value = post_total * target_percentage_points / 100
deficit = target_value - current_sleeve_value
```

Select the greatest **positive value deficit** among actionable mapped products.
This is not percentage-gap ranking: contribution size changes the target values.
Zero-target holdings still count toward the current total, but are never selected.
Only exact ties use `TIE_PRIORITY`: global equity, defensive, technology, crypto.
Core does not override a larger satellite deficit. There is no sell action or
multi-product split. The full contribution may exceed the selected deficit; V1
intentionally implements one purchase rather than splitting or capping to deficit.

All arithmetic uses Decimal with a locally sized precision, without rounding
monetary intermediates. Current percentages can repeat and are informational only;
for an empty portfolio they are null. Caller Decimal settings are not modified.

## Readiness and path

- Foundation First: `reserve`, no selected investment product; full amount remains
  reserved without recommending a bank/savings product. Existing strategy remains
  untouched.
- Getting Ready: existing effective target only, including zero Bitcoin; readiness
  caution is retained. No satellite is re-enabled.
- Ready: normal selection and minimum checks.
- Short-term: `no_action / not_applicable`, no long-term products or substitute
  Conservative allocation.
- Zero contribution: `no_action / not_applicable` before purchase selection.
- No eligible positive deficit: `no_action`, never a crash or forced purchase.

## 3P integration and minimums

All products and crypto fallbacks come from the existing 3P mapper. No product
table is copied. Fees, partnerships and affiliate fields do not rank candidates.

First purchases use known initial minima or per-order minima. Explicit product
ownership enables a published additional minimum for funds. Unknown additional
minima are not replaced with the initial minimum. Per-order products retain their
order minimum on subsequent purchases.

- Same-currency known minimum met: `invest / ready`, whole contribution.
- Below minimum: `wait / below_minimum`, retain selected product and exact amount
  still needed. Do not redirect to another sleeve merely for its cheaper minimum.
- Unknown/dynamic/additional-unverified minimum: `wait / verify_minimum`.
- Different-currency minimum: `wait / verify_minimum`, preserve original units;
  amount still needed is null, not an invented conversion.
- GCrypto quantity minimum: `wait / verify_minimum`; retain 0.00002 BTC. No live
  BTC price or PHP equivalent is inferred.

“Ready” checks the recorded buy minimum only. It is not an all-in affordability
calculation including commissions, FX, funding costs or live provider eligibility.
IBKR dynamic minimums stay unresolved. Future fee-aware practicality is separate.

## Examples

For target 65/20/10/5 in canonical tie order, current 55,000/25,000/15,000/5,000
and contribution 5,000, post-total is 105,000. Global equity's target is 68,250
and deficit is 13,250, the largest. Gotrade maps it to VT, but a PHP contribution
cannot be compared with its USD 1 minimum: selection succeeds with `verify_minimum`.

An empty portfolio and contribution 5,000 produce target values
3,250/1,000/500/250: global equity wins.

GCash first global-equity contribution 500: `wait`, minimum PHP 1,000, needs 500.
Existing ownership with contribution 300: additional minimum PHP 500, needs 200.
DragonFi additional fund purchase: verify in-app; no invented additional minimum.

## Scope and caller responsibility

Callers must provide a complete same-currency snapshot and accurate product
ownership. This service cannot establish that a live holdings dataset was fully
loaded, value non-catalog holdings, or verify provider terms. Invalid/incomplete
inputs raise validation errors rather than producing guessed advice. No reserve
balance integration exists upstream, so none is invented here. Existing engines,
catalog, APIs, frontend and database remain unchanged.
