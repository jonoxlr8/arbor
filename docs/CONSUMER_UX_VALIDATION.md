# 3U-E — Consumer UX redesign handoff

This is the original 3U-E baseline report. The follow-up visual/identity pass is
documented separately in [3U-E.1 validation](VISUAL_FIDELITY_VALIDATION.md).

Validated locally on 2026-09-25. This is an uncommitted presentation change, not a
deployment or activation. No backend, migration, dependency, credential or
production configuration changes. No hosted financial writes.

## 1. Starting repository state

`main`, HEAD `2c7817c` (`feat: add first-run and monthly check-in flow`), clean.
The locally recorded `origin/main` matched HEAD; the remote was not fetched.
The user's completed 3U-D hosted validation is accepted, not repeated.

## 2. Approved-reference analysis

Adopted compact navigation, generous whitespace, a soft green hero, large PHP
values, a broad chart, identifiable list rows, native-feeling sheets and grouped
Settings. Did not copy illustrative holdings, gains, endorsements or logos.
The existing approved Arbor mark stays intact.

## 3. Journey problems found

The prior rendered interface duplicated portfolio history on Home, buried the
holding action, gave contribution controls equal visual weight, repeated large
containers and expanded pricing ahead of Settings tasks. The redesign separates
Home's next step from Portfolio's recorded investments and hides secondary detail.

## 4. Design system

See `CONSUMER_DESIGN.md` and `frontend/app/consumer.css`.

- Colors: Arbor green; navy/slate text; blue/teal/violet/gold sleeve identities.
- Typography: existing font stack, prominent tabular amounts, clear secondary copy.
- Spacing: 16/24/32px rhythm and intentional content width.
- Radius: 12/20/28px scale.
- Surfaces: light neutral/white; purpose-designed deep slate/elevated dark surfaces.
- Shadows: restrained, mainly modal/composer depth rather than every section.
- Motion: subtle interaction feedback; reduced-motion support.

## 5. Navigation

Home · Portfolio · Ask Arbor · Settings remain the only four destinations.
Compact desktop sidebar and labeled mobile bottom navigation retain existing
hash routing, selected states, skip link, page-heading focus and back/forward.

## 6. Home

One deterministic Next Action hero, compact recorded value when available,
planned monthly amount clearly labeled an assumption, investment-profile link
and target donut. No duplicate history graph or invented progress score.

## 7. Portfolio

Prominent Add Investment, dominant complete/known PHP value, real history,
Holdings/Allocation/Monthly contribution/Activity sections. Contribution results
lead their section instead of requiring a scroll past the chart.

## 8. Holdings

Identifiable rows replace individual large cards. A detail sheet separates
holding provider, recorded units, source/freshness and value. Edit/current-value
actions and holding deletion remain distinct.

## 9. Add Investment

Provider → supported investment → fund current value or ETF/BTC units → save.
Fund units and cost basis are progressive disclosures. Value-only funds remain
supported; no transaction or units are fabricated.

## 10. Transaction limitation

The existing system records holdings and behavioral monthly completions, not
executed purchases/sales. No fake Record Transaction action was added.

## 11. Monthly contribution

Canonical planned amount is prefilled when positive. One primary Preview
contribution action; alternate mode is secondary. User-selected implementation
and product acceptance remain explicit. Accepted amount/sleeve results lead;
implementation/minimum/accounting detail remains available behind disclosures.

## 12. Terminology

Primary controls use Monthly contribution, Preview contribution and Where will
you invest? Scenario identifiers remain internal. Existing non-suitability copy
inside the readiness disclosure still uses the term; it is not a primary control.

## 13. Plan Alignment

Labeled current/target bars, actual canonical percentages and plain-language
percentage-point differences. Unknown values are not rendered as zero. No score,
trading urgency or recommendation is introduced.

## 14. Ask Arbor

Integrated Arbor identity, conversational canvas, contextual suggestions, readable
bubbles and a compact composer. Response navigation links only open existing
product areas. No prompt, intent, calculation or guardrail architecture changed.

## 15. Settings

Investment Profile row, collapsed Plus comparison, existing appearance controls,
account/help groups and working Sign out. No fake settings or payment controls.

## 16–17. Asset and provider identities

Reusable AssetIdentity and ProviderBrand use local ticker/category/provider
monograms with textual names. They are not representations of official corporate
logos. Provider and market-data source remain separate.

## 18. Empty, loading and error states

Empty holdings invite tracking existing investments. No-history/one-observation
states do not draw fabricated performance. Skeletons match summary structure.
Portfolio error/retry and chat error paths were exercised in the local browser.

## 19. Live Portfolio OFF

Chosen plan and target mix lead. Manual/hypothetical contribution, implementation
education, Ask Arbor and Next Action remain functional. Disabled-mode browser
checks recorded **zero portfolio requests**, page errors and console errors.

## 20. Live Portfolio ON fixture

Existing explicitly local fixture entrypoints exercised holdings CRUD, value-only
funds, canonical contribution context and source wording. No production feature
flag was changed and no hosted holdings/history were written.

## 21. Monthly check-in

Existing presentation now uses the matching monthly/completed design. Mark as
invested, confirmation, undo, history and UTC semantics are unchanged. Completion
does not mutate holdings. Local browser checks are UI regressions, not a repeat
of hosted 3U-D persistence/security validation.

## 22. V1 compatibility

Existing V1 frontend tests pass in the full suite. Shared chat styling retains
its contracts; V2-only navigation actions stay V2-only. No separate live V1
browser account was exercised.

## 23. Accessibility

Native dialog supplies modal focus/inert background and Escape behavior. Browser
checks verified keyboard interaction and focus restoration. Labels, nav landmarks,
textual chart values, contrast-aware themes, reduced motion and large controls
are retained. This is not a full WCAG or screen-reader certification.

## 24. Performance

No new dependencies, remote logo requests or animation framework. Existing
Recharts is reused. Pure CSS identities, gradients and allocation visualization.
No new market-data requests, polling or financial fetch paths were introduced.

## 25. Responsive results

**1440, 768, 390 and 320px, Light/Dark:** all four destinations and the milestone
surfaces checked in Chromium. No horizontal overflow in the completed runs.
Visual iteration corrected the 320px theme label, Add Investment wrapping,
portfolio chart tooltip/date labels and result-first contribution layout.
Physical-device Safari testing remains a separate follow-up.

## 26. Screenshots

Durable local artifact directory:

`/Users/jonoxlr8/Documents/Codex/2026-09-07/i-x20/artifacts/arbor-3ue/`

For each `WIDTH` in 1440/768/390/320 and `THEME` in light/dark:

| Requested surface | Screenshot pattern |
| --- | --- |
| Home | `home-WIDTH-THEME.png` |
| Populated Portfolio | `portfolio-WIDTH-THEME.png` |
| Empty Portfolio | `empty-WIDTH-THEME.png` |
| Add Investment | `add-WIDTH-THEME.png` |
| Add fund value | `fund-value-WIDTH-THEME.png` |
| Holding detail | `holding-WIDTH-THEME.png` |
| Monthly contribution | `contribution-WIDTH-THEME.png` |
| Monthly completed | `completed-WIDTH-THEME.png` |
| Ask Arbor | `ask-WIDTH-THEME.png` |
| Settings | `settings-WIDTH-THEME.png` |

Also allocation screenshots, chat response, portfolio retry/error, first-run
confirmation and feature-OFF Light/Dark. There are 98 consumer/graph captures
plus those three first-run/OFF captures (101 total).

`graph-layout-fixture-*` uses eight **browser-only synthetic observations** to
inspect the multi-point chart. None is saved to a database or production state.
Ordinary fixture snapshots use actual local observations. All financial values
in these screenshots are disposable QA fixtures, not personal portfolio claims.

## 27. Comparison with the approved reference

The final screenshots were visually inspected, not only asserted. Add Investment
is immediately visible; portfolio value dominates; chart occupies a major canvas;
assets/providers are recognizable by text and color; Settings is grouped; chat
is integrated; mobile has designed sheets and labeled navigation. Green, whitespace
and soft depth follow the reference without its fabricated gains or logo assets.
This is a meaningful visual adaptation, not a pixel-for-pixel reproduction.
The five-second discoverability assessment is an inspection judgment, not a
measured usability study.

## 28. Functional browser results

Commands run from `frontend/`, with the existing local fixture backend:

| Command | Result |
| --- | --- |
| `node scripts/e2e/consumer.mjs` | Passed; 90 captures, four widths/two themes, keyboard modal, error/retry, manual fund, monthly preview/complete/undo; 0 page/console errors |
| `node scripts/e2e/consumer-graph.mjs` | Passed; 8 chart-layout captures, range/text data, 0 page errors; synthetic history not persisted |
| `node scripts/e2e/manual-fund-values.mjs` | Passed; value-only 8000 → 9000 → add units/NAV 1000 → clear with units → delete; 0 page/console errors |
| `node scripts/e2e/portfolio.mjs` | Passed; mixed holdings, 15200 then 20800 after edit, canonical contribution/product acceptance and Ask Arbor guardrails; 0 page/console errors |
| `node scripts/e2e/first-run.mjs` | Passed; explicit plan choice, confirmation and Home; profile creation intercepted, no hosted write |
| `ARBOR_MONTHLY_LIVE=true node scripts/e2e/monthly.mjs` | Passed; local completion, Home/reload/chat/undo, holdings unchanged, 0 page/console errors |
| `node scripts/e2e/portfolio-disabled.mjs` | Passed; manual contribution, chat limitation, Next Action; 0 portfolio requests/page/console errors |
| `node scripts/e2e/navigation.mjs` | Passed; four widths/two themes, back/forward, profile cancel, Compare Plans, chat continuity; 0 errors/portfolio requests |
| Sign out through existing authenticated browser helper | Passed; authenticated shell removed |
| `npm run e2e:auth` | Passed; dedicated account authenticated normally after sign-out |

All holding flows ended with **zero local test holdings**. Monthly completion was
undone. Stopping fixture processes discarded local snapshots/history. **Zero
hosted financial writes.** Existing ignored auth/session storage remains local.

## 29. Exact automated test counts

- `npm test`: **425 passed, 0 failed, 0 skipped**, including 12 new consumer tests.
- `npm run e2e:test`: **25 passed, 0 failed** (authentication/session tooling).
- Backend and SQL suites not rerun: no backend/schema changes and no hosted
  persistence validation requested for this redesign.

## 30. Lint, build and audit

- `npm run lint`: passed.
- `npx tsc --noEmit --incremental false`: passed.
- `NEXT_PUBLIC_SITE_URL=https://arbor.ph NEXT_PUBLIC_API_BASE_URL=https://arbor-api.onrender.com npm run build`: passed, 8/8 static pages.
- `npm audit --omit=dev`: **0 vulnerabilities**.

## 31. Diff check

`git diff --check`: passed with no output.

## 32. Diff stat

Tracked diff: **28 files changed, 218 insertions(+), 222 deletions(-)**.
Standard `git diff --stat` excludes the nine new untracked files listed below.
No staging was performed merely to include them in the stat.

## 33. Files changed

Presentation: `frontend/app/globals.css`, new `consumer.css`; ArborChat,
MonthlyCheckin, NextActionCard, OnboardingV2, PlanCreated, PlanV2View, ProviderBrand,
AppShell, V2Home, ContributionCard, ContributionResult, ImplementationChoices,
dashboard/ChatSection, LivePortfolio and PortfolioHistoryChart.

New reusable components: AssetIdentity, portfolio/Allocation and ui/Sheet.

Tests: appExperience, chatV2, contributions, livePortfolio, monthlyCheckin,
navigation3uc, nextAction and new consumerExperience. Browser scripts: updated
manual-fund-values, monthly, navigation, portfolio-disabled, portfolio; new
consumer and consumer-graph. Documentation: CONSUMER_DESIGN and this report.

## 34–36. Remaining work

- Real transaction tracking requires a separate owner-scoped ledger for dated
  purchases/sales, executions, fees, transfers and reconciliation; return math
  must not be inferred from snapshot changes.
- Obtain approved local provider-logo assets before using official logos.
- Final marketing/brand rollout and physical-device/browser accessibility review
  are separate. No public-site redesign, analytics, billing or notifications here.
- Production activation remains separate. The user-confirmed OFF states for
  Live Portfolio/monthly were not changed or revalidated against hosted storage.
  Marketstack Basic/launch requirements remain in their existing documentation.

## 37. Final repository state

Branch/HEAD unchanged: `main` / `2c7817c`. Uncommitted frontend/documentation
changes only. No commit, push, deploy, migration or feature activation.

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
?? frontend/app/consumer.css
?? frontend/components/AssetIdentity.tsx
?? frontend/components/portfolio/Allocation.tsx
?? frontend/components/ui/
?? frontend/lib/consumerExperience.test.ts
?? frontend/scripts/e2e/consumer-graph.mjs
?? frontend/scripts/e2e/consumer.mjs
```
