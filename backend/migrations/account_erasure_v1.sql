-- LOCAL qualification only; no app-role/operator privilege expansion.
-- Existing migration owner must own these invoker maintenance functions.
-- CLI generation unavailable here; follows existing reviewed account_* file convention.
BEGIN;
CREATE TABLE arbor_private.account_erasure_operations (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL UNIQUE,
 request_id uuid NOT NULL UNIQUE,
 request_version bigint NOT NULL,
 state text NOT NULL CHECK(state IN ('reviewed','erasing','data_erased','auth_erased','completed')),
 verified_at timestamptz NOT NULL,
 reviewed_by name NOT NULL DEFAULT session_user,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 receipt_expires_at timestamptz,
 holds jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(holds)='array' AND jsonb_array_length(holds)<=12),
 counts jsonb NOT NULL DEFAULT '{}',
 provider_status text NOT NULL DEFAULT 'unassessed' CHECK(provider_status IN ('unassessed','pending_copies','confirmed')),
 CHECK((state='completed')=(completed_at IS NOT NULL)),
 CHECK((completed_at IS NULL)=(receipt_expires_at IS NULL))
);
-- Intentionally no Auth FK: this minimal barrier survives supported Auth deletion.
ALTER TABLE arbor_private.account_erasure_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arbor_private.account_erasure_operations FROM PUBLIC,anon,authenticated,service_role;

-- Keep erasing lifecycle state until the supported Auth deletion itself cascades it.
ALTER TABLE arbor_private.account_lifecycle DROP CONSTRAINT account_lifecycle_user_id_fkey;
ALTER TABLE arbor_private.account_lifecycle ADD CONSTRAINT account_lifecycle_user_id_fkey FOREIGN KEY(user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE arbor_private.account_deletion_requests DROP CONSTRAINT account_deletion_requests_user_id_fkey;
ALTER TABLE arbor_private.account_deletion_requests ADD CONSTRAINT account_deletion_requests_user_id_fkey FOREIGN KEY(user_id) REFERENCES arbor_private.account_lifecycle(user_id) ON DELETE CASCADE;
-- Ledger/Auth and ledger/holding RESTRICT constraints are NOT changed.

CREATE FUNCTION arbor_private.erasure_context(p_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT session_user=pg_get_userbyid(p.proowner)
 AND current_setting('arbor.erasure_owner',true)=p_owner::text
 AND EXISTS(SELECT 1 FROM arbor_private.account_erasure_operations o WHERE o.owner_id=p_owner AND o.state='erasing' AND o.holds='[]'::jsonb)
 FROM pg_proc p WHERE p.proname='erasure_data' AND p.pronamespace='arbor_private'::regnamespace
$$;
REVOKE ALL ON FUNCTION arbor_private.erasure_context(uuid) FROM PUBLIC,anon,authenticated,service_role;
-- Function reference above is resolved at execution, so create the kernel first.
CREATE FUNCTION arbor_private.erasure_inventory(p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t text; n bigint; result jsonb:='{}'; total bigint:=0;
BEGIN
 FOREACH t IN ARRAY ARRAY['arbor_investment_entries','arbor_portfolio_holdings','arbor_portfolio_snapshots','arbor_portfolio_history_changes','arbor_monthly_checkins','arbor_pending_investment_recordings','arbor_pending_recording_reminders','holdings','profiles','arbor_ask_usage_monthly'] LOOP
  IF to_regclass('public.'||t) IS NULL THEN
   IF t<>'arbor_ask_usage_monthly' THEN RAISE EXCEPTION 'erasure_schema_incompatible'; END IF;
   result:=result||jsonb_build_object(t,NULL); CONTINUE;
  END IF;
  EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id=$1',t) INTO n USING p_owner;
  total:=total+n; result:=result||jsonb_build_object(t,n);
 END LOOP;
 IF total>10000 THEN RAISE EXCEPTION 'erasure_manual_large_account_review_required'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION arbor_private.erasure_inventory(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION arbor_private.erasure_review(p_owner uuid,p_request uuid,p_version bigint,p_operation uuid,p_verified boolean,p_holds jsonb DEFAULT '[]')
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='2s' AS $$
DECLARE r arbor_private.account_lifecycle%rowtype; q arbor_private.account_deletion_requests%rowtype; o arbor_private.account_erasure_operations%rowtype; h jsonb;
BEGIN
 IF NOT p_verified OR p_verified IS NULL OR p_operation IS NULL OR jsonb_typeof(p_holds) IS DISTINCT FROM 'array' OR jsonb_array_length(p_holds)>12 THEN RAISE EXCEPTION 'erasure_review_invalid'; END IF;
 FOR h IN SELECT value FROM jsonb_array_elements(p_holds) LOOP
  IF (SELECT count(*) FROM jsonb_object_keys(h))<>4 OR h->>'category' NOT IN ('ledger','profile','history','reminders','support','provider_copies')
  OR EXISTS(SELECT 1 FROM jsonb_each(h) e WHERE jsonb_typeof(e.value)<>'string' OR e.value='""'::jsonb)
  OR h->>'reason' NOT IN ('legal_claim','restore_risk','reviewed_obligation')
  OR (h->>'review_at')::timestamptz>clock_timestamp()+interval '1 month'
  OR (h->>'review_at')::timestamptz<=clock_timestamp()
  OR (h->>'end_at')::timestamptz<(h->>'review_at')::timestamptz
  OR NOT h ?& ARRAY['category','reason','review_at','end_at'] THEN RAISE EXCEPTION 'erasure_hold_invalid'; END IF;
 END LOOP;
 PERFORM pg_advisory_xact_lock(hashtextextended('arbor-account-lifecycle:'||p_owner::text,0));
 SELECT * INTO o FROM arbor_private.account_erasure_operations WHERE owner_id=p_owner;
 IF FOUND THEN
  IF o.id<>p_operation OR o.request_id<>p_request OR o.request_version<>p_version OR o.state<>'reviewed' THEN RAISE EXCEPTION 'erasure_operation_conflict'; END IF;
 ELSE
  SELECT * INTO r FROM arbor_private.account_lifecycle WHERE user_id=p_owner;
  SELECT * INTO q FROM arbor_private.account_deletion_requests WHERE user_id=p_owner;
  IF r.state IS DISTINCT FROM 'deletion_pending' OR r.version IS DISTINCT FROM p_version OR q.status IS DISTINCT FROM 'pending' OR q.request_id IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'erasure_request_changed'; END IF;
  INSERT INTO arbor_private.account_erasure_operations(id,owner_id,request_id,request_version,state,verified_at,counts)
  VALUES(p_operation,p_owner,p_request,p_version,'reviewed',clock_timestamp(),arbor_private.erasure_inventory(p_owner));
 END IF;
 UPDATE arbor_private.account_erasure_operations SET holds=p_holds,updated_at=clock_timestamp() WHERE id=p_operation;
 RETURN jsonb_build_object('id',p_operation,'state','reviewed','held',jsonb_array_length(p_holds)>0);
END $$;
REVOKE ALL ON FUNCTION arbor_private.erasure_review(uuid,uuid,bigint,uuid,boolean,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION arbor_private.erasure_begin(p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='2s' AS $$
DECLARE o arbor_private.account_erasure_operations%rowtype; n integer;
BEGIN
 SELECT * INTO o FROM arbor_private.account_erasure_operations WHERE id=p_operation;
 IF NOT FOUND THEN RAISE EXCEPTION 'erasure_operation_missing'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('arbor-account-lifecycle:'||o.owner_id::text,0));
 SELECT * INTO o FROM arbor_private.account_erasure_operations WHERE id=p_operation FOR UPDATE;
 IF o.state IN ('erasing','data_erased','auth_erased','completed') THEN RETURN jsonb_build_object('state',o.state); END IF;
 IF o.holds<>'[]'::jsonb THEN RAISE EXCEPTION 'erasure_held'; END IF;
 IF NOT EXISTS(SELECT 1 FROM arbor_private.account_lifecycle l JOIN arbor_private.account_deletion_requests q USING(user_id)
 WHERE l.user_id=o.owner_id AND l.state='deletion_pending' AND l.version=o.request_version AND q.request_id=o.request_id AND q.status='pending') THEN RAISE EXCEPTION 'erasure_request_changed'; END IF;
 SELECT count(*) INTO n FROM public.arbor_pending_recording_reminders WHERE user_id=o.owner_id AND sent_at IS NULL AND stopped_at IS NULL AND attempt_count>0;
 IF n>0 THEN RAISE EXCEPTION 'erasure_delivery_outcome_unresolved'; END IF;
 UPDATE arbor_private.account_lifecycle SET state='erasing',version=version+1,changed_at=clock_timestamp() WHERE user_id=o.owner_id;
 UPDATE arbor_private.account_erasure_operations SET state='erasing',updated_at=clock_timestamp() WHERE id=p_operation;
 RETURN jsonb_build_object('state','erasing');
END $$;
REVOKE ALL ON FUNCTION arbor_private.erasure_begin(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION arbor_private.erasure_data(p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='2s' AS $$
DECLARE o arbor_private.account_erasure_operations%rowtype; t text; captured_counts jsonb;
BEGIN
 SELECT * INTO o FROM arbor_private.account_erasure_operations WHERE id=p_operation;
 IF NOT FOUND THEN RAISE EXCEPTION 'erasure_operation_missing'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('arbor-account-lifecycle:'||o.owner_id::text,0));
 SELECT * INTO o FROM arbor_private.account_erasure_operations WHERE id=p_operation FOR UPDATE;
 IF o.state IN ('data_erased','auth_erased','completed') THEN RETURN jsonb_build_object('state',o.state); END IF;
 IF o.state<>'erasing' OR o.holds<>'[]'::jsonb THEN RAISE EXCEPTION 'erasure_not_admitted'; END IF;
 captured_counts:=arbor_private.erasure_inventory(o.owner_id);
 PERFORM set_config('arbor.erasure_owner',o.owner_id::text,true);
 -- Trigger guards allow only this exact owner under the existing migration owner.
 FOREACH t IN ARRAY ARRAY['arbor_investment_entries','arbor_pending_investment_recordings','arbor_pending_recording_reminders','arbor_portfolio_holdings','arbor_portfolio_snapshots','arbor_portfolio_history_changes','arbor_monthly_checkins','arbor_ask_usage_monthly','holdings','profiles'] LOOP
  IF to_regclass('public.'||t) IS NOT NULL THEN EXECUTE format('DELETE FROM public.%I WHERE user_id=$1',t) USING o.owner_id;
  ELSIF t<>'arbor_ask_usage_monthly' THEN RAISE EXCEPTION 'erasure_schema_incompatible'; END IF;
 END LOOP;
 DELETE FROM arbor_private.account_export_cooldowns WHERE user_id=o.owner_id;
 IF EXISTS(SELECT 1 FROM jsonb_each(arbor_private.erasure_inventory(o.owner_id)) e WHERE e.value<>'null'::jsonb AND e.value<>'0'::jsonb) THEN RAISE EXCEPTION 'erasure_incomplete'; END IF;
 UPDATE arbor_private.account_erasure_operations SET state='data_erased',counts=captured_counts,updated_at=clock_timestamp() WHERE id=p_operation;
 RETURN jsonb_build_object('state','data_erased','counts',captured_counts);
END $$;
REVOKE ALL ON FUNCTION arbor_private.erasure_data(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Safe owner-specific maintenance exception. It does not authorize API callers.
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('arbor_private.guard_lifecycle_write()'::regprocedure);
 d:=replace(d,'IF c->>''role''=''authenticated'' THEN', 'IF arbor_private.erasure_context(owner_id) AND TG_OP=''DELETE'' THEN RETURN OLD; END IF; IF c->>''role''=''authenticated'' THEN');
 IF d NOT LIKE '%erasure_context(owner_id)%' THEN RAISE EXCEPTION 'erasure_guard_incompatible'; END IF;
 EXECUTE d;
 d:=pg_get_functiondef('public.arbor_guard_legacy_holding_write()'::regprocedure);
 d:=regexp_replace(d,'\mbegin\M','BEGIN IF TG_OP=''DELETE'' AND arbor_private.erasure_context(OLD.user_id) THEN RETURN OLD; END IF;','i');
 EXECUTE d;
 d:=pg_get_functiondef('public.arbor_note_portfolio_history_change()'::regprocedure);
 d:=regexp_replace(d,'\mbegin\M','BEGIN IF TG_OP=''DELETE'' AND arbor_private.erasure_context(OLD.user_id) THEN RETURN OLD; END IF;','i');
 EXECUTE d;
END $$;


CREATE FUNCTION arbor_private.erasure_auth_confirm(p_operation uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o arbor_private.account_erasure_operations%rowtype;
BEGIN
 SELECT * INTO o FROM arbor_private.account_erasure_operations WHERE id=p_operation FOR UPDATE;
 IF NOT FOUND OR o.state NOT IN ('data_erased','auth_erased','completed') THEN RAISE EXCEPTION 'erasure_not_ready'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=o.owner_id) OR EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=o.owner_id) THEN RAISE EXCEPTION 'erasure_auth_still_present'; END IF;
 IF o.state='data_erased' THEN UPDATE arbor_private.account_erasure_operations SET state='auth_erased',updated_at=clock_timestamp() WHERE id=p_operation; END IF;
END $$;
REVOKE ALL ON FUNCTION arbor_private.erasure_auth_confirm(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION arbor_private.erasure_finish(p_operation uuid,p_provider_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o arbor_private.account_erasure_operations%rowtype;
BEGIN
 SELECT * INTO o FROM arbor_private.account_erasure_operations WHERE id=p_operation FOR UPDATE;
 IF NOT FOUND OR o.state NOT IN ('auth_erased','completed') THEN RAISE EXCEPTION 'erasure_not_ready'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=o.owner_id) OR EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=o.owner_id) THEN RAISE EXCEPTION 'erasure_auth_still_present'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(arbor_private.erasure_inventory(o.owner_id)) e WHERE e.value<>'null'::jsonb AND e.value<>'0'::jsonb) THEN RAISE EXCEPTION 'erasure_incomplete'; END IF;
 IF p_provider_status NOT IN ('pending_copies','confirmed') OR p_provider_status IS NULL THEN RAISE EXCEPTION 'erasure_provider_assessment_required'; END IF;
 UPDATE arbor_private.account_erasure_operations SET state='completed',provider_status=p_provider_status,
 completed_at=coalesce(completed_at,clock_timestamp()),receipt_expires_at=coalesce(receipt_expires_at,clock_timestamp()+interval '90 days'),updated_at=clock_timestamp() WHERE id=p_operation;
 RETURN jsonb_build_object('receipt_id',o.id,'active_system_data_erased',true,'provider_status',p_provider_status,'whole_account_erasure_claim',false);
END $$;
REVOKE ALL ON FUNCTION arbor_private.erasure_finish(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.arbor_pending_investment_recordings ADD COLUMN reminder_metadata_pruned_at timestamptz;
ALTER TABLE public.arbor_pending_investment_recordings DROP CONSTRAINT arbor_pending_reminder_sent_check;
ALTER TABLE public.arbor_pending_investment_recordings ADD CONSTRAINT arbor_pending_reminder_sent_check CHECK(reminder_sent_at IS NULL OR reminder_delivery_id IS NOT NULL OR reminder_metadata_pruned_at IS NOT NULL);
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.arbor_claim_pending_recording_reminder()'::regprocedure);
 d:=replace(d,'p.reminder_delivery_id is null','p.reminder_delivery_id is null and p.reminder_metadata_pruned_at is null');
 IF d NOT LIKE '%p.reminder_metadata_pruned_at is null%' THEN RAISE EXCEPTION 'retention_claim_incompatible'; END IF;
 EXECUTE d;
END $$;


CREATE FUNCTION arbor_private.erasure_update_holds(p_operation uuid,p_holds jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='2s' AS $$
DECLARE o arbor_private.account_erasure_operations%rowtype; h jsonb;
BEGIN
 IF jsonb_typeof(p_holds) IS DISTINCT FROM 'array' OR jsonb_array_length(p_holds)>12 THEN RAISE EXCEPTION 'erasure_hold_invalid'; END IF;
 FOR h IN SELECT value FROM jsonb_array_elements(p_holds) LOOP
  IF jsonb_typeof(h) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(h))<>4
  OR NOT h ?& ARRAY['category','reason','review_at','end_at']
  OR EXISTS(SELECT 1 FROM jsonb_each(h) e WHERE jsonb_typeof(e.value)<>'string' OR e.value='""'::jsonb)
  OR h->>'category' NOT IN ('ledger','profile','history','reminders','support','provider_copies')
  OR h->>'reason' NOT IN ('legal_claim','restore_risk','reviewed_obligation')
  OR (h->>'review_at')::timestamptz<=clock_timestamp()
  OR (h->>'review_at')::timestamptz>clock_timestamp()+interval '1 month'
  OR (h->>'end_at')::timestamptz<(h->>'review_at')::timestamptz THEN RAISE EXCEPTION 'erasure_hold_invalid'; END IF;
 END LOOP;
 SELECT * INTO o FROM arbor_private.account_erasure_operations WHERE id=p_operation;
 IF NOT FOUND THEN RAISE EXCEPTION 'erasure_operation_missing'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('arbor-account-lifecycle:'||o.owner_id::text,0));
 UPDATE arbor_private.account_erasure_operations SET holds=p_holds,updated_at=clock_timestamp() WHERE id=p_operation;
 -- Hold review is explicit. An elapsed date does not silently release a hold.
END $$;
REVOKE ALL ON FUNCTION arbor_private.erasure_update_holds(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION arbor_private.erasure_retention(p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET lock_timeout='2s' AS $$
DECLARE r record; deliveries integer:=0; receipts integer:=0;
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>500 THEN RAISE EXCEPTION 'retention_limit_invalid'; END IF;
 FOR r IN SELECT id,user_id FROM public.arbor_pending_recording_reminders d
 WHERE greatest(sent_at,stopped_at)<=clock_timestamp()-interval '30 days'
 AND NOT EXISTS(SELECT 1 FROM arbor_private.account_erasure_operations o WHERE o.owner_id=d.user_id AND o.holds<>'[]'::jsonb)
 ORDER BY greatest(sent_at,stopped_at),id LIMIT p_limit LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('arbor-account-lifecycle:'||r.user_id::text,0));
  -- Claim owns the delivery row first; lock it before pruning links.
  PERFORM 1 FROM public.arbor_pending_recording_reminders WHERE id=r.id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.arbor_pending_recording_reminders d WHERE d.id=r.id AND greatest(d.sent_at,d.stopped_at)<=clock_timestamp()-interval '30 days') OR EXISTS(SELECT 1 FROM arbor_private.account_erasure_operations o WHERE o.owner_id=r.user_id AND o.holds<>'[]'::jsonb) THEN CONTINUE; END IF;
  UPDATE public.arbor_pending_investment_recordings SET reminder_metadata_pruned_at=clock_timestamp(),reminder_delivery_id=NULL WHERE reminder_delivery_id=r.id AND user_id=r.user_id;
  DELETE FROM public.arbor_pending_recording_reminders WHERE id=r.id AND user_id=r.user_id;
  deliveries:=deliveries+1;
 END LOOP;
 FOR r IN SELECT id,owner_id FROM arbor_private.account_erasure_operations WHERE state='completed' AND receipt_expires_at<=clock_timestamp() AND holds='[]'::jsonb ORDER BY receipt_expires_at LIMIT p_limit LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('arbor-account-lifecycle:'||r.owner_id::text,0));
  DELETE FROM arbor_private.account_erasure_operations WHERE id=r.id AND state='completed' AND receipt_expires_at<=clock_timestamp() AND holds='[]'::jsonb AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=r.owner_id);
  IF FOUND THEN receipts:=receipts+1; END IF;
 END LOOP;
 RETURN jsonb_build_object('delivery_rows_removed',deliveries,'receipts_removed',receipts,'support_mail','manual_only','hard_expiry_guarantee',false);
END $$;
REVOKE ALL ON FUNCTION arbor_private.erasure_retention(integer) FROM PUBLIC,anon,authenticated,service_role;


-- The surviving journal also blocks accidental identity restoration/recreation.
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.arbor_account_active_v1()'::regprocedure);
 d:=regexp_replace(d,'\mdeclare\M','<<erasure_scope>> DECLARE','i');
 d:=replace(d,'IF NOT FOUND THEN RETURN true; END IF;', 'IF EXISTS(SELECT 1 FROM arbor_private.account_erasure_operations o WHERE o.owner_id=erasure_scope.owner_id AND o.state<>''reviewed'') THEN RETURN false; END IF; IF NOT FOUND THEN RETURN true; END IF;');
 EXECUTE d;
 d:=pg_get_functiondef('public.arbor_reminders_allowed_v1(uuid)'::regprocedure);
 d:=replace(d,'RETURN st IS NULL OR st=''active'';', 'RETURN (st IS NULL OR st=''active'') AND NOT EXISTS(SELECT 1 FROM arbor_private.account_erasure_operations o WHERE o.owner_id=p_owner AND o.state<>''reviewed'');');
 EXECUTE d;
 d:=pg_get_functiondef('public.arbor_account_export_current_v1()'::regprocedure);
 d:=regexp_replace(d,'\mdeclare\M','<<erasure_scope>> DECLARE','i');
 d:=replace(d,'IF EXISTS(SELECT 1 FROM arbor_private.account_lifecycle WHERE user_id=owner_id AND state=''erasing'')', 'IF EXISTS(SELECT 1 FROM arbor_private.account_lifecycle WHERE user_id=owner_id AND state=''erasing'') OR EXISTS(SELECT 1 FROM arbor_private.account_erasure_operations o WHERE o.owner_id=erasure_scope.owner_id AND o.state<>''reviewed'')');
 EXECUTE d;
END $$;

-- Owner-visible status contains no counts, operator notes, financial data or secrets.
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.arbor_account_lifecycle_v1(text,bigint,uuid,boolean)'::regprocedure);
 d:=regexp_replace(d,'\mdeclare\M','<<erasure_scope>> DECLARE','i');
 d:=replace(d,'''erasure_available'',false,''access_allowed''', '''erasure_available'',false,''processing'',(SELECT jsonb_build_object(''state'',o.state,''verified_at'',o.verified_at,''completion_target'',o.verified_at+interval ''30 days'',''held'',o.holds<>''[]''::jsonb) FROM arbor_private.account_erasure_operations o WHERE o.owner_id=erasure_scope.owner_id AND o.request_id=q.request_id),''access_allowed''');
 IF d NOT LIKE '%''processing''%' THEN RAISE EXCEPTION 'erasure_status_incompatible'; END IF;
 EXECUTE d;
END $$;


DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.arbor_account_export_v1(uuid,uuid)'::regprocedure);
 d:=replace(d,'''closure_suppressed_at'',to_jsonb(t)->>''closure_suppressed_at''','''closure_suppressed_at'',to_jsonb(t)->>''closure_suppressed_at'',''reminder_metadata_pruned_at'',to_jsonb(t)->>''reminder_metadata_pruned_at''');
 d:=replace(d,'RETURN result;', 'result:=result||jsonb_build_object(''erasure_operations'',coalesce((SELECT jsonb_agg(jsonb_build_object(''id'',id,''state'',state,''verified_at'',verified_at,''holds'',holds,''completed_at'',completed_at,''receipt_expires_at'',receipt_expires_at,''provider_status'',provider_status)) FROM arbor_private.account_erasure_operations WHERE owner_id=p_verified_owner),''[]''::jsonb)); IF octet_length(result::text)>20971520 THEN RAISE EXCEPTION ''export_too_large''; END IF; RETURN result;');
 EXECUTE d;
END $$;

COMMIT;
