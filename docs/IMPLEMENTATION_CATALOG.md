# Philippine implementation catalog — 3P-A

This isolated backend catalog maps **what** Portfolio Engine V2 already selected
to **how** a user-selected route can implement it. It is not an API, route
recommendation, contribution allocator, or execution system.

## Architecture

`backend/app/services/implementation/` contains immutable typed models, separate
route and product records, and a pure mapper. `map_plan(route_id, plan,
ibkr_crypto_eligible=None)` consumes the existing canonical V2 plan. The lower-level
`map_effective_target` accepts its effective target and readiness result directly.
Both validate inputs and preserve every target percentage exactly. Zero sleeves
are omitted. Canonical roles remain `global_equity`, `technology_tilt`, `crypto`,
and `defensive`; no parallel strategy or readiness policy is introduced.

The catalog version is `ph-v1`, separate from strategy engine version `2.0`.
Products use the canonical sleeve field rather than a duplicate role field.
Money/minimum/fee values use Decimal; percentages use existing integer percentage
points. No new HTTP serialization contract is introduced.

## Explicit routes and products

| Route | Global equity | Technology | Defensive | Bitcoin |
| --- | --- | --- | --- | --- |
| GCash | ATRAM Global Equity Opportunity Feeder Fund | ATRAM Global Technology Feeder Fund | ATRAM Medium Term Peso Bond Fund | GCrypto BTC |
| DragonFi | BPI Global Equity Fund of Funds | BPI World Technology Feeder Fund | BPI Premium Bond Fund | Coins.ph BTC |
| Gotrade | VT | VGT | BND | Coins.ph BTC |
| IBKR | VWRA | IUIT | AGGU | IBKR BTC only with explicit eligibility; otherwise Coins.ph BTC |

Exactly four primary routes exist. Coins.ph is a shared product, not a route;
PDAX is secondary fallback metadata only and can never be selected by this mapper.
There are 16 product records including these shared/fallback records.
GCash global equity has `broad` match quality: it is not a pure broad-market index
equivalent. Other selected products have `direct` match quality. PDAX is marked
`unavailable` for selection in this version. There are no numerical match scores.

## Minimums and uncertainty

- GCash global equity and technology: PHP 1,000 initial / PHP 500 additional.
  The official minimums supplied for this milestone remain authoritative even
  where the live app may offer a lower threshold.
- GCash bond: PHP 50 initial / PHP 50 additional.
- GCrypto: 0.00002 BTC minimum quantity; no fixed PHP equivalent.
- DragonFi BPI funds: PHP 1,000 initial; additional minimum unknown,
  `verify_in_app`.
- Gotrade ETFs: USD 1 order minimum, fractional support enabled.
- Coins.ph BTC: PHP 5 order minimum.
- IBKR ETFs: minimums, practical minimums, and fractional eligibility remain null.
  Listing, commission, FX and eligibility require verification. IBKR BTC minimum
  and Philippine availability are not assumed.

All products have `monthly_contribution_required=false`. Unknown auto-invest,
recurrence, and other unresolved metadata remain null. No account deposit minimum
or FX conversion is modeled.

Gotrade fee metadata is separate from minimums: trading 0.15–0.30%, USD 0.10
minimum trade fee, FX 0.3–1%, method-dependent deposit fee, USD 5 local-currency
withdrawal and USD 50 USD withdrawal. These values do not affect mapping.

Records reflect the locked product-owner requirements for this milestone, not a
live provider audit. `minimum_source` records that provenance where supplied and
`last_verified_at` remains null. Verify current provider terms before execution.
Affiliate availability is metadata, not a claim that Arbor has a signed agreement;
neither partnership nor fee fields influence selection.

## Readiness and path

Actionability comes from the canonical readiness permission. Foundation First is
an inactive future preview. Getting Ready maps only the upstream effective target,
without restoring blocked Bitcoin. Ready permits active mapping. “Active” does
not establish provider/account eligibility or execute any transaction.

Short-term plans return `not_applicable`, no mapped products, and a null target
total because no long-term target exists. They are never converted to Conservative.
IBKR crypto defaults to Coins.ph unless the strict eligibility input is `true`;
the output explains fallback selection and includes PDAX only as secondary metadata.

No persistence, schema migration, frontend changes, legacy behavior changes, or
3Q contribution/practical-minimum calculations are part of this milestone.
