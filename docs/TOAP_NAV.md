# Authorized daily fund NAVPU ingestion

## Scope and release status

The founder confirmed permission for daily automated retrieval of the two TOAP /
UITF.com.ph pages below for Arbor portfolio tracking. This supersedes the earlier
3U-B.2A source-permission gate **for these pages and six classes only**, not fund
history, ROI/YTD data, unrelated funds or direct ATRAM/BPI website scraping.

This implementation is local and uncommitted. No deployment, hosted migration,
cache write, feature-flag change or cron creation was performed. Historical feature
status in older milestone notes is not a current production availability check.

## Exact source contract

| Canonical product | Exact source fund/class |
| --- | --- |
| `gcash_global_equity` | ATRAM Global Equity Opportunity Feeder Fund (PHP Unit Class) |
| `gcash_technology` | ATRAM Global Technology Feeder Fund (A PHP Unit Class) |
| `gcash_defensive` | ATRAM Medium Term Peso Bond Fund (A Unit Class) |
| `dragonfi_global_equity` | BPI GLOBAL EQUITY FUND-OF-FUNDS CLASS P (PHP CLASS) |
| `dragonfi_technology` | BPI WORLD TECHNOLOGY FEEDER FUND CLASS P (PHP CLASS) |
| `dragonfi_defensive` | BPI PREMIUM BOND FUND |

- ATRAM: <https://uitf.com.ph/daily_navpu.php?bank_id=31>
- BPI: <https://uitf.com.ph/daily_navpu.php?bank_id=3>

Only case and whitespace are normalized. No fuzzy matching or alternate classes.
The shared standard-library HTML parser reads tables identified by their Fund Name
and NAVpu headers. It reads the NAV cell, not ROI/YTD columns. Representative small
synthetic HTML fixtures cover the observed structure; tests never call the source.

A fund-specific `as of` date wins. Otherwise use the unique page-heading date.
Malformed individual dates fail closed, never falling back to a newer page date.
Missing/conflicting heading dates reject only rows that need the page date.
Date-only observations use the existing midnight-UTC convention; fetch time never
replaces the effective date. Future dates are rejected, including future page dates.

Values must be finite, positive Decimal, below the existing price maximum and
nonzero at the cache's 12-place precision. Zero, malformed NAV, missing fund or
duplicate exact-class rows fail individually. Other valid rows can still refresh.

## Storage, precedence and snapshots

Existing `ReferencePrice` / `SharedCache` fields are reused:

- `source=toap`, with display attribution **NAV data by TOAP / UITF.com.ph**;
- `kind=nav` (NAVPU), `currency=PHP`, canonical `price_key` and existing `unit_class`;
- `provenance`: exact canonical page URL; `reference_id`: exact observed fund name;
- `as_of`: source effective date; `fetched_at`: trusted refresh timestamp.

No raw HTML or ROI/YTD data is stored. Holding provider remains GFunds or DragonFi.
Normal API/browser readers never fetch vendors or obtain operator credentials.

Newer effective dates may replace older NAVs. Older and equal-date automatic rows
are no-ops, preserving manual operator corrections and preventing weekend rewrites.
An operator may still correct the same effective date using `set-nav`; older manual
dates remain rejected. The prepared database trigger also enforces precedence during
concurrent upserts, closing the read/write race. It never deletes cached data.

**Unapplied prerequisite:** `backend/migrations/20260925114901_toap_nav_ingestion.sql`.
The already-applied base migrations were not edited. This narrow migration expands
the operator-only lease allowlist, adds the write-time NAV guard, and authorizes the
exact TOAP source/class predicate in snapshot capture. Its arithmetic/fallback tail
is byte-identical to 3U-B.5. It adds no holding columns and changes no owner RLS or
client write permissions. Do not deploy automatic refresh without this prerequisite:
old lease rules reject the source, and old snapshot rules do not recognize TOAP.

NAV freshness is unchanged: fresh through 48 hours, dated fallback through 7 days,
then unavailable. Acceptable stale NAV still wins when units exist but blocks a fresh
snapshot. A manual-only holding still uses its valid user-entered whole-holding value,
even when a NAV exists. No units are invented. Manual current-value freshness remains
7 days. Attribution is added only to the existing data-source footer; no UI redesign.

## Operator refresh and safe failure

From `backend/`, with secrets already loaded securely into the process environment:

```sh
.venv/bin/python -m app.market_data refresh
```

Existing Marketstack VT/VGT/BND, USD/PHP and direct BTC/PHP sources still refresh.
The two TOAP sources add **at most one request each** per claimed Philippine calendar
day, shared across users/processes by existing atomic database leases. Calendar days
avoid skipped daily runs from a few seconds of scheduler jitter. Other vendor
cadences are unchanged. No per-fund requests, redirects, retries or detail/history
pages. HTTPS exact URLs only; Arbor-identifying User-Agent, 10-second timeouts, 2 MB
stream limit. A shared in-process gate spaces the two pages at least 60 seconds apart,
respecting the crawl delay recorded during source investigation. Use only one cron;
do not launch parallel manual refreshes against it.

Failures consume that day's source lease and retain previous cache. They do not stop
unrelated sources. Investigate source errors; do not bypass leases for retry loops.
Sanitized output reports `updated`, `cached`, `cooldown`, `partial`, `unavailable`,
`disabled_by_config` or static source errors. Partial/unavailable output includes
canonical product IDs and safe reason codes. CLI exits nonzero on partial/source
failure after continuing other sources. No HTML, credentials or raw exception text.

`TOAP_NAV_ENABLED` defaults to `true` for the trusted operator CLI; only the literal
case-insensitive `true` enables it. Set `false` to disable both source reads/leases.
This is not the Live Portfolio flag and does not expose a browser capability.
The existing `set-nav` command remains unchanged, using verified ATRAM/BPI official
URLs, exact class, effective date and Decimal. It is still the emergency correction
path; the manual command's URL allowlist has not been widened to arbitrary TOAP URLs.

## Proposed Render cron — do not create yet

Read-only service inventory showed one Arbor API web service and no existing cron
to reuse. After a successful separately authorized manual hosted validation, create
**one** Python cron service from the same repository/revision, root `backend`:

- Build: `pip install -r requirements.txt`
- Command: `python -m app.market_data refresh`
- Schedule: `0 14 * * *` — **14:00 UTC = 22:00 Philippines**, every day.
- Secrets: `SUPABASE_URL`, `SUPABASE_MARKET_DATA_KEY`, `MARKETSTACK_API_KEY`,
  `COINRANKING_API_KEY`. ExchangeRate-API Open and TOAP need no key.
- Optional nonsecret rollback config: `TOAP_NAV_ENABLED`.

Use a dedicated restricted-access environment group if one exists; do not blindly
copy all API secrets. The market-data Supabase key is server-side and bypasses RLS;
its name does not limit its privileges. Never give it to the frontend or user APIs.
No OpenAI key, user JWT, monthly flag or Live Portfolio flag is needed by this command.

[Render cron documentation](https://render.com/docs/cronjobs) specifies UTC scheduling,
one active run per cron, and a separate **US$1/month minimum per cron service**, with
runtime billing. Confirm pricing again when provisioning. This time is an initial
conservative operational choice, not a guaranteed publisher SLA. Weekends/holidays
retain unchanged dated NAVs safely.

**Daily is the fund ingestion cadence, not a guarantee of intraday ETF/FX/BTC
freshness.** BTC still expires under its existing short freshness window; a daily
cron alone cannot keep BTC continuously fresh. Do not change those limits or add
high-frequency fund polling. Any future frequent non-fund refresh must keep TOAP's
daily lease behavior (or disable TOAP on that operator invocation).

## Separate hosted approval sequence

1. Review code, tests and this unapplied migration; authorize the hosted changes.
2. Apply only the TOAP prerequisite migration; verify RLS/lease/snapshot source rules.
3. Deploy the reviewed adapter revision, without changing product availability flags.
4. Run the trusted operator refresh manually once. Inspect sanitized statuses and
   all six hosted rows: exact class, PHP Decimal, effective/fetched times and source.
5. Use disposable holdings only: verify units × usable NAV; NAV over manual value
   with units; manual-only values unchanged; snapshot consistency; ordinary clients
   cannot write shared cache or claim leases. Clean disposable holdings/snapshots.
6. Only after that passes, authorize creation/enabling of the single daily cron.
   Observe its first scheduled run, partial/failure exit status and next-day lease.

No hosted step above was executed in this milestone.

## Rollback

Disable the cron and/or set `TOAP_NAV_ENABLED=false` for operator runs. Keep cached
observations, existing schema, `set-nav`, user manual-value fallback and all user
holdings/history. Do not reverse/drop tables or delete observations. Product
availability flags remain a separate decision. Retained TOAP rows naturally age
through the existing freshness policy; no destructive database rollback is needed.

## Local validation

- Focused backend (TOAP, NAV policy, market adapters/cache credentials, manual fund
  values, Live Portfolio): **334 passed**.
- Full backend: **3,181 passed**, one existing Starlette/httpx deprecation warning.
- Isolated SQL/RLS (base, manual values, TOAP): **54 passed**, including 19 TOAP tests.
- Frontend suite: **502 passed**; lint passed. Only source-attribution metadata/UI
  changed, not financial calculations or portfolio interactions.
- Both public source pages were inspected read-only; deterministic tests use only
  minimal synthetic fixtures. No hosted write/refresh or scheduler was run.
