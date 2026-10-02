# Historical estimates and chart touch — LOCAL qualification

Base: published main `a63edb822419cfe5c32df2f735828f8ade817819`. Implementation lives only in `/tmp/arbor-chart-local-review`. No chart migration, code or setting has been published. The completed VGT/BND release is separate and unchanged.

## Reconciled live VGT/BND release

Exact saved production readback: 159 BND + 155 VGT observations = 314, zero mismatches. Original observed dates, raw closes, fetched timestamps, source and provenance match the approved import. All nine preflight table counts and full-row fingerprints match: holdings, profiles, monthly checkins, investment entries, portfolio holdings, snapshots, history changes, pending recording reminders and pending investment recordings. No import was repeated. The four invalid VGT rows and nine missing daily BSP rows remain absent from raw cache. Verification report and sanitized readback are included in the bundle.

## Bounded historical estimates

Only historical ETF and BSP FX selection changes: latest verified observation on or before valuation day, no more than four calendar days old. The prior calendar-only gate is removed for these two sources. Empty, stale and future-only sources remain unavailable. Existing positive/source/date validation applies. Raw cache rows, purchases, recorded units/costs and observed snapshots are unchanged. Crypto same-day timestamp rules and NAV closure rules remain unchanged. Current/live valuation and snapshot freshness are unchanged.

Existing source_dates retain actual observation_date, observed_at, fetched_at, provenance and valuation_date. A reconstructed point with older ETF/FX sources shows Estimate · last available and those source dates in its inspection tooltip. Same-day reconstructed and actual observed points receive no invented estimate provenance. No execution price or shares are inferred. Existing PHP/USD cost/gain calculations remain unchanged.

VGT holdings continue using the quote's actual observation date for split conversion. A carried Apr 20 raw USD809.13 quote on Apr 21 uses the original one-share basis, not eight shares multiplied by the old quote. Apr 21 USD101.02 uses eight units; genuine price movement remains. Unknown legacy basis and undated historical ownership still fail closed. The qualified original migration SHA remains ba117e2df49df92b95500fa4be9e635c698c2da3ec819f456d9cec83752e34f3; original VGT review bundle SHA remains 77b75e00861138c5e65dfab5b9fbdba3c997156e1cef7200e089b2606757a9eb.

Missing FX daily observations and saved predecessors (PHP per USD):

| Missing daily date | Actual prior date | Rate |
| --- | --- | --- |
| 2025-12-30 | 2025-12-29 | 58.805 |
| 2025-12-31 | 2025-12-29 | 58.805 |
| 2026-02-17 | 2026-02-16 | 58.059 |
| 2026-03-20 | 2026-03-19 | 59.562 |
| 2026-04-02 | 2026-04-01 | 60.678 |
| 2026-04-09 | 2026-04-08 | 60.206 |
| 2026-05-01 | 2026-04-30 | 61.506 |
| 2026-05-27 | 2026-05-26 | 61.437 |
| 2026-06-12 | 2026-06-11 | 61.497 |

VGT missing/invalid dates: June 4 uses June 3 USD123.91; June 9/10 use June 8 USD117.25; June 15 uses June 12 USD116.74. These remain dated predecessors, never fabricated same-day closes.

## Mobile reproduction and correction

Actual baseline production-build Chromium touch replay found two simultaneous selection layers: a small default Recharts active dot and Arbor's larger ReferenceDot, after tap and during hold. The reported below-line failure did not reproduce in this synthetic Chromium environment; baseline top/middle/bottom all selected. No unproven Safari cause is claimed.

Default Recharts activeDot and its competing keyboard layer are disabled; Arbor's focusable wrapper, arrow keys, Escape and aria descriptions remain. One controlled marker/line/tooltip responds to tap, hold and mouse. Tooltip cannot intercept touch input and is clamped inside the plot. Cancel clears inspection; stale timers and secondary pointers are guarded. Pre-hold vertical gestures retain pan-y scrolling. No layout/copy added beneath gain.

Patched actual production-build checks: tap/hold at 3 horizontal positions × 3 vertical positions (including all edges), 18 gestures; long-press drag, cancellation and vertical scrolling; keyboard Escape/arrows; Home and Portfolio, seven ranges, PHP/USD, widths 320/390/768/1024/1440/1920, light/dark. Tooltip bounds and actual estimate captions asserted. 48 matrix screenshots plus touch captures; zero page errors, unexpected external requests or financial writes. All Auth/API requests intercepted with synthetic data through withAuthenticatedBrowser. Personal browser/session never used. Real iOS Safari/device hold behavior remains a follow-up verification, not a claimed pass.

## Validation

- Real PostgreSQL 17: 21 valuation cases including all four VGT/nine FX gaps, boundary/stale/no-prior/future/weekend/split; passed.
- Full history/split/security SQL regression: 17 passed, bounded-estimate assertions updated; unknown basis, owner guards, exports, costs, NAV and crypto preserved.
- Local rollback/reapply of history function: passed. Migration guards exact current function MD5 16b1ededa1ced20466cacb1b0d41d17a, owner/definer/empty search_path; no ACL expansion. Read-only production MD5 matches. Review SQL rollback restores the original function only, no data rewrite.
- Backend focused: 96 passed. Full backend: 3735 passed, two existing optional SQL skips; existing Starlette deprecation warning.
- Full frontend: 666 passed. Browser harness regressions: 44 passed.
- Lint, TypeScript, production build, Python/Node syntax and patch/diff checks passed.
- First restricted baseline build lacked network for existing Google fonts; retry with authorized font access passed. First backend test collection lacked synthetic config; rerun with dummy origins/key passed. No environment secrets copied.

## Changed paths (nine)

- backend/migrations/20261002053000_chart_bounded_prior_observations.sql
- backend/tests/sql/chart_bounded_prior_local.py
- backend/tests/sql/chart_history_regression_local.test.mjs
- frontend/app/globals.css
- frontend/components/portfolio/PortfolioHistoryChart.tsx
- frontend/lib/historyEstimate.ts
- frontend/lib/historyEstimate.test.ts
- frontend/scripts/e2e/chart-touch.mjs
- docs/CHART_CARRY_TOUCH_LOCAL_REVIEW.md

## Publication and repository state

LOCAL ONLY: no chart commit, push, migration application, deploy, vendor request or public website sync. Separate publication remains outstanding. Live API/crons are still dcf9c5946fc528ef86037fd2530e7e8ef9a278f0 and frontend a63edb822419cfe5c32df2f735828f8ade817819. Original repository remains HEAD c0fd6cedba313b861cd5860c23241a02a4190935 with 46 existing dirty paths and empty index. All 42 recorded baseline file hashes match; this task wrote no files in the original repository. All implementation is isolated. No Insights work started.
