# Read-only account-deletion Admin — local proposal

The existing Admin can optionally show account-deletion requests with one main status, then progressive detail for canonical lifecycle/checkpoints, scoped holds and active-system receipts. Investment-request review stays unchanged. Local, uncommitted and unpublished on ce881dd85d3a067f7991799f6f7336a0eb218bbb.

The investment-request owner approval does not include this data. Missing schema denies access. Applying the schema proposal still keeps the separate actor-specific capability false for everyone. No hosted migration, capability activation or deletion action has occurred.

## Schema and security review

The SQL proposes three authenticated read RPCs, a private count-free view and two private gate functions. No new table/stored data, customer portfolio access, email/owner projection, exports, mutation RPC or executor. Thirteen fields: request UUID/date/status, withdrawal date, lifecycle, processing checkpoint, enumerated holds and dates, identity-review/completion/receipt-expiry dates, provider-copy status and receipt UUID. Maximum page 50, offset 10000. Responses are private/no-store. Extra selectors, unexpected fields and malformed records fail closed.

Every data read requires the existing live-session/current-owner/Terms/active-lifecycle guard plus the separate actor-specific capability. Definer functions use empty search paths and schema-qualified references. Authenticated, anonymous and service roles get no direct private view/function privileges. Proposed public read RPC execution is authenticated only. Rotating the investment owner does not transfer deletion access. Revocation sets the capability false; denied refreshes purge displayed rows. No executor or hold-editing permissions are added.

The view uses canonical request, lifecycle and operation rows, including retained operations after Auth cascades. Missing request history/date is unavailable. Verified receipts require canonical completion, an unexpired receipt, assessed provider status and absent Auth user/sessions. Canonical manual finish remains the inventory authority. Unconfirmed completion has no verified receipt. Expired completed records disappear unless canonical holds retain them. Elapsed dates never release holds. No new stored data means canonical export/erasure/retention rules remain unchanged. Receipts never claim email delivery or erasure of all provider copies/backups.

## Manual boundary

The UI reads and explains only. Withdrawal means stop; holds require scoped manual review. Follow the existing manual runbook for project/request/identity/version binding, current lifecycle, per-phase approvals, fresh inventory, Storage/Auth/session confirmation, provider-copy assessment and separately confirmed completion channel. No purge/Auth deletion/arbitrary completion/status/hold-editing controls or endpoints.

## Bounded release — proposed, not executed

1. Review the exact SQL against current canonical hosted definitions; preserve existing kernels/permissions.
2. Separately approve the default-false schema proposal and deploy only this read-only API/frontend slice from fresh published main. Gate stays closed.
3. Separately approve deletion-review READ access for Jonathan's existing verified owner. The activation proposal binds the previously verified UUID/email and checks current owner/confirmed identity. It is not executed and does not authorize account deletion.
4. Verify denied/default-off behavior, then approved-owner reads using an expressly authorized disposable fixture. No customer portfolio browsing or deletion smoke test.

Rollback: replace the capability function body with SELECT false first, then revert frontend/API if needed. Retain canonical requests, operations, holds and receipts. Investment-request access stays intact. No destructive rollback.

## Qualification and limitations

Backend: 4081 passed, 2 skipped, one existing Starlette/httpx warning. Frontend: 784 passed. Auth/hosted safety: 44 passed. Lint, TypeScript and public-config production build passed. Real local PostgreSQL/PostgREST JWT: 57 assertions covering default denial, ordinary/anonymous/forged-user denial, owner rotation, revoked session, Terms/lifecycle, pagination, exact projection, retained orphan operations, verified/unconfirmed/expired receipts, elapsed holds and 20 concurrent reads with identical canonical state before/after. No executor invoked.

Synthetic browser fixtures cover 320/390/1440, light/dark, eight display variants, empty/loading/unavailable, revoked access, focus/disclosure and Back. Screenshots/evidence and existing investment-Admin regression are in the bundle. This is scoped Admin qualification, not an all-page UX audit. Hosted deletion capability/workflow is not exercised; destructive manual phases still require their existing separate approvals.
