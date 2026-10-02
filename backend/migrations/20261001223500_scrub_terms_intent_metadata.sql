-- Auth can copy signup request metadata into identities and later user updates.
-- Strip only the reserved capability of a user with a matching signup receipt.
BEGIN;
DO $authority$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
   WHERE p.oid='arbor_private.terms_signup_record()'::pg_catalog.regprocedure
   AND p.proowner=current_user::pg_catalog.regrole AND p.prosecdef
   AND 'search_path=""'=ANY(p.proconfig)) THEN
  RAISE EXCEPTION 'terms_scrub_authority_incompatible';
 END IF;
END;
$authority$;
CREATE FUNCTION arbor_private.terms_scrub_intent_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $scrub$
DECLARE target_user uuid;
BEGIN
 IF TG_TABLE_SCHEMA='auth' AND TG_TABLE_NAME='identities' THEN
  IF pg_catalog.jsonb_typeof(NEW.identity_data) IS DISTINCT FROM 'object'
     OR NOT (NEW.identity_data ? 'arbor_terms_intent') THEN RETURN NEW; END IF;
  target_user:=NEW.user_id;
 ELSIF TG_TABLE_SCHEMA='auth' AND TG_TABLE_NAME='users' THEN
  IF pg_catalog.jsonb_typeof(NEW.raw_user_meta_data) IS DISTINCT FROM 'object'
     OR NOT (NEW.raw_user_meta_data ? 'arbor_terms_intent') THEN RETURN NEW; END IF;
  target_user:=NEW.id;
 ELSE
  RAISE EXCEPTION 'terms_scrub_target_invalid';
 END IF;
 IF EXISTS(SELECT 1 FROM arbor_private.terms_acceptances a
   JOIN arbor_private.terms_documents d ON d.version=a.version AND d.content_digest=a.content_digest
   WHERE a.user_id=target_user AND a.source='signup') THEN
  IF TG_TABLE_NAME='identities' THEN
   NEW.identity_data:=NEW.identity_data-'arbor_terms_intent';
  ELSE
   NEW.raw_user_meta_data:=NEW.raw_user_meta_data-'arbor_terms_intent';
  END IF;
 END IF;
 RETURN NEW;
END;
$scrub$;
REVOKE ALL ON FUNCTION arbor_private.terms_scrub_intent_metadata() FROM PUBLIC,anon,authenticated,service_role;
-- User INSERT keeps the intent until the existing receipt trigger validates it.
CREATE TRIGGER arbor_terms_scrub_user_metadata BEFORE UPDATE OF raw_user_meta_data ON auth.users
 FOR EACH ROW EXECUTE FUNCTION arbor_private.terms_scrub_intent_metadata();
CREATE TRIGGER arbor_terms_scrub_identity_metadata BEFORE INSERT OR UPDATE OF identity_data ON auth.identities
 FOR EACH ROW EXECUTE FUNCTION arbor_private.terms_scrub_intent_metadata();
COMMIT;
