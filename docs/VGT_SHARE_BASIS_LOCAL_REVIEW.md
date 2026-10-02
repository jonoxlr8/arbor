# VGT share basis: implemented local review

Implemented against published main `c6f15e2d582690312ab0795760bac55d4a86d3b1` in `/tmp/arbor-split-local-review`. This supersedes the earlier arithmetic-only design. Original repository files remain unchanged. No production migration, annotation, import, deployment or provider request occurred during this integration.

## Result and accounting contract

The exact `gotrade_vgt` action is eight shares for each original share, effective April 21, 2026. Provider quotes remain raw. Recorded transaction units, dates, PHP costs and opening units remain recorded facts. The additive migration does not backfill or rewrite legacy records.

One SQL calculation, `arbor_vgt_units_at_quote`, supplies quote-denominated units through `arbor_vgt_holding_units` to live valuation, historical reconstruction and snapshot capture. Backend-derived units are separate from recorded units. Existing cost, gain, FX, calendar, completeness, freshness and projection calculations are retained. Projections continue to start from actual holdings valuation.

One original share at USD 800 before the split or eight shares at USD 100 afterwards has the same USD 800 and PHP 40,000 value at FX 50. The PHP 40,000 cost stays unchanged. An already-adjusted eight-share record is not multiplied again. Mixed post-split purchases add actual shares. A carried pre-split quote uses pre-split units, even if current display units have become eight. Actual saved April 20/21 closes of USD 809.13/101.02 preserve the real USD 0.97 movement per original share; no forced-flat return. [Vanguard announcement](https://corporate.vanguard.com/content/corporatesite/us/en/corp/who-we-are/pressroom/press-release-vanguard-announces-share-splits-for-five-equity-index-etfs-032426.html).

## Approved entry and correction behavior

- New pre-April 21 VGT purchases default to original shares bought on the investment date. Hint: “Enter the original shares purchased, before any stock split”. Optional checkbox explicitly says the count is already adjusted for the April 21 split. Review shows the selected basis and preserves entered shares and PHP cost.
- Purchases dated April 21 or later need no extra question, bounded to this one verified action. Future actions require separate review.
- Legacy pre-split entries retain nullable basis. Editing starts with no selection. Unknown basis makes valuation unavailable instead of inventing shares, zero value or a complete old snapshot. Confirmation uses an owner correction with the expected revision.
- Corrections moving a purchase before the split require valid basis. Date changes clear the previous UI selection. Optimistic conflicts and idempotency remain. Voided records never contribute units/cost or require a basis answer.
- Nonzero undated openings require an explicit count basis for current valuation. Confirmation supplies no acquisition date: historical ownership remains unknown, and reconstruction remains unavailable for that undated opening.
- Activity keeps original quantities. Current holdings and review totals show derived current shares when known; unknown totals remain unavailable.

The investment date comes from the provider's investment record, not Arbor entry time. Date-only storage cannot resolve intraday ownership. No timestamp or ownership date is inferred from record creation or confirmation.

## Persistence and compatibility

Nullable `share_basis` and `opening_share_basis` columns extend existing entries and holdings. Existing security-invoker ledger/entry views carry the metadata; there is no new owner-data table or erasure surface. Strict original holding and ledger metadata responses retain their contracts.

Three new named RPCs record, revise and correct opening basis, retaining owner checks, locks, current account/Terms admission, positive paid-cost policy and reconciliation. PUBLIC/anon execution is revoked; authenticated owner execution has no new Auth/service-role grants. A trigger also protects old/direct revision RPCs against crossing the action or editing ambiguous units without a basis. Old opening correction clears a VGT basis when it cannot receive an explicit replacement, avoiding stale annotations.

Basis changes invalidate affected derived history through the existing change ledger. Observed rows are retained; ambiguous legacy lots cannot use old unsplit captures as a complete fallback. Export includes the annotations in the existing allowlisted objects and retains Terms receipts. Existing erasure deletes the same parent rows; no additional inventory or deletion adapter is needed. Export ACL and Terms/lifecycle guards remain intact.

The backend hydrates immutable holding models from the owner-scoped view. Quote dates must agree with the live quote read; a refresh crossing dates fails closed until consistent data is read. Old profiles and API fields remain readable. An old client recording a pre-split purchase through the old RPC leaves basis unknown; the new-entry default is never applied retroactively. Deploy migration before backend, then frontend.

## Actual validation

- PostgreSQL 17 on disposable localhost database `arbor_vgt_split_review`: **17 passed**. Owner isolation, Terms/lifecycle controls, raw quote/current/history/snapshot parity, mixed/restated purchases, carried quotes, idempotency conflict, correction/stale revision, old/direct RPC protection, unknown fallback suppression, void, undated ownership and export metadata. Synthetic local Terms fixtures use the guards; no real acceptance was created.
- Final backend: **3,735 passed, 2 existing optional SQL skips**, one existing Starlette/httpx deprecation warning. Six new tests cover live parity, unknown basis, quote consistency, restated/post-split counts and owner-scoped immutable model hydration. Focused predecessor: 112 passed before the additional hydration regression.
- Final frontend: **665 passed**, including narrowed affected set, exact fractional review quantities, no double adjustment, all seven history ranges and PHP/USD values/recorded-cost gains.
- Lint, TypeScript, production build, Python compilation, JavaScript syntax and patch applicability checks passed. Synthetic build configuration uses invalid remote origins, with no copied environment file or real credential.
- Actual local production-build browser: **320/390/768/1024/1440/1920 px, light/dark**, no horizontal overflow. Empty/zero units rejected; original default, adjusted override, post-split question removal, blank legacy basis, cancel without write, repeat correction and explicit opening confirmation passed. No page errors or unexpected remote requests. All auth/API calls are intercepted using isolated `withAuthenticatedBrowser`; zero hosted writes.
- **16 actual screenshots**: 12 responsive/theme review captures plus original input, adjusted review, legacy confirmation and undated opening confirmation. Browser fixtures prove interface behavior; real SQL/backend tests prove arithmetic.

## Exact changed paths

Modified:

1. `backend/app/services/live_portfolio.py`
2. `backend/app/services/portfolio_store.py`
3. `frontend/lib/livePortfolio.ts`
4. `frontend/components/portfolio/DatedInvestmentFlow.tsx`
5. `frontend/components/portfolio/HoldingActivity.tsx`
6. `frontend/components/portfolio/LivePortfolio.tsx`

Added relative to the published base:

7. `backend/migrations/20261002040000_vgt_share_basis.sql`
8. `backend/tests/test_vgt_share_basis.py`
9. `backend/tests/sql/vgt_share_basis_local.test.mjs`
10. `frontend/lib/shareBasis.ts`
11. `frontend/lib/shareBasis.test.ts`
12. `frontend/components/portfolio/ShareBasisField.tsx`
13. `frontend/scripts/e2e/vgt-share-basis.mjs`
14. `docs/VGT_SHARE_BASIS_LOCAL_REVIEW.md`

The old Python prototype is excluded. Runtime action arithmetic is shared SQL; frontend exact arithmetic is only the entry review display.

## Remaining gates and exclusions

Local implementation is complete; no stage/commit/push/deploy here. Production migration and backend/frontend release require a separate exact rollout approval and fresh read-only schema/affected-set preflight. If main advances, rerun compatibility qualification: this migration aborts on incompatible financial bodies instead of replacing them wholesale.

Prior aggregate-only production check: one VGT holding, five active post-split purchases, zero active pre-split purchases, zero nonzero openings, zero affected owners at that check. Recheck before rollout; no balances or identifiers are in the evidence.

**BND import separately pending:** 159 saved raw observations, December 29, 2025–August 17, 2026. Nothing imported here. **Older VGT import pending:** at most 155 valid rows, 77 pre/78 post, after split integration is released. Invalid June 4/9/10/15 rows stay quarantined. Saved response/manifest hashes independently verified; `adj_close` equals raw and cannot be treated as adjusted. No vendor request or price rewrite.

Nine missing same-day BSP dates for both assets stay unavailable: 2025-12-30/31; 2026-02-17, 03-20, 04-02/09, 05-01/27, 06-12. No invented FX, holiday or relaxed carry. Any approved import needs fresh insert-only conflict/provenance checks, readback and financial fingerprints.

The retained ten-path inception patch is separate and absent from this bundle. Its overlapping services/forms require a distinct rebase. Original repo HEAD remains `c0fd6cedba313b861cd5860c23241a02a4190935`, with 46 existing dirty paths, empty index and all 42 recorded baseline hashes matching. Deliverable is the isolated 14-path current-main patch, not edits to the retained working tree.
