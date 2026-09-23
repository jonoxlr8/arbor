# Arbor access: private beta, Free and Plus

## Authority and release status

`app/services/entitlements.py` is the server-owned capability policy. All currently
authenticated accounts receive **Plus Trial / Arbor Plus — Private Beta**. This
assumes the existing account population is the private-beta population; this
milestone does not implement invitations or paid entitlement assignment.

There is no production Free switch and no subscription/profile database mutation.
`free/active`, `plus/trial`, `plus/active`, and `plus/expired` are supported policy
states. Expired Plus resolves to Free capabilities. Beta has no expiry date,
credit card, countdown, checkout or billing. Pricing (₱399/month, ₱3,990/year) is
a launch assumption, not a charge or purchase offer.

**The quota migration is prepared but unapplied. Live Free-quota persistence has
not been validated.** Do not enable production Free or public/paid launch until:

1. Intentionally review and apply `backend/migrations/3u_a_ask_usage.sql` with the
   normal privileged migration role; do not expose `arbor_private` through PostgREST.
2. Validate owner RLS, RPC grants, concurrent cap enforcement and month rollover
   against the intended Supabase environment with dedicated accounts.
3. Add deliberate server-owned entitlement assignment/launch configuration and
   test its downgrade/upgrade lifecycle. Never accept a tier from the browser.

Plus Trial/Active return before constructing a quota client, so normal beta does
not depend on this migration. Free storage failure closes chat with a safe 503;
account metadata/basic plans remain accessible, with usage marked unavailable.

## Current capability matrix

| Capability | Free | Plus |
| --- | --- | --- |
| Onboarding, readiness, assessment, model comparison/initial selection | Yes | Yes |
| Basic saved plan, planning assumptions/basic projections | Yes | Yes |
| Basic implementation education and deterministic next action | Yes | Yes |
| Ask Arbor | 10 successful answers / UTC month | Full access |
| Monthly Contribution Planner / single contribution scenario API | No | Yes |
| Investment-profile edit/rebuild / change existing approach | No | Yes |

Existing V1 basic What-If/projection, embedded insights and legacy health/holdings
surfaces remain unchanged; they are not relabeled as new paid features. V2 has no
Live Portfolio/Plan Alignment, advanced What-If, recurring insights or monitoring
yet. Those future recurring capabilities belong to Plus when implemented; no
fake UI or permissions claiming that they exist are added here.

Initial plan creation and comparison remain Free. Editing/rebuilding a saved plan
is Plus, including the compatibility approach-update endpoint and V1 edit route.
Free implementation education remains in Plan (including historical/short paths).
Financial values and investment calculations never depend on tier.

## API and next actions

`GET /account/entitlements` uses the normal authenticated identity and no-store
response. It returns tier/status/effective tier, beta flag, feature identifiers,
Free monthly limit and optional usage (`used`, `remaining`, `allowed`, `period`).
No client tier/user-ID parameter is used. Backend dependencies enforce Plus at
both contribution endpoints and profile preview/save/rebuild routes.

Frontend account access in both V1 and V2 is an owner-keyed provider, not localStorage. Plus tools
wait for a confirmed server permission; errors allow retry. Settings contains
Compare Plans. A Free contribution next action leads there, not to a dead tool.
Foundation/historical next actions retain their meaning and offer saved-plan
review without requiring a paid editor. Ask Arbor uses the same next-action
policy and only discusses account tier in factual product-support responses.

## Free usage accounting

The database stores only `(user_id, UTC month start, successful_count)`. No
questions, replies, payments or unrelated PII are stored for metering.

Chat validates the request and loads the canonical owner plan, then checks quota.
It calculates an answer, then atomically admits it using `INSERT ... ON CONFLICT
DO UPDATE ... WHERE successful_count < 10`. The tenth completed answer is returned
normally; the next is 429 with the calm limit message and Settings destination.
Parallel requests may calculate concurrently, but at most ten are admitted.

Every valid returned answer counts, including educational redirections and
product-support replies. Validation/auth/plan/generation failures before admission
do not count. A failed HTTP delivery or ambiguous RPC response **after a database
commit can count**: this lightweight contract meters admitted successful answers,
not guaranteed client receipt. Automatic retries/idempotent delivery and broader
fair-use/abuse controls belong to 3W-C; no claim of unlimited AI is made.

The private security-definer function has an empty search path, fully qualified
objects, and derives identity from `auth.uid()`. The public RPC is invoker-only.
Authenticated table reads are owner-RLS scoped; direct inserts, updates, deletes
and truncation are denied. There is no reset, arbitrary owner, date or count input.
An authenticated client can consume only its own quota via RPC (self-exhaustion),
never gain extra access or change another user's count. Plus does not call this RPC.

## Safe local QA

Use the isolated disposable-account authentication workflow in `E2E_AUTH.md`.
Configure backend process variables (not frontend public variables):

- `APP_ENV=development` (or `test`)
- `ARBOR_ENTITLEMENT_QA_ENABLED=true`
- `ARBOR_E2E_USER_ID` matching the configured disposable account
- `ARBOR_ENTITLEMENT_QA_MODE`: `free`, `plus_trial`, `plus_active`, `expired_plus`

Overrides are ignored on Render/Vercel or outside explicit dev/test, and apply
only to that exact authenticated user. They cannot be set through HTTP/body/query
parameters. Keep them unset in production. This is server configuration, not an
auth bypass; normal JWT/profile authentication still applies.

Optional `ARBOR_ENTITLEMENT_QA_ASK_EXHAUSTED=true` supplies a **fixed exhausted QA
fixture** (10 used) for that same isolated account, allowing real 429/limit-UI
testing without applying SQL or making eleven model calls. It does not increment
or persist and is not an alternative counter. With it unset, simulated Free uses
the real RPC and fails closed while the migration is unapplied. Restore normal
beta behavior by restarting the local backend without the QA variables.

With the backend running in the matching mode, from `frontend/` run
`node scripts/e2e/entitlements.mjs plus_trial`, `plus_active`, or `free` (add
`--exhausted` only when the fixed exhausted fixture is enabled). The script checks
real authenticated API access, next-action destinations, Compare Plans, chat and
responsive Light/Dark layouts. It never writes a profile. Screenshots contain only
the Compare Plans card and go to `/tmp`, not the repository. Raw auth/error payloads
are not printed. `free` without the fixture currently verifies the expected safe
503 while the migration is unapplied; revisit that expectation after rollout.

## Automated SQL verification without hosted changes

Python API tests use a locked RPC fixture; the SQL suite executes the actual
migration in isolated PostgreSQL/WASM using PGlite 0.5.8 installed in a temporary
directory, not an application dependency. Run:

```sh
ARBOR_PGLITE_PATH=/absolute/temp/node_modules/@electric-sql/pglite \
  node --test tests/sql/ask_usage.test.mjs
```

It checks cap admission, RLS, denied mutation, missing identity, UTC periods and
transaction rollback. PGlite serializes queries on one connection: this is actual
SQL coverage, **not** a substitute for multi-connection hosted contention testing.
The latter remains a launch prerequisite. No hosted migration is run by any test.
