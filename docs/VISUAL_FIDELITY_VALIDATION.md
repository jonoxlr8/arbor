# 3U-E.1 — Visual fidelity and investment identity

Local presentation pass, September 25, 2026. Continues the existing uncommitted
3U-E; no restart, backend financial changes, hosted writes, configuration changes,
migration, commit, push or deployment. Production availability is unchanged.
The completed 3U-D hosted persistence work was not rebuilt or revalidated.

## 1. Starting repository state

`main`, HEAD `2c7817c`; existing uncommitted 3U-E: 28 tracked files modified and
9 untracked files at handoff. The locally recorded `origin/main` also resolves to
`2c7817c`; no remote fetch or reset was performed. All earlier work was retained.

## 2. Visual differences identified

Compared the three founder-supplied current screenshots with `arbor.ph.png`.
The old Home spread a thin plan section across the canvas; Portfolio used tiny
provider initials as asset identity, a collapsed-looking chart and four bulky
mobile buttons; Add Investment started with abstract dropdowns. Chat suggestions
looked like fields. Vendor details and repeated footer disclaimers competed with
primary content. The approved reference guided hierarchy, grouping, color,
spacing and the catalogue—not its illustrative holdings, returns or percentages.

## 3. Provider names

GFunds and GCrypto replace the combined GCash names in presentation. Gotrade,
DragonFi, Coins.ph and PDAX remain distinct. Canonical IDs and calculation inputs
are unchanged; provider totals and implementation labels use the same names.

## 4–7. Investment/provider identity and assets

Separate `InvestmentIdentity` and `ProviderIdentity` components use centralized
display-only metadata. Vanguard identifies VT/VGT/BND; ATRAM and BPI identify
their funds; Bitcoin has its own supplied symbol. Each holding separately names
where it is held. Production assets are local; no image search copies or hotlinks.

Bitcoin's supplied SVG is credited and distributed under the Bitcoin Design
project's offered CC BY 4.0 option. All other company identities are polished
typographic fallbacks, **not official logos**. Approved local assets/usage
confirmation are still needed for Vanguard, ATRAM, BPI Wealth, GFunds/GCrypto,
Gotrade, DragonFi, Coins.ph and PDAX. Some reviewed terms explicitly require
permission; none was assumed or sought by contacting third parties.
See [asset register and primary sources](INVESTMENT_IDENTITY.md).

## 8. Add Investment catalogue

Searchable grouped investment rows replace the provider-first form. Twelve
existing canonical provider/product combinations are available only when
returned by the authenticated API. Search supports ticker, fund, provider and
unit class. Empty search results have a clear state. Back returns to the
catalogue; Escape/Close restores focus. There is no ranking or suggested purchase.

## 9–12. Recording flows

- GFunds: choose an exact ATRAM fund → peso current value → Save Investment.
- DragonFi: choose an exact BPI PHP fund → current value → Save Investment.
- Gotrade: choose VT/VGT/BND → required Shares → Save Investment.
- Bitcoin: choose an equally styled GCrypto/Coins.ph/PDAX entry → required BTC
  amount → Save Investment.

Fund units remain behind “I know my fund units”; cost basis remains secondary.
No fake transaction date or execution status is collected. Existing validation,
manual-value freshness, NAV precedence and clear/delete rules are unchanged.

## 13. Holdings

Larger issuer identities, short fund/ticker headings, full ETF names, a separate
provider row, quantity/freshness and right-aligned PHP value replace database-like
rows. Detail sheets retain full names and valuation information. Empty Portfolio
uses Arbor's own mark rather than featuring one investment.

## 14. Portfolio graph

Value/history occupy a prominent, consistent surface. One point has an exact
amount/date in a soft chart canvas; zero/one-point states never draw a fake line.
Multiple recorded observations use the existing chart. “Portfolio history”
replaces the technical observation-count disclosure. Range/tooltip behavior and
the explicit non-return-chart explanation remain.

## 15. Home

The next-action hero has a decorative landscape, a shorter explanation and one
working CTA. Three compact summaries show portfolio context, monthly amount and
the selected approach—not horizon as the main investment-profile identity.
Plan and recent activity sit side by side on desktop and stack on mobile.
The activity area reads the existing monthly endpoint only when available and
eligible; records are not invented. Undone records are labeled as undone.
Completed-month summaries use the recorded amount; pending amounts are labeled
planned. Live Portfolio OFF retains the existing plan/horizon context.

## 16. Allocation colors

Global Equity blue, Technology violet, Defensive teal and Bitcoin gold are shared
by allocation, alignment and contribution previews. Text accompanies every
color. Canonical weights are unchanged: the test account's Aggressive target is
100% Global Equity and is intentionally not made artificially multicolored.

## 17. Monthly contribution

The existing preview-first 3U-E flow is preserved, with matching sleeve accents
and calmer primary copy. Confirmation, outside-Arbor execution wording, undo,
history, readiness gates and server-derived next actions are unchanged. Home's
recent-activity read is presentation only; no new persistence or decision engine.

## 18–19. Ask Arbor and Settings

Chat has the consistent Arbor mark, a clearly introductory companion message,
smaller suggestion chips, conversational panels and a round send control with
an accessible name. No canned message pretends to be a generated financial answer.
Settings has an account header, icons, grouped rows, disclosure arrows and
integrated appearance controls. No new payment or nonworking settings actions.

## 20–22. Copy, sources and product boundaries

Primary copy uses Portfolio value, Portfolio history, Shares, Bitcoin amount and
Save Investment. UTC and assessment explanations are not in the Home hero.
Market-data explanations sit under About prices & data. Required source links
remain visible in a discreet footer, including ExchangeRate-API's on-page link.
The repeated all-page footer is removed; trade/choice boundaries remain in
recording, contribution/check-in, chat and Settings Help & disclosures.

## 23–25. Desktop, mobile and Dark

Desktop uses the available width for a clear hero, compact summaries and a
two-column plan/activity row. Mobile uses one segmented tab row, bottom sheets,
prominent Add Investment, readable amounts and no horizontal overflow. Dark mode
has purpose-designed elevated surfaces, readable labels and the same identities.
No physical-device Safari or formal screen-reader certification is claimed.

## 26–27. Screenshot inventory and reference comparison

Artifacts are local disposable-account/fixture captures, not production screenshots.
The browser-only multi-point graph fixture never persists synthetic history.

**101 new PNG artifacts**: 92 consumer-flow captures, eight multi-point chart
layout captures, and one first-run boundary capture. Four supplied reference
images are also copied into the gallery for direct before/after comparison.

Local gallery:
`/Users/jonoxlr8/Documents/Codex/2026-09-07/i-x20/artifacts/arbor-3ue1/index.html`

| Required surface | Screenshot filenames in that directory |
| --- | --- |
| Home 1440 light / 390 light / 390 dark | `home-1440-light.png`, `home-390-light.png`, `home-390-dark.png` |
| Portfolio populated 1440 light / 390 light / 390 dark | `portfolio-1440-light.png`, `portfolio-390-light.png`, `portfolio-390-dark.png` |
| Portfolio empty 390 | `empty-390-light.png` |
| Add Investment 390 light / dark | `add-390-light.png`, `add-390-dark.png` |
| Add GFunds value 390 light | `fund-value-390-light.png` |
| Add VT 390 light | `add-vt-390-light.png` |
| Add Bitcoin 390 light | `add-bitcoin-390-light.png` |
| Ask Arbor 390 light / dark | `ask-390-light.png`, `ask-390-dark.png` |
| Settings 390 light / dark | `settings-390-light.png`, `settings-390-dark.png` |
| Multi-point graph, browser-only fixture | `graph-layout-fixture-{1440,768,390,320}-{light,dark}.png` |
| Completed, allocation, contribution and details | Corresponding `completed-`, `allocation-`, `contribution-`, `holding-` files for all eight viewport/theme combinations |

Inspected the requested screen families against the founder reference. Iterated
after inspection: integrated Settings appearance group, clearer peso input,
Arbor-branded empty state, a softer graph gradient, compact selected range tabs,
and wrapping of year-long history controls at 320px. The gallery includes literal
before/after pairs for Home, Portfolio and Ask Arbor. It does not claim pixel
identity or corporate logo completion. Exact source dates and known/partial values
remain truthful even when they differ from the illustrative approved screenshot.

## 28–30. Functional validation and commands

- Frontend: `npm test` — **437 passed**, 0 failed.
- Authentication helper: `npm run e2e:test` — **25 passed**, 0 failed.
- `npm run lint` — passed.
- `npx tsc --noEmit --incremental false` — passed.
- `npm audit --omit=dev` — **0 vulnerabilities**; no dependencies changed.
- `npm run e2e:auth` — normal dedicated-account authentication passed.
- Portfolio browser regression — CRUD, contributions, three Ask Arbor intents,
  attribution, Light/Dark at 1440/390/320; 0 page/console errors; 0 final holdings.
- Manual-fund browser regression — value-only create/update, canonical automatic
  priority after adding units, clear/delete; 0 errors and 0 final holdings.
- Monthly ON-fixture browser regression — completion/reload/chat/undo,
  unchanged holdings, eight responsive/theme combinations; 0 errors.
- Navigation enabled and disabled — all four destinations, back/forward,
  eight viewport/theme combinations, 0 errors; disabled mode made 0 portfolio
  requests.
- Feature-OFF browser smoke — manual contribution and chat returned 200,
  canonical contribution-review action worked, 0 portfolio requests and 0
  page/console errors. Both local availability flags were false.
- Consumer visual/browser suite — **92 captures**, catalogue search and all
  recording forms, error/retry, keyboard dialog/focus restoration, completion,
  undo, chat, cleanup; 0 page/console errors, 0 final holdings.
- Multi-point graph suite — **8 captures**, range behavior plus four-range
  320px non-overlap check; 0 page errors, no synthetic history persisted.
- First-run authenticated transport fixture — explicit plan choice,
  confirmation and Home transition passed; 0 page errors, no hosted profile writes.
- Production build — passed compilation, TypeScript and **8/8 static pages** with
  `NEXT_PUBLIC_SITE_URL=https://arbor.ph` and
  `NEXT_PUBLIC_API_BASE_URL=https://arbor-api.onrender.com`.
- Final dependency audit — **0 vulnerabilities**. Final authentication check
  verified and reused the dedicated session; no profile fixture written.

Eight milestone browser scenarios passed (portfolio, manual fund, monthly ON,
navigation ON, graph, consumer, first run, feature OFF), plus navigation OFF and
the separate authentication check. Backend suites were not rerun: no backend or
financial changes, and the task explicitly excludes persistence revalidation.
All fixture servers are stopped; local holdings, snapshots and monthly records
were discarded. Every scenario that created holdings also deleted them first.

An initial test exposed the new peso prefix's label lookup ambiguity. The input
now has an explicit accessible name; the entire manual-fund test passed afterward.
Intentional error/retry tests distinguish expected simulated failures from app
errors. No production secrets, personal accounts or hosted financial writes.

## 31–33. Git checks and files

`git diff --check` passes. The cumulative tracked diff is **29 files, 279
insertions, 256 deletions**. There are **19 new untracked files** in addition;
ordinary `git diff --stat` does not include them. All 48 files are named in the
final Git listing below. This includes the preceding uncommitted 3U-E; it is not
all newly introduced here. No backend, migration, dependency manifest, lockfile,
environment or public marketing file was changed by this pass.

Two agent-instruction stubs generated by this run of `next dev` were removed
after stopping the server; they contained no user content and Next can regenerate
them. No existing user work was deleted.

## 34. Transaction-ledger gap

Add Investment creates/updates holdings only. Monthly completion is the existing
user-reported activity record. No broker transaction persistence, execution,
import, inferred unit creation or dead Add Transaction action was added.

## 35. Final state and boundaries

No commit, push, deployment, feature activation, migration or Marketstack upgrade.
Backend financial logic and canonical calculations are untouched. No hosted
3U-D revalidation. Live Portfolio and Monthly Check-In availability remain under
the existing server gates; local fixture flags do not change production.

## Acceptance checklist

| Founder acceptance question | Assessment |
| --- | --- |
| 1. Substantially closer to the approved reference? | Yes: hierarchy, landscape, compact summaries, plan/activity, chart, sheets and chat were directly compared. |
| 2. Add Investment immediately discoverable? | Yes, a prominent Portfolio toolbar CTA plus empty-state CTA. |
| 3. Supported catalogue instead of provider-first selection? | Yes, all twelve canonical combinations, searchable and grouped. |
| 4. Vanguard/ATRAM/BPI/Bitcoin identities recognizable? | **Partial:** Bitcoin has a sourced symbol; issuer names/tiles are clear, but approved corporate logos remain pending. No inaccurate logo redraws. |
| 5. All six provider identities clear? | Yes through separate named/provider-colored identities; official provider artwork is pending. |
| 6. GFunds simplified? | Yes. |
| 7. GCrypto simplified? | Yes. |
| 8. Portfolio visual rather than textual? | Yes: prominent value/graph, issuer-led holdings, segmented sections, secondary detail disclosures. |
| 9. Home uses desktop canvas better? | Yes, plan and activity now share the row instead of one stretched plan area. |
| 10. Ask Arbor feels like a companion? | Yes, welcome panel, contextual chips, conversation bubbles and a compact composer. |
| 11. Technical market-data details de-emphasized? | Yes; required attribution remains visible, not removed. |
| 12. Box overuse reduced? | Yes; grouped holdings/settings and chips, with cards reserved for distinct summaries. |
| 13. 390px feels native-style and polished? | Yes by visual inspection; physical-device testing and approved corporate assets remain follow-ups. |

The remaining partial item is an asset permission/delivery gap, not a claim that
typographic fallbacks are official logos. The implementation uses the explicitly
allowed fallback policy while preserving names and issuer/provider separation.

## Implementation review

Next.js/React guidance informed fixed-size local imagery, semantic controls,
abortable reads and restrained state changes. Browser-verification guidance was
followed through the repository-mandated isolated Playwright helper. Auth, feature
gates, API ownership, server targets and financial engines were not duplicated.

## Exact final git diff --stat

```text
 frontend/app/globals.css                           |  1 +
 frontend/components/ArborChat.tsx                  | 51 ++++--------
 frontend/components/MonthlyCheckin.tsx             |  8 +-
 frontend/components/NextActionCard.tsx             | 17 ++--
 frontend/components/OnboardingV2.tsx               |  4 +-
 frontend/components/PlanCreated.tsx                |  7 +-
 frontend/components/PlanV2View.tsx                 | 31 +++----
 frontend/components/ProviderBrand.tsx              |  6 +-
 frontend/components/app/AppShell.tsx               |  6 +-
 frontend/components/app/V2Home.tsx                 | 60 +++++++++----
 .../components/contributions/ContributionCard.tsx  | 28 +++----
 .../contributions/ContributionResult.tsx           | 21 ++---
 .../contributions/ImplementationChoices.tsx        | 12 +--
 frontend/components/dashboard/ChatSection.tsx      |  8 +-
 frontend/components/portfolio/LivePortfolio.tsx    | 97 ++++++++++++----------
 .../components/portfolio/PortfolioHistoryChart.tsx | 21 ++---
 frontend/lib/appExperience.test.ts                 |  4 +-
 frontend/lib/chatV2.test.ts                        |  2 +-
 frontend/lib/contributions.test.ts                 | 10 +--
 frontend/lib/contributions.ts                      |  2 +-
 frontend/lib/livePortfolio.test.ts                 |  4 +-
 frontend/lib/monthlyCheckin.test.ts                |  2 +-
 frontend/lib/navigation3uc.test.ts                 |  4 +-
 frontend/lib/nextAction.test.ts                    |  2 +-
 frontend/scripts/e2e/manual-fund-values.mjs        | 30 +++----
 frontend/scripts/e2e/monthly.mjs                   | 18 ++--
 frontend/scripts/e2e/navigation.mjs                | 18 ++--
 frontend/scripts/e2e/portfolio-disabled.mjs        |  8 +-
 frontend/scripts/e2e/portfolio.mjs                 | 53 ++++++------
 29 files changed, 279 insertions(+), 256 deletions(-)
```

## Exact final git status --short

```text
 M frontend/app/globals.css
 M frontend/components/ArborChat.tsx
 M frontend/components/MonthlyCheckin.tsx
 M frontend/components/NextActionCard.tsx
 M frontend/components/OnboardingV2.tsx
 M frontend/components/PlanCreated.tsx
 M frontend/components/PlanV2View.tsx
 M frontend/components/ProviderBrand.tsx
 M frontend/components/app/AppShell.tsx
 M frontend/components/app/V2Home.tsx
 M frontend/components/contributions/ContributionCard.tsx
 M frontend/components/contributions/ContributionResult.tsx
 M frontend/components/contributions/ImplementationChoices.tsx
 M frontend/components/dashboard/ChatSection.tsx
 M frontend/components/portfolio/LivePortfolio.tsx
 M frontend/components/portfolio/PortfolioHistoryChart.tsx
 M frontend/lib/appExperience.test.ts
 M frontend/lib/chatV2.test.ts
 M frontend/lib/contributions.test.ts
 M frontend/lib/contributions.ts
 M frontend/lib/livePortfolio.test.ts
 M frontend/lib/monthlyCheckin.test.ts
 M frontend/lib/navigation3uc.test.ts
 M frontend/lib/nextAction.test.ts
 M frontend/scripts/e2e/manual-fund-values.mjs
 M frontend/scripts/e2e/monthly.mjs
 M frontend/scripts/e2e/navigation.mjs
 M frontend/scripts/e2e/portfolio-disabled.mjs
 M frontend/scripts/e2e/portfolio.mjs
?? docs/CONSUMER_DESIGN.md
?? docs/CONSUMER_UX_VALIDATION.md
?? docs/INVESTMENT_IDENTITY.md
?? docs/VISUAL_FIDELITY_VALIDATION.md
?? frontend/app/consumer.css
?? frontend/components/AssetIdentity.tsx
?? frontend/components/InvestmentIdentity.tsx
?? frontend/components/ProviderIdentity.tsx
?? frontend/components/app/SettingsIcon.tsx
?? frontend/components/portfolio/Allocation.tsx
?? frontend/components/portfolio/InvestmentCatalogue.tsx
?? frontend/components/ui/
?? frontend/lib/consumerExperience.test.ts
?? frontend/lib/investmentIdentity.test.ts
?? frontend/lib/investmentIdentity.ts
?? frontend/public/identities/
?? frontend/scripts/e2e/consumer-graph.mjs
?? frontend/scripts/e2e/consumer.mjs
```

The directory entries expand to `frontend/components/ui/Sheet.tsx` and
`frontend/public/identities/bitcoin.svg`, `frontend/public/identities/NOTICE.md`.
Everything remains unstaged and uncommitted on `main` at `2c7817c`.
