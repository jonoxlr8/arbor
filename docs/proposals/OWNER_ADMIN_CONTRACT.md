# Owner Admin — LOCAL contract, no hosted activation

Base6688185063112e45ec4f01b1f41b9e35d222ca64 in detached `/tmp/arbor-owner-admin-local`. Separate from uncommitted reliability patch and chart proposal. Reviewed mock: task-3/admin-design-mock/index.html and mock.css. This contract authorizes local synthetic qualification only; no hosted DDL/grant/bootstrap/activation/deploy.

## Identity and access

Use existing Arbor login. Backend verifies ES256 issuer/audience/expiry/subject through existing get_current_user_id and active lifecycle admission. Database rechecks live session/current Terms/active account and a private owner allowlist from auth.uid(), never user metadata/email/name/header/client-supplied owner.

Allowlist starts EMPTY. Only operator can insert/remove its single owner record through separately reviewed, explicit bootstrap; authenticated/anon/service roles get no direct grants. No owner UUID hard-coded in product. A confirmed Jonathan-named profile candidate was found by read-only query; display name is insufficient authority. Independent connected-account email cross-check was rejected by automatic approval review; user approval requested and pending. No retry/workaround. LOCAL fixtures use unrelated synthetic UUIDs. Any hosted release remains blocked until exact existing owner identity is independently verified and exact bootstrap separately approved.

## Data / workflow

Existing request table's six immutable fields/grants/three policies remain untouched. Admin read RPC returns ONLY receiptID,name,provider,received date and workflow status/revision/updated date. No customer account UUID/email, profiles, holdings, investments, export, accounts or free-form operator notes.

New private owner allowlist: user_id primary key, FKauth.users cascade, plus a singleton boolean constrained true and unique (at most one owner). New public request-review table: request_id PK/FKrequest cascade; user_id derived submitter FKauth.users cascade (required by owner erasure inventory); status constrained new/reviewing/resolved; revision bigint positive; updated_at timestamptz. No rows/backfill initially: missing metadata means New/revision0. Update never edits submitted name/provider/date/retry/account fields. One current status only, no unbounded history. All three status values supported; no extra confirmation/timing/settings panel.

Status RPC locks the submitted request then verifies expected revision atomically. No-op same status returns current revision; mismatched revision returns409 requiring refresh. Only successful actual change advances revision/date. Ambiguous write failure prompts refresh, not blind repeat. Updates derive actor internally and return only the safe projection.

## Schema / RLS / exact grants

Both new tables RLS enabled. Request-review table has no anon/authenticated/service direct SELECT/INSERT/UPDATE/DELETE grant or policy. Private allowlist unexposed and no ordinary grants. Owner-only public RPCs use narrowly scoped SECURITYDEFINER with empty search_path and fully qualified fixed relations: access(), list(limit50,offset bounded), detail(requestUUID), status(requestUUID,newStatus,expectedRevision). Revoke PUBLIC/anon/service EXECUTE, grant authenticated only. Every function performs owner/live-admission checks; grant alone does not authorize. No dynamic SQL or broad configurable table selector, request totals/analytics, bulkdelete, feedback collection or generic admin capability.

## Lifecycle / retention / export / erasure / privacy

Admin actor inactive/deletion_pending/erasing/revoked-session/Terms-required is denied immediately by DB admission and normal API. For submitters restricted for deletion/erasure, hide their request from Admin reads/updates rather than make an owner dashboard into an erasure workaround. Lock submitter lifecycle and request consistently with existing closure/admission order to prevent race with irreversible erasure. Metadata lifetime follows its request FK; request deletion/manual90day retention/Auth cascade removes review metadata. Existing holds remain effective; no automatic purge.

Owner export must include only that submitter's current review status/date for their own requests if processing metadata is added; do not expose private owner allowlist or other customers. Update exact export validator/source-availability expectations as needed. Erasure inventory/delete adds five-column review metadata before requests with exact FK/policy/grant/function guards; reject unknown surfaces. Private owner allowlist row is removed by Auth deletion and explicit erasure step if owner is erased; no new auth cascade to customer requests. Preserve existing session barrier and unknown-surface fail-closed guards. Proposed privacy notice explains owner review/status processing and retention tied to requests, no emails/new analytics.

These integrations are REQUIRED before any hosted Admin activation. Do not silently disable erasure's shape guards or relax unknown-surface checks. The export, erasure and privacy integrations are implemented and qualified locally. Local SQL proposal will remain unapplied to hosted database; include local security/real erasure/export regression evidence and exact migration/grant/bootstrap proposal in final review package.

## Qualification / release boundary

Test anon/ordinary/forged-owner signature and direct RPC denial; authorized synthetic owner; no cross-customer financial reads; New/default, transitions/no-op/conflict/concurrent write; request erasure and90day cascade; actor/submitter lifecycle/Terms/revocation; export isolation and strict manual erasure guards. Actual local UI Settingsentry/list/detail/status at390/1440light/dark, keyboard/focus/error/loading/empty/unavailable; no mock-only banners copied into product. Full relevant backend/frontend tests/lint/types/build and preservation.

Separate explicit approval required for identity bootstrap, hosted migration/grants and eventual release after concrete review. No billing/analytics/emails/feedback/bulk deletion/customer financial access. Local source work remains sole product writer; preserve original46dirtypaths/indexempty and all frozen ZIPs.
