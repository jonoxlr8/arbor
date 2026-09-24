# PHP Live Portfolio (3U-B)

Manual records of investments already owned; reference valuation, not execution,
custody, broker linking or a recommendation. V1 holdings remain unchanged.

## Release prerequisites — NOT applied

`backend/migrations/3u_b_live_portfolio.sql` is prepared only. Review and deliberately
apply it before exposing the Portfolio feature in a release. No hosted migration
was applied during development. The separate **3U-A Ask Arbor quota migration is
also still unapplied**; this feature does not apply or depend on it for Plus users.

There is **no approved production market-data source configured**. No scraper,
public endpoint with unverified terms, or market-data credential was introduced.
Production prices remain unavailable until an approved, licensed server-side feed
populates the shared price cache. Do not deploy expecting automatic external price
ingestion: provider selection, licensing and ingestion are release prerequisites.

## Production-safe availability (3U-B.1)

`LIVE_PORTFOLIO_ENABLED` is server-only and defaults to **false**. Only the exact
value `true` enables it. Missing, empty or unrecognized values fail closed.
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
| ETF and USD/PHP | 15 minutes | 4 days (weekends/holidays) |
| BTC/PHP | 5 minutes | 1 hour |
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
