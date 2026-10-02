# Ask Arbor named-instrument education — local review

Base HEAD: c0fd6cedba313b861cd5860c23241a02a4190935. Implemented only in /tmp/arbor-ask-local-qualification; main checkout remains unchanged. No hosted actions, LLM/vendor calls, schema/grant changes, live account changes, staging, commits, pushes or publication.

Named purpose/risk/fee/source questions now take priority over generic ETF, feeder, Bitcoin and fee templates. Static education works before onboarding; personal plan roles read only the authenticated canonical plan. Historical V2 targets are preserved, zero/dormant sleeves are not activated, and older non-V2 profiles get facts with an explicit unavailable personal-role answer. Targets and implementation selections are not ownership. Advice, coding/prompt-injection, actual holdings and accounting questions retain their boundaries. Existing quota consumption remains in place.

The immutable registry contains ten underlying instruments and twelve provider recording choices, with exact reviewed PHP classes/US ETF shares, aliases, document dates, retrieval/review date, evidence category and unresolved costs. IBKR/UCITS and other share classes are not substituted. ATRAM equity/technology trust-fee conflicts remain null/unconfirmed. Underlying fund expenses, provider charges, FX/spreads/funding/withdrawals are separate; no all-in estimate or extra NAV deduction is invented. Bitcoin expense ratio is not applicable, not zero; all Bitcoin execution minimums remain verify-in-app. The existing implementation catalog, return engine, NAV/holdings accounting, market data, entitlements and plan target calculations are byte-identical to base.

Sources and exact dates are stored in backend/app/services/arbor/instrument_facts.py from the public-primary-source handoff reviewed 2026-10-01. DragonFi fee evidence is explicitly indexed-only because the old help URL is unavailable. BPI technology KIIDS cover/footer date discrepancy and unavailable August link are explicit. Gotrade Global schedule is kept separate from Indonesia; country-dependent FX is not a Philippines quote. GCrypto/PDAX shared custody is explained without implying independent custody diversification.

Chat displays source links using a small allowlisted HTTPS parser, React text escaping, new-tab noopener/noreferrer. Arbitrary HTML, executable schemes, credentials, ports and unreviewed hosts remain text. No remote facts are fetched per question.

## Changed paths (isolated archive only)

- backend/app/routes/chat.py
- backend/app/services/arbor/education.py
- backend/app/services/arbor/v2_explanations.py
- backend/app/services/arbor/instrument_education.py
- backend/app/services/arbor/instrument_facts.py
- backend/tests/test_instrument_education.py
- frontend/components/ArborChat.tsx
- frontend/lib/chatSourceLinks.ts
- frontend/lib/chatSourceLinks.test.ts
- frontend/scripts/e2e/instrument-education.mjs
- docs/ASK_INSTRUMENT_EDUCATION_LOCAL_REVIEW.md

## Validation

Focused: 238 passed. Full backend: 3817 passed, 2 existing optional SQL skips; existing Starlette/httpx deprecation warning. Named matcher/render/route tests cover all twelve choices, exact aliases, purpose/risk/fees/role/full/brief/sources, ambiguity, wrong classes/mixed unsupported comparisons, no invented ownership or choices, unknown/conflicting fee layers, unchanged minimums, no static owner/model reads, canonical authenticated role, older profiles and quota rejection.

Frontend: 661 tests passed; lint, TypeScript and production build passed. Python compilation and JS syntax checks passed. Initial build attempts failed restricted Google Fonts fetching, then missing/loopback production site configuration; final build used explicit synthetic HTTPS origins and normal existing fonts without changing source/dependencies.

Actual production-build UI via withAuthenticatedBrowser isolated synthetic fixture: 13 captures, widths 320/390/768/1024/1440/1920, light/dark, no horizontal overflow, source href/target/rel and keyboard focus checks, conversation preserved across Chat/Learn, repeated named response. All remote traffic mocked or blocked; zero page/console errors, unexpected remote requests, account actions and real hosted writes. This qualifies local rendering, not managed authentication or source availability today. Actual original backend renderer produced browser answer fixtures; no handwritten answer substitutions.

Main repository preservation: all 42 original baseline SHA256s equal, 46 dirty paths, empty index, HEAD unchanged. Portable patch git apply --check and main git diff --check passed; patch was not applied. Remaining gate: integrate after the owner's paused Terms release sequence and separately authorize publication. Production is explicitly paused. TEST scrub approval blockage is independent; this Ask work does not retry or bypass it.
