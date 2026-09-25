# Premium UX, Portfolio errors and original identity review

Local implementation and browser review completed September 26, 2026.
No commit, push, deployment, migration, dependency installation, analytics,
production flag change or hosted financial mutation was performed.

[Open the 55-image review gallery](/Users/jonoxlr8/Documents/Codex/2026-09-07/i-x20/artifacts/premium-ux/index.html)

## Implementation report

1. **Starting state:** clean `main`, HEAD
   `f15f57fed76d0b8ccf26c1baa9ea667cb6276eee`. Existing authenticated and public
   redesigns were continued, not restarted. Backend files remain unchanged.
2. **Portfolio error root cause:** the initial read catch in `LivePortfolio.tsx`
   discarded the API's useful safe failure and replaced every case with the same
   generic unavailable message. This explains the masking, not the underlying
   cause of the founder's particular hosted request; that was not reproduced.
3. **Error handling:** a small typed `PortfolioError` and `portfolioReadError`
   allow only predefined display messages. Raw response bodies, unknown thrown
   messages, URLs, stack traces and payloads never become initial-read UI copy.
4. **Error codes:** 401/invalid session → `portfolio_auth`; 403 →
   `portfolio_entitlement`; 404 → `portfolio_unavailable`; invalid 200/JSON →
   `portfolio_contract`; fetch failure/known timeout → `portfolio_network`;
   500/503/unexpected failure → `portfolio_server`. Retry clears the message and
   makes a fresh uncached read. It cannot save a holding or capture a snapshot;
   normal entry/post-edit snapshot behavior remains unchanged.
5. **Error regression tests:** unit coverage for HTTP categories, malformed
   responses, safe fallback and GET-only retry; existing TOAP/mixed/unknown-source
   tests preserved. Nine real-browser fault/recovery cases passed, including a
   populated retry: zero portfolio writes, zero page errors, TOAP attribution
   rendered, unknown source rejected. Six browser transport/HTTP console errors
   were expected from intentional fault injection, not ordinary-flow failures.
6. **Onboarding audit:** the prior progress badge, generic card treatment and
   form-like money inputs did not match the calmer authenticated app. The old
   sticky actions also covered part of the new customization preview in an
   initial capture; this was corrected during visual iteration.
7. **Onboarding redesign:** centered setup shell, restrained brand/progress,
   focused question hierarchy, large PHP entry, generous touch areas and clear
   Continue controls. No dashboard sidebar. Original step codes, answers,
   readiness logic, validation and persistence paths remain intact.
8. **Profile:** original globe treatment, prominent informational profile,
   compact horizon/monthly/goal context, explicit statement that no plan has
   been selected. The user still proceeds to compare approaches.
9. **Approach selection:** four concise approaches, canonical allocation bars,
   visible selection state and disabled Continue until explicit choice. Risk
   context remains available without becoming the main visual.
10. **Customization:** optional Technology/Bitcoin None/5%/10% controls and
    original category icons. First onboarding defaults to None/None. A live
    allocation preview uses the existing authenticated backend preview endpoint,
    validates the returned choices and cancels obsolete requests. No frontend
    allocation calculator was added. Editing still restores saved choices.
11. **Final plan:** “Your plan is ready”, prominent allocation and explicit
    “You chose this allocation” / satellite provenance. Only confirmation saves.
12. **Ways transition:** plan-created screen now shows the confirmed allocation
    and clearly leads to Ways to Invest. Browser assertions confirm 80/10/10,
    with Defensive unchanged, rather than relying on screenshot labels alone.
13. **Identity system:** reusable original `ArborIdentityIcon` vectors are
    selected by existing presentation metadata. Investment category and holding
    provider remain separate concepts; canonical IDs and product allowlists do
    not change. No altered corporate trademark is presented as Arbor artwork.
14. **Investment icons:** globe, circuit, shield and neutral faceted coin.
    Factual Vanguard/ATRAM/BPI/Bitcoin and full product/class names remain.
15. **Provider icons:** GFunds layered units; Gotrade market window; DragonFi
    facets; GCrypto wallet; Coins.ph paired coins; PDAX exchange motif. These are
    six original Arbor badges, not official provider logos.
16. **Color mapping:** green equity identity, violet/blue technology, teal
    defensive, gold crypto, with subtle separate provider tones. Existing
    allocation palette and labeled percentages remain consistent across charts.
17. **Holdings:** shared category icons plus separate provider badge/text. No
    value, quantity, NAV/date, source, freshness or manual-value rule changes.
18. **Catalogue:** the same icons appear in the server-supported All/Funds/ETFs/
    Bitcoin catalogue. Browser checks retain 12 total, 6 funds, 3 ETFs and 3
    provider-specific Bitcoin options. Current-value-first fund entry remains.
19. **Ways to Invest:** same metadata/components, canonical official links,
    nonzero target sections and user-selected implementations. No rankings.
20. **Monthly plan:** investment/provider identities now visually match holdings
    and catalogue through shared components. Canonical exact amounts, provider
    groups, below-minimum and verify-minimum presentation are retained.
21. **Graph refinement:** smooth green line, subtle existing fill and compact
    PHP axis labels. The visible axis fits observed values instead of starting
    at zero; this is a visual scale change only. Values, date filtering,
    snapshot capture rules and financial calculations are unchanged. Empty and
    single-observation states still explain why no multi-date line exists.
22. **Demo history:** only the guarded marketing browser substitutes eight
    illustrative recorded-value observations into GET/snapshot responses. It
    never inserts them into a store. Production continues using actual snapshots.
    The public captions explicitly say these are not investment returns.
23. **Home screenshot:** neutral Alex, monthly hero, PHP 161,400 example with
    mini graph, monthly amount, profile and compact plan/activity columns. The
    complete desktop composition is captured, not a stretched partial card.
24. **Portfolio screenshot:** graph, immediate Add Investment, simplified tabs
    and all four example holdings: ATRAM/GFunds, VT/Gotrade, VGT/Gotrade and
    Bitcoin/PDAX. Separate mobile and dark review images are available.
25. **Website hero:** replaced old product state with current Home and graph.
    Existing Arbor brand, typography, gradients, navigation and CTA paths remain.
26. **Website Portfolio:** large current graph/holdings image, current allocation
    and fund-entry examples. Copy describes manual recording, not broker sync.
27. **Website Add Investment:** current catalogue with original Arbor graphics,
    exact supported products and factual recording—not transaction-import—copy.
28. **Website Ways:** current empty/implementation screen and shared provider
    destination whitelist. Names identify options; no partnership or ranking.
29. **Website monthly:** current deterministic provider-grouped calculation;
    copy explains exact assigned amounts, minimum states and investing outside
    Arbor. The public example is separate from the smaller functional QA case.
30. **Website Ask Arbor:** actual deterministic portfolio-value answer, including
    the manually entered fund-value distinction. No unrestricted AI framing.
31. **Website onboarding:** approach comparison, optional customization preview
    and final-plan review use the actual redesigned components. Free/Plus and
    private-beta copy follows the founder-confirmed activated product; pricing,
    future public quota caveat and absence of checkout remain unchanged.
32. **Images:** 19 local WebPs total **460,004 bytes**; largest **43,162 bytes**.
    Separate social-renderer PNG: **183,821 bytes**, not shipped as a normal
    homepage image. Next Image, lazy loading below the hero, eager/high-priority
    hero and narrow mobile sources retained. Generated intrinsic size metadata
    removes old mismatched dimensions. No external image or new dependency.
33. **Mobile:** app functional checks at 1440/1024/768/390/320; graph demo matrix
    at 1440/390/320. Onboarding checked at 390/320. No detected horizontal
    overflow. Public build checked at all five widths.
34. **Dark mode:** onboarding/final review, app identities, graph, catalogue,
    monthly, Ask, Settings and public surfaces inspected in dark as well as light.
    Public screenshot panels intentionally show the light product captures.
35. **Accessibility:** original icons are decorative next to names; standalone
    marks have an accessible label. Step focus, keyboard controls, native radio
    semantics, sheet focus trap/Escape, public menu Escape focus return, FAQ
    keyboard behavior, reduced motion, image alt text and graph history text
    retained/tested. This is not a formal WCAG certification or exhaustive
    screen-reader audit.
36. **Functional E2E:** onboarding save; explicit customization and provider
    persistence; catalogue/fund/ETF/BTC save/edit/remove; real fixture snapshots;
    allocation/activity; 13 deterministic Ask questions; exact monthly results;
    minimum states; check-in completion/reload/idempotence/undo with unchanged
    holdings/history; Free Ways and exhausted Ask state all pass. With no
    holdings PHP 10,000 produces 8,000/1,000/1,000. The PHP 16,600 functional
    portfolio produces 7,680/2,320/0 using the existing service. Below-minimum
    PHP 100 remains accounted for. No backend math was changed.
37. **Test counts:** `npm test` **535/535**; `npm run e2e:test` **25/25**.
    Onboarding browser run: 22 captures; Plus: 80; Free: 24; graph/app matrix:
    24; public production build: 54; injected Portfolio faults: 9. Ordinary
    completed flows have zero page/console errors and no hosted financial writes.
    `npm run e2e:auth` passed normal dedicated-account authentication. Backend
    suites were not run because no backend code changed.
38. **Lint/build/audit:** lint passed. Production build passed with
    `NEXT_PUBLIC_SITE_URL=https://arbor.ph` and
    `NEXT_PUBLIC_API_BASE_URL=https://arbor-api.onrender.com`; 11 static pages
    generated. `npm audit --omit=dev`: **0 vulnerabilities**. Public browser QA
    also passed against the compiled build, not just the dev server. Earlier
    missing screenshots during generation and test-selector races were fixed
    and rerun. Dev-only LCP hints occurred while scrolling directly to lazy
    below-fold screenshots; hero loading remains eager.
39. **Diff check:** `git diff --check` passes.
40. **Diff stat:** tracked-file diff: **28 files, 452 insertions, 178 deletions**.
    Git's unstaged diff stat excludes 24 new/untracked files listed below,
    including this report and the optimized assets; nothing is staged.
41. **Files changed:** full inventory below. Only frontend, visual test harness
    and documentation/asset changes are present. Backend, migrations, package
    manifests and lockfiles are unchanged.
42. **Gallery:** linked at the top; 55 selected full-size PNGs, compressed gallery
    thumbnails, six contact sheets and `inventory.json`. All 34 requested view
    types are covered. Reviewed contact sheets and full-size Home, Portfolio,
    customization and website sections against the approved Arbor reference.
    Full-page mobile captures preserve the fixed nav at its viewport position;
    this is a capture artifact, not a mid-page navigation implementation.
43. **Remaining gaps:** founder aesthetic sign-off and eventual authorized
    deployment remain. This does not diagnose the particular hosted request
    behind the founder's old generic error or revalidate production market data.
    It makes future failures safely distinguishable. No claim of new hosted
    activation verification, trademark permission, performance returns or formal
    accessibility certification. Historical logo/screenshot assets are retained
    but not used by active identity metadata or the refreshed website.
44. **Final state:** still `main` at the starting HEAD; **28 modified tracked
    files and 24 new files**, all unstaged/uncommitted. Local fixture and preview
    services stopped; their process-local profiles, choices, holdings, history
    and monthly records were discarded. Normal QA auth cache remains ignored.
    No founder/personal data or legitimate shared market observations touched.

## Acceptance assessment

All 17 requested questions: **Yes within the locally tested scope**. Safe errors
are distinct, onboarding follows one clear decision at a time, final review is
polished, original investment/provider identities are consistent with visible
names, graphs are prominent, recording/monthly flows share the same language,
and website/app screenshots now agree. 390px is intentionally designed and
320px has no detected overflow. Canonical financial behavior is preserved by
unchanged backend code plus the browser/unit regressions above. “Apple-quality”
is a design assessment for founder review, not an objective certification.

Visual iteration corrected the inherited progress-pill styling, removed the
sticky action overlap, improved chart scaling/labels, expanded desktop captures
to include the complete intended content and synchronized image aspect ratios.

## Changed-file inventory

Modified tracked files:

```text
docs/CONSUMER_DESIGN.md
docs/INVESTMENT_IDENTITY.md
frontend/app/consumer.css
frontend/app/marketing.css
frontend/app/opengraph-image.tsx
frontend/app/plan-choice.css
frontend/components/ApproachSelection.tsx
frontend/components/InvestmentIdentity.tsx
frontend/components/OnboardingV2.tsx
frontend/components/PlanCreated.tsx
frontend/components/PlanCustomization.tsx
frontend/components/PlanV2View.tsx
frontend/components/entry/PublicWebsite.tsx
frontend/components/portfolio/LivePortfolio.tsx
frontend/components/portfolio/PortfolioHistoryChart.tsx
frontend/lib/consumerExperience.test.ts
frontend/lib/investmentIdentity.test.ts
frontend/lib/investmentIdentity.ts
frontend/lib/livePortfolio.test.ts
frontend/lib/livePortfolio.ts
frontend/lib/navigation3uc.test.ts
frontend/lib/publicWebsite.test.ts
frontend/lib/publicWebsite.ts
frontend/public/brands/NOTICE.md
frontend/public/identities/NOTICE.md
frontend/public/product/NOTICE.md
frontend/scripts/e2e/completion.mjs
frontend/scripts/e2e/marketing-assets.mjs
```

New files:

```text
docs/PREMIUM_UX_REVIEW.md
frontend/components/ArborIdentityIcon.tsx
frontend/scripts/e2e/portfolio-errors.mjs
frontend/public/product/premium/allocation-mobile.webp
frontend/public/product/premium/allocation.webp
frontend/public/product/premium/approaches.webp
frontend/public/product/premium/ask-desktop.webp
frontend/public/product/premium/ask.webp
frontend/public/product/premium/catalogue.webp
frontend/public/product/premium/contribution.webp
frontend/public/product/premium/customize.webp
frontend/public/product/premium/final-plan.webp
frontend/public/product/premium/fund-value.webp
frontend/public/product/premium/holdings-mobile.webp
frontend/public/product/premium/holdings.webp
frontend/public/product/premium/home-mobile.webp
frontend/public/product/premium/home-social.png
frontend/public/product/premium/home.webp
frontend/public/product/premium/portfolio-mobile.webp
frontend/public/product/premium/portfolio.webp
frontend/public/product/premium/settings.webp
frontend/public/product/premium/sizes.json
frontend/public/product/premium/ways-mobile.webp
frontend/public/product/premium/ways.webp
```

The two instruction files generated automatically by `next dev` were removed
after stopping it; no pre-existing repository instruction was removed.
