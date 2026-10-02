# Prospective tracker history maintenance — local proposal

The current refresh command captures daily TOAP NAVs but only updates the live
ETF/BTC/Exchange Rate API cache. The reconstruction reader requires dated
Marketstack, Coinranking and BSP facts. This patch adds prospective observations
without changing holdings, investment accounting, snapshots, coverage rules or
chart presentation.

`ARBOR_AUTOMATIC_HISTORY_ENABLED=true` opts the existing refresh command into
ETF/BTC history capture and public BSP ingestion. Absent/false retains the old
refresh behavior, including existing TOAP capture. No cron definition changes.

Validated latest ETF/BTC responses are reused, with their original source time,
currency and provenance. Cached ETF/BTC observations are also captured on cached
ticks to repair a failed historical write without another vendor call. Existing
source leases/cadences remain unchanged. Marketstack calls do not increase.
Current Exchange Rate API quotes never become historical BSP observations.
BSP's official daily archive is parsed using the existing source parser; only
published dates in a seven-day tail are appended, on the existing daily FX
lease, even when the live FX source fails. This is a bounded repair window, not
a global coverage cutoff. BSP failure waits until the next eligible daily FX
attempt; it does not trigger five-minute archive downloads. The archive adds up
to its existing 20-second request timeout to the FX refresh attempt.

Non-NAV writes use PostgREST `resolution=ignore-duplicates` against the existing
`(price_key, observed_at)` primary key, in batches of at most 100. Repeated or
concurrent capture cannot replace an existing observation. Existing guarded NAV
merge behavior is preserved. A non-NAV vendor correction for the same timestamp
is retained in history; the unchanged live cache may accept the revised quote.
After each append, bounded exact-key reads compare stored value/source/currency
with the incoming observation and report `historical_observation_conflict` if a
revision was ignored. Retrieval provenance/fetch timestamps can differ between
latest and dated imports without constituting a price correction. Correction
resolution still needs separate operator review/reconciliation. Existing historical rows and unsupported older data are not repaired
by this patch.

History failures print a sanitized `SOURCE/history: history_capture_failed`
status (or `historical_observation_conflict` for a detected correction) and make
the command exit nonzero while preserving successful live updates. Cached ETF/BTC observations retry on the next cached tick. Pre-April 21,
2026 VGT is excluded per instrument from both automatic capture and the dated
Marketstack importer. Automatic capture reports `vgt_split_review_required` if
such VGT is encountered. VT/BND/BTC/FX have no analogous cutoff. The stated VGT
8:1 split remains a separate accounting qualification gate: no pre-split VGT
import, unit conversion or split accounting is implemented. Dates with missing
provider facts remain missing; no interpolation, invented source dates,
nonpublishing-day assumptions or chart smoothing.

## Chosen activation sequence — parent review required

1. Integrate the cloud patch with the owner's current Mac checkout. Reconciled cloud base
   is `c0fd6cedba313b861cd5860c23241a02a4190935`, remote/main verified October 1,
   2026. Separate checkout `/workspace/arbor-tracker-reconciled`, branch `main`.
   Its latest backend commit is `f661960d2f428ee75747f80bb9528eae27e185f4`.
   The original patch applied without conflicts. Parent must finish the Terms
   checkpoint and compare pending Mac work before integrating or releasing.
2. Reverify production schema, historical table primary key/source constraints,
   NAV guard, service-role permissions, quote/source dates, current job build/HEAD,
   source rights and existing vendor budget. No credentials need copying here.
   The historical migration must already exist before capture is enabled.
3. On a disposable local database, verify insert-only conflict/concurrency
   behavior against real PostgREST and the deployed schema. This cloud task used
   mocked HTTP only; no local PostgreSQL/PostgREST server was available.
4. After authorized integration/release, deploy reviewed code with the flag off.
   Then explicitly enable the flag on the existing operator job and inspect one
   eligible refresh's sanitized statuses and read-only source-date boundaries.
   Check history vs live provenance, not equality across different FX providers.
   FX history uses BSP while live valuation keeps Exchange Rate API, so amounts
   can differ legitimately. Reverify the chart's honest missing-date coverage.
5. Watch subsequent weekday/EOD/BSP publication cycles and job failures. The daily
   BSP lease can poll before publication, so same-day BSP is not guaranteed;
   the next eligible capture repairs a late release within the seven-day tail.
   Roll back prospective capture by disabling the flag; retain genuine history.

## BTC timeline and PHP/USD requirements

Capture stores genuine Coinranking PHP-reference observations with the provider
`as_of` timestamp, validated PHP reference identity, and separate `fetched_at`.
The unchanged reader selects the latest genuine BTC timestamp on each UTC
valuation day, before the next day's cutoff. It cannot borrow a BTC observation
from a different day or use fetch dates to fabricate dates. Its PHP value is
owned BTC units times the dated BTC/PHP price. USD value additionally requires
an eligible dated BSP PHP-per-USD rate and divides that PHP value by the rate.
Without BSP FX, a BTC-only point can have PHP value with USD null. ETF-containing
portfolios also need dated FX for complete PHP values. Weekend/verified-closure
FX fallback retains the existing four-day bound and missing-weekday guards;
this patch does not change those rules. The BSP history series can legitimately
differ from the current Exchange Rate API used for live valuations.

These reader requirements were inspected in migration SQL and existing SQL
fixtures. The mocked ingestion tests verify source timestamps and currency
identity; no real PostgreSQL/PostgREST reader test was executed in this cloud run.

## Separate backfill gates

This patch cannot reconstruct missed ETF/BTC dates from current quotes. Use
already-authorized, genuine dated provider files if available, otherwise obtain
separate approval/budget verification before any Marketstack historical call.
Do not run `history_cli` in production as part of activation: it makes paid
Marketstack requests and may fetch Coinranking history. Older BSP rows can be
read from the public archive using the existing parser, then imported only under
separate bounded production-write approval. TOAP historical access/export rules
remain unchanged. VGT older than the split day stays blocked until split-safe
unit accounting and fixtures are qualified. Existing same-timestamp historical
corrections and any corporate actions require explicit review. No production
boundary is asserted current by this local run; the September 28/30 discrepancy
is prior audit context only.

## Local verification

399 affected backend tests passed against reconciled remote main with synthetic
Supabase configuration and mocked vendor responses. The full backend suite also
passed: 3,710 passed, 2 skipped. The initial full run had 16 subprocess setup
failures because `.venv/bin/python` was missing; a temporary symlink to the
existing shared virtualenv resolved them. The symlink was removed after testing. New fixtures cover invalid prices (including values
rounding to zero), identity/currency/future-date rejection, effective UTC dates,
cache retries, idempotence, conflicting-observation retention, BSP sparse/error
behavior, cooldowns, CLI activation and error exit status, and VGT exclusion.
Pinned installed dependencies match `requirements.txt`; `pip check` passed.
No dependency/version change, migration, frontend edit, production operation,
commit, push or deployment was performed.

Supabase persistence reference: [official upsert documentation](https://supabase.com/docs/reference/python/upsert).
The skill-requested changelog check was attempted; this environment received
HTTP 403 from `https://supabase.com/changelog.md` (browser also could not parse
it). No new Supabase feature/schema is introduced.


## Independent review and exact request bounds

Activation flag: `ARBOR_AUTOMATIC_HISTORY_ENABLED=true` on the existing server
operator job. Command: `python -m app.market_data refresh`. Flag wiring:
`backend/app/market_data/__main__.py`; capture orchestration: `refresh.py`;
prospective quote/BSP conversion: `automatic_history.py`; existing parsers:
`adapters.py` and `history_sources.py`; insert/read-back policy: `cache.py`.
No startup or browser route starts vendor ingestion. No flag or job was changed.

The opt-in adds **zero paid Marketstack/Coinranking calls**. Existing atomic
leases cap request attempts, including failures, per half-open 24-hour interval:
Marketstack interval 21,600 seconds permits at most 4 latest requests (each up to
3 ETF quotes); live Exchange Rate API interval 86,400 seconds permits 1 request;
BSP shares that same claim and adds at most 1 public archive request, with no
pagination, retry or redirect. Archive responses remain capped at 1 MB and the
existing parser bounds decompressed parts. BSP captures only actual dates in
`UTC today - 7 days` through `UTC today`, at most 8 dated observations. A seven-day
outage can be repaired within this inclusive tail; older BSP gaps require an
explicit bounded import, never an unbounded automatic request.

Coinranking's existing 540-second lease caps price attempts at 160 per half-open
24-hour interval. Missing cached PHP identity uses a 1,200-second lease, with at
most two requests per attempt (identity then price), so at most 72 identity
requests when identity remains unavailable. These are conservative component
ceilings; identity and established-cache modes share one lease and are not
independent budgets. In the ordinary five-minute schedule with cached PHP
identity, price requests occur every two ticks: at most 144 per day. The mock
288-tick day made 144 BTC price requests plus one bootstrap identity request,
4 Marketstack requests, 1 current-FX request, and 1 BSP request. Existing TOAP
source/day guards and request gate are unchanged.

Historical insertion batches are at most 100 rows. Read-after-write verification
uses exact pairs of price key and provider timestamp, at most 25 keys per read,
to bound URL length and response size. An ordinary cached tick adds at most two
history POSTs and two history GETs (ETF and BTC); daily BSP adds one POST and one
GET for its at-most-eight observations. This is shared-cache traffic, not vendor
traffic. Duplicate primary keys never grow the dataset or change stored facts;
BTC intentionally retains distinct genuine provider timestamps, and the reader
selects the latest real observation on each UTC day. The simulated day's frozen
EOD source date produced 3 ETF history rows despite 4 vendor polls, plus 144 real
BTC timestamps and one actual BSP date. No history is created on fetch dates.

Market closure/source-age behavior remains conservative: repeated old EOD/BSP
facts retain their original source date, never a new weekend/fetch date. Live
freshness limits remain unchanged. The canonical reader still uses genuine BTC
same-day timestamps and its existing weekend/confirmed-closure/date bounds for
ETF/FX; missing weekday data cannot be silently treated as a closure. Latest
ETF/BTC endpoints cannot recover every missed historical day under this request
budget. Cached facts can repair failed inserts, and the BSP tail repairs recent
published FX dates; older/missed ETF/BTC facts need separately authorized genuine
provider data. This limitation is intentional, not a coverage guarantee.

Independent review fixed two issues: silent non-NAV same-timestamp corrections
now produce a visible conflict; verification reads are split into 25-key groups
so 100-row import batches do not risk oversized filter URLs. Mock fixtures cover
post-insert conflict/race outcomes, malformed/incomplete reads, valid differing
retrieval metadata, bounded import URLs, and a whole synthetic five-minute day.

Local runtime discovery found Docker 28.4.0 and a reachable daemon, but **no
cached container images**, PostgreSQL binaries, PostgREST executable, or Supabase
CLI. Real isolated verification cannot run using already-available components;
it requires a new runtime/image download. No install or image pull was made.
Real PostgREST SQL semantics, permissions, concurrency and canonical reader
execution remain explicitly unverified, despite mock HTTP verification.

## Current local qualification after Terms and P1 release — 2 October 2026

Requalified on published source base
`79f85084a22b96a471bea23041991da713e9f280` (Terms grant/release-record-only
successor of `23e93842e8755dab077dcf0bf94539c8aab01e0f`). Reviewed original
nine-path patch applied without conflicts. All eight runtime/test files retain
the reviewed bytes; this document adds the current qualification record.

Fresh full backend:3,729passed,two existing optional SQL skips; focused ingestion
selection:179passed. Python syntax and patch/diff checks pass. No frontend path,
dependency, schema migration or frozen accounting/history-reader source changes.

Actual fresh disposable local PostgreSQL17.11/PostgREST:17capture checks and all
12historical reader scenarios pass. Terms schema is present and enforcement ON;
synthetic Auth fixtures obtain an explicit intent through the anon RPC before
receipt-bound insertion. Owner data writes/reads use authenticated fixtures with
actual session claims. Legacy INSERT/UPDATE/DELETE use allowed app columns and
normal app role under the published P1 guard; the prior privileged workaround
is removed. No private-function EXECUTE or additional app-table grants were added.
The legacy opening/snapshot invalidation case now passes. Local Auth is a mock,
not GoTrue qualification. Fixture adapters are delivery evidence only, excluded
from the nine-path runtime patch.

Prospective capture remains default OFF. No flag, production history, cron,
account, vendor request or backfill changed during qualification. Read-only shared
cache inventory confirms Sep29-Oct1 missing for VT/VGT/BND/BTC/BSP; rows are
bounded future proposal, not imported. Exact saved BSP archive yields three
published FX rows with original capture timestamp; zero new source requests.
ETF/BTC facts remain unavailable until separately authorized bounded requests.
No pre-Apr21 2026 VGT, unit adjustment, older BND/VGT or chart-rule change.
