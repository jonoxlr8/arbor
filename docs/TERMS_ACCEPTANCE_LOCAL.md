# Terms acceptance — local candidate and activation review

LOCAL ONLY. No approval to apply this migration, grant the Auth hook, configure
hosted Auth, create accounts, publish or enforce Terms is implied by this file.

## Recorded agreement

Initial version `2026-10-01.1`, SHA-256
`16081efb1de73fb08c2afeaa905ac4b6d0659c2f1ac6dab6d44d66642602e599`.
The frontend and backend JSON contain identical UTF-8 document bytes. Existing
business clauses are preserved; only the acceptance explanation changes. Never
overwrite an archived version when adding a material update. Add its public
archive route/document before making it current.

Each receipt records owner, version, content digest, server time and signup/account
source. There is no backfill or inference from login. The Privacy Notice remains
a disclosure, not an agreement checkbox or blanket consent. An unauthenticated
signup declaration is not proof of verified email identity or that a person read
every clause; Supabase confirmation still controls account access.

## Implementation boundary

`terms_acceptance_v1.sql` adds four private, RLS-enabled tables with no ordinary
table privileges. Signup intents contain token/email hashes and server expiry,
one slot per email, at most 1,000 total slots, ten-minute validity and a ten-second
email cooldown. Consumption and receipt recording occur in the Auth INSERT
transaction; a failed creation rolls both back. The preliminary Auth hook checks
the intent without consuming it. The short-lived nonce is removed from persisted
Auth metadata; user metadata never authorizes ordinary data access.

Expired intents are pruned opportunistically when another intent is issued.
Validity expiry is not guaranteed physical deletion. No new cleanup job, IP
tracking, CAPTCHA service, credential or broad grant is added. Global capacity
and locks bound work, but an attacker can temporarily deny legitimate intent
issuance; fairness or perfect anonymous rate limiting is not claimed. Fatal
transaction rollback also rolls back intent writes. Confirmation and capacity
bounds still apply to direct RPC calls.

Current-document and signup-intent RPCs are granted only to anon/authenticated.
Account status/acceptance is authenticated-only and derives the owner/session
from verified JWT claims and actual Auth sessions. Acceptance requires a session
created within fifteen minutes, not a recently refreshed token's iat. Hook
EXECUTE is revoked from all app roles and is NOT granted to Auth by this base
migration. Definer functions have empty search paths and explicit allowlisted
operations; expected hosted owner is postgres with existing Auth/private access.
Do not solve ownership/permission failures with broader app-role grants.

Enforcement starts false. Once enabled, current-version acceptance gates ordinary
personal-data admission through existing active-account guards, including direct
RLS/RPC paths. It does not gate export, privacy requests, closure/deletion status,
support or explicit pre-erasure cancellation. Accepting Terms does not cancel a
deletion request, reactivate a closed account or stop erasure. No acceptance after
erasure admission is permitted. Receipts are included in owner export and the
bounded erasure inventory/kernel; intents matching the original email are removed
before Auth removal. No financial calculation or onboarding question changes.

## Exact proposed hosted activation packet — NOT EXECUTED

1. Fresh read-only preflight: exact approved source bytes, current migrations,
   function owner/search paths/ACLs, Auth INSERT triggers and session schema,
   reviewed export/erasure rewrite markers, unchanged ledger RESTRICT, and no
   existing Terms objects/hook collision. Stop on drift. The expected target is
   Arbor production `gnjjtlswwhkpiabyayvi`; qualification should first use a
   separately approved disposable managed project, not real users.
2. Apply only the reviewed base migration while enforcement remains false.
   Backend first, frontend next; verify the current document/version archive and
   actual signup intent UI before enforcement. Publication remains separately
   authorized. An inactive hook is not a strict signup release.
3. After explicit approval, grant public-schema name resolution and only this
   hook EXECUTE to the existing Supabase Auth administrator role. No private
   schema/table grant is needed by the definer hook. Record whether schema USAGE
   pre-existed; do not revoke shared schema access during rollback. Supabase may
   apply these grants automatically when the hook is selected, so verify actual
   ACLs rather than claiming configuration is permission-neutral:

```sql
BEGIN;
DO $$ BEGIN
 IF pg_get_userbyid((SELECT proowner FROM pg_proc
  WHERE oid='public.arbor_terms_before_user_created_v1(jsonb)'::regprocedure))
  <> 'postgres' THEN RAISE EXCEPTION 'Unexpected hook owner'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.arbor_terms_before_user_created_v1(jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.arbor_terms_before_user_created_v1(jsonb)
 TO supabase_auth_admin;
COMMIT;
```

4. Configure the **Before User Created** Postgres Auth hook to exactly
   `public.arbor_terms_before_user_created_v1`, through the authorized Auth
   configuration UI. Preserve any existing hook; do not overwrite a collision.
   This SQL hook requires no HTTP secret or new credential. Verify enabled state
   and effective role execution. Specific hosted configuration/grant approval is
   still needed.
5. Under the same explicitly approved activation scope, publish/effect the exact
   version and enable control atomically:

```sql
BEGIN;
DO $$ DECLARE d arbor_private.terms_documents%rowtype; BEGIN
 SELECT * INTO d FROM arbor_private.terms_documents
 WHERE version='2026-10-01.1' FOR UPDATE;
 IF NOT FOUND OR d.content_digest <>
  '16081efb1de73fb08c2afeaa905ac4b6d0659c2f1ac6dab6d44d66642602e599'
 THEN RAISE EXCEPTION 'Approved document mismatch'; END IF;
 UPDATE arbor_private.terms_documents
 SET published_at=coalesce(published_at,clock_timestamp()),
     effective_at=coalesce(effective_at,clock_timestamp())
 WHERE version=d.version;
 UPDATE arbor_private.terms_control SET current_version=d.version,
 enforcement_enabled=true WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing Terms control'; END IF;
END $$;
COMMIT;
```

6. Managed synthetic qualification: owner-entered credentials only; no real user
   signup/export. Prove actual hook execution, unsupported/missing/wrong-email/
   expired/replayed intents reject without a committed Auth user or receipt,
   downstream Auth transaction failure leaves no orphan evidence, email
   confirmation behavior, private receipt/metadata removal, material-version
   update, existing-user recent session, cross-owner/direct-call isolation,
   rights access, unchanged deletion/reminder/financial behavior. Check any
   configured OAuth, invite, anonymous and administration creation flows;
   enforcement deliberately rejects creation without an accepted intent and must
   not silently exempt another route. Stop a failed gate rather than add a bypass.

## Exact rollback / containment — separately authorized if needed

Disable enforcement first to restore prior ordinary access and legacy no-intent
creation. No invented past acceptance, account reopening or data removal:

```sql
BEGIN;
UPDATE arbor_private.terms_control SET enforcement_enabled=false WHERE singleton;
COMMIT;
```

Then disable this exact Before User Created hook through authorized Auth settings;
verify it is disabled before revoking its call permission:

```sql
REVOKE EXECUTE ON FUNCTION public.arbor_terms_before_user_created_v1(jsonb)
 FROM supabase_auth_admin;
```

Keep documents, receipts and the disabled trigger/RPCs so already-published UI can
still work and audit/export/erasure data remains accurate. Roll back frontend
before backend if reverting code. Do not drop tables, backfill receipts or remove
existing lifecycle/export guards. Re-enabling later requires fresh qualification.

## Local versus managed proof

The local test Auth table is a synthetic approximation with raw metadata added.
PostgreSQL trigger atomicity and actual loopback PostgREST signatures/ACLs are
tested; this is not proof that hosted GoTrue executes the hook or reports all
creation failures as expected. No hosted hook/grant/configuration was changed.
The SQL contains 8-second statement and 2-second lock settings; local lock
contention is tested, not forced disruptive managed timeouts or production scale.

Official references: [Auth hooks](https://supabase.com/docs/guides/auth/auth-hooks),
[Before User Created](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook),
[user/session deletion](https://supabase.com/docs/guides/auth/managing-user-data).
