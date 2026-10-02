# UITF indicative monthly planning — LOCAL review only

Base: published `07f7fa5c37bf19244d28d7efa11e417aef7231b8`. Detached worktree `/tmp/arbor-uitf-indicative-local`. This patch is uncommitted and unpublished. Insights release stays complete. Original checkout remains untouched.

## Result and flow

A complete recorded portfolio can supply an indicative monthly contribution breakdown using delayed cached NAVs from exact verified TOAP fund/classes. Every affected NAV must be at most seven calendar days / 604800 seconds old, measured from its real `as_of`, never `fetched_at`. This is a proposed product risk bound, not a publication SLA or guarantee of price accuracy. Nothing is refreshed or imported by this path.

The updated POST client automatically sends strict boolean `allow_indicative_nav: true`, indicating that it understands the response's `indicative_navs` metadata. No timing selector or extra user question. Older POST clients and public GET retain strict stale-price blocking. Internal Ask already has canonical indicative wording and uses that context; it never invokes an LLM for this calculation. This capability is presentation compatibility, never an authorization bypass.

Monthly service reads the complete valued portfolio. Fresh portfolios follow existing `current_values()` unchanged. Stale holdings qualify only if all are NAV holdings with exact `ReferencePrice` TOAP identity validation and source/provenance/class checks. A second owner-scoped cache read verifies the exact price and date already used; a concurrent change fails closed instead of mixing quote versions. Future, missing, unverified, class mismatch, source mismatch and over-bound NAVs block. Any stale required ETF, FX or Bitcoin reference blocks the whole monthly calculation. Never omit failed holdings or renormalize partial values. Existing fresh manual whole-holding PHP fallback remains explicitly manual; it is not converted to a NAV or inferred units.

Response preserves actual dates, source TOAP and exact unit class. Main result says **Indicative estimate**, using **latest NAVs available to Arbor**, with actual purchase prices/units may differ. Progressive detail lists fund/class/date/source. It does not claim a fresh check against the publisher. A failed recalculation clears prior results, preventing an old estimate from remaining actionable.

Recorded investments remain a separate step: actual units received and actual amount paid both start blank. Planned PHP is context only. Provider continuation is an existing external link; no trade is placed. Check-in is an independent self-reported record. Pending-recording resolution requires the existing explicit investment entry. No transaction price, unit, cost, historical chart observation, or snapshot is created from indicative NAVs.

## Schema, authorization and isolation

No SQL, migration, RLS, table, grants, export, erasure, credentials, Terms, accounts, reminder/job schedule or entitlement changes. Existing authentication, lifecycle, Terms and Plus gating remain. `/v2/monthly-plan` remains private/no-store. New request field is strict boolean; new response is optional to the frontend and validates bounded supported NAV product metadata before display. `current_values`, reference freshness, global valuation and POST snapshot capture are unchanged. Snapshot capture continues rejecting stale observations. Original ETF/FX/BTC limits and session calendars are unchanged. All browser data is synthetic; remote requests are fulfilled or blocked, including auth. No production or financial vendor call was made by this prototype.

## Qualification

- Backend full: **3964 passed, 2 skipped**; existing FastAPI/TestClient httpx deprecation warning. Synthetic `SUPABASE_URL=http://127.0.0.1:9 SUPABASE_KEY=synthetic-only`.
- Focused NAV service/HTTP/Ask: **36 passed**, including all six exact TOAP classes, 48h threshold and exact seven-day inclusive/exclusive seconds, future/unverified/corrupt/mismatched identity, missing/expired holdings, cache race, existing manual fallback, mixed fresh/stale ETF/FX/BTC, exact decimal contribution conservation, old clients blocking, malformed opt-in rejected, owner-scoped no-write HTTP and canonical Ask with no LLM.
- Frontend full: **672 passed**. Browser harness safety: **44 passed**.
- ESLint, TypeScript, production webpack build and `git diff --check`: **pass**. Build uses synthetic public HTTPS config; existing fonts fetched by normal Next build. No source, dependency or credential changes to enable compilation.
- Actual isolated production browser: 320/390/768/1440 widths, no horizontal overflow, light/dark desktop/mobile, metadata date/class, actual purchase fields blank, failed 409 removes previous breakdown. Zero page errors or unexpected remote requests; one expected injected 409 console error. **11 screenshots** in review bundle. Screenshot dates/amounts are synthetic examples, not owner records.
- No hosted authenticated proof or production change attempted for this task. Browser uses mocked endpoint data generated from real local backend calculation; service/HTTP integration is separately tested. Seven-day accuracy is inherently unguaranteed.

## Official-source rationale (research supplied by parent)

Manager publication is delayed by design; a universal 48h threshold is not its publication guarantee. TOAP posting time remains independently unverified. Existing TOAP fund/class mappings are preserved exactly; current ATRAM Equity DOT naming does not authorize inferring an alias.

- [ATRAM current documents](https://www.atram.com.ph/documents): Medium Term Peso Bond A DOT 21 Mar 2025 p21: T+1 business day by 11:30am. Technology A PHP DOT 16 Jul 2026 p24 and Equity DOT 16 Jul 2026 p25: T+2 by 11:30am. Business days exclude weekends and Makati bank closures.
- [BPI Premium Bond rules](https://www.bpi.com.ph/content/dam/bpi-wealth/plan-rules/bpi-premium-bond-fond/BPI%20Premium%20Bond%20Fund%20Plan%20Rules.pdf?download=true) pp9–10: 7pm valuation, available by noon following day.
- [BPI Global Equity Class P rules](https://www.bpi.com.ph/content/dam/bpi-wealth/plan-rules/global-equity-fund-of-funds/BPI-GLOBAL-EQUITY-FUND-OF-FUNDS-PLAN-RULES-20250716.pdf?download=true) pp12–14 and [World Technology Class P rules](https://www.bpi.com.ph/content/dam/bpi-wealth/plan-rules/world-technology-feeder-fund/BPI-WORLD-TECHNOLOGY-FEEDER-FUND-PLAN-RULES-20250716.pdf?download=true) pp13–15: next banking day publication. These rules do not establish a TOAP SLA.

## Bounded release proposal — approval required

Review the nine-path patch and screenshots. On explicit owner approval only, verify main still equals the recorded base (otherwise rebase and requalify affected paths), publish this exact patch through the existing repo workflow, then verify frontend and API deployment versions. No hosted migration or refresh/backfill is required. Existing repo-linked cron builds may follow a main push, but no job execution or schedule change is proposed. Updated frontend is safe against old API; old open tabs remain strict against new API due to opt-in. Verify one bounded owner/dedicated-account monthly calculation without capture/trade/recording writes, then stop. Rollback is reverting this bounded patch; there is no schema/data rollback.

## Restart checkpoint / held UX queue

UITF is the sole current priority and is now ready for deployment approval, not live. Stop after saving this bundle/handover; do not restart the app on the owner's behalf. Resume queued UX only after owner restart/resumption:

1. Home cohesive desktop/mobile hierarchy: portfolio summary, recorded monthly progress and one useful “Plan your next investment” shortcut. Full Investment breakdown and What-if in Portfolio. Free Home one Plus entry, preserving gating/data/navigation/back behavior. Keep any monthly planning-assumption input truthful; do not silently call it recorded progress.
2. Clear progress vs investment-breakdown naming; no calculation or entitlement changes.
3. Learn Arbor logo sizing/spacing consistent with shared header.
4. Settings truthful Plus active / Plus trial / Free highlight and existing management action.
5. Restrained Arbor treatment for Home Portfolio top-right arrow and public Get started arrow; retain navigation.
6. Tighten desktop Home portfolio/chart excess whitespace using Free preview from task01a0fc18 (fb0b662); preserve readable labels and working mobile touch/tooltip behavior.
7. Desktop/mobile review screenshots before any UX publication. Full all-page review remains later scope.
