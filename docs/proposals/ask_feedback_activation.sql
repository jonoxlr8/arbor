-- Exact approved activation scope, apply only after release/security qualification.
-- No cleanup job or cleanup operator grant. No investment/deletion role change.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN arbor_private.admin_owner a ON a.user_id=u.id
 WHERE u.id='6c5be4a1-06a0-4b92-9b54-2a693d6df024'::uuid AND lower(u.email)='jonoxlr8@gmail.com' AND u.email_confirmed_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Approved verified identity and existing owner must match; stop'; END IF;
 IF arbor_private.ask_feedback_enabled() OR arbor_private.ask_feedback_review_enabled('6c5be4a1-06a0-4b92-9b54-2a693d6df024'::uuid)
 THEN RAISE EXCEPTION 'Expected closed installation before activation; stop'; END IF;
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='arbor_ask_feedback')<>7
 OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.arbor_ask_feedback'::regclass)
 OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role'])r WHERE has_table_privilege(r,'public.arbor_ask_feedback','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'))
 THEN RAISE EXCEPTION 'Feedback storage security drift; stop'; END IF;
END $$;
CREATE OR REPLACE FUNCTION arbor_private.ask_feedback_enabled() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION arbor_private.ask_feedback_review_enabled(p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT p_actor='6c5be4a1-06a0-4b92-9b54-2a693d6df024'::uuid $$;
REVOKE ALL ON FUNCTION arbor_private.ask_feedback_enabled(),arbor_private.ask_feedback_review_enabled(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
-- Rollback: close both capability functions; retain storage/export/erasure coverage.
