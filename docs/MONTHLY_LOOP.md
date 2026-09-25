# First-run experience and monthly check-ins (3U-D)

> **Current status — full product completion pass, 25 September 2026:** see
> [FULL_PRODUCT_COMPLETION.md](FULL_PRODUCT_COMPLETION.md) for the current
> implementation and validation record. The hosted monthly migration is already
> applied, and the latest read-only production check reports monthly check-in
> available and Live Portfolio unavailable. The new local “Invest this month”
> experience belongs to Home, reuses existing check-in storage, and calculates
> exact amounts from saved targets and explicit implementation choices. Persistent
> carry-forward is not implemented. No hosted storage or flags were changed in
> this pass. The original 3U-D sections below are retained as historical design
> notes; their unapplied/OFF statements and Portfolio placement are not current
> deployment or navigation instructions.

## Journey

Normal signup/login and onboarding are unchanged. After a confirmed V2 plan
creation, a short **Your plan is ready** screen names the user's choice,
explains Arbor's tracking/education role and says Arbor does not place trades or
move money. **Go to Home** leads to the existing deterministic Next Action;
**See your plan** opens Portfolio. No tour, checklist percentage or new onboarding
engine is introduced. The confirmation is session-local: refreshing restores the
already-saved plan normally rather than forcing a tutorial again.

Home's existing single Next Action becomes the monthly entry point for eligible
users. Portfolio contains the existing scenario engine plus a small monthly
activity section. Implementation acceptance must be completed before the UI
offers **Mark as invested**. That opens an inline confirmation and an editable
amount: users report what they actually contributed, which need not equal the
scenario's hypothetical amount. Cancelling makes no request.

## Meaning and separation

**Recorded as invested** means the user says they completed a contribution outside
Arbor. It is not brokerage verification, execution, an order, a transaction ledger,
or a deposit. It never changes units, holdings, prices, snapshots, plan targets or
contribution calculations. Ask Arbor explains the record and its UTC update date
using a deterministic template; it does not infer performance or reconcile holdings.

The current-month record can be undone deliberately. Undo retains the row and
marks it undone; it is visible in recent activity. Completing again replaces that
month's amount/time and clears the undone marker. This is correction of one
monthly check-in, not an immutable transaction/audit ledger. The most recent 12
monthly records are displayed; older records are not deleted by the feature.

## Month, idempotency and security

- A month is **UTC calendar month**, matching Arbor's existing monthly quota
  convention. There is no account timezone setting. Labels explicitly mention UTC.
- PostgreSQL derives owner from `auth.uid()`, month and timestamps from its clock.
  The request month is only an expected-period check, not authority to backdate.
- Unique `(user_id, month)` and atomic conflict handling keep the first active
  completion unchanged on duplicate/retry requests, even with a different amount.
  To correct it, undo then record again.
- A September completion cannot satisfy October. Home refreshes on visibility
  return and checks for month rollover; client time only triggers a fresh read.
  A stale confirmation crossing the server month boundary receives a safe conflict.
- JWT-derived identity only; no client owner, timestamps, tier, targets or readiness.
  Positive finite PHP Decimal amounts, under one trillion, at most two decimals.
- Table RLS permits owner-only reads. Direct authenticated/anonymous table writes
  are revoked. A private, search-path-locked privileged function plus an invoker
  RPC wrapper provide narrow own-user read/complete/undo operations.
- The backend validates the saved canonical plan and Plus contribution entitlement.
  The RPC also guards against absent/short-term/foundation/implicit saved plans
  through persisted profile fields. It does not calculate allocations. Keep this
  defensive guard consistent if readiness eligibility changes in a later milestone.
- Direct RPC remains an own-user self-report operation, not a grant of Plus tools.
  Before paid/public entitlements replace the current all-Plus beta, revisit DB
  entitlement enforcement alongside that canonical entitlement storage. No current
  production user can choose a tier through the app.
- No prompt text, account numbers, broker credentials, securities, provider choices
  or transaction documents are stored. No new service key is used.

## Eligibility and priority

Monthly UI/complete API follows the existing Plus Monthly Contribution Planner.
All private-beta accounts remain Plus Trial. Free retains its plan, basic next
action and Ask Arbor access; its existing Plus explanation/Compare Plans route
is preserved. Prices, weights and investment outputs never depend on this record.

Foundation First, incomplete profiles, short-term paths, historical-plan review,
and canonical portfolio setup/staleness keep priority. Monthly completion only
replaces the ordinary contribution-review action with **You're set for [month]**.
An eligible completed user can view Portfolio without another contribution prompt.
Profile edits recalculate eligibility; a check-in never overrides readiness.

Live Portfolio OFF uses manual/hypothetical scenario values. Local fixture ON uses
existing canonical holdings inputs. Completion performs no portfolio writes;
Portfolio's pre-existing real snapshot capture behavior remains separate.

## Deployment prerequisite — intentionally unapplied

`backend/migrations/20260924112421_3u_d_monthly_checkin.sql` is a new additive
migration, generated with Supabase CLI. It creates only the activity table, RLS,
and private/public RPC functions. It does not edit applied portfolio migrations
or create Ask Arbor quota objects.

`MONTHLY_CHECKIN_ENABLED` is server-only and defaults **false**. Disabled endpoints
return safe unavailability and Next Action/chat do not query the new table.
`/account/entitlements` exposes `availability.monthly_checkin` separately from tier.
There is no browser override. Missing-table/errors while enabled fail safely,
not as an invented pending/completed state.

Future intentional release order: review/apply this migration, verify hosted
own-user and cross-user behavior, then explicitly enable the monthly flag and
smoke-test. Until then, the first-run confirmation works but monthly persistence
is unavailable in production. Roll back availability by disabling this flag;
retain activity data. Do not apply the unrelated Free quota migration or enable
Live Portfolio as part of this feature's setup.

## Tests / local browser setup

Use `docs/E2E_AUTH.md` and the dedicated disposable account. The separate
`tests/e2e_monthly_app.py` entrypoint requires APP_ENV=test,
ARBOR_MONTHLY_E2E=true, MONTHLY_CHECKIN_ENABLED=true,
ARBOR_PORTFOLIO_E2E=true and ARBOR_E2E_USER_ID. It refuses Render/Vercel hosts.
It uses normal JWT authentication and read-only hosted profile restoration, with
isolated in-process monthly/portfolio fixtures only. Its memory storage is a
browser fixture, never the production persistence implementation. Restart clears it.

With local frontend/backend running, from frontend:

```sh
node scripts/e2e/monthly.mjs
# Separate local run with fixture Live Portfolio enabled:
ARBOR_MONTHLY_LIVE=true node scripts/e2e/monthly.mjs
node scripts/e2e/first-run.mjs
```

The first-run script mocks only the authenticated profile-creation transport
boundary; it never resets or overwrites the hosted profile. Monthly SQL tests use
PGlite and no network. No hosted migration or monthly persistence is validated yet.

## Future hooks, no telemetry or reminders sent

Stable event points for later 3V instrumentation:

- `first_home_viewed`: successful new-plan confirmation → Home.
- `next_action_clicked`: existing deterministic action key and destination.
- `monthly_checkin_started`: eligible Portfolio activity section opened.
- `contribution_scenario_viewed`: accepted scenario displayed, no prompt text.
- `monthly_checkin_completed`: confirmed server response, month identifier.
- `monthly_checkin_undone`: confirmed undo response, month identifier.
- `ask_arbor_after_checkin`: bounded intent/category, not conversation text.

A future reminder worker can determine the canonical UTC month and look for
an active owner/month record, respecting eligibility, consent and entitlement.
No notifications, fake toggles, analytics SDK, sharing, streaks or payments exist.
