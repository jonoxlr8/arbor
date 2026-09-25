# Arbor full product completion pass

Implementation report — 25 September 2026. This document is the current source of
truth for the completion pass; earlier milestone reports remain historical.

**Status:** local implementation, automated tests, authenticated fixture flows,
real sign-in handoff, production build and visual iteration are complete. The new
flows are not deployed or hosted-write validated. Production Live Portfolio is
OFF (contrary to the brief's expected state); no activation was attempted.
Nothing in this report authorizes deployment or activation.

## 1. Starting repository state

The starting checkout was clean `main`, HEAD `7781d6b`. Earlier approved supplied
logos and 3U-G work were already present in that commit. No old milestone SHA was
used as the starting assumption.

## 2. Existing worktree preservation

The existing product, brand assets, provider destinations, portfolio persistence,
market-data adapters and monthly check-in storage were extended, not restarted.
All completion-pass edits remain uncommitted. No commit, push or deployment was
performed. Next's two generated instruction files (`frontend/AGENTS.md` and
`frontend/CLAUDE.md`), absent from the clean starting tree, were removed after
validation. Their contents remain regenerable by `next dev`; no user-authored
instructions or source were removed.

## 3. Production feature availability

The read-only authenticated production check returned:

| Capability | Verified runtime state |
| --- | --- |
| Live Portfolio | `availability.live_portfolio = false` |
| Monthly Check-In | `availability.monthly_checkin = true` |

This differs from the brief's expected both-enabled state. The production
Portfolio request returned the expected feature-gated 404; that is not evidence
of a failed valuation calculation. No Render flags were changed. Local fixture
availability is kept distinct from production availability throughout this report.

## 4. Current UX issues reproduced

The implementation audit found that optional customization was not a complete
explicit, saved user-choice journey; Ways to invest did not persist the user's
choice for each sleeve; monthly planning lived under Portfolio and exposed the
older route/scenario abstraction rather than an exact chosen-product breakdown.
The final target needed one shared reader so Home, Ways to invest, contributions
and Ask Arbor could not each interpret customization independently. Old public
copy/screens also needed to distinguish current production availability from the
new local preview. The gallery includes before captures and the final local
implementation for direct comparison; see section 57.

## 5. Final onboarding structure

The existing profile questions lead to an informational profile, explicit approach
selection, optional customization, a backend-calculated final-plan review, then
explicit confirmation. The success screen names the user's choice. Eligible
long-term users can continue to Ways to invest; Home remains available. Short-term
and Foundation First paths retain their own guarded behavior.

## 6. Informational profile

The profile summary explicitly says no plan has been selected for the user. It
summarizes their horizon, planned monthly amount and goal; it is informational,
not a suitability decision. The risk/profile assessment does not silently select
the next approach.

## 7. Approach selection

Conservative, Balanced, Growth and Aggressive remain the existing standardized
core models. No core weights were changed. Nothing is selected automatically in
the new choice flow. Short-term users select the existing short-term path without
a long-term allocation.

## 8. Technology customization

Technology is optional: None, 5% or 10%. None is the initial choice. Copy explains
that global equities may already contain technology companies and that this
choice adds concentration. Arbor neither recommends nor automatically enables it.

## 9. Bitcoin customization

Bitcoin is optional: None, 5% or 10%, initially None. Copy explains its larger
potential price swings and that it is not required for a complete plan. Bitcoin
is not automatically added based on profile, provider or an LLM response.

## 10. Satellite validation

The backend requires strict integer choices from `{0, 5, 10}` for each satellite,
with combined exposure no greater than 20%. Booleans, strings, unsupported values
and invalid totals are rejected. Satellite percentages are taken only from Global
Equity. Defensive is unchanged; negative Global Equity and non-100% totals are
invalid. Backend validation remains authoritative.

## 11. Final allocation engine

`backend/app/services/plan_customization.py` owns explicit customization and the
`canonical_target()` reader. The result has backend-added `user_selected`
provenance and a final allocation; restored final weights are checked against the
chosen core approach and explicit inputs. Decimal arithmetic and existing
allocation validation are reused. Frontend charts display this returned result;
they do not create a competing allocation engine.

## 12. Persistence architecture

The existing owner-scoped profile JSON stores `explicit_customization` and
`implementation_choices`. Existing server plan state stores the validated
explicit target and customization provenance. No table or migration is needed.
The read-only hosted constraint inspection confirmed that the existing profile
JSON requires its established answer keys but permits these additive fields.
The existing saved-profile restoration and preview/confirmation paths remain the
authority; client-supplied targets or provenance are not accepted as truth.

## 13. Historical compatibility

Missing explicit customization retains the meaning of an older saved plan.
Historical preference requests are not relabeled as new explicit choices, and
historical effective targets remain unchanged. New explicit targets require
coherent provenance. Profile edits preserve older saved preferences and saved
implementation choices, including dormant choices for currently zero-weight
sleeves. No historical plans are rewritten in bulk.

## 14. Change Plan

The existing profile/plan editor uses preview, review, cancel and confirmation.
Changing a plan is an explicit user action; opening the editor or changing a
radio control does not save a new target. Existing access gates and optimistic
concurrency protection remain in place.

## 15. Final Plan review

The final review names the chosen approach, shows the canonical final allocation
and says “You chose this allocation.” It identifies Technology/Bitcoin as added
by the user, or states that the core plan is unchanged. Foundation First remains
visible when it prevents contribution guidance. No recommendation is implied.

## 16. Ways to Invest

Ways to invest follows the nonzero canonical target sleeves, with neutral
investment/issuer identity, separate provider identity and official provider
links. Each active sleeve can have one explicit chosen implementation. There is
no default provider, recommendation, ranking or automatic split among providers.
The catalogue remains the supported universe rather than unrestricted products.

## 17. Global Equity implementations

Supported choices are Gotrade VT, GFunds ATRAM Global Equity Opportunity Feeder
Fund, and DragonFi BPI Global Equity Fund-of-Funds. The canonical IDs remain
`gotrade_vt`, `gcash_global_equity` and `dragonfi_global_equity`.

## 18. Technology implementations

Supported choices are Gotrade VGT, GFunds ATRAM Global Technology Feeder Fund,
and DragonFi BPI World Technology Feeder Fund. The canonical IDs remain
`gotrade_vgt`, `gcash_technology` and `dragonfi_technology`. The sleeve appears only
when the authoritative target contains it.

## 19. Bitcoin implementations

Supported holding choices remain Bitcoin at GCrypto, Coins.ph or PDAX:
`gcrypto_btc`, `coins_btc`, `pdax_btc`. These are user-selected holding providers,
not price vendors. None is preferred or ranked by Arbor.

## 20. Defensive implementations

Supported choices are Gotrade BND, GFunds ATRAM Medium Term Peso Bond Fund, and
DragonFi BPI Premium Bond Fund: `gotrade_bnd`, `gcash_defensive`,
`dragonfi_defensive`. Customization does not reduce the Defensive target.

## 21. Provider links

The existing shared canonical provider-destination whitelist is reused. Links
open the provider; they do not place an order, transmit a portfolio or imply
account linking. No affiliate parameters, tracking or partner claims were added.
User-facing names remain GFunds, GCrypto, Gotrade, DragonFi, Coins.ph and PDAX.

## 22. Implementation-choice persistence

`PUT /v2/implementation-choices` accepts only `expected_revision` and a map of
canonical sleeve to supported product. It derives the owner from authentication,
uses the user's normal database session/RLS and compares the previous profile
JSON before writing. A stale revision returns a conflict rather than overwriting
another edit. Free basic-implementation access is retained. The response is the
restored canonical plan and new revision.

Unchanged dormant choices are preserved across edits. A newly selected or changed
choice for a zero-target sleeve is rejected. Clearing choices is explicit. The
frontend submits the existing map plus the changed sleeve so other saved choices
are not accidentally discarded. No host, owner, target or provider URL is accepted
from this request.

## 23. Empty Portfolio

The existing empty-state journey remains a real empty portfolio: explore Ways to
invest, open a provider, invest outside Arbor, then record a supported holding.
Feature-off and Free views show the plan and implementation options rather than
fake holdings. They do not make disabled portfolio requests. Final empty-state
captures cover 1440/390/320px, Light and Dark. Free and the normal feature-OFF
auth handoff both passed with no hidden portfolio requests.

## 24. Populated Portfolio

The existing canonical recorded holdings, known value, attribution, freshness and
history remain intact. New choices do not change a holding's units, manual value
or provider. Recording a monthly completion does not mutate the portfolio.

## 25. Add Investment

The existing supported investment catalogue and prominent Add Investment entry
remain. Issuer and provider identity use the shared abstraction and supplied local
logo files unchanged. The flow records current holdings; it is not a transaction
ledger or broker import.

## 26. Fund recording

The six supported GFunds/DragonFi funds retain current-PHP-value-only tracking.
Units are optional. Fresh manual values remain explicitly user-entered; official
NAV is never implied. With valid units, usable canonical NAV has priority. Without
units, NAV alone cannot value the holding. Existing seven-day manual freshness
and clear-value constraints are unchanged.

## 27. ETF recording

VT, VGT and BND still require positive units/shares. Manual-current-value overrides
remain invalid. Canonical market prices and FX remain the valuation sources; no
market-data adapter or pricing threshold changed.

## 28. Bitcoin recording

Bitcoin still requires a positive BTC quantity and an explicit supported holding
provider. Coinranking remains a price source, not the holding provider. No manual
PHP override, fake units, trade execution or provider synchronization was added.

## 29. Portfolio graph

Only actually recorded snapshots form graph history. The retained chart footprint
handles empty/insufficient history without fabricated lines or gains. Neither a
new plan choice nor monthly completion creates a snapshot automatically.

## 30. Holdings

Recognizable issuer identity stays separate from provider identity. The supplied
Vanguard, ATRAM, BPI, Bitcoin, GCash, Gotrade, DragonFi, Coins.ph and PDAX logos are
unchanged. GCash visual identity may accompany the text GFunds or GCrypto. Current
quantities, manual timestamps and reference-price freshness remain factual.

## 31. Allocation

Home, portfolio comparison, Ways to invest and monthly calculations consume the
same saved final targets. Current allocation still comes from canonical portfolio
valuation, not planned contributions. Missing/stale data is not manufactured as
zero, and target percentages are not presented as actual holdings.

## 32. Plan Alignment

The existing comparison uses canonical current values against the explicit final
target. Source completeness/freshness safeguards remain. Manual fund values are
not penalized merely for being manual when they satisfy existing validity rules.
No opaque score, success probability, return promise or automatic switching was
introduced.

## 33. Monthly navigation placement

“Invest this month” now belongs to Home at `#home/monthly`, rather than being a
Portfolio tab. Older Portfolio contribution links are routed compatibly. The
deterministic Next Action key chooses this destination without displacing
Foundation First, incomplete-profile, short-term or applicable portfolio-review
priorities. Free upgrade destinations are not redirected into an unavailable flow.

## 34. Monthly exact allocation

`GET/POST /v2/monthly-plan` restores saved targets, readiness and implementation
choices, then returns exact PHP Decimal amounts for the user-chosen products.
There is no provider default and no same-sleeve provider split. The response
separates ready, verify-minimum, below-minimum, choose-investment and zero-amount
states. This new result contract coexists with the older contribution APIs.

## 35. Existing-portfolio target-gap behavior

The new path reuses the existing post-contribution target-gap calculation, largest
positive gaps first with the existing deterministic tie order. It does not simply
repeat target percentages when the portfolio is off target. Product choice and
minimum checks cannot change the calculated sleeve candidates. No selling is
proposed to remove an excess. With Live Portfolio enabled, complete fresh canonical
values are used; incomplete/stale values stop the calculation. When it is disabled,
users explicitly supply current sleeve values or confirm they have none. The
profile's hypothetical starting amount is never silently treated as holdings.

## 36. Provider grouping

Rows include the chosen product and canonical provider ID. Provider groups sum
the exact amounts for those rows, with separate ready, verify and waiting totals.
Changing a provider changes the grouping/minimum status, not target-gap arithmetic.
Unchosen products remain visibly unchosen and are excluded from provider groups.

## 37. Minimum handling

Existing minimum data and logic are preserved: Gotrade's practical PHP100
threshold; known fund initial/additional minimums; Coins.ph's PHP5 minimum;
GCrypto's BTC-quantity minimum; and verification for unknown/incompatible
minimums such as PDAX. Exact product ownership, not merely owning the same sleeve,
determines an additional-investment fund minimum. No invented exchange conversion
turns a BTC quantity minimum into a PHP fact. Below-minimum amounts remain visible
and are not silently redirected to another sleeve.

## 38. Carry-forward design/result

Persistent carry-forward is deliberately deferred. The response explicitly
returns `carry_forward_saved = false`, and UI/Ask wording says waiting amounts are
not saved between months. There is no invented cash balance, automatic next-month
rollover or new ledger. A future implementation requires explicit balance and
correction semantics; this pass does not pretend that storage exists.

## 39. Accounting invariant

Every result validates the exact invariant:

`ready + verify_minimum + waiting + choose_investment + reserve + unallocated = contribution`.

Per-row and per-provider totals reconcile as well. Existing Decimal calculations
can produce sub-cent planning values; these are displayed exactly, without a new
rounding policy that could change allocation. The actual completion amount remains
a user-confirmed two-decimal PHP amount. A fractional computed prefill is not
silently rounded and reported as invested.

## 40. Change implementation

The monthly view and Ways to invest reuse the same picker/persistence endpoint.
After saving, the canonical saved plan is restored, stale in-flight requests are
cancelled, and the monthly result is recalculated while retaining the entered
contribution amount. No selection is saved just by opening the picker. Conflict,
loading and error states remain explicit.

## 41. Monthly completion

Existing hosted check-in RPC/storage, owner/month/timestamp controls, idempotency,
undo and history semantics are reused, not rebuilt. The canonical month remains
UTC. Ready plus verify-minimum amounts may prefill the user's confirmation;
waiting, unchosen and reserve amounts cannot. The user must confirm what they
actually invested externally, including checking provider constraints. “Recorded
as invested” is not execution verification. No holdings, units, prices, snapshots
or broker transactions are created by this action.

## 42. Home

Home retains one deterministic next step and now owns the monthly workflow.
Greeting, monthly status, portfolio surface, selected-plan summary and real recent
activity use the existing visual system. There are no streaks, countdowns or
price-driven trading alerts. Completed current-month state does not pressure the
user to repeat the same contribution.

## 43. Home portfolio state

The Home portfolio surface distinguishes feature unavailable, Free, empty,
populated, loading and error states. Actual known values/history are only requested
when allowed. An unavailable feature is not presented as an empty real account.
The existing planned monthly contribution is labeled as planned, not held money.

## 44. Home final plan

The selected approach remains the profile identity, while the allocation display
uses the validated final target including explicitly chosen satellites. The core
plan and current holdings remain conceptually distinct. Historical plans remain
identified as historical rather than silently restyled as new choices.

## 45. Ask Arbor

Deterministic context includes final targets, explicit customization/provenance,
saved product choices and current monthly completion. Relevant monthly questions
call the same monthly-plan service instead of letting an LLM calculate amounts.
Replies explain sleeve amounts, chosen provider, target gaps and minimum status;
missing/current-value errors are explained rather than treated as zero. Bitcoin
remains optional. Historical requests are distinguished from current explicit
choices. Unsaved monthly-view edits are explicitly unavailable to chat. “What
should I do next?” follows deterministic priority and the Home monthly destination.
The existing refusal to pick investments/rank providers remains intact.
Manual fund explanations also apply presentation-only GFunds/GCrypto names;
canonical provider IDs and stored valuation metadata are unchanged.

## 46. Settings

The existing grouped Settings and Investment Profile entry remain; Change Plan
uses the new explicit customization/review flow. Saved provider choices are not
lost through unrelated profile edits. No new billing controls, notifications,
fake integration toggles or data collection were added.

## 47. Free experience

Free keeps standardized plan choice, target understanding, basic planning, Ways to
invest and official provider links. Explicit implementation choices use the basic
implementation entitlement, not a new paywall. Rich monthly planning and portfolio
tracking remain Plus. Public limited Ask quota is described conditionally because
the Free quota migration is still absent; this pass does not claim it is live.

## 48. Plus experience

Private-beta Plus continues to use existing entitlements. Canonical holdings,
contribution planning, full Ask and monthly activity are subject to their existing
availability gates. There is no checkout or billing activation. Planned public
pricing remains PHP399/month or PHP3,990/year, clearly separate from free beta.

## 49. Real hosted Plus validation

The coordinating read-only verification used the disposable E2E identity and
verified Arbor Supabase project `gnjjtlswwhkpiabyayvi`, existing feature migrations
and production entitlement state. No founder/personal portfolio data was used.
Live Portfolio being off prevents claiming a new hosted end-to-end portfolio
write/valuation pass. New customization/monthly-choice writes are exercised in the
isolated local authenticated fixture; they are not deployed or hosted-validated.
No hosted financial writes or cleanup obligations were created by this pass.

## 50. Market-data refresh

No market-data refresh was performed in this pass. Read-only hosted inspection
found seven shared observations: VT, VGT, BND, USD/PHP, BTC/PHP, BPI Technology and
BPI Defensive. Most had 24 September fetch timestamps. Existence is not a claim
that every value is fresh now; no observation was changed or manufactured.
Adapters, vendors and cache thresholds were not changed. Marketstack Basic is
founder-confirmed active; no upgrade or production activation was performed here.
Prior hosted real-cache validation is historical evidence, not a new refresh.

## 51. arbor.ph synchronization

The existing public-site design is retained and synchronized with the latest
local app journey, using neutral fixture data. No broad marketing redesign or
authenticated shell replacement was introduced. Public and signed-in surfaces
share identity assets, typography, allocation palette, buttons and provider links.

## 52. Website messaging

Public copy explains user-chosen approaches and optional None/5/10 customization,
the supported provider journey, manual tracking and exact contribution preview.
Current production monthly check-ins are distinguished from the newly prepared
provider-grouped monthly view. Live Portfolio and local undeployed changes are
labeled as previews, not generally available capabilities. There is no broker
sync, custody, investment recommendation, endorsement or execution claim.

## 53. Website screenshots

The fixture capture pipeline has been extended for customization and the new
Home-owned monthly breakdown. Captures must use neutral public identity, no test
emails and no personal holdings. `frontend/public/product/completion/` contains
17 WebPs totaling **381,032 bytes** (5,246–42,176 bytes each), plus a separate
211,350-byte social PNG. Home, Portfolio, Ways, holdings and allocation have
desktop/mobile versions; customization, catalogue, fund entry, Ask, Settings and
the provider-grouped monthly result are current captures. Intrinsic image sizes
and alt text match the actual crops. Older image sets remain historical.

## 54. Accessibility

Customization uses labeled native radio groups and visible help; final review has
semantic headings. Existing sheet focus/escape behavior is reused for investment
choice. Status/minimum distinctions are textual, not color-only. Amount errors,
pending requests and deliberate completion confirmation remain explicit.
Browser checks cover sheet keyboard containment/Escape, mobile menu Escape/focus
return, native FAQ keyboard operation, labeled controls and deliberate completion
confirmation. Light/Dark captures were inspected for readability. This is a
targeted accessibility review, not a formal WCAG or assistive-technology audit.

## 55. Responsive behavior

The completion pass extends existing light/dark tokens and mobile sheet patterns,
with exact monetary strings preserved rather than rounded. The summary total is
kept on one line at 320px; longer explanatory labels may wrap.
1440/1024/768/390/320px checks passed in Light and Dark with no horizontal
overflow. Populated Home/Portfolio cover the full matrix; empty, monthly, Free
and mobile form states have dedicated captures. Public pages cover all five
widths and both themes. The 320px amount-wrap defect was corrected and recaptured.

## 56. Visual comparison against approved Arbor reference

The approved compact, calm product hierarchy remains the acceptance reference.
New customization, saved implementation choice and Home monthly screens use the
existing identity system rather than dashboard-style engine controls. Actual
desktop/mobile captures were visually compared with the approved reference:
recognizable issuer/provider rows, restrained green/blue/violet surfaces,
prominent real portfolio history, a conversational Ask page and grouped Settings
remain consistent. Fixture amounts and illustrative previews are not claims of
investment performance. No invented return or line history was added.

Visual iteration retained the approved 3U-G Home composition: a large portfolio
surface beside two stacked compact summaries. A new equal-height three-column
override was removed because it introduced excessive unused space. This was a
targeted return to the approved hierarchy, not another shell redesign.

## 57. Final screenshot gallery

[Open the review gallery](/Users/jonoxlr8/Documents/Codex/2026-09-07/i-x20/artifacts/completion/index.html).

- Final authenticated app: **114 captures** — Plus 80, Free 24, first-run Free 10.
- Public website: **54 captures**, including 10 complete viewport/theme layouts,
  product sections, mobile menus and signup/sign-in entry.
- Before-pass captures are a separate historical group, not counted as final.
- Each filename records state/viewport/theme. The three `summary-*.json` files
  under `app/` are the authoritative final app inventory; failed diagnostic
  captures are excluded.

Coverage includes informational profile, explicit approach, customization, final
review, first Home, empty/populated Portfolio, Ways, implementation picker,
catalogue, fund/share/BTC inputs, monthly gaps/minimums/provider grouping, completed
Home, Ask answers, Free exhausted quota, Settings and public showcases. Public
production assets use neutral Alex fixture data without email/test identifiers.

## 58. Backend tests

Final backend rerun after the Ask navigation/provider copy corrections: **3,059 passed** with
`.venv/bin/pytest -q -p no:cacheprovider`. This includes **57 new monthly-plan
tests**, explicit customization/persistence tests, owner/CAS checks, existing
portfolio/contribution/Ask regressions and isolated completion-fixture coverage.
The focused manual-value/monthly/Ask/Next Action/check-in run passed **227 tests**. The only
warning was the existing Starlette/httpx TestClient deprecation. The final
coordinating rerun again passed all 3,059 tests in 9.33 seconds.

## 59. Frontend tests

New/updated tests cover target reading, customization validation, profile payloads,
monthly Decimal response validation/exact display, navigation and public copy.
`npm test`: **502 passed**, zero failed/skipped.

## 60. Browser E2E

The existing auth harness checkpoint is **25 passed** (`npm run e2e:test`, reported
by the coordinating run). Milestone browser validation uses the isolated backend
fixture with real authenticated request handling and in-process test storage;
it does not write hosted financial data.

- Plus: explicit 80/10/10 plan, saved VT/VGT/PDAX choices; fund-only PHP8,000,
  one VT share PHP5,600 and 0.001 BTC PHP3,000 give **PHP16,600**.
- PHP10,000 monthly preview: empty portfolio **8,000/1,000/1,000**; recorded
  portfolio **7,680/2,320/0**. A GFunds Technology choice with PHP100 below its
  minimum remains waiting; changing provider does not change sleeve amounts.
- Thirteen Ask questions passed, including explicit-user-choice attribution,
  monthly gap explanations, manual-value source and the no-buy-advice boundary.
- Completion, reload, idempotency and undo passed. Holdings and recorded snapshot
  history stayed unchanged. Holdings were deleted; stopping/restarting the
  isolated fixture cleared its test history. No hosted financial writes occurred.
- Free: plan/Ways/official links and saved implementation choice work; portfolio
  requests stay absent; exhausted Ask composer and Plus link behave correctly.
- First-run Free: profile through explicit 80/10/10 confirmation and Home/Ways
  passed. Expected initial missing-profile 404 is recorded separately, not hidden.
- **Zero unexpected page/console errors** in all three final app runs.
- Anonymous public QA also passed against the **built production bundle**: 10
  layouts, 54 captures, no overflow, zero page/console errors and zero hidden
  feature requests; signup/sign-in entry, keyboard menu/FAQ, deep link, metadata,
  social image, sitemap/robots and reduced-motion checks passed.
- `npm run e2e:auth` passed: dedicated identity verified, no profile fixture write.
- Genuine public sign-out/sign-in restored the saved hosted plan, all four
  destinations and reload, with both optional features OFF in the local backend:
  zero page errors, zero hidden feature requests, zero financial writes.

## 61. Lint/build/audit

`npm run lint`: **pass**. TypeScript check: **pass**. Production dependency audit:
**0 vulnerabilities**. `npm run build`: **pass**, using
`NEXT_PUBLIC_SITE_URL=https://arbor.ph` and
`NEXT_PUBLIC_API_BASE_URL=https://arbor-api.onrender.com`. No dependency upgrade or
new large runtime library is part of this pass.

## 62. `git diff --check`

Clean after implementation, tests and final documentation. Exact final repository
checks are included in the Git evidence linked below.

## 63. `git diff --stat`

The tracked diff is **49 files changed, 664 insertions, 249 deletions**. It excludes
new files. The complete tracked diffstat and expanded untracked inventory are
saved in [Git evidence](/Users/jonoxlr8/Documents/Codex/2026-09-07/i-x20/artifacts/completion/git-state.txt);
section 67 gives the final counts.

## 64. Files changed

Implementation areas (the exact filename inventory is in `git-state.txt`):

- Backend: `services/plan_customization.py`; profile schema, restoration/editor
  and profile routes; shared contribution helpers; `implementation/choices.py`;
  `services/monthly_plan.py` and `routes/monthly_plan.py`; main router registration;
  canonical Ask context/explanations/chat; narrow Next Action/monthly copy.
- Frontend: onboarding/approach/customization/final review/profile editor;
  PlanV2 routing; Home; ImplementationPicker/Ways to invest; MonthlyInvesting and
  monthly completion integration; shared target/profile/monthly types/helpers;
  scoped style sheets; public content, website/social preview and capture script.
- Tests: backend customization/monthly and regression assertions; isolated
  completion app/tests; frontend target/monthly/profile/public tests; completion
  browser runner and newly captured optimized public/review assets.
- Documentation: this report plus current-status notes in `MONTHLY_LOOP.md`,
  `CONSUMER_DESIGN.md` and `PUBLIC_WEBSITE.md`. Historical sections are preserved.

## 65. Any migration prepared but NOT applied

No new migration is required or prepared. Read-only hosted history confirmed the
base Live Portfolio, manual-fund-value and monthly-check-in migrations already
present; monthly is `20260924115550 — 3u_d_monthly_checkin`. The Free Ask Arbor
`3u_a_ask_usage.sql` migration remains absent, with no quota objects created.
No migration was applied, rewritten or otherwise altered during this pass.

## 66. Remaining product/backend gaps

- Production differs from the user's expected runtime: Live Portfolio is still
  off. Activation requires a separate explicit operational decision.
- New explicit customization/implementation-choice/monthly view changes remain
  local and undeployed. They are not claimed as live production behavior.
- A separately authorized release should deploy the backward-compatible backend
  before the frontend that sends the new explicit-choice fields. Then validate
  normal hosted profile save/reload and monthly planning with the disposable
  account. No migration is required; do not bundle feature activation into it.
- Persistent carry-forward remains deliberately deferred and visibly disclosed.
- Ask's monthly explanation uses the saved monthly amount and current canonical
  data. A different unsaved preview amount is not chat context; the reply says so
  explicitly rather than claiming to remember or recompute a displayed preview.
- There is no broker synchronization, transaction ledger, order verification or
  automatic reconciliation between monthly activity and holdings.
- Free Ask quota deployment, payments, analytics and reminders are not implemented
  or activated here. Full public legal documents remain a separate launch task.

## 67. Final Git status

Branch remains `main`, HEAD `7781d6b`. All completion-pass changes remain
uncommitted and unstaged: **49 tracked modified files and 36 untracked files**
(including 18 optimized image assets). No push or deployment occurred. Exact final
`git status --short` and expanded untracked inventory are in the gallery's
`git-state.txt`. No production feature flag, hosted schema, shared cache or
personal portfolio was changed by this pass.

## Acceptance answers

Items 1–19 and 21–30: **Yes in the validated local implementation**. Explicit
choice, conservative defaults, Decimal totals, owner-scoped persistence, official
links, visible recording, Home monthly workflow, gap/minimum accounting and Free
boundaries are covered by tests and the gallery.

20: **Yes, using real fixture-held values and actually captured snapshots**; an
insufficient-history state stays honest instead of drawing fake performance.

31: **Yes locally for Plus; not yet a hosted acceptance pass.** Production Live
Portfolio is OFF and the new release remains undeployed. A separate authorized
release and hosted validation are required before claiming this operationally.

32–33: **Yes, by visual review.** The public site now uses the current app's actual
fixture captures, and the existing approved Arbor identity/layout is preserved.

34: **The journey is visibly explicit and beginner-oriented.** The first-run
browser walkthrough passes; comprehension within seconds is a design assessment,
not a measured user-study result.
