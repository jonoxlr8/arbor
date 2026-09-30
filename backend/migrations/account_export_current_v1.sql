-- LOCAL REVIEW ONLY: additive JWT-bound entry point; do not alter the hosted v1 migration.
-- Apply as the same verified privileged owner (expected postgres). No broader table/role access grants. Export-only operational metadata is private.
-- PostgREST must validate the JWT before populating auth.jwt()/auth.uid(). SQL does
-- not verify token signatures or defend against a database administrator forging GUCs.
BEGIN;
CREATE TABLE arbor_private.account_export_cooldowns (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 cooldown_until timestamptz NOT NULL
);
CREATE INDEX account_export_cooldowns_expiry ON arbor_private.account_export_cooldowns(cooldown_until);
ALTER TABLE arbor_private.account_export_cooldowns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arbor_private.account_export_cooldowns FROM PUBLIC,anon,authenticated,service_role;
-- One rolling timestamp per owner, no attempts/history/payloads/tokens.
-- Expiry is 60s; bounded physical cleanup needs an approved periodic caller.
CREATE OR REPLACE FUNCTION arbor_private.purge_account_export_cooldowns()
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET statement_timeout='1s'
AS $$
DECLARE removed integer;
BEGIN
 DELETE FROM arbor_private.account_export_cooldowns r USING (
  SELECT user_id FROM arbor_private.account_export_cooldowns
  WHERE cooldown_until<clock_timestamp() ORDER BY cooldown_until LIMIT 1000 FOR UPDATE SKIP LOCKED
 ) expired WHERE r.user_id=expired.user_id AND r.cooldown_until<clock_timestamp();
 GET DIAGNOSTICS removed=ROW_COUNT;
 RETURN removed;
END $$;
REVOKE ALL ON FUNCTION arbor_private.purge_account_export_cooldowns() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.arbor_account_export_current_v1()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path='' SET timezone='UTC' SET statement_timeout='8s'
AS $$
DECLARE claims jsonb; owner_id uuid; session_id uuid; epoch_now numeric; accepted_until timestamptz; result jsonb; response_status integer:=200; response_code text; response_message text;
BEGIN
 PERFORM set_config('response.headers','[{"Cache-Control":"private, no-store"},{"X-Content-Type-Options":"nosniff"}]',true);
 claims:=auth.jwt();
 epoch_now:=extract(epoch FROM statement_timestamp());
 IF claims IS NULL OR claims->>'role' IS DISTINCT FROM 'authenticated'
  OR coalesce(claims->>'sub','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR coalesce(claims->>'session_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR jsonb_typeof(claims->'exp') IS DISTINCT FROM 'number'
  OR jsonb_typeof(claims->'iat') IS DISTINCT FROM 'number'
  OR coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$'
  OR coalesce(claims->>'iat','') !~ '^[0-9]{1,12}$'
  OR NOT coalesce((claims->'aud'='"authenticated"'::jsonb
     OR (jsonb_typeof(claims->'aud')='array' AND claims->'aud' @> '["authenticated"]'::jsonb)),false)
 THEN RAISE EXCEPTION 'export_reauthentication_required' USING ERRCODE='28000'; END IF;
 owner_id:=auth.uid();
 session_id:=(claims->>'session_id')::uuid;
 IF owner_id IS NULL OR owner_id<>(claims->>'sub')::uuid
  OR (claims->>'exp')::numeric<=epoch_now
  OR (claims->>'iat')::numeric>epoch_now+5
  OR (claims->>'iat')::numeric>(claims->>'exp')::numeric
 THEN RAISE EXCEPTION 'export_reauthentication_required' USING ERRCODE='28000'; END IF;
 -- Refuse caller-selected rollback preferences before metadata admission/work.
 -- Hosted REST must use commit by default and reject transaction overrides.
 IF coalesce(current_setting('request.headers',true),'{}')::jsonb->>'prefer' ~* 'tx[[:space:]]*=[[:space:]]*rollback'
 THEN RAISE EXCEPTION 'export_transaction_override_denied' USING ERRCODE='PT400'; END IF;
 IF NOT EXISTS (SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
  WHERE s.id=session_id AND s.user_id=owner_id AND s.created_at IS NOT NULL
   AND s.created_at>=statement_timestamp()-interval '15 minutes'
   AND s.created_at<=statement_timestamp() AND (s.not_after IS NULL OR s.not_after>statement_timestamp()))
 THEN RAISE EXCEPTION 'export_reauthentication_required' USING ERRCODE='28000'; END IF;
 -- Transaction locks bound simultaneous direct RPCs without storing quotas or data.
 -- The private timestamp below additionally throttles sequential direct calls.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('arbor-account-export:'||owner_id::text,0))
 THEN RAISE EXCEPTION 'export_busy' USING ERRCODE='PT429'; END IF;
 -- Two global slots use the separate two-int advisory-lock namespace.
 IF NOT (pg_try_advisory_xact_lock(-184920731,0) OR pg_try_advisory_xact_lock(-184920731,1))
 THEN RAISE EXCEPTION 'export_busy' USING ERRCODE='PT429'; END IF;
 INSERT INTO arbor_private.account_export_cooldowns AS r(user_id,cooldown_until)
 VALUES(owner_id,clock_timestamp()+interval '60 seconds')
 ON CONFLICT(user_id) DO UPDATE SET cooldown_until=excluded.cooldown_until
 WHERE r.cooldown_until<=clock_timestamp()
 RETURNING cooldown_until INTO accepted_until;
 IF accepted_until IS NULL THEN RAISE EXCEPTION 'export_busy' USING ERRCODE='PT429'; END IF;
 -- Keep admission outside this subtransaction. Expected failures return an error
 -- response instead of rethrowing, so a normal REST commit preserves cooldown.
 BEGIN
  result:=public.arbor_account_export_v1(owner_id,session_id);
  PERFORM arbor_private.purge_account_export_cooldowns();
 EXCEPTION
  WHEN query_canceled THEN response_status:=504; response_code:='PT504'; response_message:='export_timed_out';
  WHEN OTHERS THEN
   response_status:=503; response_code:='PT503'; response_message:='export_unavailable';
   IF SQLERRM IN ('export_too_large','export_oversized_record','export_invalid_or_oversized_record')
   THEN response_status:=413; response_code:='PT413'; response_message:=SQLERRM;
   ELSIF SQLERRM='export_reauthentication_required'
   THEN response_status:=403; response_code:='PT403'; response_message:=SQLERRM;
   END IF;
 END;
 IF response_status<>200 THEN
  PERFORM set_config('response.status',response_status::text,true);
  RETURN jsonb_build_object('code',response_code,'message',response_message,'details',NULL,'hint',NULL);
 END IF;
 RETURN result||jsonb_build_object('export_operational_metadata',jsonb_build_array(jsonb_build_object('cooldown_until',accepted_until)));

END $$;
REVOKE ALL ON FUNCTION public.arbor_account_export_current_v1() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.arbor_account_export_current_v1() TO authenticated;
-- The parameterized v1 stays service-only. No authenticated/anon grant is added to it.
COMMIT;
-- Proposed rollback (separately approved on hosted):
-- DROP FUNCTION public.arbor_account_export_current_v1();
-- This leaves the existing service-only v1 and private projection helper intact.
-- Rate table/purger contain only new export metadata; retention/cleanup rollback
-- requires its own review. No automatic data cleanup/drop is included here.
