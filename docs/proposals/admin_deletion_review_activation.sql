-- PROPOSAL ONLY: separate approval required for owner deletion-review READ access.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN arbor_private.admin_owner a ON a.user_id=u.id
 WHERE u.id='6c5be4a1-06a0-4b92-9b54-2a693d6df024'::uuid AND lower(u.email)='jonoxlr8@gmail.com' AND u.email_confirmed_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Approved identity and existing owner must match; stop'; END IF;
END $$;
CREATE OR REPLACE FUNCTION arbor_private.deletion_review_enabled(p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS
$$ SELECT p_actor='6c5be4a1-06a0-4b92-9b54-2a693d6df024'::uuid $$;
REVOKE ALL ON FUNCTION arbor_private.deletion_review_enabled(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
-- Revocation: replace the capability function body with SELECT false.
-- Current owner/live session/Terms/active lifecycle still checked on every data read.
-- No grants to erasure, Auth/Storage mutation, holds or completion.
