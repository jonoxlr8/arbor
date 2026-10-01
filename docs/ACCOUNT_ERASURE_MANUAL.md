# Arbor manual erasure runbook — explicit admission modes

LOCAL REVIEW. No execution job, new credential, new grant, production deletion or release activation. Founder Jonathan Isidoro is the sole operator. Approved targets and policies are unchanged.

## Artifact use

This folder contains seven runnable phase SQL templates, the pure standard-library renderer, the local rehearsal and its passing evidence. Defaults are execution_approved=false and ROLLBACK. Reserved sample UUIDs are not account instructions. Never change them to an account or set execution approval without the separate action-time phase authorization. Never run all files as a batch.

The renderer takes an immutable Binding(project_ref, owner UUID, operation UUID, request UUID, request_version, original Auth created_at, complete expected_counts), a fixed phase, aware issued/expires timestamps, approved=False and commit=False. It only returns text; it does not connect, load credentials or execute. Counts contain all ten allowlisted categories, with null allowed only for the absent inactive usage table; bounds reject over10,000 rows. Regenerate one phase using fresh evidence and <=180-second approval. Default-disabled samples will raise before changing data even if their timestamps are edited.

## Existing access and fixed target

Production project gnjjtlswwhkpiabyayvi/arbor, Arbor org; Management SQL current_user=session_user=postgres and reviewed migration/function ownership verified. Every query must use that exact project_id, verified by fresh project metadata; SQL itself cannot infer the Supabase project ref. Default production Storage has zero buckets/policies: recheck immediately before admission and stop if its configuration has changed. Do not expand grants, introduce a server key, use a database password or borrow Python's persistent-session lock. One operator/one operation at a time. Each phase takes a nonblocking transaction advisory lock plus operation row lock, with8s statement/2s lock bounds.

## Read-only preflight and review binding

Receive via authenticated request or functional external resource; proportionately verify identity and confirm a completion channel that remains usable after Auth removal. No user password/token in chat, default ID requirement or operator copy of financial export. Record the original immutable Auth UUID+created_at, current request UUID/version, all allowlisted count-only inventory, original owned object IDs/versions and provider-copy/hold assessment in private evidence. Counts can be obtained with SELECT arbor_private.erasure_inventory(exact_owner). Independently count ALL auth.sessions for that owner, including expired/nullable-expiry rows. Inventory Storage using exact ownership, complete bounded pagination and version/size metadata; never SQL-delete Storage metadata. Capture no secret values. No unspecified search for other accounts.

Request/version mismatch, unknown copy, unresolved reminder delivery, changed identity, hold, incomplete inventory or unavailable evidence stops admission. A scoped hold records necessity/category/review/end condition and remains monthly reviewed; it is not a blanket audit exemption. Current minimal templates refuse held execution; selective erasure is not supported by this lane.

## Phase sequence

1. REVIEW: exact pending request/version and original identity, current counts match captured counts, no holds, fresh approval. Stores reviewed operation through the existing private function. No data removal.
2. BEGIN: repeat identity/count/request checks under lock and fresh approval. Existing SQL refuses unresolved in-flight reminder outcomes. Changes the durable barrier to erasing. Pre-erasure cancellation is now closed; do not treat sign-in as cancellation.
3. SESSIONS_READY: verify erasing barrier, identity and unchanged reviewed counts. This template only checks; it calls no provider. Obtain separate bounded authorization for supported global sign-out, not raw Auth-table deletion. Then independently verify ALL session rows are zero; do not trust204/403/expired tokens as absence. A new sign-in can race; next phases recheck and stop.
4. STORAGE: if current owner has objects, obtain separate per-object authorization and use supported Storage API/dashboard removal after independently matching ownership/version. Reconcile uncertain outcomes read-only before any retry. Current production has no buckets; never create one to make a test pass. New buckets/policies/writers require review. Never remove Storage rows with SQL.
5. DATABASE: fresh original identity, exact erasing request/version, no holds, exact reviewed counts, zero current sessions and owned objects, approval checked again immediately before dispatch. Calls the existing owner-specific erasure_data inside one transaction. Explicit commit only under that irreversible phase approval; local rehearsals roll back. Completed data checkpoints return read-only and do not repeat DELETE.
6. AUTH_READY: requires data_erased, original identity, erasing barrier, zero personal rows/sessions/objects and fresh approval. This checks only. Owner separately uses supported Auth console/API hard deletion, after verifying exact UUID/created_at. It does not delete auth.users or create/administer credentials.
7. AUTH_CONFIRM: independently verify Auth UUID and ALL sessions absent, personal inventory zero and owned Storage absent. A recreated/restored identity blocks confirmation; do not delete it automatically. Calls the existing confirmation helper under fresh authorization.
8. COMPLETE: verifies the same absence evidence, no holds and auth_erased state. Produces minimal primary-system receipt with provider_status=pending_copies and whole_account_erasure_claim=false. Manual Zoho completion communication is separately authorized and its sent/received evidence recorded. Receipt creation is not email delivery. No automatic retention job or hard expiry is activated.

## Supported Auth actions and exact missing capability

Official Supabase signOut({scope:'global'}) terminates that signed-in user's sessions; access JWTs can remain cryptographically valid until expiry. Admin signOut requires a valid logged-in user JWT and an admin client. Do not collect a user's password/access token in chat, require another login to revoke already-absent sessions or silently add a powerful key. Existing connected database tools expose no Auth-admin API action. A separate authorized Chrome-extension read-only check verified Delete user and Ban user controls on the designated QA account. No all-session revocation control was found. No browser permission was changed; neither action was clicked.

Supabase documents console deletion at Authentication > Users. After AUTH_READY and its separate irreversible approval, Jonathan selects the exact UUID in production's Users page, checks the original identity and chooses permanent deletion, not soft deletion. Read-only Management SQL independently verifies Auth/session absence afterward. The read-only console check showed Delete user enabled with its irreversible warning; actual deletion is still a separately authorized owner action.

The zero-session mode remains unchanged and fails closed when sessions remain. A separately explicit banned_barrier mode is now implemented locally in backend/app/services/account_erasure_manual.py. It does not call Ban, revoke sessions, remove Auth/Storage rows, add grants or connect to a database. Its admission is not a fallback after failed revocation.

The alternate mode requires the exact erasing request/version and original Auth UUID+created_at, no holds and exact reviewed inventory. Before SESSIONS_READY/DATABASE/AUTH_READY it locks the original Auth row and reads authoritative banned_until, requiring it to remain later than the entire fresh approval window. It allows remaining sessions only in these pre-Auth phases. Ban is not labeled session revocation. AUTH_CONFIRM/COMPLETE still require the original Auth identity and ALL sessions absent; a recreated identity blocks completion.

Current Storage support is deliberately limited to the verified zero-bucket/zero-policy configuration. Owned objects, new buckets/policies, unreviewed owner relations/views, missing restrictive RLS policies, changed invoker-view security or disabled lifecycle write triggers stop admission. No Storage feature or access is created to satisfy a test. A fresh complete API/RPC/catalog review is mandatory on deployment/schema changes; these checks are drift detectors, not a proof against a privileged administrator modifying the guard functions themselves.

Cached JWTs are still cryptographically valid. Product routes require the active lifecycle guard; direct financial tables use restrictive owner/lifecycle RLS; derived owner views use invoker security; definer writes and owner triggers serialize on the same admission lock. Export denies erasing and surviving non-reviewed journal state. Minimal account status and public support/shared-market information remain intentionally accessible. Reminder admission excludes the closed owner and the erasure begin checkpoint rejects unresolved delivery outcomes. Already accepted remote deliveries cannot be recalled.

The deployed Auth version was observed as v2.197.0. Its requireAuthentication explicitly rejects banned users with pre-Ban access tokens; Ban itself changes banned_until and does not remove sessions. This source inspection supports the design but does not replace a reversible test against the deployed gateway/Auth configuration. No hosted Ban has been performed for this revision.

Remaining exact action-time approval: temporarily Ban ONLY the already designated disposable production QA identity for 15 minutes through the existing authorized console, preserve prior banned_until, then verify old-token GET /auth/v1/user, refresh and normal sign-in are denied; restore the previous Ban state immediately after the bounded test and verify login again. No emails, new credential, Auth deletion, financial writes, Storage operation or global setting change. Never log access/refresh tokens or passwords. If a test unexpectedly succeeds or restoration fails, stop and report the exact gate; do not release. The owner/parent must authorize this specific reversible security action before it occurs. Permanent deletion remains separate action-time authorization, even after general release approval.

Sources checked: https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/api/auth.go ; https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/models/user.go ; https://raw.githubusercontent.com/supabase/auth/v2.197.0/internal/api/admin.go ; https://supabase.com/docs/guides/auth/signout ; https://supabase.com/docs/reference/javascript/auth-admin-signout ; https://supabase.com/docs/guides/auth/managing-user-data . Dashboard user deletion is documented; dashboard session-revocation control is NOT assumed.

## Recovery and uncertain outcomes

Read the durable operation after interruption. reviewed: recheck request/holds before BEGIN. erasing: inspect sessions and Storage, authorize only the missing side effect; never replay confirmed removals. After confirmed object absence, resume DATABASE without replaying Storage. data_erased: never rerun primary DELETE; fresh AUTH_READY checks then supported owner Auth step. auth_erased: recheck absence then COMPLETE. completed: reconcile receipt/provider follow-up only, never re-delete. Auth/Storage calls are not covered by a SQL rollback; uncertain network errors are not permission to duplicate.

A restored backup is quarantined and authorized decisions reapplied before access/reminders. Provider backups/logs/support/operator copies are tracked separately; pending copies can be disclosed truthfully without pretending that all copies are erased. No blanket indefinite audit retention, automatic90-day purge or comprehensive compliance claim.

## Demonstrated tests and limits

Nine cases passed against actual disposable localhost PostgreSQL: success, expiry, sessions, objects, changed counts, changed identity, holds, changed request and default execution-disabled. The success chain executes REVIEW/BEGIN/SESSIONS_READY/DATABASE/AUTH_READY/AUTH_CONFIRM/COMPLETE and receipt, using local simulated Auth removal only. Savepoint/full rollback restores all17 baseline table fingerprints; temporary synthetic Auth/Storage fixtures are absent. No managed provider behavior is claimed from that simulation.

A scratch rehearsal wrapper initially retained its COMMIT suffix; the identified two local synthetic rows/operation/temp Storage schema were cleaned locally, the wrapper fixed, and the final nine-case run passed with full rollback. No hosted action occurred in that correction. Production migration and reversible HTTP qualification evidence remains separate.

Latest local revision: 6 renderer unit tests; a real valid-signature backend guard test; original zero-session 9-case PostgreSQL rehearsal; banned-barrier 18-case PostgreSQL rehearsal including missing/expired/short Ban, objects, inventory/identity/hold/request changes, policy/trigger/view drift, new owner surface, recreated identity and partial post-data Ban failure. Successful checkpoint retries are read-only. All 17 baseline table fingerprints restored and temporary schema/Auth fixtures absent. The local Auth-removal step is a simulation that explicitly removes synthetic sessions because the local minimal Auth schema has a RESTRICT FK; this is not managed Auth API qualification.

Actual local PostgREST tests used a still-valid synthetic JWT and an existing session: financial tables and all five derived owner views return no rows; INSERT/UPDATE and all eight reviewed financial RPCs cannot change data; export, login and cancellation reject; another synthetic owner remains unaffected. A late privileged writer also rejects and waits behind the operator advisory lock. Test-only fixtures are removed by exact UUID after each run. No hosted actions were taken by these tests.

The mixed working tree full backend run reported 3,604 passed, 2 skipped. It includes the separately excluded inception tests, so fresh deletion-only overlay reported 3,589 passed, 2 skipped, plus 647 frontend tests, lint, TypeScript, production build, browser-script syntax and git diff --check all passed. The first isolated collection lacked its safe test origin configuration; it was corrected with explicit test-only URL/key placeholders and rerun successfully. No production environment file was copied. Existing 43 candidate paths plus this manual documentation and four new implementation/test paths make 48 deletion candidates. Ten unrelated inception paths remain excluded. No staged files or publication at this checkpoint.

New paths: backend/app/services/account_erasure_manual.py (pure explicit-mode renderer), backend/tests/test_account_erasure_manual.py (renderer safety contract), backend/tests/sql/account_erasure_manual_local.py (fully rolled-back phase rehearsal), backend/tests/sql/account_erasure_barrier_access_local.py (actual local cached-JWT/late-write isolation). No new migration, grant, job, credential or app execution endpoint.

## Default-disabled runnable REVIEW SQL

```sql
BEGIN;
SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='2s';
-- External tool target MUST be project_id=gnjjtlswwhkpiabyayvi; SQL cannot infer project ref.
-- No writes to managed Auth/Storage tables; one operator/operation at a time.
DO $manual$ DECLARE
 bound_owner_id uuid:='00000000-0000-4000-8000-000000000001'; bound_operation_id uuid:='00000000-0000-4000-8000-000000000002'; bound_request_id uuid:='00000000-0000-4000-8000-000000000003';
 bound_original_created timestamptz:='2026-10-01T16:48:48.626275+00:00'; bound_request_version bigint:=1;
 bound_expected_counts jsonb:='{"arbor_ask_usage_monthly":null,"arbor_investment_entries":0,"arbor_monthly_checkins":0,"arbor_pending_investment_recordings":0,"arbor_pending_recording_reminders":0,"arbor_portfolio_history_changes":0,"arbor_portfolio_holdings":0,"arbor_portfolio_snapshots":0,"holdings":0,"profiles":0}'; issued timestamptz:='2026-10-01T16:48:48.626275+00:00'; expiry timestamptz:='2026-10-01T16:51:48.626275+00:00';
 phase text:='review'; execution_approved boolean:=false;
 o arbor_private.account_erasure_operations%rowtype; current_counts jsonb;
BEGIN
 IF NOT execution_approved THEN RAISE EXCEPTION 'manual_execution_not_approved'; END IF;
 IF session_user<>pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='arbor_private.erasure_data(uuid)'::regprocedure)) THEN RAISE EXCEPTION 'manual_operator_owner_mismatch'; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('arbor-account-lifecycle:'||bound_owner_id::text,0)) THEN RAISE EXCEPTION 'manual_operation_busy'; END IF;
 IF clock_timestamp()<issued OR clock_timestamp()>=expiry OR expiry-issued>interval '180 seconds' THEN RAISE EXCEPTION 'manual_approval_expired'; END IF;
 SELECT * INTO o FROM arbor_private.account_erasure_operations WHERE id=bound_operation_id FOR UPDATE;
 IF FOUND AND (o.owner_id<>bound_owner_id OR o.request_id<>bound_request_id OR o.request_version<>bound_request_version OR o.holds<>'[]'::jsonb) THEN RAISE EXCEPTION 'manual_operation_changed_or_held'; END IF;
 IF phase<>'review' AND NOT FOUND THEN RAISE EXCEPTION 'manual_operation_missing'; END IF;
 -- Reconciliation is read-only: never repeat an already committed destructive phase.
 IF (phase='begin' AND o.state IN ('erasing','data_erased','auth_erased','completed'))
 OR (phase='database' AND o.state IN ('data_erased','auth_erased','completed'))
 OR (phase='auth_confirm' AND o.state IN ('auth_erased','completed'))
 OR (phase='complete' AND o.state='completed') THEN RETURN; END IF;
 IF phase IN ('review','begin','sessions_ready','database','auth_ready') THEN
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=bound_owner_id AND created_at=bound_original_created) THEN RAISE EXCEPTION 'manual_original_identity_changed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM arbor_private.account_lifecycle l JOIN arbor_private.account_deletion_requests q USING(user_id)
   WHERE l.user_id=bound_owner_id AND q.request_id=bound_request_id AND q.status='pending'
   AND l.state=CASE WHEN phase IN ('review','begin') THEN 'deletion_pending' ELSE 'erasing' END
   AND l.version=bound_request_version+CASE WHEN phase IN ('review','begin') THEN 0 ELSE 1 END) THEN RAISE EXCEPTION 'manual_request_or_barrier_changed'; END IF;
 END IF;
 current_counts:=arbor_private.erasure_inventory(bound_owner_id);
 IF phase IN ('review','begin','sessions_ready','database') AND (current_counts IS DISTINCT FROM bound_expected_counts OR (phase<>'review' AND o.counts IS DISTINCT FROM bound_expected_counts)) THEN RAISE EXCEPTION 'manual_inventory_changed'; END IF;
 IF phase IN ('database','auth_ready','auth_confirm','complete') AND
 (EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=bound_owner_id) OR EXISTS(SELECT 1 FROM storage.objects s WHERE s.owner_id=bound_owner_id::text)) THEN RAISE EXCEPTION 'manual_sessions_or_storage_remain'; END IF;
 IF phase IN ('auth_ready','auth_confirm','complete') AND EXISTS(SELECT 1 FROM jsonb_each(current_counts) e WHERE e.value<>'null'::jsonb AND e.value<>'0'::jsonb) THEN RAISE EXCEPTION 'manual_primary_rows_remain'; END IF;
 IF clock_timestamp()>=expiry THEN RAISE EXCEPTION 'manual_approval_expired'; END IF;
 IF phase='review' THEN PERFORM arbor_private.erasure_review(bound_owner_id,bound_request_id,bound_request_version,bound_operation_id,true,'[]'::jsonb);
 ELSIF phase='begin' THEN
  IF o.state<>'reviewed' THEN RAISE EXCEPTION 'manual_wrong_checkpoint'; END IF;
  PERFORM arbor_private.erasure_begin(bound_operation_id);
 ELSIF phase='sessions_ready' THEN
  IF o.state<>'erasing' THEN RAISE EXCEPTION 'manual_wrong_checkpoint'; END IF;
  -- Authorizes no provider call: separate owner-approved supported global signout.
  NULL;
 ELSIF phase='database' THEN
  IF o.state<>'erasing' THEN RAISE EXCEPTION 'manual_wrong_checkpoint'; END IF;
  PERFORM arbor_private.erasure_data(bound_operation_id);
 ELSIF phase='auth_ready' THEN
  IF o.state<>'data_erased' THEN RAISE EXCEPTION 'manual_wrong_checkpoint'; END IF;
  NULL; -- No Auth DELETE here. Owner must separately approve and act via supported console/API.
 ELSIF phase='auth_confirm' THEN
  IF EXISTS(SELECT 1 FROM auth.users WHERE id=bound_owner_id) THEN RAISE EXCEPTION 'manual_auth_identity_still_present'; END IF;
  PERFORM arbor_private.erasure_auth_confirm(bound_operation_id);
 ELSIF phase='complete' THEN
  IF o.state<>'auth_erased' OR EXISTS(SELECT 1 FROM auth.users WHERE id=bound_owner_id) THEN RAISE EXCEPTION 'manual_wrong_checkpoint'; END IF;
  PERFORM arbor_private.erasure_finish(bound_operation_id,'pending_copies');
 END IF;
END $manual$;
SELECT jsonb_build_object('operation',id,'state',state,'held',holds<>'[]'::jsonb,'provider_status',provider_status,'completed_at',completed_at,'whole_account_erasure_claim',false) result
 FROM arbor_private.account_erasure_operations journal WHERE journal.id='00000000-0000-4000-8000-000000000002' AND journal.owner_id='00000000-0000-4000-8000-000000000001';
ROLLBACK;
```

## Release delta and current stop gate

HEAD remains 2c59df9fd6024bb176cec2da0feabd95296776bf on main; no files staged. Forty-eight reviewed deletion paths are isolated from the ten inception paths. This revision adds no migration or role grant; the already-applied lifecycle and erasure migrations remain versioned 20261001161114 and 20261001161211. A read-only production recheck found the designated QA identity active, current banned_until null, no erasure operation, zero Storage buckets/policies, and all five owner views with invoker security. No hosted user state changed.

Generic deletion release/commit/deployment approval is recorded; the specific reversible Ban action and every permanent account phase remain separately gated. Once the managed Ban gate passes, proceed with deletion-only staged audit/tests, a reviewed backend-first commit/push, verified API and both existing cron deployments, then the reviewed frontend commit/push and actual live request/status/export checks through isolated auth QA. Respect the known Vercel connector denial; use legitimate authorized Git publication and public/isolated browser evidence, not alternate privileged API/CLI routes. Do not reapply the existing migrations or silently grant maintenance RPCs to app roles. Exclude the inception paths and stop on a failing gate.
