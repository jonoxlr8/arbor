# Arbor consumer experience — 3U-E

Presentation redesign only. 3U-D first-run/monthly persistence and its hosted
validation are complete; this milestone does not rebuild or revalidate storage.
Production availability remains server-controlled and OFF for monthly check-in
and Live Portfolio. No migrations, deployments or hosted financial writes.

## Reference and journey audit

The approved image establishes a compact sidebar, labeled bottom navigation,
large recorded value, broad chart canvas, identifiable assets, restrained green
actions, soft color and grouped settings. Its sample returns, holdings, provider
logos and transaction dates are not product data or permitted logo assets.

The previous rendered journey duplicated the portfolio chart on Home, buried
Add Holding below explanatory sections, exposed long contribution forms before
their result, and expanded pricing on Settings. Dark surfaces lacked separation.
The four existing destinations and all canonical APIs are retained.

## Tokens and components

`frontend/app/consumer.css` scopes the consumer palette to the app, sheets,
plan-created state and onboarding. Public marketing retains its layout.

- Green primary actions; navy/slate text. Light background `#f5f7fb`, surface
  white; dark background `#101821`, surface `#192431`.
- Blue global equity, teal defensive, violet technology, gold Bitcoin. Every
  allocation has text labels/percentages; color never carries meaning alone.
- Existing font stack; 36–56px portfolio values, 28–34px destination headings,
  14–16px reading text, secondary 12px labels. Tabular financial values.
- 12/20/28px radius scale; 16/24/32px spacing rhythm. Grouped rows and separators
  replace repeated cards. Shadows are reserved mainly for modal depth/composer.
- 208px desktop sidebar; existing four labeled mobile destinations. Existing
  approved Arbor mark is retained. No remote image requests.
- 3U-E.1 introduces separate InvestmentIdentity and ProviderIdentity components
  with centralized display metadata and an API-allowlisted investment catalogue.
  The Bitcoin symbol is sourced and stored locally. Other issuer/provider tiles
  are named typographic fallbacks, not corporate logos. See
  [identity provenance](INVESTMENT_IDENTITY.md) for permissions and missing assets.
- Native dialog sheets provide modal focus/inert background, Escape, accessible
  title, busy-state dismissal protection and focus restoration. Mobile sheets
  dock at the bottom. Restrained motion respects reduced-motion preferences.

## Destination responsibilities

**Home:** deterministic one-action hero, compact recorded-value summary when
available, planned contribution (explicitly an assumption), investment-profile
link, labeled target mix and a concise existing monthly-activity summary when
available. No duplicated history graph. Foundation/short-term
routes remain canonical, not inferred from colors or assessment scores.

**Portfolio:** Add Investment at the top, dominant known/complete PHP value,
real recorded history, holdings list, allocation, monthly contribution and
activity. Short/incomplete history has an intentional empty state, never fake
returns. Source details stay accessible but secondary. Allocation percentages
are withheld when incomplete; backend totals/targets/differences remain authority.

With Live Portfolio OFF, the selected plan and target mix lead instead. The
existing manual/hypothetical contribution path and implementation education
remain. No client flag enables a hidden API or causes portfolio requests.

**Ask Arbor:** Arbor-branded conversational canvas, contextual questions,
readable bubbles and compact composer. Navigation links only open plan/portfolio;
the LLM cannot write financial state. Existing quotas, source wording and
non-adviser boundaries remain unchanged.

**Settings:** Investment Profile row, collapsed Arbor Plus comparison, existing
appearance preference, account details and help disclosures. Pricing and account
semantics are unchanged; no dead provider/notifications/settings controls.

## Add/edit and valuation

Add Investment records what the user already owns, not a purchase. Choose from
the grouped supported-investment catalogue, then current PHP value for a fund or
required shares/BTC quantity. The holding provider is explicit in each catalogue
entry; it is not an abstract first-step selector. Fund units and cost basis are
secondary disclosures.
Holding details separate provider, units, current value and freshness/source.
Value editing/clearing and holding deletion remain separate confirmations.

No input/model/API or valuation priority changed. Missing units are not invented;
valid manual values retain “Updated by you”; NAV/reference labels remain distinct.
No new provider, asset, price refresh, snapshot or financial calculation logic.

## Monthly contribution and check-in

The primary label is Monthly contribution / Preview contribution. The planner
prefills the existing positive planned amount; providers are never preselected.
Alternate gap mode is secondary. All ownership/minimum and explicit product
acceptance steps remain. Accepted results appear before the collapsed input
form, with amount/sleeve breakdown first and implementation details on demand.
“Scenario” remains internal API/type language, not the main beginner controls.

The existing Month/UTC/idempotency/undo/history contracts are untouched.
Mark as invested is the user's report of investing outside Arbor, never an
executed trade. Holdings and chart history are not mutated by completion.
Plus/Free restrictions and foundation/short-term exclusions remain unchanged.
First-run confirmation emphasizes the user's explicit choice and leads Home.

## Transaction gap — deliberately not implemented

Current persistence stores holdings, valuations, actual snapshots and behavioral
monthly completion. It is not a transaction ledger. Future buy/sell records need
owner-scoped dated executions, quantities, prices, fees, cash flows, transfers,
corrections/reconciliation and return-calculation semantics. Until that separate
work exists, there is no Record Transaction button, return percentage, fabricated
performance history or claim that Arbor verified a trade.

## Local visual verification

Use the repository's dedicated-account `withAuthenticatedBrowser` helper with
the existing `e2e_monthly_app` local in-memory store. Enable fixture flags only in
that test process, never in Render. No production account data is modified.

- `node scripts/e2e/consumer.mjs`: empty/populated Home/Portfolio, add/fund/detail
  sheets, allocation, monthly preview/completion, chat, Settings, keyboard modal,
  error/retry; 1440/768/390/320px, Light/Dark. Screenshots `/tmp/arbor-3ue1/`.
- `node scripts/e2e/manual-fund-values.mjs`: value-only, update, add units,
  canonical NAV priority, clear with units, delete. Leave
  `ARBOR_MANUAL_VALUE_E2E` unset for the documented available-NAV fixture.
- Existing first-run and monthly scripts cover explicit choice, confirmation,
  canonical next action and monthly presentation without hosted persistence tests.
- Run the existing disabled-portfolio script against feature-OFF local setup.

Browser screenshots contain labeled disposable fixture values, not claims about
the real user's investments. The app never generates example values or chart
points. Stop fixture processes afterward to discard all local test history.

## Remaining work

Production activation is separate: Marketstack Basic and explicit server flags,
with the previously documented launch checks. No persistence revalidation here.
Official provider assets, a true transaction model, final marketing redesign,
notifications, analytics and payments remain separate milestones. No new runtime
dependencies were added.
