# Local EOD freshness fix — review proposal

This separate detached worktree starts at published main `2235496ba37db77605d0f5ab927dc839312431eb`. No commit, push, hosted migration, vendor request, refresh or publication was performed. The completed Insights worktree and bundle are separate.

## Problem and resulting behavior

Marketstack's midnight-UTC EOD date marker identifies a trading date, not a quote at the start of that day. Literal aging made the reported September 30 observations look over 48 hours old on October 2 at 07:19:18 UTC. For explicitly verified VT/VGT/BND Marketstack USD EOD markers, the proposed classifier measures from the completed exchange close. That example is 35h19m18s old and qualifies for planning with independently valid FX. The stored September 30 date, prices and raw history remain unchanged. A missing October 1 provider row stays missing. Synthetic browser amounts use fake ETF prices of 100 and FX of 50; no real holdings or quote values are bundled.

The 48-hour planning and 96-hour display budgets remain unchanged. Only full exchange-local closed calendar days are paused. Regular sessions close at 16:00 America/New_York; November 27 and December 24 close at 13:00. Only the reviewed 2026 calendar and three product identities qualify. Other sources, timestamp conventions, instruments and years use conservative literal aging. Known non-session quote dates, incomplete/future closes, unverified observations and invalid future receipt metadata fail closed. `fetched_at` records a poll and never renews observation freshness. Equal date/equal value Marketstack polls now report `unchanged_observation`; their six-hour lease is unchanged.

Closures mean eligibility can span more than 48 wall hours. Exhaustive hourly scans across every verified 2026 session establish a maximum of 120 wall hours for planning (48 aging hours plus the longest 72-hour closure). Calendar adjustment stops beyond seven wall days (168 hours); older observations fall back to literal age and cannot regain eligibility. Ages are monotonic through weekends, holidays, DST and the calendar-year boundary. This is not intraday freshness or evidence that the missing later session has arrived.

FX receives no session/calendar allowance: planning 48h, display 96h. Crypto retains 10m planning/1h display. NAV retains existing literal budgets and source/provenance rules. Missing/bad FX blocks ETF valuation/planning. Existing UI and planning allocation logic are unchanged.

## Calendar evidence

- [NYSE core hours and 2026 holidays/early closes](https://www.nyse.com/trade/hours-calendars)
- [Nasdaq 2026 holiday schedule and early closes](https://www.nasdaq.com/market-activity/stock-market-holiday-schedule)
- Vanguard product pages identify [VT](https://advisors.vanguard.com/investments/products/vt/vanguard-total-world-stock-etf) and [VGT](https://advisors.vanguard.com/investments/products/vgt/vanguard-information-technology-etf) with NYSE Arca, and [BND](https://advisors.vanguard.com/investments/products/bnd/vanguard-total-bond-market-etf) with Nasdaq.

The shared JSON calendar is the single authority. SQL is generated from it and regeneration is tested byte-for-byte. No inferred future-year calendar is enabled. Unexpected emergency closures are not invented. Review primary sources and regenerate/requalify before extending the calendar; unsupported years fall back automatically.

## Proposed schema and security review

`backend/migrations/eod_session_freshness_v1.sql` is a local proposal, never applied hosted. It adds only a pure stable, security-invoker age helper with an empty search path. Anonymous/public execution is revoked; authenticated/service-role execution is allowed. It reads no account data and writes no prices, histories or tables.

The migration requires the existing capture function and VGT helper, and aborts transactionally if expected freshness/provenance clauses are absent. It replaces the ETF/BTC gate with the same Python classifier, retains literal FX's 48h gate through the pure helper, and adds a future-receipt rejection to the existing NAV provenance gate. Existing capture function ownership, grants, account lifecycle guard, VGT basis helper, recorded cost and snapshot behavior remain authoritative. No RLS policies, credentials, Terms, entitlements, imports, budgets or portfolio entries change.

Disposable PostgreSQL17 qualification uses actual portfolio, NAV, entries, recorded-cost and VGT migration logic plus a synthetic active-account guard and identities. It verifies unchanged capture privileges, owner isolation, restricted-account denial, VGT helper retention, raw date retention, stale/future FX refusal and Python/SQL parity. Additional exact-schema qualification is complete: fresh read-only deployed metadata reproduced all 24application tables,120 constraints,44 indexes,25 policies,17 triggers and54 Arbor function definitions and ACLs. The independent freshness migration leaves every existing table/policy/trigger/ACL and53 other function bodies unchanged. Actual deployed lifecycle, Terms, revoked/mismatched/future/expired sessions, deactivated/deletion_pending/erasing states, owner isolation and stale/future/unverified FX checks pass through the real capture function. All 54hosted function definitions/ACLs were read back unchanged after local qualification. Managed Auth and PostgREST transport are represented by synthetic local support; no real account or Terms acceptance was performed.

## Qualification

- Full backend: 3,914 passed, 2 skipped; one existing FastAPI/Starlette HTTPX deprecation warning. Synthetic environment configuration only.
- Full frontend: 669 passed. E2E authentication/hosted-policy safety tests: 44 passed.
- ESLint: zero warnings/errors. TypeScript: pass. Production webpack build: pass using already cached local font responses and synthetic endpoint names.
- Real local PostgreSQL17: 8,293 conformance vectors, each in UTC, Pacific/Auckland and America/Los_Angeles, zero mismatches. Exact 48h/96h boundaries, every 2026 session, holidays, early close, DST, unsupported 2027, unknown conventions, invalid/future observations/receipt data and unchanged polls covered. Maximum planning wall age 120h; outer cap 168h.
- Actual local isolated Chrome production build: widths 320/390/768/1440, no horizontal overflow; 390/1440 light and dark screenshots plus stale-FX blocking screenshot. Valuation and monthly allocation responses come from the real frozen backend services with synthetic prices. Raw September 30 marker asserted unchanged. No page errors or unexpected remote requests; one expected injected409 console error. All auth/API requests intercepted; no real login, Terms acceptance, account or vendor call.

Logs and five screenshots are included in the bundle. SQL harness destructively recreates ONLY its fixed disposable local fixture database and verifies its dedicated data-directory identity before doing so.

## Exact migration and permissions delta

One new function: public.arbor_reference_age_seconds(text,timestamptz,text,text,text,boolean,timestamptz,timestamptz), stable/security invoker/empty search_path. PUBLIC and anon receive no execution; authenticated and service_role receive EXECUTE only. One existing function body changes: public.arbor_capture_portfolio(), retaining its owner postgres, SECURITY DEFINER, empty search_path and existing postgres/service_role/authenticated EXECUTE grants. Its three precise edits are ETF/BTC classifier use, independent literal FX classifier gate, and NAV future receipt rejection. No tables/columns/indexes/policies/triggers/role memberships change. capture-delta.diff is included.

## Bounded release proposal — not authorization to deploy

1. Reverify published main and the exact hosted schema/capture definition read-only immediately before a separately approved release. Preserve original dirty checkout. Exact-schema disposable qualification now passes, including the real deployed lifecycle wrapper and capture. A separate compatibility branch also passes: applying freshness then saved Insights or saved Insights then freshness produces byte-identical capture functions; actual combined captures retain allocation_values and both history tables preserve owner/restricted-account reads. This compatibility check does not admit the broader Insights export/erasure release; both saved bundles remain separate.
2. Release this blocker fix independently: reviewed migration first, then the backend API/refresh code with the shared calendar asset. Keep the existing refresh schedule and six-hour Marketstack lease. No frontend product release is required; the added browser script is qualification only.
3. Read-only verification after a separately authorized release: Monthly Plan becomes eligible only with the recorded quote/FX passing the classifier, source date still September 30 until a genuinely newer row arrives, no new vendor traffic or altered lease, owner/restricted-account/capture behavior preserved. If Oct1 is still absent, diagnose vendor lag separately; do not fabricate or manually refresh here.
4. Rollback must restore the prior capture definition and backend classifier together, remove the now-unused helper after dependencies are restored, and retain all unchanged stored observations. Save exact pre-release function/grants before executing any future migration. Do not weaken the guards to unblock planning.

Remaining freshness release gate: explicit owner approval of the bounded migration and backend release, followed by fresh main/schema/data preflight and post-release read-only verification. Independent exact-schema and separate Insights capture compatibility qualification are complete. The broader Insights export/erasure admission remains separate. Local Auth does not prove managed GoTrue or JWT transport; those existing code paths are unchanged. Calendar coverage intentionally ends at 2026. This is a bounded valuation freshness repair, not a full-page UX review or an assertion of vendor timeliness.
