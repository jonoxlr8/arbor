# Final vision fidelity review — 26 September 2026

## Outcome and remaining gate

The auth, Home, Portfolio, Ask Arbor, monthly handoff and public-site work is implemented and locally validated. **This is not full production sign-off.** No code was committed, pushed or deployed, and no production settings or financial records were changed.

The remaining correctness boundary is BTC refresh cadence. The current implementation deliberately makes market-data refresh an operator-only operation. A proposed bounded server-side, shared-lease BTC refresh on Portfolio reads was **not applied**: it would introduce a privileged cache-writer path into ordinary authenticated requests. Explicit approval is required before that security-boundary change. An alternative is separately authorized trusted-operator scheduling. No freshness limits, source configuration or cache rows were changed to conceal the issue.

Auth email templates are ready for review but **not applied to hosted Supabase**. See [email handoff](auth-emails/README.md).

## 1. Starting state

Clean `main`, local HEAD and existing `origin/main` reference both `63d09b0751efc4a89c5e6cfd8ba2ffce4cf96d32` (`feat: polish Arbor onboarding and premium product experience`). This pass did not fetch, commit, push or deploy. Deployment identity was not re-certified; this is a local implementation pass.

## 2–3. Actual Portfolio diagnosis and error behavior

Read-only checks used the normal disposable QA identity, not the founder’s browser or profile:

- `/account/entitlements`: HTTP 200; `live_portfolio=true`, `monthly_checkin=true`.
- Disposable `/v2/portfolio`: HTTP 404 because that account has no saved Arbor profile. No hosted fixture profile was inserted to bypass this boundary.
- Shared cache view: HTTP 200. BTC/PHP effective time `2026-09-25T15:10:00Z`, fetched `2026-09-25T15:10:28.753648Z`; approximately 157 minutes old at the diagnostic check.
- Canonical BTC policy is fresh through 600 seconds, fallback through 3,600 seconds. This observation was outside the usable window. Daily refresh alone cannot maintain this window.
- VT/VGT/BND, FX and sampled NAV observations remained present. No refresh was performed.

The expired shared BTC observation explains the unavailable-price mechanism and is consistent with the founder screenshots. The exact founder-specific `/v2/portfolio` response was not accessed or reproduced. Do not call that a verified founder-account request failure or claim it was fixed.

Existing bounded error categories remain in place. Nine browser-injected cases passed: 401, 403, 404, 500, 503, network failure, malformed contract, unknown source and malformed JSON. Retry clears stale error state, performs a fresh GET, accepts TOAP metadata, and does not create holdings/snapshots. Raw error payloads remain hidden. Expected injected HTTP errors are distinguished from application runtime errors.

## 4–8. Authentication experience

Shared calm gradient, existing Arbor mark, consistent typography, focused forms, rounded controls, light/dark treatments and visible focus states cover sign-in, signup, email sent, explicit confirmation, confirmation success/invalid, forgot password, reset form, password changed and authenticated change password.

Signup/resend cooldowns and neutral reset-request messaging remain unchanged. Confirmation success appears only after the existing `verifyOtp` path returns a real session; the user then continues to Arbor. Confirmation/recovery fragments are captured and removed before SDK import/redemption. Reset remains explicit-action-only and requires the recovery identity; sign-out after recovery is preserved.

Authenticated password change verifies the current user against the expected owner and calls the normal Supabase password-update API. Server denials are not bypassed; a secure reset-link fallback remains. No actual QA password was changed during validation.

## 9–10. Supabase email templates and deployment

`docs/auth-emails/confirm-signup.html` and `reset-password.html` use inline email-safe styling, a text wordmark, the existing public logo, one action, fallback URL and security note. Exact prefetch-safe links are preserved:

- `https://arbor.ph/confirm-signup#token_hash={{ .TokenHash }}&amp;type=email`
- `https://arbor.ph/reset-password#token_hash={{ .TokenHash }}&amp;type=recovery`

Two template regressions and desktop/mobile previews passed. Hosted template configuration was not read or changed. No emails were sent. Inbox-client rendering and actual delivery still require the documented owner rollout. Change-email/invite/magic-link flows were not enabled.

## 11. Add Investment simplification

Portfolio retains one primary `+ Add Investment` entry. The redundant `Record Investment` action was removed from Ways to Invest. Monthly planning no longer presents a competing generic record action; successful submission guides users to existing holdings or Add Investment as appropriate. The catalogue and normal record/edit/delete paths remain unchanged.

## 12–13. BTC root cause and provider matrix

GCrypto, Coins.ph and PDAX already map to the same `btc_php` key. There was no provider-specific mapping defect to repair. Five backend age-boundary tests cover all three providers at 0, 600, 601, 3,600 and 3,601 seconds, including identical Decimal valuation, freshness and unavailable-allocation semantics.

The actual local UI recorded `0.001 BTC` through each provider. All three produced canonical fixture values of PHP 3,000.00 from the same quote. Holdings were removed afterward. These are isolated local values, not a claim that the expired hosted quote became usable.

## 14–15. Portfolio value change and graph ranges

The selected range compares its first and last real recorded observations. PHP subtraction uses integer cents/BigInt; the display percentage is rounded half-up to two decimals without binary-floating-point monetary arithmetic. Backend valuation/contribution math is untouched.

The label is **Portfolio value change**, with explicit disclosure that contributions and holding changes are included and this is not an investment return. A zero starting value has no percentage; zero/one observation never invents a baseline or history. Available range buttons only appear when enough history exists. Plotting still uses the existing chart library.

## 16–20. Portfolio sections and allocation

- **Holdings:** existing canonical values, original Arbor investment/provider identity system, freshness and source labels.
- **Performance:** first/latest recorded values and dates; truthful value-change explanation, no gains/returns claim.
- **Allocation:** existing canonical sleeve percentages, targets and differences. A new explanation names unavailable holdings and states they are not treated as zero.
- **History:** actual recorded observations in reverse chronological order; no transaction ledger or fabricated performance.

The allocation-unavailable cause is an incomplete canonical valuation, notably expired BTC in the diagnosed cache. With usable prices the provider-matrix and existing complete-portfolio checks pass. The production freshness issue remains the approval gate above.

## 21. Recent Activity

Home combines actual holding creation/update/manual-update timestamps with monthly completion/undo records. If a creation timestamp is absent, it says Updated rather than fabricating an addition. Holding activity does not invent a historical purchase amount from current valuation. Deleted holdings do not generate imagined removal events. This is a bounded recent-state summary, not a durable event ledger.

## 22. Ask Arbor

Readable conversation width, right-aligned user bubbles, left-aligned Arbor replies with an external avatar, persistent composer, labeled conversation log and portfolio-context suggestions. Enter/Shift+Enter behavior and deterministic response services are unchanged. No LLM financial calculation was introduced.

## 23–25. Monthly contribution and portfolio-value integrity

The primary action is **Submit monthly contribution**. Confirmation explicitly requires investing outside Arbor. It writes only the existing check-in record. Completion shows **Update holdings**, explaining how to enter actual total units/current fund value or add a new holding. Home offers a follow-up while no holding update has occurred after completion.

No `portfolio_total += contribution`, reference-price-derived executed units, automatic trades or snapshot creation was added. Completion/reload/idempotency/undo passed with holdings and history unchanged. Existing sub-cent contribution precision and two-decimal check-in normalization remain unchanged.

## 26–27. Home and onboarding

Home now follows the approved structure: monthly hero, three compact summaries, Your plan and Recent activity. A real recorded-value mini chart is used where available; source attribution remains visible below the cards. Empty/single-observation states remain truthful. Onboarding remained functionally unchanged and passed explicit 80/10/10 selection, confirmation and transition checks in an isolated fixture.

## 28–30. Public website refresh

The current Home/Portfolio composition, four tabs, visible graph/value-change label, holdings, Add Investment, optional customization, final plan, chat and monthly submit UI were recaptured under `frontend/public/product/vision/`. A new versioned URL avoids reusing the previous image cache.

24 WebP assets total 586,330 bytes; largest 43,238 bytes. Responsive mobile variants, dimensions, lazy loading and the existing Next image strategy remain. The social image uses the refreshed Home capture. Monthly copy now explains Review → Submit → Update holdings, with investing still performed through the provider.

Multi-date marketing history exists only in intercepted responses inside the local screenshot browser. It was never inserted into a datastore. Public captions explicitly identify illustrative data and recorded-value history, not investment returns. No founder identity or personal data appears in artwork.

## 31–33. Accessibility, responsive review and email previews

Semantic headings and form labels, live status/error text, keyboard actions, dialog behavior, focus outlines, the chat conversation log and reduced-motion behavior are retained. Public menu Escape/focus return and FAQ keyboard toggles passed. Full WCAG certification was not performed.

App functional matrices covered 1440/1024/768/390/320 at the relevant Plus/Free states. Final app-artwork matrices covered 1440/390/320 in light/dark. Auth captures cover 1440/390 light and 390 dark. Public production-build QA covered all five widths in both themes. Final runs reported no horizontal overflow or unexpected page/console errors. Email previews are local browser renderings, not claims about every email client.

## 34–37. Validation results

| Validation | Result |
| --- | --- |
| Frontend focused | 27 passed |
| `npm test` | 552 passed |
| `npm run e2e:test` | 25 passed |
| `npm run e2e:auth` | Normal isolated disposable session verified/reused; no profile written |
| Plus functional browser | 80 captures; 0 page/console errors; 0 hosted financial writes |
| Onboarding browser | 22 captures; 0 unexpected page/console errors; expected missing-profile 404 |
| Free browser | 24 captures; access/quota boundaries passed; 0 page/console errors |
| Auth fixtures | 39 captures; explicit verify actions passed; 0 real email/password mutations |
| Password/BTC boundary browser | 12 captures; 3-provider parity; password update mocked; 0 page errors |
| Portfolio recovery browser | 9 injected cases; safe retry and TOAP acceptance passed |
| Production-built public browser | 10 layouts, 54 captures; menu, FAQ, auth entry, SEO and reduced motion passed; 0 page/console errors |
| Backend focused | 194 passed |
| Full backend | 3,248 passed |
| Lint | Passed |
| Production build | Passed with requested `NEXT_PUBLIC_SITE_URL` and API URL |
| `npm audit --omit=dev` | 0 vulnerabilities |

Backend tests emit one existing Starlette/httpx deprecation warning. No dependencies were added. Financial test state was process-local; fixture processes were stopped, discarding all holdings, snapshots, check-ins and choices. Hosted cache and the established QA profile were not changed.

## 38–40. Diff and changed files

`git diff --check` passed. Tracked diff: **28 files, 152 insertions, 100 deletions**. This excludes new files, which remain untracked; nothing was staged.

Tracked areas: `DEPLOYMENT.md`; `backend/tests/test_live_portfolio.py`; frontend confirmation/reset pages and global/social wiring; AuthForm, SignupPending, PasswordResetRequest, PlanV2View, V2Home, ArborChat, MonthlyCheckin, MonthlyInvesting, PublicWebsite, LivePortfolio, PlanImplementation and PortfolioHistoryChart; chatSession/livePortfolio types; related existing assertions; completion and marketing capture scripts.

New source/test files: `AuthSurface.tsx`, `ChangePassword.tsx`, `auth-experience.css`, `vision.css`, `accountPassword.ts`/test, `portfolioActivity.ts`, `portfolioHistory.ts`/test, `authEmailTemplates.test.ts`, `scripts/e2e/auth-vision.mjs`, `scripts/e2e/vision-boundaries.mjs`.

New documents/assets: this report; the three `docs/auth-emails/` files; `public/product/vision/` (24 WebP images, one social PNG and sizes manifest). Runtime-generated, untracked Next agent hints were removed after stopping the dev server; no pre-existing user instructions were removed.

## 41. Review gallery

68 curated captures, ten contact sheets and a machine-readable inventory cover all 38 requested review surfaces plus dark modes/error cases:

`/Users/jonoxlr8/Documents/Codex/2026-09-07/i-x20/artifacts/vision-fidelity/index.html`

The gallery is labeled local review, with the unresolved BTC gate and unapplied hosted email status visible at the top. No production completion is implied.

## 42. Remaining transaction-ledger gap

Arbor still records holdings, not executed transactions. A durable purchase/removal activity feed, cash/pending contributions, realized gains or investment-return calculations requires separately scoped ledger work. This pass intentionally does not simulate that accounting.

## 43. Final repository and acceptance status

`main` remains at `63d09b0751efc4a89c5e6cfd8ba2ffce4cf96d32`, with the scoped modified/new files listed above. No commit, push, deploy, migration, flag change, cron change, credential disclosure/copy, market refresh or founder-data mutation. Normal QA authentication used locally configured credentials opaquely.

Local presentation and regression work is ready for founder review. **The entire milestone is not yet complete:** approve the bounded privileged BTC refresh design (or a separate trusted operator cadence), then validate hosted freshness separately. Apply/review the prepared Supabase email templates only under the documented rollout. Do not enable analytics based on this report alone.
