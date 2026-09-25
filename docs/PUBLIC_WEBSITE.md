# Public website and brand experience

## Supplied-logo follow-up (2026-09-25)

The founder supplied nine PNGs and confirmed use unchanged. All primary provider
and issuer identities now use these files, including Vanguard, Coins.ph and
PDAX. Originals are byte-for-byte copies with SHA-256 integrity tests; Next Image
serves display-sized versions. Total original logo size is 456,893 bytes.
See `frontend/public/brands/supplied/manifest.json` and the brand NOTICE for
provenance. This is not a claim of licensing, endorsement or a rights workaround.

The active website/social preview now uses freshly captured
`public/product/3ug1-supplied/` imagery (16 WebPs, 365,232 bytes; separate social
PNG 211,312 bytes). Earlier `3ug1/` images are retained but no longer selected.
Component-only captures hide the floating mobile navigation so it cannot cover
holdings; full-screen captures preserve the real app navigation. Public identity
rows and website screenshots share the same central identity mapping.

The earlier report below describes the previous asset-selection stage; its
fallback and first-party-download selections are superseded by this follow-up.

Follow-up validation: 470 frontend tests, 25 auth-harness tests, 16 catalogue
Light/Dark captures and 50 public responsive captures passed. Zero browser page
or console errors. Dedicated authentication, lint, production build and
production dependency audit passed (0 vulnerabilities). No hosted financial
writes; fixture holdings were deleted and local fixture servers stopped.

## 3U-G.1 synchronization (2026-09-25)

Continues the uncommitted 3U-G app on `main` / `1b70d01`; does not replace the
approved 3U-F layout. The older report below is historical.

- Hero now shows current Home with its larger Portfolio surface. Current
  populated Portfolio, empty Portfolio / Ways to invest, catalogue and Ask Arbor
  captures replace the previous milestone's images. No test-account identity or
  email appears: the local screenshot-only profile label is Alex.
- Story: chosen plan → supported options → official provider → invest externally
  → record what you own → track in Arbor. The site explicitly labels tracking
  and monthly check-ins as unavailable previews. No account sync is implied.
- Public Ways examples consume `PLAN_OPTIONS`, `providerDestination`,
  `InvestmentIdentity` and `ProviderIdentity` from the app. No duplicated URLs,
  provider ranking, affiliate parameters or independent asset universe.
- Free includes chosen plan/targets, Ways to invest and official links, basic
  planning, and limited Ask Arbor **when public quota support launches**. Plus
  includes planning/editing/full Ask Arbor and separately labeled previews for
  holdings/history/Plan Alignment/monthly check-ins. Beta remains free; no checkout.
- First-party corporate artwork is locally stored for identification under the
  founder's requested reuse, not a claim of provider permission or endorsement.
  Vanguard, Coins.ph and PDAX remain permission-dependent fallbacks. See
  `INVESTMENT_IDENTITY.md` and `frontend/public/brands/NOTICE.md` for exact sources.
- `public/product/3ug1/` is versioned because visual QA caught Next's optimizer
  serving older images after an in-place source replacement. New paths prevent
  that stale-image cache issue without changing framework cache configuration.
- Sixteen optimized WebPs total 372,448 bytes; five new corporate asset files
  total 18,152 bytes. Desktop screenshots retain responsive Next Image sizing;
  native-width mobile WebP crops use picture sources without redundant
  upscaling/recompression. This also resolved a verified Chrome mobile source
  loading failure. The hero loads eagerly; below-fold images remain lazy.
  The separate social PNG is 211,312 bytes and is used only by
  the social-image renderer, not delivered as a full-size homepage PNG.

### Reproducible captures / browser validation

Use the existing local-only `e2e_portfolio_app` and disposable-account auth helper.
`marketing-assets.mjs` asserts fixture headers and no existing holdings before
creating neutral examples, captures the current UI, and deletes all examples.
No hosted financial writes. It does not fabricate graph history. `brand-review.mjs`
checks filters/search, source-image failure fallback, themes and Escape focus.
`marketing.mjs` checks responsive public navigation, FAQ keyboard controls,
image decoding, no overflow, auth entry, metadata and no hidden-feature requests.
`plan-provider.mjs` remains the OFF / Plus / Free regression.

New screenshot inventory: Home desktop/mobile; Portfolio desktop/mobile;
empty Portfolio/Ways desktop/mobile; catalogue mobile; fund form mobile;
holdings desktop/mobile; allocation desktop/mobile; contribution result;
Ask Arbor desktop/mobile; Settings mobile; social-source PNG.

Final validation: 469 frontend tests; 25 auth-harness tests; lint, production
build and dedicated `e2e:auth` passed; production audit found 0 vulnerabilities.
Browser checks passed for Plus (56 captures), feature OFF (33), Free (32),
identity/filter/fallback interaction (16), and the public site (50 captures
across 1440/1024/768/390/320, Light/Dark). The public suite also passed against
the production build. All runs reported zero page/console errors; feature-OFF
and Free generated no portfolio reads. A genuine disposable-account UI sign-in
restored the saved plan and all four destinations. No hosted financial writes.
Normal authenticated financial state and both production flags were untouched.

No backend, schema, calculation, product-flag, deployment, payment or analytics
changes. Marketstack Basic activation is owner-reported complete, but Live
Portfolio activation remains a separate task; this pass does not perform it.

---

# Historical 3U-F implementation report

Validated September 25, 2026. Implementation is local and uncommitted.

## 1. Starting repository state

- Repository: `/Users/jonoxlr8/Projects/arbor`
- Branch: `main`
- HEAD: `e7f2048`
- Starting `git status --short`: empty (clean).
- Authenticated app visuals are the approved source of truth. Financial engines,
  schemas, feature gates, account logic and authenticated components were not
  redesigned. No hosted financial writes, commits, pushes or deployments.

## 2. Existing public-site audit

The live public entry and source agreed: a large mark inside decorative orbits,
“Build wealth. Grow with Arbor.”, three generic steps, repeated login links and
no substantial product showcase, pricing, FAQ or footer. Green-only decoration
felt separate from the app's navy typography, soft neutrals and colored data.
The copy generally respected user choice, but availability was too vague and
the product itself was absent. Existing login/signup hash routes worked.

Removed the orbit/garden illustration, generic landing block and its unused
styles rather than re-skinning them. No published Privacy/Terms routes existed;
this implementation does not invent legal documents or dead links.

## 3. Brand consistency

Reuses the approved Arbor logo/geometry, Geist font, theme provider, identity
component and app colors. Scoped marketing styles add green/teal/violet washes,
large editorial typography and restrained product-frame shadows. Light is the
primary presentation; the existing appearance setting also supports intentional
Dark. No new font, animation, component or analytics dependency was installed.

## 4. Hero

“Invest with clarity. Keep the longer view.” introduces an AI investment
companion and the user's choice. Get started free matches actual account access
and free private-beta Plus; it is not an invitation waitlist or checkout.
The hero uses an actual Home capture. Preview/illustrative labels accompany it,
including an explicit gated-feature caption. No abstract AI or stock imagery.

## 5. Product showcase

Large screenshot-led sections tell one story: choose an approach, see recorded
investments together, understand the mix, explore contributions, ask questions.
There is no feature-card grid. Product UI was captured without changing its
design, using local isolated fixtures and neutral Alex data. It includes no
email, account identifier, customer data, invented return or chart history.

## 6. Portfolio

Actual holdings and fund-entry views show provider/issuer separation. Mobile
gets actual narrow captures rather than unreadably shrinking desktop rows.
Copy states manual entry, selected supported products and no broker sync.
Live Portfolio is explicitly a preview, not currently enabled. Allocation
describes recorded percentages versus chosen targets, not a signal to trade.

## 7. Ask Arbor

Actual conversation screenshot, existing Arbor mark and contextual question
chips make the section conversational. Copy limits Ask to Arbor context and
acknowledges AI errors. The portfolio-context example is marked as preview.

## 8. Monthly contribution

Actual PHP 5,000 scenario preview is illustrative, not a buy list or execution.
Current manual-input planning is distinguished from future canonical holdings
integration. Review / Record / Keep perspective explains the monthly rhythm;
monthly completion remains preview-only and explicitly records outside activity.

## 9. Trust

Plain statements: investments stay with the provider, Arbor does not custody
money or execute trades, and users choose. No invented regulatory approval,
security certification, testimonials, partnerships or customer-count claims.

## 10. Pricing and private beta

Two contained panels are intentional, not a feature-card wall. Free is labelled
“At launch”, including 10 monthly Ask questions. Plus is free during private
beta; full Ask access is under fair use. PHP 399/month and PHP 3,990/year are
planned prices only. No payment UI, trial countdown or billing date. Portfolio
tracking/monthly recording are marked Preview. The unapplied Free quota system
was neither changed nor represented as available to production Free users.

## 11. FAQ

Ten beginner questions cover what Arbor is, custody, user choice, where investing
happens, existing holdings, supported providers, broker sync, Ask, pricing and
Philippines-first scope. Native disclosure controls are keyboard operable.

## 12. Navigation and header

Sticky translucent header: How it works, Portfolio, Ask Arbor, Pricing, FAQ;
Sign in and Get started free. Mobile disclosure closes on navigation/Escape and
returns focus to its button. This is a public menu, not the app bottom bar.
Working anchors preserve deep links. The screenshot may depict the app bar;
it is not interactive public navigation.

## 13. Footer

Product/help links, support@arbor.ph, existing appearance control and fuller
disclosures. Privacy and Terms are transparently described as being prepared;
publication of reviewed legal pages remains a launch prerequisite. No email
infrastructure was added or delivery claim made.

## 14. Provider and asset identities

Reuses `ProviderIdentity` and the actual app screenshots: GFunds, Gotrade,
DragonFi, GCrypto, Coins.ph, PDAX; selected ATRAM/BPI/Vanguard/Bitcoin products.
Existing corporate typographic fallbacks remain fallbacks, not newly licensed
logos. Existing Bitcoin attribution is retained. Names identify products, not
endorsements. See `INVESTMENT_IDENTITY.md` and the product asset notice.

## 15. Compliance and availability

User chooses; Arbor calculates/tracks/simulates/explains. No investment selection,
buy/sell instruction, ranking, guarantee, execution or fake integration claim.
Fuller boundary language lives in FAQ/disclosures rather than every paragraph.
Static public copy is **not** entitlement authority. Preview labels must only be
revised after a separately approved release. No production configuration was
read or changed in this milestone; existing OFF decisions remain untouched.

## 16. SEO and social preview

Accurate title/description, canonical https://arbor.ph, Open Graph/Twitter data,
robots and a homepage sitemap. Built-in Next ImageResponse generates a 1200×630
PNG with the approved mark and actual illustrative Home preview. Metadata/social
routes were verified in a production build. Initial HTML now includes the public
story during session checking, not only a loading spinner. Existing session
restoration still selects the app/onboarding afterward; signed-in visitors may
briefly see the public presentation during restoration. Auth callbacks were not
changed. The production renderer needs PNG input (WebP is unsupported there).

## 17. Accessibility

One h1, labelled sections/navigation, skip link, visible focus, semantic anchors,
native FAQ disclosures, alt text/captions, button state, Escape focus return and
reduced-motion handling. Labels accompany colors. Browser checks cover keyboard
menu/FAQ controls and no overflow. This is not a full WCAG certification or
screen-reader audit; a dedicated assistive-technology pass remains useful.

## 18. Performance

Nine WebP assets total **171,878 bytes** (about 168 KiB). A separate 219,644-byte
PNG is for social rendering, not a homepage image. Next responsive images use
explicit dimensions, sizes, mobile art direction and lazy loading; the hero has
high fetch priority. Production initial-fold optimized image transfer measured
23,418 bytes locally, not a real-network performance benchmark. Existing font
loading is reused; no new package or animation library. No Lighthouse score is
claimed. Next/Image, metadata and React guidance informed this implementation.

## 19. Responsive and visual results

Validated 1440, 1024, 768, 390 and 320 widths in Light and Dark: **10 layouts**.
All images decoded, no horizontal overflow, no page/console errors. Reviewed
desktop/mobile hero, Portfolio, Ask, monthly, pricing, footer and social image.
Iteration corrected a capture taken before Home finished loading, mobile image
art direction, tablet sign-in visibility and oversized mobile footer headings.

Acceptance assessment: the same mark, palette, actual app images and identities
make the website/app visibly one brand. Product is the main visual; the opening
copy is concise. Portfolio is screenshot-led, mobile layouts are deliberate and
the language stays non-advisory. No generic AI brain, fake growth graph or card
grid. Corporate official-logo permissions remain an inherited gap, not hidden
by unapproved artwork.

## 20. Screenshot inventory

46 review PNGs are outside the repository under
`/Users/jonoxlr8/Documents/Codex/2026-09-07/i-x20/artifacts/arbor-3uf/`:

- 10 full homepage captures: five widths × two themes.
- 28 section captures: hero, Portfolio, monthly, Ask, pricing, FAQ, footer ×
  1440/390 × Light/Dark.
- 2 mobile menu captures; signup and sign-in captures.
- 2 before-live captures at 1440/390; social preview; desktop hero viewport.
- `index.html` is the visual-review gallery. Section captures hide the sticky
  header during capture only; full-page/viewport captures preserve it.

## 21. Public → authenticated handoff

Public CTAs reach the existing signup/sign-in forms; forgot password, validation
and navigation remain intact. Dedicated-account normal UI sign-out/sign-in,
saved V2 restoration, four destinations and reload passed against the local
backend, with Live Portfolio/monthly OFF and zero hidden-feature requests.
No account was created, personal account used or hosted financial record written.

One additional attempt to authenticate a localhost production build against the
production API failed due to the existing CORS policy. Credential-free OPTIONS
verified localhost is rejected (400) and https://arbor.ph allowed (200). This is
not an auth implementation failure; no policy was loosened. Public production-
build QA passed separately, and the correct local-backend auth pairing passed.
Real deployed-origin handoff remains a post-deployment smoke test; this work is
not deployed. Both local servers were stopped after validation.

## 22. Tests

| Validation | Result |
| --- | --- |
| `npm test` | **448 passed**, 0 failed, including 11 new public-site tests |
| `npm run e2e:test` | **25 passed**, 0 failed |
| Public browser script, development and production build | Each: **10 layouts / 42 captures**, 0 page errors, 0 console errors, 0 hidden-feature requests |
| Real UI auth handoff | Passed; saved plan, reload, four destinations; 0 page errors/hosted financial writes |
| `npm run e2e:auth` on correct local backend pairing | Passed; no profile fixture written |
| Raw HTML/OG/robots/sitemap | Passed; image and metadata routes 200 |
| Menu Escape, FAQ keyboard, deep links, reduced motion | Passed |

The production-CORS diagnostic described above is the sole environment-limited
auth attempt. Backend tests/migrations were not rerun because no backend code,
database design or financial calculation changed.

Reproducible helpers: `scripts/e2e/marketing.mjs` (local anonymous public matrix),
`marketing-auth.mjs` (existing dedicated-account helper, both features OFF), and
`marketing-assets.mjs` (isolated local fixture captures). Follow `E2E_AUTH.md`;
never put credentials, tokens or auth storage into screenshots/reports.

## 23. Lint, build and audit

- `npm run lint`: passed, no warnings/errors.
- Production build with `NEXT_PUBLIC_SITE_URL=https://arbor.ph` and
  `NEXT_PUBLIC_API_BASE_URL=https://arbor-api.onrender.com`: passed; 11 static pages.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- No dependency, lockfile, environment, backend or infrastructure change.

## 24. Diff validation

`git diff --check`: clean. No whitespace errors. Generated Next development
`frontend/AGENTS.md` and `frontend/CLAUDE.md` were removed after stopping the dev
server; they were task-generated, untracked artifacts, not original user files.

## 25. Diff statistics

Tracked-file stat (Git excludes new untracked files until staged):

```text
 frontend/app/globals.css                  |  4 +--
 frontend/app/layout.tsx                   |  9 +++++--
 frontend/app/page.tsx                     | 20 +++------------
 frontend/components/entry/PublicEntry.tsx | 42 +++++++------------------------
 frontend/lib/publicEntry.test.ts          |  4 +--
 5 files changed, 22 insertions(+), 57 deletions(-)
```

There are also **22 new files** listed below (including 10 images). Nothing is
staged. The tracked stat alone is not the full implementation size.

## 26. Changed files

Modified: the five files in the stat above.

New sources/tests/docs:

- `docs/PUBLIC_WEBSITE.md`
- `frontend/app/marketing.css`
- `frontend/app/opengraph-image.tsx`
- `frontend/app/robots.ts`
- `frontend/app/sitemap.ts`
- `frontend/components/entry/PublicWebsite.tsx`
- `frontend/lib/publicWebsite.ts`
- `frontend/lib/publicWebsite.test.ts`
- `frontend/scripts/e2e/marketing-assets.mjs`
- `frontend/scripts/e2e/marketing-auth.mjs`
- `frontend/scripts/e2e/marketing.mjs`
- `frontend/public/product/NOTICE.md`

New images in `frontend/public/product/`: `home.webp`, `home-mobile.webp`,
`home-social.png`, `holdings.webp`, `holdings-mobile.webp`, `allocation.webp`,
`allocation-mobile.webp`, `ask.webp`, `contribution.webp`, `fund-value.webp`.

## 27. Remaining public-site work

1. Review/publish complete Privacy and Terms pages; current disclosure is not a
   substitute for that legal work. Verify support mailbox operations separately.
2. Keep preview copy/images synchronized with separately approved feature release
   decisions. Production Live Portfolio/monthly remain OFF; no activation work
   was performed. No quota migration, payment, analytics or provider upgrade.
3. Obtain approved corporate-logo assets/permissions if replacing inherited
   typographic identities. No new third-party rights were assumed.
4. After a separately authorized deployment, smoke-test the real-origin public
   → signup/sign-in → authenticated handoff and social crawlers. No fresh signup
   email/account was created in this task. Consider real-device/screen-reader
   and real-network performance audits before broader launch.

## 28. Final repository status

```text
 M frontend/app/globals.css
 M frontend/app/layout.tsx
 M frontend/app/page.tsx
 M frontend/components/entry/PublicEntry.tsx
 M frontend/lib/publicEntry.test.ts
?? docs/PUBLIC_WEBSITE.md
?? frontend/app/marketing.css
?? frontend/app/opengraph-image.tsx
?? frontend/app/robots.ts
?? frontend/app/sitemap.ts
?? frontend/components/entry/PublicWebsite.tsx
?? frontend/lib/publicWebsite.test.ts
?? frontend/lib/publicWebsite.ts
?? frontend/public/product/
?? frontend/scripts/e2e/marketing-assets.mjs
?? frontend/scripts/e2e/marketing-auth.mjs
?? frontend/scripts/e2e/marketing.mjs
```

Only this public-site milestone is uncommitted. Branch/HEAD remain `main` /
`e7f2048`. No commit, push, deploy, migration, financial-engine change or
production feature enablement.
