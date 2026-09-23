# Arbor product boundary — 3T-0

**User chooses. Arbor calculates, tracks, simulates and explains.**

This is a product contract, not a legal determination. Use it for 3T-A and later
product work; disclaimers are not a substitute for these interaction boundaries.

## New and explicitly reviewed V2 plans

- Nine onboarding questions collect financial-foundation, goal, contribution,
  horizon and volatility-comfort inputs in memory.
- Authenticated `POST /v2/approaches` returns the unchanged assessment plus the
  four canonical standard model definitions. It neither selects nor saves.
- Users compare models with no preselected choice and explicitly press
  **Use this as my plan**. All four models are available to long-term users;
  horizon caps remain informational assessment output, not an override of choice.
  The existing less-than-three-year path remains separate and explicitly selected.
- New `POST /v2/profiles` writes require `selected_approach`. Retries still recover
  an existing profile without overwriting it. `PUT /v2/profiles/approach` changes
  only the authenticated owner's selection, using saved answers, never client
  owner IDs or replacement financial answers. It rejects V1 profiles.
- Selection is an optional key in existing `v2_inputs` JSON. No migration,
  backfill, ownership-policy change or new table. Existing RLS still applies.
- `plan.plan_basis` distinguishes `user_selected` from `historical_assessment`.
  `plan.selection` retains the deterministic **assessment** for compatibility;
  `plan.selected_strategy` is authoritative for an explicitly chosen model.
  Canonical model allocation/return and independent readiness remain backend-owned.
- Standard models apply no satellites. Historical `saved_preferences` remain
  intact, while the selected model's `preference_result` represents zero satellite
  requests and the canonical base target. No historical request is overwritten.

## Existing V2 and V1 data

Missing `selected_approach` means historical assessment, not implied user consent.
These plans still load with unchanged allocations and historical preferences.
The UI labels their origin and requires explicit model review before new
contribution scenarios. Reads do not migrate data. V1 flows remain unchanged.

Deployment requires coordinated backend/frontend release: the previous backend's
strict V2 JSON reader does not understand `selected_approach`. Once selections are
saved, do not roll back to that reader or delete user selection data; use a
compatible forward fix. An old frontend cannot create a new profile against the
new backend without the required selection. Schedule the transition accordingly.
Verify the existing owner-scoped UPDATE policy in a safe environment before live
release; this milestone does not change Supabase configuration.

## Contribution scenarios and implementation options

3P catalog, 3Q calculations, readiness pauses, accounting and Gotrade practical
minimums are unchanged. Explicit target inputs remain the API contract; no profile
auto-loading, trades or persistence. Internal legacy names (`recommendation`,
`recommended_amount`, `invested_amount`, `action=invest`, `actionable`) remain for
compatibility: they describe scenario outputs/minimum feasibility, not instructions
or executed investments. Decimal money remains string-serialized.

The UI uses monthly scenarios and largest eligible target gaps. Route choice is
explicit; returned catalog matches remain provisional until the user chooses each
implementation option for the scenario. Product choice is separate from ownership.
Declining an option does not substitute another automatically: the user can change
route or leave the scenario. Route/eligibility changes clear choices; newly returned
options require a new choice. No product is ranked as best or suitable.

## Reusable boundary for 3T-A

Allowed: explain user inputs and selected models, target/current differences,
hypothetical projections, objective concepts, factual implementation comparisons,
and user-controlled scenarios. Operational next steps may include reviewing a
plan, adding/updating holdings and reviewing scenarios.

Prohibited: independent portfolio/product selection; personalized security ranking
or suitability; buy/sell/hold instructions; market-timing calls; circumventing
deterministic constraints; custody or execution. A future chat handler must enforce
these through supported intents and response contracts, not only prompt prose.
V2 Ask Arbor remains unavailable in this milestone.

## Deliberately retained legacy terminology

V1 dashboard, Portfolio Health, rebalancing, legacy chat/advisor modules and internal
financial service names retain old recommendation/health terminology. V2 does not
invoke those guarded features. Its unavailable alignment surface says Plan Alignment;
no score or algorithm has been relabeled as a new measurement. V1 product-boundary
changes need separate scope. Full route redesign remains 3P-B; V2 chat remains 3T-A.
