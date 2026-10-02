BEGIN;
DO $verify$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.arbor_terms_before_user_created_v1(jsonb)'::regprocedure AND pg_get_userbyid(proowner)='postgres' AND prosecdef AND 'search_path=""'=ANY(proconfig) AND prosrc='
DECLARE c arbor_private.terms_control%rowtype; token text; e text;
BEGIN
 SELECT * INTO c FROM arbor_private.terms_control FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION ''terms_configuration_missing'' USING ERRCODE=''PT503''; END IF;
 IF NOT c.enforcement_enabled THEN RETURN ''{}''::jsonb; END IF;
 token:=event->''user''->''user_metadata''->>''arbor_terms_intent''; e:=event->''user''->>''email'';
 IF token IS NULL OR token !~ ''^[0-9a-f]{64}$'' OR e IS NULL OR length(e)>254
 OR NOT EXISTS(SELECT 1 FROM arbor_private.terms_signup_intents i WHERE
 i.token_hash=encode(sha256(convert_to(token,''UTF8'')),''hex'') AND i.email_hash=encode(sha256(convert_to(lower(btrim(e)),''UTF8'')),''hex'')
 AND i.version=c.current_version AND i.expires_at>clock_timestamp())
 THEN RETURN jsonb_build_object(''error'',jsonb_build_object(''http_code'',400,''message'',''Review and accept the current Arbor Terms before creating an account.'')); END IF;
 RETURN ''{}''::jsonb;
END ') THEN RAISE EXCEPTION 'Reviewed hook mismatch'; END IF;
 IF NOT has_schema_privilege('supabase_auth_admin','public','USAGE') THEN RAISE EXCEPTION 'Unexpected missing existing public schema usage'; END IF;
 IF (SELECT enforcement_enabled FROM arbor_private.terms_control) IS DISTINCT FROM false THEN RAISE EXCEPTION 'Enforcement must remain off'; END IF;
END $verify$;
REVOKE ALL ON FUNCTION public.arbor_terms_before_user_created_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.arbor_terms_before_user_created_v1(jsonb) TO supabase_auth_admin;
COMMIT;