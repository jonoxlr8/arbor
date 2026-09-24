# PHP Live Portfolio (3U-B)

Manual records of investments already owned; reference valuation, not execution,
custody, broker linking or a recommendation. V1 holdings remain unchanged.

## Holding-specific manual fund values (3U-B.5)

Only `gcash_global_equity`, `gcash_technology`, `gcash_defensive`,
`dragonfi_global_equity`, `dragonfi_technology`, and `dragonfi_defensive` accept a
personal current PHP value. Fund units are optional: a fund must retain positive
units OR a positive manual value. ETFs and Bitcoin still require positive units
and cannot use manual values. The user enters the **whole holding value** shown in
GFunds/DragonFi, not a NAV or price per unit. Cost basis remains separate.

`PUT /v2/portfolio/holdings/{id}/manual-value` accepts only `manual_value_php`
(positive finite Decimal, under PHP 10^16, at most two decimal places), or null to
clear it without deleting the holding, but only if positive units remain. Otherwise
add units first or delete the holding. Value-only creation uses the normal holding
POST with `units=null` and `manual_value_php`; timestamps remain database-assigned.
No owner, source, timestamp or price URL
is accepted. JWT owner RLS remains in force. A database trigger sets
`manual_value_updated_at`; even reaffirming the same amount explicitly refreshes
it. Editing units/cost alone does not refresh the manual value. Normal clients
cannot write the timestamp or shared market cache. Source is exposed as
`valuation_source=manual_user` only when the value is actually used.

When units exist, central valuation precedence: fresh verified canonical NAV, then acceptable cached
canonical NAV (existing 7-day maximum), then valid personal manual value, otherwise
unavailable. Without units, NAV cannot determine a holding value: the valid manual
value remains authoritative even when a NAV exists. Adding units later enables
NAV valuation without refreshing an unchanged manual value's timestamp.
A manual value is usable for **7 × 24 hours inclusive** after its
recorded update time; future or older timestamps fail closed. Beyond that window
it is excluded, not zero: the portfolio becomes partial, complete percentages and
contribution scenarios are withheld, and no new snapshot is captured. Existing
history is retained. Next Action uses the existing update-portfolio action after
higher-priority readiness/profile/path checks.

Fresh manual values participate in totals, provider/sleeve grouping, alignment,
canonical contribution inputs and first-complete daily snapshots. They are not
penalized for being manual and are never written to the shared NAV cache. Ask Arbor
identifies the amount, holding provider, manual origin and date. The UI says
“Updated by you”; canonical valuation says “NAV updated”. If NAV becomes available,
it wins, while the saved manual record remains available to clear. An acceptable
but stale NAV still wins and follows the existing conservative scenario/snapshot
pause; a fresh manual value cannot conceal stale canonical data.

Migration order before activation: existing `3u_b_live_portfolio.sql`, then review
and deliberately apply **only** `20260924070525_3u_b_5_manual_fund_values.sql`.
The latter adds two holding columns, a restrictive constraint, timestamp trigger,
column-only update grant, extends the security-invoker text view, and replaces the
owner-derived snapshot calculation. It does not change RLS, shared cache, products,
profiles or quota objects. Validate hosted CRUD/RLS after eventual application.
Keep the feature OFF until that validation and the Basic subscription check pass.
Rollback: disable availability first; retain holding/manual/history data.
Do not roll back to an older portfolio reader while leaving the feature enabled:
older strict models may reject the new view columns. Roll back with availability
OFF, or deploy a reader compatible with both column sets.

Local isolated SQL regression command (no hosted database):

```sh
ARBOR_PGLITE_PATH=/path/to/@electric-sql/pglite node --test tests/sql/live_portfolio.test.mjs tests/sql/manual_fund_values.test.mjs
```

Local browser fixture: use the existing `tests.e2e_portfolio_app` test server with
`APP_ENV=test`, `ARBOR_PORTFOLIO_E2E=true`, the dedicated
test user ID, and local-only `LIVE_PORTFOLIO_ENABLED=true`. Leave
`ARBOR_MANUAL_VALUE_E2E` unset for the value-only / later-units test: fixture NAVs
exist but cannot value a holding until units are added. The optional `true` mode
still omits fund NAVs for missing-price checks. Run `node scripts/e2e/manual-fund-values.mjs` with the normal
isolated authenticated harness. No hosted holdings/history or profile writes occur.
Stop the fixture process afterward to discard all fixture history.

## Current release status — feature remains OFF

`backend/migrations/3u_b_live_portfolio.sql` was applied and hosted persistence/RLS
validated in 3U-B.3. The new additive
`20260924070525_3u_b_5_manual_fund_values.sql` is **prepared, NOT applied**.
The separate **3U-A Ask Arbor quota migration remains unapplied**; this feature
does not apply or depend on it for Plus users.

Production adapters and hosted technical ingestion were validated before 3U-B.5.
The product owner reports Marketstack confirmed **Basic supports Arbor's intended
commercial customer-facing use**. Display permission is no longer an unresolved
clarification; **Marketstack Basic must be active before private-beta activation**.
The development account may remain Free until then. This milestone does not change
subscriptions, credentials, hosted data, migrations or feature flags. No scraper,
scheduler or browser vendor calls are added.

## Production-safe availability (3U-B.1)

`LIVE_PORTFOLIO_ENABLED` is server-only and defaults to **false**. Only the exact
value `true` requests enablement. Missing, empty or unrecognized values fail closed.
In production (APP_ENV=production or Render/Vercel host markers), availability also
requires MARKETSTACK_API_KEY, COINRANKING_API_KEY and an explicit
MARKETSTACK_DISPLAY_RIGHTS_CONFIRMED=true operational sign-off. This is not a legal
conclusion. The API still fails safely if tables are missing; individual missing,
unverified or stale prices never become fabricated valuations.
Code may be deployed with the flag absent before either migration is applied.
Plus Trial/Active entitlement does not enable infrastructure. No browser, query,
request body or account-tier override can enable it.

`GET /account/entitlements` separately returns `availability.live_portfolio`.
The frontend treats a missing availability field from an older backend as false.
Disabled authenticated `/v2/portfolio` endpoints return a safe 404 before storage
construction. Chat and next actions skip holdings, cache and history entirely.
Portfolio shows the existing manual/hypothetical contribution workflow, respecting
short-term, historical-plan and Free/Plus gates. Plus Trial stays Plus Trial and
does not query the separate, unapplied Ask Arbor quota table. No ingestion starts.

Availability is read from server configuration per request. After changing process
environment, restart the service and reload clients to refresh the UI signal.
An already-open client cannot bypass the endpoint gate even with stale availability.

### Production activation checklist

Keep production disabled throughout preparation. Use a controlled validation
environment explicitly enabled only after its infrastructure is ready; do not
expose unvalidated production functionality merely to test it.

1. Review `3u_b_live_portfolio.sql`.
2. Intentionally apply **only 3U-B** for this feature.
3. Verify holdings owner RLS.
4. Verify snapshot owner RLS.
5. Verify shared-cache write restrictions and privileged snapshot function access.
6. Configure an approved server-side market-data source/ingestion.
7. Verify Marketstack Basic is active under the confirmed commercial-use permission.
8. Test real ETF reference valuation.
9. Test USD/PHP reference conversion.
10. Test BTC/PHP across supported providers.
11. Test latest published fund NAV units/timestamps.
12. Verify stale, missing and unavailable behavior.
13. Validate Add/Edit/Delete with the disposable hosted account.
14. Validate canonical contribution integration.
15. Validate Ask Arbor portfolio context.
16. Validate next-action behavior.
17. Deliberately set production `LIVE_PORTFOLIO_ENABLED=true` only after sign-off.
18. Run the production smoke test.

The independent `3u_a_ask_usage.sql` is required **before enabling production Free
Ask Arbor quotas**; it is not part of Live Portfolio activation. Both migrations
are independent. The base Live Portfolio migration is already applied; the new
manual-value migration and Free quota migration remain unapplied by this work.
No migration runs at application startup.

### Rollback

Disable the feature flag first and restart/reload as above. Confirm manual
contributions, chat and saved plans remain available. Do not immediately delete
holdings, snapshots, prices or migration data. Older application code can ignore
these additive tables. No existing profile JSON changes are needed.

## Data and ownership

- `arbor_portfolio_holdings`: authenticated owner defaulted from `auth.uid()`, UUID,
  canonical product/provider, positive units (12 fractional digits; nullable only
  for supported funds with a manual value), optional total PHP cost basis,
  personal manual PHP value (2 fractional digits), timestamps. One record per
  owner/product; update that record rather than inserting duplicate lots.
- `arbor_portfolio_products`: a locked subset of the existing implementation
  catalog. No arbitrary ticker search or user-entered provider names.
- `arbor_market_prices`: shared reference price cache, trusted server writes only.
  Source attribution is required at ingestion. Backend readers use normal JWT/RLS,
  not a service-role key. No production writer or new credentials are configured.
- `arbor_portfolio_snapshots`: owner-scoped, first complete fresh observation each
  UTC date. No backfill or estimated prehistory. A parameterless authenticated RPC
  derives values from database holdings/cache; users cannot submit snapshot values.
  It is the only narrowly privileged operation and has a fixed empty search path.
- Text-decimal, security-invoker views avoid numeric loss in PostgREST JSON clients.

RLS protects holdings/history even through direct REST access. Column grants deny
owner/product reassignment on update; pair foreign keys and numeric constraints also
apply outside FastAPI. Anonymous access and direct price/snapshot writes are denied.
All current authenticated production accounts are beta Plus. Future persistent
Free/Plus entitlements should also be considered when exposing direct database
capabilities; the current server gates are FastAPI's canonical entitlement service.

## Universe and reference units

| Provider | Products | Cache price units |
| --- | --- | --- |
| Gotrade | VT, VGT, BND | USD/share, multiplied by shared PHP-per-USD FX |
| GCash / GFunds | ATRAM Global Equity Opportunity Feeder Fund; ATRAM Global Technology Feeder Fund; ATRAM Medium Term Peso Bond Fund | PHP/unit, latest published NAV |
| DragonFi | BPI Global Equity Fund of Funds; BPI World Technology Feeder Fund; BPI Premium Bond Fund | PHP/unit, latest published NAV |
| GCrypto, Coins.ph, PDAX | BTC | Same BTC/PHP reference across providers |

No approved logo assets were available in the repository. Text provider badges and
names are used, without implying affiliation. Cost basis is optional and is not
used to value holdings or claim investment returns.

## Valuation and freshness

`MarketData` is the injectable provider interface; `PortfolioStore.prices` reads
the shared database cache in a single batch. `FixtureMarketData` is a deterministic
test adapter. Browsers never fetch individual market prices or send prices.

| Reference | Fresh | Maximum labeled cached fallback |
| --- | --- | --- |
| ETF EOD and daily USD/PHP | 48 hours | 4 days (weekends/holidays) |
| BTC/PHP | 10 minutes | 1 hour |
| Fund NAV | 48 hours | 7 days |

Future timestamps are rejected. Missing/expired/invalid individual prices yield
null holding values, not zero. Known sums are labeled incomplete; actual
percentages and differences are withheld until every holding can be valued.
Freshness is based on the oldest input, including FX. These initial conservative
policies should be reviewed with the approved source's market/calendar semantics.

All authoritative arithmetic is `Decimal` (80-digit intermediate context).
Each holding is rounded half-up to PHP centavos, then provider/sleeve totals are
summed. Current percentage = sleeve value / complete total × 100; difference =
current percentage − canonical saved target. Empty/zero portfolios have undefined
percentages. Short-term paths have no long-term target comparison. Historical
allocations retain their canonical historical targets. No alignment score is used.

## API and integration

All `/v2/portfolio` routes require JWT, operational availability and Plus `live_portfolio` entitlement:

- `GET /v2/portfolio`: owner records, PHP values, catalog, comparisons and history;
  read-only, no-store. History returns up to 366 daily observations.
- `POST /v2/portfolio/holdings`: supported provider/product, units and/or fund
  manual value under the tracking-input rules above, optional cost.
- `PUT /v2/portfolio/holdings/{id}`: units/cost/manual value for the authenticated
  owner, never product/provider changes. An unchanged manual value retains its date.
- `PUT /v2/portfolio/holdings/{id}/manual-value`: explicitly reaffirm/update a
  manual value or clear it when units remain; timestamp is assigned by the DB.
- `DELETE /v2/portfolio/holdings/{id}`: removes record, never a broker transaction.
- `POST /v2/portfolio/snapshot`: DB-derived daily observation; no request values.
- `POST /v2/portfolio/scenarios/{plan|recommendation}`: amount, chosen route and
  optional Bitcoin provider only. Reloads saved plan, holdings, prices and ownership
  server-side, then calls the unchanged contribution engines/response serializers.

Canonical scenarios require complete **fresh** values. Stale/partial portfolios
cannot fall through to manually fabricated current values. No-holdings users may
still explore clearly hypothetical manual inputs in the existing stateless planner.
Product choices remain explicit; actual product IDs determine additional-purchase
ownership without inferring it from sleeve ownership. Profile changes and holdings
refreshes remount/clear contribution scenarios and temporary product confirmations.

Ask Arbor loads current portfolio facts only for relevant intents, retains the
decision boundary and never uses targets as actual holdings. No market-timing,
performance attribution or constituent-overlap data is invented. Missing migration
or temporary storage failure does not take down basic saved-plan explanations.
Next actions preserve foundation/short-term/historical priority, then direct empty
portfolios to recording holdings, incomplete/stale portfolios to data review, and
complete portfolios to contribution scenarios. Free users retain Compare Plans.

History starts at the first real stored observation. Current-day history does not
rewrite itself after later record edits. Changes in value can include edits/additions;
there is no contribution-versus-growth or gain/loss claim. The chart is reusable,
with accessible recorded values; floating point is used only for drawing coordinates,
never monetary calculations. Snapshot failure does not erase current valuations.

## Isolated validation (no hosted migration)

SQL tests execute the actual migration in isolated PostgreSQL/WASM:

```
ARBOR_PGLITE_PATH=/path/to/@electric-sql/pglite node --test tests/sql/live_portfolio.test.mjs
```

PGlite tests prove SQL permissions, RLS, constraints, decimal views and daily
idempotence. It is a single connection, not a multi-connection concurrency benchmark.

`backend/tests/e2e_portfolio_app.py` is a test-only ASGI entrypoint, never imported by
production `app.main`. Start on loopback with APP_ENV=test,
ARBOR_PORTFOLIO_E2E=true, LIVE_PORTFOLIO_ENABLED=true and the dedicated ARBOR_E2E_USER_ID supplied in environment,
using `uvicorn --app-dir tests e2e_portfolio_app:app`. It refuses deployed hosts and
any other account. It retains normal JWT verification and normal read-only hosted
profile restoration, but injects isolated process-only holdings/history and fixed
reference quotes. Restarting discards all fixtures. No account/profile reset exists.
With `LIVE_PORTFOLIO_ENABLED=false`, the same isolated entrypoint refuses any store
construction, making unintended disabled-mode storage access a test failure.
Use `node scripts/e2e/portfolio-disabled.mjs` for the disabled-mode smoke test.

From the normal local frontend run `node scripts/e2e/portfolio.mjs`. It uses
`withAuthenticatedBrowser`, requires the local fixture marker before mutations,
and tests add/edit/delete, group totals, contribution/Ask Arbor integration and
responsive themes. It never exports tokens or changes hosted profile/holdings.

**Pending live validation:** apply the migration intentionally, select/license and
configure a feed, then validate real Supabase persistence, timestamp freshness,
scheduled ingestion and history across calendar days with the disposable account.
These prerequisites are not satisfied by deterministic fixture browser tests.

## Production adapter preparation (3U-B.2)

### Contracts and scope

- Marketstack: fixed `https://api.marketstack.com/v2/eod/latest`, batched VT/VGT/BND
  only, unadjusted `close` in USD and vendor effective `date`. No ticker search or
  intraday/execution data. Missing/malformed batch preserves previous cache.
- ExchangeRate-API Open: fixed `https://open.er-api.com/v6/latest/USD`, retain only
  PHP and `time_last_update_unix`. No key needed for this chosen endpoint. One daily
  shared rate serves all ETFs/users. The keyed endpoint is intentionally not added.
- Coinranking: documented Bitcoin UUID `Qwsogvtv82FCd`, `/v2/coin/{uuid}/price` with
  PHP `referenceCurrencyUuid`. First resolve `/v2/reference-currencies` using PHP
  search + fiat type; require exactly one exact PHP fiat match. No guessed PHP UUID,
  no configurable arbitrary URL and no BTC→USD→PHP conversion. Persist the validated
  reference ID in the trusted BTC cache record for reuse. If it stops working, fail
  closed; an operator must investigate before changing reference identity.

`ReferencePrice` extends the existing Price contract with source, USD/PHP currency,
reference kind, fetched timestamp, verified identity, optional official provenance,
unit class and reference ID. Effective time is never replaced with fetch time to
make old data appear fresh. Decimal JSON parsing avoids binary floats; incoming
precision is rounded half-up to the existing cache's 12 fractional digits. No raw
vendor response reaches valuation or the frontend. Attribution uses fixed IDs/URLs.

The existing **unapplied** 3U-B SQL was extended with these cache columns and one
operator-only refresh coordination table/RPC. This is the migration to review and
apply later, not an already-installed schema upgrade. Authenticated users cannot
claim refresh slots or write reference prices. Snapshot freshness matches Python.

### Commands (server operator only)

From `backend/`:

```sh
.venv/bin/python -m app.market_data refresh
.venv/bin/python -m app.market_data set-nav dragonfi_global_equity 123.456789 2026-09-24 https://www.bpi.com.ph/official-source-page --unit-class 'PHP / Class P'
```

The NAV command above is syntax only: **not a real NAV or source page**. Enter the
actual latest official published value/date and the exact official source URL.
No website is fetched. The command does not touch user holdings, plans or snapshots.
Dates use midnight UTC conservatively, not an invented intraday publication time.
Future dates, non-positive/invalid values, wrong currency/class and non-official
provenance URLs are rejected. Older NAV dates cannot replace newer ones through CLI.

Server-only ignored environment variables:

- `SUPABASE_URL`: existing project URL.
- `SUPABASE_MARKET_DATA_KEY`: prefer a dedicated modern Supabase server secret key
  (`sb_secret_...`) for Arbor's market-data operator. Create/configure it only when
  production setup is explicitly authorized, and store it only in Render/backend
  secrets for the trusted operator environment. **Only the operator CLI** consumes
  it; never put it in frontend config, `NEXT_PUBLIC_*`, source control, or chat.
  Secret keys bypass RLS and are not restricted to market-data tables merely by
  giving them a dedicated name. Restrict access to the operator environment.
  Modern keys are sent only in `apikey`, with no `Authorization` header and no JWT
  decoding. JWT-shaped legacy `service_role` keys remain compatibility-only:
  they use `apikey` plus `Authorization: Bearer <legacy JWT>`. Supabase validates
  their signature and role; local shape detection does not grant privileges.
  Do not provision new setups with legacy keys. Missing/malformed credentials
  fail before network access with static, credential-free errors.
  The destination comes only from server-configured `SUPABASE_URL` (HTTPS project
  root); no user-request URL/key input exists. Cache operations are allowlisted
  and redirects are disabled.
- `MARKETSTACK_API_KEY`, `COINRANKING_API_KEY`.
- `MARKETSTACK_DISPLAY_RIGHTS_CONFIRMED`: explicit activation sign-off, not credentials.
- `LIVE_PORTFOLIO_ENABLED`: remains false until activation is approved.

No keys were created or installed. Never put secrets in CLI arguments, test fixtures
or NEXT_PUBLIC variables. HTTP logging is disabled in the CLI; failures print only
static codes. Requests use fixed HTTPS provider paths, ten-second timeouts and no
redirects/retries. The operator cache URL must be an HTTPS Supabase project root.

### Shared cache / request budget

Refresh is a callable, demand-driven **operator operation**, not a scheduler and
not a side effect of opening Portfolio. It skips values fetched within 24 hours
(ETF/FX) or 10 minutes (BTC). Atomic database claims coordinate overlapping CLI
processes and throttle failed attempts too. Normal readers only read the cache;
two users never cause two provider requests. No unused-background quota consumption.

Coinranking first resolution needs two requests, so the cold/unresolved path uses
a 20-minute cooldown; after a successful cached PHP reference it uses ten minutes.
About 4,320 calls per 30 days (4,464 per 31 days) at continuous ten-minute cadence,
plus initial resolution, stays below the assumed 5,000 allowance for this dedicated
key. Other consumers of the same key must be budgeted separately. There is no polling
loop here. A future demand-triggered trusted worker can invoke this operation; until
then operators must refresh when needed and stale/unavailable behavior is intentional.
Failure of any source retains its old cache and does not prevent unrelated sources
from updating. A database failure produces safe operational errors, not fake prices.

### Exact fund identity / activation status

| Existing product ID | Required identity | Ingestion status |
| --- | --- | --- |
| gcash_global_equity | ATRAM Global Equity Opportunity Feeder Fund — PHP Unit Class | Exact class required; official NAV still operator-verified |
| gcash_technology | ATRAM Global Technology Feeder Fund — A PHP Unit Class | Exact class required; official NAV still operator-verified |
| gcash_defensive | ATRAM Medium Term Peso Bond Fund — A Unit Class | Exact class required; official NAV still operator-verified |
| dragonfi_global_equity | BPI Global Equity Fund-of-Funds — PHP / Class P | Explicit required mapping; operator must verify official NAV source |
| dragonfi_technology | BPI World Technology Feeder Fund — PHP / Class P | Explicit required mapping; operator must verify official NAV source |
| dragonfi_defensive | BPI Premium Bond Fund — PHP | Explicit required mapping; operator must verify official NAV source |

ATRAM requests cannot silently select a class. Ingestion, cache validation and snapshot
checks require the exact classes above. The 3U-B.3 identity review matches the
TOAP participating-fund listings: [Global Equity](https://www.uitf.com.ph/daily_navpu_details.php?fund_id=420),
[Technology](https://uitf.com.ph/daily_navpu_details.php?bank_id=31&fund_id=327),
and [Medium Term Bond](https://www.uitf.com.ph/daily_navpu_details.php?fund_id=240).
This verifies identity, not a current NAV value or commercial permission.
An ETF-only portfolio does not require six fund NAVs. Unavailable fund values are
null, never zero. No standardized allocation or implementation provider mapping changed.

### Attribution, terms and estimated cost

Holding providers (GCrypto/Coins.ph/PDAX, etc.) remain distinct from reference-data
sources. Portfolio displays `Crypto data by Coinranking`, `Rates By Exchange Rate API`
and Marketstack attribution once where their data is used, with accessible fixed
links. These are not executable provider quotes or endorsements. History continues
to use Arbor snapshots, never TradingView widgets.

Planning estimate: existing Marketstack Basic approximately **US$9.99/month**;
Coinranking Free $0; ExchangeRate-API Open $0; manual official NAV $0. No additional
paid source is introduced. Prices and terms can change; this is not a guaranteed
quote. Confirm the Basic subscription is active before activation. User-entered
manual fund values also cost $0; no additional data subscription is needed.

References inspected for implementation:

- [Marketstack EOD documentation](https://docs.apilayer.com/marketstack/docs/api-documentation): confirm customer-facing cached/derived-value use under the actual Basic agreement.
- [Coinranking reference currencies](https://coinranking.com/api/documentation/reference-currencies) and [price endpoint](https://coinranking.com/api/documentation/coins/coin-price): reference valuation with attribution; confirm current terms, no raw API resale or generic redistribution.
- [Coinranking Free pricing](https://coinranking.com/api/pricing): 5,000 calls is a planning budget, not a promise by Arbor.
- [ExchangeRate-API Open](https://www.exchangerate-api.com/docs/free): daily caching and commercial conversion with attribution; no FX API redistribution.
- Fund NAV: operator-entered official published values only; no scraping or claimed API partnership.

### Exact eventual hosted activation sequence — NOT executed

1. Activate Marketstack Basic before enabling private-beta access (permission confirmed by the product owner).
2. Configure Marketstack key server-side.
3. Configure Coinranking key server-side and confirm intended-use terms.
4. Confirm ExchangeRate-API Open endpoint/attribution (no key required).
5. Reconfirm exact ATRAM class identities against each official NAV input.
6. Collect current official ATRAM/BPI NAV inputs offline; do not write before migration.
7. Review the revised 3U-B migration.
8. Apply only `3u_b_live_portfolio.sql` deliberately.
9. Keep `3u_a_ask_usage.sql` unapplied (separate Free-quota launch prerequisite).
10. Validate hosted holdings RLS.
11. Validate history RLS.
12. Validate cache-write and refresh-RPC restrictions; configure isolated writer secret.
13. Run production market-data refresh and enter the reviewed NAV inputs.
14. Verify VT/VGT/BND.
15. Verify USD/PHP.
16. Verify direct BTC/PHP and attribution.
17. Verify six fund NAV records/classes.
18. In a controlled enabled validation environment, use the disposable hosted account for Add/Edit/Delete.
19. Verify portfolio PHP total.
20. Verify target-versus-current.
21. Verify snapshot creation.
22. Verify canonical contribution integration.
23. Verify Ask Arbor holdings context.
24. Verify next actions.
25. Set production `LIVE_PORTFOLIO_ENABLED=true` only after sign-off.
26. Restart/redeploy as required.
27. Run production smoke tests.
28. Monitor errors and freshness.

Rollback: disable flag first, restart/reload, verify normal manual fallback flows,
retain holdings/history/cache, then investigate. Do not drop tables/delete user
holdings as a first response. No activation step above was performed in 3U-B.2.

## 3U-B.2A — official NAV source discovery (2026-09-24)

**Outcome: no category-A source established; no automatic NAV adapter enabled or
implemented. Manual official NAV remains the preferred available path.** Public
availability is not commercial reuse permission. The classifications below are
conservative engineering activation decisions, not legal conclusions.

### ATRAM / TOAP

Public GET HTML identity pages (no credentials):

- `https://www.uitf.com.ph/daily_navpu_details.php?fund_id=420` — Global Equity PHP Unit Class.
- `https://www.uitf.com.ph/daily_navpu_details.php?fund_id=327` — Global Technology A PHP Unit Class.
- `https://www.uitf.com.ph/daily_navpu_details.php?fund_id=240` — Medium Term Peso Bond A Unit Class.

The inspected fund-420 HTML returned 200. Public page code references:

| Surface | Method | Observed contract / limits |
| --- | --- | --- |
| `https://www.uitf.com.ph/daily_navpu.php` | GET form | `bank_id` selection; HTML, not a documented API |
| `https://www.uitf.com.ph/daily_navpu_details_call_ajax.php` | POST | DataTables data source; page form includes `bank_id`, `fund_id`, `verification_id`, `date_from`, `date_to`, and CAPTCHA validation. Expected row fields include `navpu_value`, `yoy_value`, `ytd_value`, `date`. Endpoint response/complete parameter contract NOT tested. |
| `https://www.uitf.com.ph/daily_navpu_details_json.php` | GET | Referenced by chart JavaScript; JSON intended by page code. Parameters/response NOT validated; endpoint not requested. |
| CSV export | Browser DataTables button | `csvHtml5` export code exists; no independent official CSV feed established. |

These are page implementation details, not documented public integration contracts.
No form was submitted, CAPTCHA solved/bypassed, or underlying endpoint probed.
The initial page/robots discovery preceded learning the site's 60-second crawl delay;
subsequent HTML inspection was spaced, and no bulk fund retrieval was performed.
`https://www.uitf.com.ph/robots.txt` returned 200 with `Allow: /` and `Crawl-Delay: 60`.
That does not grant data reuse rights.

[TOAP terms](https://www.uitf.com.ph/disclaimer.php) restrict copying, distribution,
publication/display and exploitation, and reference personal noncommercial use.
**Category C for Arbor's proposed automated commercial use under these published
terms.** No TOAP production adapter, parser or fallback scraping was implemented.
An alternative directly licensed ATRAM feed remains unverified, not assumed available.
Written source permission and an approved stable contract are prerequisites.

### BPI Wealth

The public [Investment Funds Monitor](https://www.bpi.com.ph/group/bpiwealth/analyst-insights/investment-funds-monitor)
returned 200 HTML. Normal Chrome inspection confirmed separate Class A/Class P rows,
Premium Bond, an archive and a downloadable PDF. The visible table was dated Sep 22
while the PDF label was Sep 23; footnotes also identify t-2 prices. A future parser
must establish each observation's true effective date, not assume the file date.

Observed public GET file (linked, not a guessed URL):

`https://www.bpi.com.ph/content/dam/bpi-wealth/investment-funds-monitor-pdfs/2026/09-september/Investment%20Funds%20Monitor%2009.23.2026.pdf`

The download link optionally adds `?download=true`; intended response is PDF.
The research tool could not retrieve that file; no parser or reliable PDF schema was
validated. Archive names vary historically, so predictable filenames are not a contract.
Public HTML references AEM `simpletable` and `listdownload` client libraries. No
documented NAV JSON/CSV/XML API or supported integration endpoint was established.
Browser rendering and public HTML were inspected; a complete network capture was not
available, so this is not proof that no other endpoint exists.

Official fund surfaces:

- `https://www.bpi.com.ph/group/bpiwealth/our-solutions/personal/investment-solutions/funds/world-technology-feeder-fund`
- `https://www.bpi.com.ph/group/bpiwealth/our-solutions/personal/investment-solutions/funds/premium-bond-fund`
- [Official multi-class notice](https://www.bpi.com.ph/group/bpiwealth/news/important-notice-conversion-of-global-equity-fund-of-funds-and-bpi-world-technology-feeder-fund-to-a-multi-class-structure)
  confirms Global Equity and World Technology Class P is PHP; Class A is USD.

The monitor's expanded disclaimer limits the material to the reader's sole use;
the footer reserves rights. **Category C for adopting this public material as an
automated commercial display feed without separate permission.** A separately
licensed BPI structured feed would require a new review. No permission or attribution
license was found that makes automated reuse permissible merely by crediting BPI.
`https://www.bpi.com.ph/robots.txt` returned 200; it excludes admin/search/image-upload
paths but does not expressly exclude the monitor. Robots access is not a reuse license.

### Safe operation and future adapter requirements

`python -m app.market_data refresh` now reports both `atram_nav` and `bpi_nav` as
`not_enabled_source_permission_required`, even before storage setup. These are
status-only entries: no HTTP, cache reads, leases, environment enable switch or hidden
scraper. Existing ETF/FX/BTC refresh remains independent. No extra subscription added.

Manual `set-nav` retains exact class, PHP currency, positive Decimal, provenance and
effective date checks. No TOAP provenance host was added to the manual allowlist.
Operators must use an authorized official source; manual operation does not itself
settle commercial display rights. Holdings provider and NAV publisher stay separate.

Future approved NAV refresh should run once per banking day after publication, shared
across users; no per-user fetch or minute polling. No new banking calendar/scheduler is
implemented. The generic refresh boundary now retains existing NAV on older **or equal**
effective dates, protecting manual same-date corrections; only a newer valid automatic
observation may replace it. An operator can still deliberately correct the same date.
Concurrent manual writers should be serialized operationally; this is not a new atomic
multi-writer precedence guarantee. No automatic NAV writer currently exists.

Source failure must retain cache without changing effective dates. NAV remains fresh
through 48 hours, dated cached fallback through seven days, then unavailable—not zero.
Fund NAV values are delayed daily valuations, not live trading quotes.

Required next step: obtain written automated-access, caching, derived/display and
commercial-use permission, attribution requirements, an exact approved feed contract
and publication-date semantics. Then implement/mock-test that contract, validate a
minimal permitted live read and hosted persistence later. Live Portfolio remains off;
both 3U-A and 3U-B migrations remain unapplied. No hosted settings or data changed.
