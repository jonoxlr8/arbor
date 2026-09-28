# Phase 2C beta product boundary

**User chooses. Arbor calculates, tracks and explains.** This note describes the
local Phase 2C application contract; it does not activate public Free, billing or
any hosted configuration.

## Free learns and tracks; Plus understands and plans

Free keeps onboarding, informational assessment, explicit choice among the four
standardized approaches, optional Technology/Bitcoin targets, the chosen plan,
neutral Ways to Invest and official provider links. Factual tracking remains
available: supported holdings, actual units and dates, optional actual cost,
dated activity and corrections, current values, gain/loss only against complete
recorded cost, genuine portfolio-value history and graph, and actual goal
progress. An entitlement change does not delete saved plan, goal, holding,
ledger, pending or history records.

Plus adds interpretation and planning: current allocation and Plan Alignment,
monthly contribution planning/check-in and its pending follow-up, future-value
projection and What If, and explicit plan/profile rebuilding. Plus is enforced
by authenticated backend routes and response shaping, not merely hidden React
controls. The Portfolio read removes allocation and provider-group fields for
Free while retaining the same basic tracking facts. The frontend refuses to use
a Free response as a complete allocation scenario.

All current production private-beta accounts retain Plus Trial. Local,
account-scoped QA can simulate Free and Plus; this is not a public tier switch.
There is no checkout or billing activation. Limited Free Ask Arbor access is an
intended public-launch model, not a production quota activated by this phase;
the deferred Ask quota migration stays unapplied. Full Ask Arbor Chat/Learn
work belongs to the next phase, and Learn does not become primary navigation.

## Information architecture and authority

Primary navigation stays Home, Portfolio, Ask Arbor and Settings. Home retains
the approved portfolio/graph, goal, monthly, projection or one calm Free preview,
recent activity and compact plan order. Portfolio defaults to current value,
the truthful graph, Add Investment and holdings. Holding detail owns Add more
and its Phase 1 investment activity. Plus insights and recorded-value history
remain available as secondary disclosures; neither changes the ledger or
fabricates a historical valuation from an investment date.

Onboarding assessment is informational. It does not choose or save an approach
for the user. A new long-term plan requires an explicit user choice and retains
`user_selected` provenance. The four standardized plans, readiness/horizon
rules, and Tech/Bitcoin carving are unchanged. Changing the selected plan is a
Plus operation with confirmation: it changes targets and planning context, not
owned units, transactions or trades. Settings groups account, plan,
subscription, appearance, security and about/data controls. Downgrade hides
Plus interpretation/planning, not factual records.

## Beta catalogue and later integration

The beta universe is still 12 canonical provider/product combinations: three
ATRAM funds through GFunds, three BPI funds through DragonFi, VT/VGT/BND through
Gotrade, and Bitcoin through GCrypto, Coins.ph and PDAX. Product, issuer and
provider identity stay distinct. Planning and tracking currently share this
curated catalogue. A future broad tracking catalogue is **not implemented**:
the later principle is curated planning choices alongside broader factual
tracking, without turning tracking support into a recommendation.

The next Ask Arbor/Learn phase may add a Chat/Learn switch inside Ask Arbor,
educational content and the reviewed limited-Free model. It must reuse the
existing authenticated entitlement, owner, portfolio and plan authorities,
without introducing another primary navigation destination or exposing Plus
portfolio comparisons through Free answers.
