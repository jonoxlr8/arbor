# Terms production staged release

Recorded checkpoint, 2026-10-02. Project `gnjjtlswwhkpiabyayvi`.

## Activated checkpoint

The owner subsequently authorized the browser save, and the parent received
independent enabled-hook readback. The approved atomic activation completed:
enforcement is ON; published_at and effective_at are both
`2026-10-02T01:38:39.735414+00:00`, from the database server clock.
Live Terms API verifies exact version/digest and active state. Nine saved
financial fingerprints, Auth users/identities/sessions and lifecycle records
match before/after activation. Public archive, privacy and account-deletion pages
return 200; anonymous account status/export/lifecycle return 401. No real account
signup, acceptance, export, email or financial write was performed. Managed fresh
signup after scrub and actual managed callback remain explicitly unverified.

The earlier staged checkpoint below records the state before that authorization.

## Earlier staged checkpoint

The owner resumed the staged production release after TEST qualification. Base
migration `20261002011451` and receipt-bound scrub `20261002011701` are applied.
The narrow Auth-admin hook EXECUTE grant is applied as `20261002012537`;
its source is `backend/migrations/20261002012537_grant_terms_before_user_created_auth_execute.sql`.
Existing public-schema USAGE was already present and was not changed. Hook ACL
is postgres plus supabase_auth_admin; PUBLIC and app-role execution is denied.
Private Terms tables retain postgres-only ACLs. No historical cleanup or backfill.

Version `2026-10-01.1`, digest
`16081efb1de73fb08c2afeaa905ac4b6d0659c2f1ac6dab6d44d66642602e599`
matches the database-computed digest and deployed backend. The scrub body,
owners, empty search paths, RLS and intended triggers were verified. The saved
identical nine-table financial fingerprint query matched after both migrations.

Backend commit `a156b4f2fa87d24e62d5cdb509fa6100f761137a` is live on Render.
Frontend commit `23e93842e8755dab077dcf0bf94539c8aab01e0f` is READY on Vercel
and promoted to arbor.ph. The isolated release included exactly 30 reviewed
Terms paths. No unrelated pending tracker, inception or Ask changes were included.

Fresh isolated validation passed: 3,680 backend tests, two existing optional SQL
skips; 662 frontend tests; lint, TypeScript, production build, syntax and diff
checks. Actual local-build synthetic browser QA passed six widths. Deployed
public-page checks passed 320/390/768/1024/1440/1920 in light and dark, unchecked
signup, disabled creation button and the version archive, without account creation,
emails, page errors or write attempts. Public Terms API returns private/no-store;
anonymous account Terms and export requests return 401.

**Enforcement is OFF. The hook has not been saved in Auth configuration.**
published_at and effective_at are null; receipts and intents are zero at this
checkpoint. The browser helper selected the exact function but did not save it:
the task's direct owner authorization was read-only. It awaits the owner's direct
save authorization. Do not retry the save or substitute another management API.

After the authorized browser save, verify exact enabled Before User Created
Postgres target `public.arbor_terms_before_user_created_v1`, effective narrow
permissions and required gates before the approved atomic server-clock activation.
Fresh managed signup after the scrub and actual managed callback remain explicit
qualification limits; earlier TEST and local proofs are separate evidence. No new
account/email probe is authorized by this document.

`TERMS_ACCEPTANCE_LOCAL.md` preserves the original implementation/activation review;
its historical LOCAL-only status is not the current deployed-state record. This
document records the staged state and does not itself authorize any operation.
