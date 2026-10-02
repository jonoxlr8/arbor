-- Preserve the invoker guard and its original authenticated ledger checks.
-- Only the existing maintenance owner may evaluate the private exception.
BEGIN;
DO $repair$
DECLARE definition text;
 old_prefix text := 'BEGIN IF TG_OP=''DELETE'' AND arbor_private.erasure_context(OLD.user_id) THEN RETURN OLD; END IF;';
 new_prefix text := 'BEGIN
  -- arbor_legacy_erasure_owner_gate_v1
  IF TG_OP=''DELETE'' THEN
    IF current_user = pg_catalog.pg_get_userbyid((
      SELECT p.proowner FROM pg_catalog.pg_proc p
      WHERE p.oid=''arbor_private.erasure_data(uuid)''::pg_catalog.regprocedure
    )) THEN
      IF arbor_private.erasure_context(OLD.user_id) THEN RETURN OLD; END IF;
    END IF;
  END IF;';
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc g JOIN pg_catalog.pg_proc k
   ON k.oid='arbor_private.erasure_data(uuid)'::pg_catalog.regprocedure
   WHERE g.oid='public.arbor_guard_legacy_holding_write()'::pg_catalog.regprocedure
   AND NOT g.prosecdef AND g.proowner=k.proowner AND 'search_path=""'=ANY(g.proconfig)) THEN
   RAISE EXCEPTION 'legacy_erasure_guard_authority_incompatible';
 END IF;
 definition:=pg_catalog.pg_get_functiondef('public.arbor_guard_legacy_holding_write()'::pg_catalog.regprocedure);
 IF position('arbor_legacy_erasure_owner_gate_v1' IN definition)>0 THEN RETURN; END IF;
 IF position(old_prefix IN definition)=0 THEN RAISE EXCEPTION 'legacy_erasure_guard_definition_incompatible'; END IF;
 EXECUTE replace(definition,old_prefix,new_prefix);
END;
$repair$;
COMMIT;
