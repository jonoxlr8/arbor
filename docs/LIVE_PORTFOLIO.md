# PHP Live Portfolio (3U-B)

Manual records of investments already owned; reference valuation, not execution,
custody, broker linking or a recommendation. V1 holdings remain unchanged.

## Release prerequisites — NOT applied

`backend/migrations/3u_b_live_portfolio.sql` is prepared only. Review and deliberately
apply it before exposing the Portfolio feature in a release. No hosted migration
was applied during development. The separate **3U-A Ask Arbor quota migration is
also still unapplied**; this feature does not apply or depend on it for Plus users.

Production adapters are prepared for Marketstack Basic, ExchangeRate-API Open and
Coinranking Free. **No production credentials, hosted ingestion or activation was
configured by this milestone.** Commercial/display rights and hosted validation
remain activation prerequisites. No scraper, scheduler or browser vendor calls.

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
7. Verify commercial use and display rights.
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
remain prepared and unapplied by this work. Neither is run by application startup.

### Rollback

Disable the feature flag first and restart/reload as above. Confirm manual
contributions, chat and saved plans remain available. Do not immediately delete
holdings, snapshots, prices or migration data. Older application code can ignore
these additive tables. No existing profile JSON changes are needed.

## Data and ownership

- `arbor_portfolio_holdings`: authenticated owner defaulted from `auth.uid()`, UUID,
  canonical product/provider, positive units (12 fractional digits), optional total
  PHP cost basis (2 fractional digits), timestamps. One record per owner/product;
  update total units rather than inserting duplicate lots.
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
- `POST /v2/portfolio/holdings`: supported provider/product, units, optional cost.
- `PUT /v2/portfolio/holdings/{id}`: units/cost only for the authenticated owner.
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
- `SUPABASE_MARKET_DATA_KEY`: separately configured privileged cache-writer credential
  (service-role/secret capability); **only the operator CLI** consumes it. Prefer a
  dedicated restricted writer deployment/secret store; never frontend or user routes.
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
| gcash_global_equity | ATRAM Global Equity Opportunity Feeder Fund; exact PHP unit class to verify | Blocked/unverified |
| gcash_technology | ATRAM Global Technology Feeder Fund; expected A PHP class, not proven by catalog | Blocked/unverified |
| gcash_defensive | ATRAM Medium Term Peso Bond Fund; exact PHP/A identity unresolved | Blocked/unverified |
| dragonfi_global_equity | BPI Global Equity Fund-of-Funds — PHP / Class P | Explicit required mapping; operator must verify official NAV source |
| dragonfi_technology | BPI World Technology Feeder Fund — PHP / Class P | Explicit required mapping; operator must verify official NAV source |
| dragonfi_defensive | BPI Premium Bond Fund — PHP | Explicit required mapping; operator must verify official NAV source |

ATRAM requests cannot silently select a class. They fail ingestion and cache-reader
validation; snapshots also exclude unverified fund identities. Resolve evidence and
update the narrow identity allowlist and snapshot checks before accepting those NAVs.
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
quote. Confirm the actual subscription and display rights before activation.

References inspected for implementation:

- [Marketstack EOD documentation](https://docs.apilayer.com/marketstack/docs/api-documentation): confirm customer-facing cached/derived-value use under the actual Basic agreement.
- [Coinranking reference currencies](https://coinranking.com/api/documentation/reference-currencies) and [price endpoint](https://coinranking.com/api/documentation/coins/coin-price): reference valuation with attribution; confirm current terms, no raw API resale or generic redistribution.
- [Coinranking Free pricing](https://coinranking.com/api/pricing): 5,000 calls is a planning budget, not a promise by Arbor.
- [ExchangeRate-API Open](https://www.exchangerate-api.com/docs/free): daily caching and commercial conversion with attribution; no FX API redistribution.
- Fund NAV: operator-entered official published values only; no scraping or claimed API partnership.

### Exact eventual hosted activation sequence — NOT executed

1. Confirm Marketstack customer-facing display rights.
2. Configure Marketstack key server-side.
3. Configure Coinranking key server-side and confirm intended-use terms.
4. Confirm ExchangeRate-API Open endpoint/attribution (no key required).
5. Verify exact ATRAM class identities and resolve blocked mappings.
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
