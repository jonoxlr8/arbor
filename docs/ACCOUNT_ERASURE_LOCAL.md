# Account erasure: local review boundary

This code is a local rehearsal, not an enabled hosted deletion service. It adds no key, role, provider connection, scheduled job, email or real-account action. Closure and erasure migrations remain unpublished. Do not apply a local grant/migration to production as a shortcut.

## Operator workflow

Jonathan reviews the queue and support/Spam each business day. The approved operating targets are acknowledgment within two business days, assessment within seven calendar days, ordinary completion within 30 calendar days after sufficient identity verification, and weekly updates if delayed. Holidays require adjustment to the acknowledgment helper. These are service targets, not legal deadlines or guarantees.

Use recent authenticated ownership for in-app requests. Lost-access requests need proportionate evidence through a previously associated channel or separately reviewed alternative; never collect passwords/tokens. No mandatory cooling-off period. Cancellation is explicit and allowed until the first irreversible phase; signing in never cancels a deletion request.

A reviewed operation contains a bounded, category-scoped hold, reason code, review date (no later than one month) and end condition. Keep the actual justification in the controlled case process; do not attach financial exports. Local execution pauses on any hold. Selective erasure of unaffected categories is not yet automated: review dependency implications instead of retaining everything indefinitely. A hold must not be invented merely to avoid completing a request.

The local maintenance CLI uses the fixed existing loopback database only, verifies its data directory, and rejects missing confirmations. It never reads environment credentials. From backend, use `ARBOR_LOCAL_ERASURE_TEST=1 PYTHONPATH=. .venv/bin/python scripts/account_erasure_local.py --help`. Inventory and queue are read-only. Other phases require matching operation confirmation; review also requires owner/request/version and identity verification. Retention needs a distinct explicit confirmation. Never supply a real owner to this synthetic rehearsal.

## Exact phases and restrictions

1. Review the request/version and owner-scoped count-only inventory. Keep rights/export available. A cancelled or changed request invalidates admission.
2. Begin under the same owner lock as cancellation/writes/export/reminder admission. Uncertain admitted reminder outcomes block the phase. Commit erasing status, then use a qualified provider adapter to revoke sessions. A revoke failure leaves the barrier intact.
3. Remove owned Storage bytes through supported APIs, then delete personal DB records in one transaction: ledger before holdings, pending before delivery rows, then snapshots/history/check-ins/optional usage/legacy holdings/profile/cooldown. The private invoker maintenance functions have no app-role grants. A narrow trigger exception requires the original migration-owner session, exact owner context and admitted operation. Normal financial paths and ledger RESTRICT remain unchanged.
4. Only a qualified supported Auth adapter deletes the identity. Lifecycle/request FKs cascade at that final step; erasing state is not removed early. Old tokens fail actual-session checks. Confirm Auth absence separately.
5. Assess external copies and issue a minimal active-system receipt. Pending provider copies prevent a whole-account-erasure claim. Minimal operation ID/owner/request/state/counts/timestamps/hold metadata survives Auth deletion; it contains no balance, email, password, token or financial payload.

`account_erasure.advance` enforces fresh owner/operation/phase approval and advances one phase. Timeout/error does not prove success. Adapter actions must be idempotent and must confirm absence. The only supplied provider adapters are synthetic tests. There is deliberately **no live Auth/Storage/provider adapter**: its permissions, supported APIs, identity-recreation protection and capabilities need separate qualification, without a new broadly privileged server key.

## Retention

Detailed delivery metadata is eligible 30 days after terminal sent/stopped time. The bounded manual maintenance function removes at most 500 delivery rows per invocation, clears dependent FKs and leaves a minimal pruned marker and sent timestamp on the pending task. The claim function excludes that marker, preventing a second reminder. Open/nonterminal deliveries and held owners are excluded. No scheduled purge or hard expiry is claimed.

Ordinary support cleanup is a manual Zoho checklist, six calendar months after resolution; substantive reopening resets resolution. Verify attachments, sent/trash, holds and provider capabilities before removing anything. No mailbox purge integration exists. Privacy-case evidence is separate.

Minimal completed receipts are eligible after 90 days. Uncompleted/held operations are not purged. Verify backup/restore windows and a narrowly justified extension before releasing a hold; no blanket audit exemption. Private owner-locked hold review can preserve a completed receipt for a specifically justified exception; expired hold dates require explicit operator review/release. Automatic selective erasure is not implemented. Do not use an unreviewed infinite hold to extend retention.

Provider backups/logs/support copies and local operator exports need inventory, expiry/capability evidence and a restore-quarantine procedure. Paid Supabase backup windows do not establish Free-plan guarantees. Shared market data is untouched. DB deletion cannot undo Storage deletion or guarantee provider erasure. Reverting code cannot restore deleted data.

## Gates still required before release

Qualify a supported Auth/Storage administrative workflow using existing authorized access (not a new key), complete provider handling and completion communication, prove managed-session/FK/trigger/schema compatibility, measure representative owner scans, resolve SCIM SET NULL and unlinked audit/log identity, and qualify safe restore reconciliation. The web mailto request resource is functional locally, but real inbox receipt/review/completion have not been tested by this task. No live email is authorized.

Apple requires in-app whole-account initiation, not deactivation alone; manual handling communicates timeframe/completion and ordinarily cannot impose another support contact. Google requires the in-app and functional web paths plus associated-data handling. This local request/coordinator/SQL prototype is not a store-compliance certification or yet an operational whole-account deletion feature.

Sources: https://developer.apple.com/support/offering-account-deletion-in-your-app/ ; https://support.google.com/googleplay/android-developer/answer/13327111?hl=en ; https://privacy.gov.ph/data-privacy-act/ ; https://supabase.com/docs/guides/auth/managing-user-data ; https://supabase.com/docs/guides/platform/backups

## Integrated local workflow — 1 October

LocalWorkflow joins review evidence, current request/version and count-only inventory, serialized execution and a minimal unsent receipt. LocalRepository connects only to the fixed loopback qualification database after checking its name/data directory; it reads no credentials. Nonblocking owner locks serialize operator processes; SQL independently guards admission. This is not a distributed transaction. After interruption, read durable state and obtain the matching next-phase approval.

Review requires an accountable operator, verified owner-session or existing-channel method, verified time and confirmed completion channel. These are operator assertions, not automatic identity verification. Changed/cancelled requests, changed inventory, holds or missing evidence block admission. Production remains disabled. The existing isolated SDK adapter is unwired; no production credentials or adapter are introduced.

Runbook: receive/acknowledge under approved targets; verify proportionately without passwords; review inventory/holds; confirm a channel usable after Auth removal; approve each phase separately; reconcile uncertain outcomes before retry; verify primary absence/provider assessment; prepare the scoped receipt and separately confirm communication. A not_sent receipt is not delivery. Pending copies prevent a whole-account-erasure claim.

Remaining operational gates: absence backup operator, independently verified completion communication, provider-copy follow-up/restore reconciliation, managed concurrent writer/reminder behavior and representative volume. Approved operating targets are not reopened. No notification integration, hosted purge job or store-readiness claim is added.

## Qualified local session-revocation retry — 1 October

Isolated Auth logs established the retry failure: initial logout204, followed by GET /user403 session_not_found. A repeat must not require the revoked owner's token to authenticate again. The provider adapter now requires an explicitly supplied SessionInventory: exact isolated project/owner/operation, complete count of ALL owner sessions (including expired/nullable-expiry sessions), captured within30seconds. No inventory supplier is created by application code; omission or read failure fails closed. No Auth403/logout result proves absence.

Revocation first checks matching phase approval, durable erasing barrier and immutable Auth creation identity. Independently verified zero skips token retrieval/logout, then rechecks barrier, identity and a second fresh count. Nonzero counts still require a verified owner token and supported global logout, followed by confirmed zero. Provider uncertainty is not success; a later retry may reconcile actual absence. Cross-owner, stale/incomplete inventory, changed identity/barrier and new-session races fail closed.

This is not an atomic lock across Auth and PostgreSQL. A session created after the final count remains a residual race; durable lifecycle restrictions must continue to deny product/Storage access and final Auth/session absence must be confirmed. No permanent zero-session guarantee is claimed. Managed continuation must supply narrowly bound read-only session evidence through existing authorized access; never add app-role session grants or new credentials to obtain it.

Local tests include mock-SDK integrated LocalWorkflow, provider failures/retries and actual disposable PostgreSQL/PostgREST checks. The live isolated C operation remains erasing/v2, sessions0, all11rows/object/Auth present; local qualification does not authorize resuming it. Production erasure remains disabled. No code/migration is published.

### Expired phase authorization and operator recovery

`ApprovalFailure.code` distinguishes `approval_expired` from mismatched approval.
`PhaseFailure` exposes only fixed phase/stage/code classifications, never raw
provider exceptions. An opaque provider failure remains `phase_unconfirmed`.
The adapter checks expiry both before and after a slow durable guard and preserves
expiry classification inside Storage removal. No expiry extends automatically.

Complete read-only preflight before issuing a bounded phase approval. If reads
consume that window, stop with execution disabled, independently inventory the
last durable state, and re-review before a separately authorized continuation.
Do not retry on a loop, cache session absence beyond freshness, weaken identity or
object-version checks, or increase the TTL merely to accommodate slow tooling.
Synthetic delayed-read tests reproduce expiration before removal and recovery
only after fresh preflight and a new bounded approval. Managed tool round-trip
latency remains a runner qualification limit; preparation is not authorization
for another hosted destructive attempt.

The isolated runner may use `IsolatedGuardSessionEvidence` to consume one
current authoritative joined read for its guard and immediately following
session check. Every guard replaces prior evidence, and every session check
consumes it exactly once. Two revocation checkpoints still perform two
independent reads; the independent SDK identity check and30-second evidence
freshness limit remain enforced. A consumed/missing/foreign/stale result denies
execution. This reduces duplicate management round trips; it is not reusable
session caching. Managed read-only timing qualification simulates all removals
locally and must not be described as actual provider deletion qualification.

### Database-only resumption after partial Storage completion

`DatabaseContinuation` is a LOCAL synthetic contract, not a new public API or
hosted migration. An explicit `database` approval advances only an existing
`erasing` operation whose current owner Storage inventory is empty. It never
calls Storage removal. Complete fresh evidence binds owner/operation, original
Auth creation, current request/barrier, no sessions/objects, and exact reviewed
counts. Slow preflight, stale evidence and dispatch expiry stop without renewal.

The proposed dispatch transaction acquires the existing owner lock, then checks
expiry, identity/request, sessions, Storage and counts before invoking the
existing erasure function. It remains UNEXECUTED until separately authorized
local runtime qualification; generated text alone does not prove SQL behavior.
Successful `data_erased` is the existing durable checkpoint for a separately
approved Auth phase. Auth deletion and its absence/confirmation/completion
checks remain separate; no storage checkpoint is inferred from a timeout.
Read-only phase timing with local simulated removals cannot prove actual managed
SQL/Auth deletion or every retained provider copy. No new permission or automatic
retry is introduced. Final primary absence, new-session races and partial failures
must be independently reconciled before any completion claim.

## Production-capable operator integration — local review only

`app/services/account_erasure_operator.py` is separate from the isolated adapter.
It accepts an exact `OperatorTarget(project_ref, owner_id, operation_id,
original_created_at)`, a supplied dedicated direct DB-API connection and supplied
bounded Auth/Storage SDK clients. It loads no credentials, creates no connection,
adds no grant and exposes no web endpoint. Workflow and provider execution both
default disabled. The isolated adapter still blocks production unchanged.

The repository commits durable phases independently, serializes operator calls
with a nonblocking owner session-advisory lock across commits, and uses the
existing lifecycle transaction lock for dispatch. Approval expires after at most
three minutes. Database dispatch rechecks expiry after lock acquisition, original
identity, reviewed counts, request/version, holds, barrier and session/Storage
absence. A missing/changed count or access failure stops; optional Ask usage is
handled by the existing inventory's explicit absent category, not silently lost.
Completed-state retries reconcile without side effects. After uncertain Storage
removal, inspect ownership/version metadata first; `resume_database` takes a new
`database` phase approval and performs SQL only. Never renew approval silently.

Tested commands from `backend/`, using the existing disposable local database:

```sh
SUPABASE_URL=https://fixture.supabase.co SUPABASE_KEY=synthetic-test-only .venv/bin/python -m pytest tests/test_account_erasure_operator.py tests/test_account_erasure.py tests/test_account_erasure_workflow.py tests/test_account_erasure_continuation.py tests/test_account_erasure_providers.py tests/test_account_lifecycle.py -q
ARBOR_LOCAL_ERASURE_TEST=1 PYTHONPATH=. .venv/bin/python tests/sql/account_erasure_operator_rollback_local.py
```

The SQL command reuses the established BEGIN/ROLLBACK fixture pattern. Actual
request/cancel, reviewed admission, DB erasure, simulated Auth-row removal,
Auth confirmation and truthful pending-copies receipt execute inside rollback.
It tests remaining sessions/objects, expiry, changed counts/identity and holds.
All baseline fingerprints and temporary fixture absence are verified afterward.
Auth SDK behavior is separately covered by synthetic provider tests, not a
claim that local SQL implements the managed Auth API. No managed deletion occurs.

Operator usage after separately approved capability qualification:

1. Supply the already authorized dedicated connection, never a pooler/shared app
   connection; `SqlOperatorRepository(connection, target)` requires the direct
   `db.<project>.supabase.co` host. Driver/certificate-validated connection
   availability is a prerequisite; no DB-API driver was added by this work.
2. Supply `OperatorProviders(target=target, auth=..., session_auth=..., storage=...,
   inventory=repository.object_inventory, session_inventory=repository.session_inventory,
   owner_token=..., guard_probe=..., review=..., execution_enabled=False)`.
   These are Python objects from reviewed existing access, not strings/keys in
   commands. The owner-token supplier must be bound to this owner; never collect
   passwords or create a token simply to run the operator.
3. `OperatorWorkflow(repository, providers, target).preflight()` is read-only.
   It checks available schema/inventory/maintenance capability and effective
   app-role denial. It does not certify an absent production Storage guard.
4. Enabling both explicit execution flags requires later approval and verified
   guards; each `review`, `step` or database continuation is separately controlled.
   Call `review(ReviewEvidence(...), now)` only after proportionate identity,
   scope, request/version and verified completion-channel review. Then use fresh
   bound `Approval` objects for begin, data, auth and complete; never a batch
   blanket approval. Store/provider uncertainty remains pending.
5. Read `receipt()` after completion. It deliberately returns not_sent and
   whole_account_erasure_claim=false. Jonathan's manual Zoho completion route
   is the established route; no automatic send is implemented. Manual sent/receipt
   evidence must be recorded separately, with no blind duplicate message.

### Exact future hosted qualification packet

No hosted SQL/grant/configuration is authorized by this local work.
Preflight current schema, migrations, owners, effective ACLs and existing export/
reminder function definitions. Apply only separately reviewed lifecycle then
`account_erasure_v1.sql`; inspect source-rewrite expectations before executing.
Maintenance functions remain SECURITY INVOKER, empty search_path, and denied to
PUBLIC/anon/authenticated/service_role. Do not grant them to an app role to solve
an operator permission problem. Current production lacks these lifecycle/erasure
objects; live export's existing grant must remain unchanged.

Verify the supplied operator connection can execute all required maintenance
functions and read count-only Auth sessions, immutable identity and complete
Storage ownership/version metadata. Actual DB-API driver/TLS/connection capability
and network failures are not qualified by compiled SQL alone. Operator/provider
SDK authority must come from legitimate separately authorized access, not a new
broad credential created under this task.

Storage quiescence is a real gate: the current migrations do not install a Storage
lifecycle policy. Session revocation alone is insufficient for already-issued
JWTs. `guard_probe` must fail closed until effective existing Storage/app policies
and all service writers are demonstrated to deny owner writes during erasure.
If a restrictive Storage policy or other guard is needed, propose its exact local
SQL and qualification separately; never assume a callback assertion establishes
production enforcement. Dynamic public-bucket behavior also needs inspection.

Use a designated synthetic hosted owner only after separate setup/qualification
approval. Test direct RPC/SDK stale sessions, owner isolation, cancellation/write/
export/reminder races, holds, bounded locks, restart and lost responses; no live
financial records. Current small-fixture checks are not representative-volume
performance qualification. No broad grants, quota activation or production sleeps.
Backend/operations precede frontend and functional web exposure; consider the API
and both Render crons redeploying. On failure halt erasure admission and UI rollout;
retain durable barriers. App rollback cannot undo Auth/Storage deletion or safely
reactivate erased users. Quarantine restores and reapply deletion decisions.

Jonathan remains sole operator. Previously approved 2-business-day/7-day/30-day/
weekly-update and 90-day receipt targets remain settled, not legal guarantees.
Provider logs/backups, Zoho support, operator copies and scoped hold review remain
separate obligations; C primary deletion and owner-reported Inbox receipt do not
prove all retained copies erased or automated notification available.
