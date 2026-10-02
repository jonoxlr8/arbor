# Arbor Insights — local implementation review

Implemented and locally qualified against published main `fb0b662` on Jonathan’s Mac. The Insights slice has not been released. The independently approved EOD freshness release remains separate.

## Base and isolation

- Original: `/Users/jonoxlr8/Projects/arbor`, HEAD `c0fd6cedba313b861cd5860c23241a02a4190935`; 46 preexisting dirty paths and empty index remain. No original source files were edited.
- Isolated worktree: `/tmp/arbor-insights-current-main`, detached HEAD `fb0b6623e8c2d1ff4c876e59b8a92bf45227a978`. Published GitHub main verified read-only before work. No branch, commit, push or PR was created. Earlier task 01a0f905 was not restarted.
- Read repository AGENTS.md and `/Users/jonoxlr8/Arbor-Handover/Arbor-Insights-Approved-Scope-Checkpoint.md`, including the superseding October 2 budget rule. No repository `.agents` directory exists.

## At a glance

Monthly Review now pairs the recorded amount with the saved target and remaining amount, with one small progress bar. At or above the target it says **Target reached**. Explicit zero says **Your target is explicitly set to ₱0** and counts as reached. Unset says **Monthly target not set**. Older missing history says **Monthly target history unavailable**. No dated purchases says **No investment recorded**. A subtotal with missing PHP purchase amounts does not invent a complete remaining amount; known recorded purchases can still establish that a target was reached.

Plan alignment over time sits inside existing Portfolio Insights. Its main sentence states whether the recorded allocation is closer, further, about as close, or unavailable compared with last month. Method, dates and the two largest supported allocation-gap changes are behind **How this comparison works**. There is no buy/sell recommendation, timing selector, new settings flow or duplicate Home What If.

## Historical authority and calculation

- Budget versions have one row per owner and edited Philippine calendar month. Each edit replaces the CURRENT month’s target; already recorded purchases are untouched. The latest verified version carries forward into future months. Prior closed-month rows remain unchanged. Null is unset; numeric zero is explicit. Missing versions are unavailable.
- Existing active dated purchase records remain the only contribution authority. Openings, check-ins, performance and voided entries are not counted. Corrections change the canonical totals rather than adding a second purchase. Activity/history rereads refuse ordinary concurrent changes; bounded complete pagination refuses partial reads.
- Plan versions start at their actual save timestamps. Backend restores each observation’s version using the canonical V2 engine, requiring a user-selected long-term plan. No current profile target is applied to older observations.
- Future immutable portfolio observations retain per-product PHP values in the same valuation SQL query. Existing price freshness, provenance and VGT share-basis rules stay in the published capture body. Existing observations remain null for allocation detail; no historical backfill.
- Compare the latest valid observation in the current Philippine month with the latest valid observation in the preceding month, and show their exact Philippine dates. No assumption that these are month-end balances. Missing either side remains unavailable. Observations affected by a later historical correction are excluded.
- Distance is half the sum of absolute sleeve percentage-point gaps. A smaller distance means closer to the dated chosen targets. If targets changed, the detail says so. Supported drivers describe changed sleeve gaps; purchases, prices and corrections are not claimed as causal attribution.

## Proposed schema and security review

`backend/migrations/insights_history_v1.sql` is a LOCAL review proposal, **not applied to hosted Supabase**. It adds `arbor_budget_versions`, `arbor_plan_versions` and nullable `allocation_values` on future portfolio snapshots. It seeds only the current monthly budget and a plan version from the migration time. The capture and export body patches fail on incompatible published definitions.

- New histories are read-only to normal authenticated users; owner RLS plus the existing restrictive active-account check govern reads. Anonymous, public and service-role grants are explicitly revoked, including the identity sequence and trigger function, overriding the actual hosted default grants. Only authenticated SELECT is granted; direct client mutations are denied.
- A database-only trigger uses `auth.uid()` owner verification, empty search path and restricted function execution. Existing profile write restrictions and the revision compare-and-swap remain authoritative; row locks serialize edits.
- No client-selected timestamp, month, target-history owner or arbitrary snapshot values are accepted.
- Both history tables reference the profile with ON DELETE CASCADE, covering profile erasure. They omit profile name/email but retain only the canonical inputs needed to restore allocation (risk/horizon/readiness answers, saved strategy/customization and its validated plan state). Goal text/date, implementation choices and redundant goal/current-value/monthly profile amounts are omitted or null. Decoder-required revision metadata uses a fixed placeholder; live nonces are not retained and no nonce is exported. The current profile and budget history remain intact. The existing lifecycle guards still govern profile/snapshot writes.
- Existing authenticated snapshot API, valuation rules and privileges are preserved. The export extension keeps the published fresh-session/cooldown wrapper and execute grants, uses the existing nested allowlist projector, excludes internal revision nonces, bounds rows/bytes and includes planning histories and snapshot allocation values. Backend export validation accepts old deployments and checks new sections.
- Read-only hosted catalogs were reproduced locally: 24 application tables, 120 constraints, 44 indexes, 25 policies, 17 triggers and 55 deployed functions with owners/ACLs, plus actual default grants. The proposed delta is two history tables (one identity sequence), six constraints, three indexes (two primary-key indexes and one owner/time index), four policies, one profile trigger/function and one nullable snapshot column. Only the existing capture and private export SQL bodies change; existing owners/grants, public export admission and erasure functions remain unchanged. Necessary local manual-erasure integration adds explicit history-table FK/security checks; its default execution-disabled behavior stays intact.
- Actual local PostgREST/JWT checks exercise the deployed export wrapper, fresh-session ownership, cooldown, transaction-override denial, lifecycle restrictions and nested allowlisting. Monetary values are text at SQL/REST boundaries to preserve exact cents. Unknown historical nested fields fail closed (503); record limits use the existing 413 response.
- Actual updated manual banned-barrier full phase chain passes (local synthetic Auth removal only), with replay/rollback and eight drift rejections: missing history, removed cascade, client write grant, service read grant, extra permissive owner policy, removed lifecycle policy, sequence exposure and unknown owner table. The new tables are recognized only with explicit reviewed RLS/grant/ownership/cascade checks.
- Actual private erasure review/hold/begin/data functions remove both new histories through profile cascade. Replay and savepoint rollback pass; another synthetic owner stays unchanged. The legacy inventory enumerates ten allowlisted table categories plus Terms acceptances when present; it is not an exhaustive physical-row total and omits the two cascading histories. The user-facing receipt exposes no numeric total. The manual runbook now states this precise limit; supplemental local checks prove both histories are absent and the control owner is unchanged. Auth removal remains a separate existing phase; attempting confirmation before Auth removal fails.
- This repository uses manually reviewed SQL proposals. No Supabase CLI is installed here; a deployment migration should be generated using the team’s normal tooling only after schema review. No CLI install or hosted advisor/migration operation was performed.

## Qualification

All input financial/auth data is synthetic. Local PostgreSQL 17 uses a new disposable cluster `/tmp/arbor-insights-current-pg`, loopback port 55473, with local PostgREST on 55474. Browser uses the AGENTS-approved `withAuthenticatedBrowser` synthetic fixture path, in an isolated Chrome context; every external response is fulfilled locally or blocked. No real login, account provisioning, Terms acceptance, import, vendor data request, credential creation, hosted write, email or publication was performed.

- Full backend: **3,928 passed, 2 skipped**, with the preexisting FastAPI/TestClient httpx deprecation warning. `SUPABASE_URL=http://127.0.0.1:9 SUPABASE_KEY=synthetic-only .venv/bin/python -m pytest -q` from backend.
- Full frontend: **671 passed** (`npm test`).
- Frontend lint: **pass, zero warnings** (`npm run lint`).
- TypeScript: **pass** (`npx tsc --noEmit`).
- Production webpack build: **pass** (`npm run build` with synthetic HTTPS configuration and Next’s supported offline Google font response mechanism pointing to already cached local font files). Initial sandboxed font fetch failed; no font source or dependency was changed. This qualifies compilation/rendering, not fresh network font retrieval.
- Browser helper safety regressions: **44 passed** (`npm run e2e:test`).
- Original bounded PostgreSQL harness, plus exact current-main replica and actual PostgREST/erasure tests: repeated current-month edits, closed-month preservation, owner/anonymous isolation, direct mutation denial, active-account read restriction, concurrent revision CAS one winner, atomic allocation capture, real VGT split helper/unknown-basis rejection, legacy observations unchanged, profile cascade erasure, actual nested export projector/nonce exclusion and unchanged export grants all pass.
- Local browser: widths **320, 390, 768, 1440**; no horizontal overflow, no page errors or unexpected external requests. Both features captured in **390/1440 light and dark**. Remaining, reached, zero, unset, empty current month, missing historical budget/alignment and retry states pass. One expected console network error is the intentionally injected 503 retry case.
- `git diff --check`: pass. No commit/index changes.

The current-main production browser fixture derives feature results from backend services. Twelve fresh screenshots were captured and representative light/dark/mobile/desktop results inspected; prior screenshots/bundles remain separate. This verifies actual production UI integration. Local JWTs, users and sessions are synthetic; managed GoTrue infrastructure, real reauthentication and a hosted release are not exercised.

The actual budget trigger additionally passes frozen October/November Philippine month-boundary edits in UTC, Los Angeles and Auckland sessions, retaining the closed September target. Repeated zero/unset/large monetary edits and a concurrent profile revision race pass through actual SQL/REST. Local fixture setup differences (managed Auth columns, authenticated denial status and zero-row RLS updates) were reconciled to deployed definitions; no export/lifecycle permission was relaxed.

## Limitations and bounded release proposal

Historical targets/budgets before version collection are unknowable and remain unavailable. Alignment will require complete future recorded observations in two consecutive Philippine months; this is intentional. There is no attempt to reconstruct sleeve history from today’s holdings or targets, no attribution beyond observed gaps, and no portfolio-wide UX review in this task. V2 historical decoding must remain stable in future engine upgrades.

Release is **proposed only**: review this exact 23-path patch/schema and its local export/erasure evidence; reverify published main and read-only deployed function/permission fingerprints before release; obtain separate explicit approval for its hosted application, backend release and frontend release. The schema must precede backend/frontend use. Verify that the current-month seed, historical unavailability, restricted-account reads and export/erasure behavior are correct before deploying UI. No historical import/backfill or vendor refresh is included. Rollback should disable the new UI/read paths while retaining collected history; destructive table/column removal requires separate review. Local readiness is qualified; hosted migration/backend/frontend release approval remains outstanding. Fresh provider prices may advance through normal scheduled jobs and are not feature writes.

## Exact changed paths

- `backend/app/services/account_erasure_manual.py` (necessary history compatibility guard)
- `backend/tests/test_account_erasure_manual.py`
- `docs/ACCOUNT_ERASURE_MANUAL.md` (precise inventory/receipt coverage)
- `backend/app/routes/live_portfolio.py`
- `backend/app/schemas/account_export.py`
- `backend/app/services/insights_history.py`
- `backend/app/services/monthly_review.py`
- `backend/app/services/portfolio_store.py`
- `backend/migrations/insights_history_v1.sql`
- `backend/tests/sql/insights_history_local.py`
- `backend/tests/test_insights_history.py`
- `backend/tests/test_monthly_review.py`
- `frontend/app/v3.css`
- `frontend/components/portfolio/AlignmentOverTime.tsx`
- `frontend/components/portfolio/LivePortfolio.tsx`
- `frontend/components/portfolio/MonthlyReview.tsx`
- `frontend/lib/alignmentHistory.test.ts`
- `frontend/lib/alignmentHistory.ts`
- `frontend/lib/livePortfolio.ts`
- `frontend/lib/monthlyReview.test.ts`
- `frontend/lib/monthlyReview.ts`
- `frontend/scripts/e2e/insights-history.mjs`
- `docs/INSIGHTS_LOCAL_REVIEW.md` (this review)

## Bundle contents

- This review; complete changed source files under `source/`; unstaged patch including new files.
- Synthetic screenshots under `screenshots/`; full verification logs under `evidence/`.
- SHA-256 manifest for every bundled file. No .env, auth state, node_modules, database contents or original dirty files are included.

Local dependency symlinks were used rather than installing/upgrading dependencies. The temporary backend `.venv` symlink is removed at completion; use the existing original interpreter or relink it to rerun the harness. Frontend node_modules remains an ignored link to the existing dependency installation. The private handover receives a new review file, preserving prior content. Earlier local Insights and EOD freshness bundles remain independent. The initial 20-path current-main draft is superseded by this minimized 23-path qualified proposal.

Owner voice confirmation at 09:44 UTC reports October monthly flow working after the separately approved freshness release. This is user-reported resolution, not comprehensive automated owner-account end-to-end coverage.
