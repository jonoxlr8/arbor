# Authenticated app navigation (3U-C)

The app has exactly four primary destinations on desktop, tablet and mobile:
Home, Portfolio, Ask Arbor and Settings. The existing hash router remains in
place; this is not a Next.js routing or financial-engine migration.

## Destinations and links

- `#home`: concise plan/goal/readiness context and one server-selected Next Action.
  With both server availability and entitlement, show recorded portfolio value,
  provider names and real snapshot history. Reading Home never captures a snapshot.
- `#portfolio`: holdings when available, Plan Alignment, contribution scenarios,
  selected plan and implementation education. Planning assumptions use progressive
  disclosure. Existing V1 projections, What-If and insights remain here.
- `#ask`: focused investment questions and the current conversation. Current-value
  suggestions require both availability and entitlement.
- `#settings`: investment profile/editing, Arbor Plus/Compare Plans, appearance,
  account details, help/disclosures and sign out.

Section links include `#portfolio/plan`, `#portfolio/holdings`,
`#portfolio/contribution`, `#settings/investment` and `#settings/plus`.
The old `#plan` link resolves to Portfolio's plan section. Browser back/forward
uses native hash history. Next Action keys map to sections without duplicating
the backend decision tree.

## State and boundaries

Navigating never saves a profile, submits a contribution or changes a holding.
Leaving the existing editor discards its unsaved draft. Portfolio component
drafts/scenarios are session-local and reset on leaving that destination.
V2 chat mounts on first visit and remains mounted, hidden, across destinations;
changing the canonical plan resets the conversation and plan-dependent content.
Portfolio's existing real snapshot capture behavior is unchanged.

Live Portfolio availability and Plus entitlement are separate server-derived
requirements. When unavailable there are no portfolio data requests or dead
holdings controls: Home shows plan context and Portfolio offers the existing
manual/hypothetical contribution workflow. Free users retain their plan and
implementation education; Plus gates link to Compare Plans.

V2 has canonical horizon buckets and planning assumptions, not an exact-duration
projection/What-If service. No new balances, goal completion percentages, return
math or projection engine are invented. Historical plans display their returned
historical effective allocation, not just the base allocation. All financial
and recommendation boundaries remain server-owned.

Graphs use only recorded snapshots, retain a readable history table and expose
time ranges only when recorded history spans those ranges. ProviderBrand uses
visible local text badges; no remote logos or implied endorsements.

## Validation and later work

`node scripts/e2e/navigation.mjs` exercises the feature-off local backend.
`ARBOR_NAV_E2E_LIVE=true node scripts/e2e/navigation.mjs` requires the existing
isolated portfolio fixture backend (normal dedicated-account authentication,
local holdings/prices only). It checks all four destinations at 1440, 768, 390
and 320 pixels in Light and Dark, chat, edit/cancel, history navigation and
fixture manual holdings/cleanup. It hides only Next.js's development indicator,
which otherwise covers a mobile navigation target; production has no indicator.

Later brand work: approved provider logo assets for Gotrade, GCash/GFunds,
DragonFi, GCrypto, Coins.ph and PDAX; published legal/support destinations;
marketing imagery/screenshots, typography and public/private visual consistency.
The public entry's old investment-direction claim was replaced narrowly with
user-selected plan/target language. No marketing redesign, notification settings,
data export/deletion UI, billing, provider persistence or new financial tools are
introduced. V1 still uses its legacy holdings/health/calculation semantics inside
the four-destination shell; it is not represented as PHP Live Portfolio.
