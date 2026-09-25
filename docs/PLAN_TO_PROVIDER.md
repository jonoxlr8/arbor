# Plan → provider → recorded portfolio (3U-G)

## Scope and starting state

Started from clean `main`, `1b70d01`. This is an authenticated presentation change,
not another redesign of the public site, financial engine, holdings schema or
entitlements. No production flags, hosted records, migrations or deployments are
changed. Marketstack Basic is active and commercial use confirmed **per the
product owner's update**; no vendor account was inspected or upgraded here.

## Journey audit

The local authenticated rendering of the current feature-OFF implementation
reproduced the reported problem: plan/readiness details dominated Portfolio,
contribution had the prominent CTA, implementation education was collapsed, Home
replaced the portfolio concept with horizon, and desktop Ask Arbor was a narrow
centered column. This was local browser evidence, not a fresh production visit.
The existing `add_first_holding` server priority already precedes contribution
review when tracking is available and empty. No decision-tree change was needed.

## Canonical plan implementation

`planTargets` reads the saved explicit plan's base allocation, or the historical
effective allocation for a historical plan. It filters zero targets for display;
it never creates, rebalances or renormalizes weights. Short-term paths return no
long-term options. The server's existing readiness permission suppresses
implementation prompts for Foundation First. Getting Ready retains a caution.
Incomplete onboarding remains upstream of the saved-plan shell.

The presentation-only `PLAN_OPTIONS` projection uses the existing backend catalog
and identity metadata. Twelve product/provider/sleeve mappings were checked
against the backend; there is no new supported product or provider:

| Target sleeve | DragonFi | GFunds | Gotrade |
| --- | --- | --- | --- |
| Global Equity | `dragonfi_global_equity` | `gcash_global_equity` | `gotrade_vt` |
| Technology | `dragonfi_technology` | `gcash_technology` | `gotrade_vgt` |
| Defensive | `dragonfi_defensive` | `gcash_defensive` | `gotrade_bnd` |

Bitcoin, only when the saved target is nonzero: `coins_btc` / `coins_ph`,
`gcrypto_btc` / `gcrypto`, and `pdax_btc` / `pdax`.

Options are alphabetical by provider name, explicitly not ranked, and never
preselected. The UI explains that fund/ETF holdings, fees and structure differ.
It does not assert identical exposures, suitability or a preferred security.
Existing issuer identity and provider identity remain distinct; named local
fallbacks remain where official assets are not approved. See
[identity provenance](INVESTMENT_IDENTITY.md).

## Official external destinations

Public official sources were checked read-only on 2026-09-25:

| Provider | Fixed destination |
| --- | --- |
| GFunds | <https://gcash.com/services/gfunds> |
| Gotrade | <https://www.heygotrade.com/> |
| DragonFi | <https://www.dragonfi.ph/> |
| GCrypto | <https://gcash.com/services/gcrypto> |
| Coins.ph | <https://www.coins.ph/en-ph> |
| PDAX | <https://pdax.ph/> |

DragonFi's JavaScript landing page is also supported by its official
[account-opening help](https://help.dragonfi.ph/hc/en-us/articles/17029145775385-How-do-I-open-an-account)
and [fund-investing help](https://help.dragonfi.ph/hc/en-us/articles/59523524251673-How-do-I-invest-in-a-fund).
These are product/provider websites, not undocumented app or trading deep links.
Unknown IDs return no destination. No arbitrary URL, affiliate parameters,
account data or tracking is accepted. Links retain provider text, an external
arrow, an accessible new-tab label, `target="_blank"` and
`rel="noopener noreferrer"`. Browser testing intercepts the provider destination
to verify navigation and `window.opener === null` without starting a provider
session. No claim of partnership or endorsement is added.

## Experience by state

| State | Portfolio | Home |
| --- | --- | --- |
| Plus, availability OFF | Chosen targets → Ways to invest → official links; restrained availability message; contribution secondary | Intentional Portfolio preview, no invented amount/line |
| Plus, ON, empty | Same options; visible Add Investment; provider-return Record investment; secondary contribution | Empty chart-sized surface and Add Investment |
| Plus, ON, populated | Existing PHP totals, history, holdings/allocation/monthly/activity, always-visible Add; ways secondary | Canonical known/complete value and compact recorded history |
| Free, either availability | Same useful plan/ways/links; Plus explanation → Compare Plans, no holdings controls | Portfolio preview; no portfolio data requests |
| Foundation / short term | Existing canonical path guidance; no long-term implementation/contribution prompt | Existing deterministic primary action preserved |

Free's Ask Arbor allowance, production quota prerequisites, profile gating and
server authorization are unchanged. Private-beta accounts remain Plus Trial.
The QA Free state comes only from existing local server-side test configuration;
there is no browser tier toggle or new public bypass.

## Recording and contribution boundaries

The return CTA opens the existing, unselected Add Investment catalogue. Funds
retain current PHP value plus optional units; ETFs require shares, Bitcoin its
amount. This records holdings already owned, not a verified brokerage transaction.
Official links do not write financial state. The app states that investing occurs
with the provider and Arbor does not place trades or move money.

`#portfolio/add` is also used by Home's empty CTA and the existing deterministic
`add_first_holding` action. Availability and entitlement still gate the entire
tracking component. Add is visible with zero, one or multiple holdings.

On empty Portfolio the monthly planner is a secondary disclosure. Existing
section links still open it directly. With holdings, it remains an existing tab
and consumes canonical values. No contribution math, minimums, scenario selection,
monthly storage or provider persistence changes. Foundation/profile/short-term
priorities remain server-owned; the LLM makes no navigation decision.

## Charts and Ask Arbor

Home uses the existing history component in compact mode. Zero/one observations
retain a meaningful empty canvas; multiple observations use only returned
snapshots. No returns, rising example line, current-value backfill or history
write is generated by Home. Portfolio retains its existing actual daily snapshot
behavior. Incomplete current value remains explicitly known/partial. Required
attribution stays present where reference data is displayed.

Desktop Ask Arbor aligns with Home/Portfolio's left edge and full content grid,
while individual replies remain readable. Suggestions and composer use the wider
canvas; the composer is anchored near the viewport bottom. Mobile chat, accessible
labels, quota and non-adviser behavior are retained. Free is explicitly identified.

## Local verification and screenshots

Use `scripts/e2e/plan-provider.mjs off|plus|free` with the existing dedicated-account
`withAuthenticatedBrowser` helper and local `e2e_portfolio_app`. The script refuses
non-local APIs or a missing isolated-fixture marker. Real authentication and the
saved test plan are read; holdings/prices are local fixtures. No hosted financial
writes or production flag changes. Monthly availability stays false in this matrix.

The matrix covers Home, Portfolio, Ask Arbor and Settings at 1440, 768, 390 and
320px in Light/Dark; Plus additionally covers a value-only fund, populated Home
and Portfolio, multiple holdings, contribution preview and cleanup. OFF/Free must
make zero browser portfolio requests. Free's direct forged-tier attempts must
remain 403. Keyboard dialog isolation, Escape, external-tab safety and no horizontal
overflow are checked. Screenshots are stored under `/tmp/arbor-3ug/`.

`scripts/e2e/consumer-graph.mjs` separately supplies **browser-only chart layout
fixtures** to test multi-point Home and Portfolio graphs at all eight layouts.
Those sample history points are never persisted; they must not be represented
as real investment history. Screenshots under `/tmp/arbor-3ue1/` are named
`graph-layout-fixture-*`. Empty/single-observation screenshots in the main matrix
come from actual local fixture-service behavior, not browser-generated lines.

## Future activation sequence (not performed)

1. Founder reviews the UI and explicitly authorizes the separate deployment and
   activation task; deploy only approved code through the normal release process.
2. Reconfirm Marketstack Basic remains active under the confirmed commercial terms.
3. Check the verified Arbor project, previously applied holdings/manual-value
   migrations, server-only credentials and existing trusted writer. Do not apply
   the Free Ask Arbor quota migration as part of this sequence.
4. Run the existing trusted hosted market-data refresh once. Verify VT/VGT/BND,
   USD/PHP and BTC/PHP values, dates, freshness and source attribution. Verify
   cache reuse and failure retention; do not invent fund NAVs.
5. Rehearse a disposable canonical portfolio through trusted service paths while
   public availability is still OFF. Validate manual funds and clean test records.
6. With explicit activation approval, set `LIVE_PORTFOLIO_ENABLED=true` on Render.
7. Set `MONTHLY_CHECKIN_ENABLED=true` **only if separately approved**, after its
   already-hosted migration/status is confirmed. It is not implied by step 6.
8. Restart/deploy the approved backend as required to load settings; check health
   and deployed revision. Verify `/account/entitlements` availability and that
   tracking remains Plus-only; Free quota remains separately gated.
9. Smoke-test Plus on the approved frontend: empty plan/options, provider link,
   Add fund/ETF/BTC, real value/history, targets, contribution, Ask Arbor and,
   only if approved, monthly completion/undo. Check the normal Free/OFF routes.
10. Remove only disposable holdings/history/check-ins; retain valid shared prices.
11. Monitor Render/Vercel/Supabase errors. Roll back availability first if needed;
    reload backend configuration, preserve user records and diagnose.

This milestone performs none of the hosted steps. Automatic NAV sources, a real
transaction ledger, approved missing corporate assets, analytics, payments and
notifications remain separate work.
