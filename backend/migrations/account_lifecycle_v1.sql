-- LOCAL ONLY. Additive lifecycle guards; no erasure/retention executor.
-- Expected migration owner: postgres with existing Auth session access.
-- No new credentials or role/table privilege expansion. Apply only after review.
BEGIN;
CREATE TABLE arbor_private.account_lifecycle (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
 state text NOT NULL CHECK(state IN ('active','deactivated','deletion_pending','erasing')),
 version bigint NOT NULL DEFAULT 0 CHECK(version>=0),
 deactivated_at timestamptz,
 last_action_id uuid,
 last_action text,
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE arbor_private.account_deletion_requests (
 user_id uuid PRIMARY KEY REFERENCES arbor_private.account_lifecycle(user_id) ON DELETE RESTRICT,
 request_id uuid NOT NULL UNIQUE,
 status text NOT NULL CHECK(status IN ('pending','withdrawn')),
 requested_at timestamptz NOT NULL,
 withdrawn_at timestamptz,
 CHECK((status='withdrawn')=(withdrawn_at IS NOT NULL))
);
-- One current lifecycle and request per owner, not an unbounded event log.
ALTER TABLE arbor_private.account_lifecycle ENABLE ROW LEVEL SECURITY;
ALTER TABLE arbor_private.account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arbor_private.account_lifecycle,arbor_private.account_deletion_requests FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.arbor_pending_investment_recordings ADD COLUMN closure_suppressed_at timestamptz;
ALTER TABLE public.arbor_pending_recording_reminders ADD COLUMN closure_suppressed_at timestamptz;

CREATE FUNCTION arbor_private.lifecycle_session(p_recent boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb:=auth.jwt(); owner_id uuid; sid uuid; created timestamptz;
BEGIN
 IF c->>'role' IS DISTINCT FROM 'authenticated'
 OR coalesce(c->>'sub','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR coalesce(c->>'session_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR jsonb_typeof(c->'exp') IS DISTINCT FROM 'number'
 OR jsonb_typeof(c->'iat') IS DISTINCT FROM 'number'
 OR NOT coalesce(c->'aud'='"authenticated"'::jsonb OR (jsonb_typeof(c->'aud')='array' AND c->'aud' @> '["authenticated"]'::jsonb),false)
 THEN RAISE EXCEPTION 'lifecycle_sign_in_required' USING ERRCODE='PT401'; END IF;
 owner_id:=auth.uid(); sid:=(c->>'session_id')::uuid;
 IF owner_id IS NULL OR owner_id<>(c->>'sub')::uuid OR (c->>'exp')::numeric<=extract(epoch FROM clock_timestamp())
 OR (c->>'iat')::numeric>extract(epoch FROM clock_timestamp())+5 OR (c->>'iat')::numeric>(c->>'exp')::numeric
 THEN RAISE EXCEPTION 'lifecycle_sign_in_required' USING ERRCODE='PT401'; END IF;
 SELECT s.created_at INTO created FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
 WHERE s.id=sid AND s.user_id=owner_id AND s.created_at IS NOT NULL AND s.created_at<=clock_timestamp()
 AND (s.not_after IS NULL OR s.not_after>clock_timestamp());
 IF created IS NULL THEN RAISE EXCEPTION 'lifecycle_sign_in_required' USING ERRCODE='PT401'; END IF;
 IF p_recent AND created<clock_timestamp()-interval '15 minutes'
 THEN RAISE EXCEPTION 'lifecycle_recent_sign_in_required' USING ERRCODE='PT403'; END IF;
 RETURN owner_id;
END $$;
REVOKE ALL ON FUNCTION arbor_private.lifecycle_session(boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.arbor_account_active_v1()
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid; r arbor_private.account_lifecycle%rowtype; created timestamptz;
BEGIN
 owner_id:=arbor_private.lifecycle_session(false);
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('arbor-account-lifecycle:'||owner_id::text,0));
 SELECT * INTO r FROM arbor_private.account_lifecycle WHERE user_id=owner_id;
 IF NOT FOUND THEN RETURN true; END IF;
 SELECT s.created_at INTO created FROM auth.sessions s WHERE s.id=(auth.jwt()->>'session_id')::uuid AND s.user_id=owner_id;
 RETURN r.state='active' AND (r.deactivated_at IS NULL OR created>r.deactivated_at);
END $$;
REVOKE ALL ON FUNCTION public.arbor_account_active_v1() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.arbor_account_active_v1() TO authenticated;
CREATE FUNCTION arbor_private.require_active_account()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.arbor_account_active_v1() THEN RAISE EXCEPTION 'account_restricted' USING ERRCODE='PT403'; END IF;
END $$;
REVOKE ALL ON FUNCTION arbor_private.require_active_account() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.arbor_account_lifecycle_v1(p_action text DEFAULT 'status',p_expected_version bigint DEFAULT NULL,p_action_id uuid DEFAULT NULL,p_confirm boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET statement_timeout='8s' SET lock_timeout='2s' AS $$
DECLARE owner_id uuid; r arbor_private.account_lifecycle%rowtype; q arbor_private.account_deletion_requests%rowtype; created timestamptz; inflight integer;
BEGIN
 PERFORM set_config('response.headers','[{"Cache-Control":"private, no-store"}]',true);
 IF p_action NOT IN ('status','login','deactivate','request_deletion','cancel_deletion') OR p_action IS NULL
 THEN RAISE EXCEPTION 'invalid_lifecycle_action' USING ERRCODE='PT400'; END IF;
 IF coalesce(current_setting('request.headers',true),'{}')::jsonb->>'prefer' ~* 'tx[[:space:]]*=[[:space:]]*rollback'
 THEN RAISE EXCEPTION 'lifecycle_transaction_override_denied' USING ERRCODE='PT400'; END IF;
 owner_id:=arbor_private.lifecycle_session(p_action<>'status');
 PERFORM pg_advisory_xact_lock(hashtextextended('arbor-account-lifecycle:'||owner_id::text,0));
 SELECT * INTO r FROM arbor_private.account_lifecycle WHERE user_id=owner_id;
 IF NOT FOUND THEN r.user_id:=owner_id; r.state:='active'; r.version:=0; END IF;
 SELECT * INTO q FROM arbor_private.account_deletion_requests WHERE user_id=owner_id;
 IF p_action NOT IN ('status','login') THEN
  IF p_action_id IS NULL OR NOT p_confirm THEN RAISE EXCEPTION 'lifecycle_confirmation_required' USING ERRCODE='PT400'; END IF;
  IF r.last_action_id=p_action_id THEN
   IF r.last_action IS DISTINCT FROM p_action THEN RAISE EXCEPTION 'lifecycle_action_conflict' USING ERRCODE='PT409'; END IF;
   p_action:='status';
  ELSIF p_expected_version IS DISTINCT FROM r.version THEN RAISE EXCEPTION 'lifecycle_version_conflict' USING ERRCODE='PT409';
  ELSIF r.changed_at>clock_timestamp()-interval '1 second' THEN RAISE EXCEPTION 'lifecycle_busy' USING ERRCODE='PT429'; END IF;
 END IF;
 IF p_action<>'status' AND r.state='erasing' THEN RAISE EXCEPTION 'lifecycle_erasure_started' USING ERRCODE='PT409'; END IF;
 IF p_action='login' AND r.state='deactivated' AND q.status IS DISTINCT FROM 'pending' THEN
  SELECT s.created_at INTO created FROM auth.sessions s WHERE s.id=(auth.jwt()->>'session_id')::uuid AND s.user_id=owner_id;
  IF created<=r.deactivated_at THEN RAISE EXCEPTION 'lifecycle_recent_sign_in_required' USING ERRCODE='PT403'; END IF;
  r.state:='active'; r.version:=r.version+1;
 ELSIF p_action IN ('deactivate','request_deletion') THEN
  IF p_action='deactivate' AND (r.state='deletion_pending' OR q.status='pending')
  THEN RAISE EXCEPTION 'lifecycle_pending_request' USING ERRCODE='PT409'; END IF;
  IF r.state<>'active' AND p_action='deactivate' THEN p_action:='status';
  ELSIF p_action='request_deletion' AND q.status='pending' THEN p_action:='status';
  ELSE
   r.state:=CASE WHEN p_action='deactivate' THEN 'deactivated' ELSE 'deletion_pending' END;
   r.deactivated_at:=clock_timestamp(); r.version:=r.version+1;
   r.last_action_id:=p_action_id; r.last_action:=p_action;
  END IF;
 ELSIF p_action='cancel_deletion' THEN
  IF r.state<>'deletion_pending' OR q.status IS DISTINCT FROM 'pending'
  THEN RAISE EXCEPTION 'lifecycle_no_pending_request' USING ERRCODE='PT409'; END IF;
  -- Return requires a session created after deactivation, not a refreshed old token.
  SELECT s.created_at INTO created FROM auth.sessions s WHERE s.id=(auth.jwt()->>'session_id')::uuid AND s.user_id=owner_id;
  IF created<=r.deactivated_at THEN RAISE EXCEPTION 'lifecycle_recent_sign_in_required' USING ERRCODE='PT403'; END IF;
  r.state:='active'; r.version:=r.version+1; r.last_action_id:=p_action_id; r.last_action:=p_action;
 END IF;
 IF p_action<>'status' AND (r.version>0 OR r.last_action_id IS NOT NULL) THEN
  INSERT INTO arbor_private.account_lifecycle(user_id,state,version,deactivated_at,last_action_id,last_action)
  VALUES(owner_id,r.state,r.version,r.deactivated_at,r.last_action_id,r.last_action)
  ON CONFLICT(user_id) DO UPDATE SET state=excluded.state,version=excluded.version,deactivated_at=excluded.deactivated_at,last_action_id=excluded.last_action_id,last_action=excluded.last_action,changed_at=clock_timestamp();
  IF p_action='request_deletion' THEN
   INSERT INTO arbor_private.account_deletion_requests(user_id,request_id,status,requested_at)
   VALUES(owner_id,p_action_id,'pending',clock_timestamp()) ON CONFLICT(user_id) DO UPDATE
   SET request_id=excluded.request_id,status='pending',requested_at=excluded.requested_at,withdrawn_at=NULL;
  ELSIF p_action='cancel_deletion' THEN
   UPDATE arbor_private.account_deletion_requests SET status='withdrawn',withdrawn_at=clock_timestamp() WHERE user_id=owner_id;
  END IF;
  IF r.state IN ('deactivated','deletion_pending') THEN
   UPDATE public.arbor_pending_investment_recordings SET closure_suppressed_at=coalesce(closure_suppressed_at,clock_timestamp()) WHERE user_id=owner_id;
   UPDATE public.arbor_pending_recording_reminders SET closure_suppressed_at=coalesce(closure_suppressed_at,clock_timestamp()),
    stopped_at=CASE WHEN attempt_count=0 AND sent_at IS NULL THEN coalesce(stopped_at,clock_timestamp()) ELSE stopped_at END WHERE user_id=owner_id;
  END IF;
 END IF;
 SELECT * INTO q FROM arbor_private.account_deletion_requests WHERE user_id=owner_id;
 SELECT count(*) INTO inflight FROM public.arbor_pending_recording_reminders WHERE user_id=owner_id AND sent_at IS NULL AND stopped_at IS NULL AND attempt_count>0;
 RETURN jsonb_build_object('state',r.state,'version',r.version,'deletion_request',CASE WHEN q.status='pending' THEN jsonb_build_object('id',q.request_id,'requested_at',q.requested_at) ELSE NULL END,
 'in_flight_reminders',inflight,'erasure_available',false,'access_allowed',public.arbor_account_active_v1());
END $$;
REVOKE ALL ON FUNCTION public.arbor_account_lifecycle_v1(text,bigint,uuid,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.arbor_account_lifecycle_v1(text,bigint,uuid,boolean) TO authenticated;

-- RLS restrictive policy ANDs with every existing permissive ownership policy.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['profiles','holdings','arbor_portfolio_holdings','arbor_investment_entries','arbor_portfolio_snapshots','arbor_portfolio_history_changes','arbor_monthly_checkins','arbor_pending_investment_recordings','arbor_ask_usage_monthly'] LOOP
  IF to_regclass('public.'||t) IS NOT NULL THEN
   EXECUTE format('CREATE POLICY arbor_lifecycle_active ON public.%I AS RESTRICTIVE TO authenticated USING ((select public.arbor_account_active_v1())) WITH CHECK ((select public.arbor_account_active_v1()))',t);
  END IF;
 END LOOP;
END $$;

-- Write guard also covers definer paths and serializes against closure.
CREATE FUNCTION arbor_private.guard_lifecycle_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid; c jsonb:=auth.jwt(); st text;
BEGIN
 owner_id:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
 IF TG_OP='UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN RAISE EXCEPTION 'lifecycle_owner_change_denied' USING ERRCODE='PT403'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('arbor-account-lifecycle:'||owner_id::text,0));
 IF c->>'role'='authenticated' THEN
  IF auth.uid() IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'lifecycle_owner_denied' USING ERRCODE='PT403'; END IF;
  PERFORM arbor_private.require_active_account();
 ELSE
  SELECT state INTO st FROM arbor_private.account_lifecycle WHERE user_id=owner_id;
  IF st IS NOT NULL AND st<>'active' THEN RAISE EXCEPTION 'account_restricted' USING ERRCODE='PT403'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION arbor_private.guard_lifecycle_write() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['profiles','holdings','arbor_portfolio_holdings','arbor_investment_entries','arbor_portfolio_snapshots','arbor_portfolio_history_changes','arbor_monthly_checkins','arbor_ask_usage_monthly'] LOOP
  IF to_regclass('public.'||t) IS NOT NULL THEN EXECUTE format('CREATE TRIGGER arbor_lifecycle_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION arbor_private.guard_lifecycle_write()',t); END IF;
 END LOOP;
END $$;

-- Guard reviewed RPC entry points without changing their financial bodies/grants.
DO $$ DECLARE f record; definition text; BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN ('arbor_record_investment','arbor_revise_investment','arbor_correct_opening_position','arbor_capture_portfolio','arbor_reconstructed_portfolio_history','arbor_start_pending_recording','arbor_resolve_pending_recording') LOOP
  definition:=pg_get_functiondef(f.oid);
  IF definition !~* '\mbegin\M' THEN RAISE EXCEPTION 'unsupported_lifecycle_rpc_body'; END IF;
  definition:=regexp_replace(definition,'\mbegin\M','BEGIN'||chr(10)||' PERFORM arbor_private.require_active_account();','i');
  EXECUTE definition;
 END LOOP;
END $$;
-- The private monthly helper is also explicitly executable by authenticated.
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('arbor_private.monthly_checkin(text,text,numeric)'::regprocedure);
 definition:=regexp_replace(definition,'\mbegin\M','BEGIN'||chr(10)||' PERFORM arbor_private.require_active_account();','i');
 EXECUTE definition;
END $$;
-- The existing SQL monthly wrapper delegates to its private calculation helper.
-- Preserve that delegation and its invoker security; only add admission.
CREATE OR REPLACE FUNCTION public.arbor_monthly_checkin(p_action text DEFAULT 'read',p_month text DEFAULT NULL,p_amount numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT public.arbor_account_active_v1() THEN RAISE EXCEPTION 'account_restricted' USING ERRCODE='PT403'; END IF;
 RETURN arbor_private.monthly_checkin(p_action,p_month,p_amount);
END $$;
DO $$ DECLARE f record; definition text; BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='arbor_monthly_checkin' LOOP
 definition:=replace(pg_get_functiondef(f.oid),'PERFORM arbor_private.require_active_account();', 'IF NOT public.arbor_account_active_v1() THEN RAISE EXCEPTION ''account_restricted'' USING ERRCODE=''PT403''; END IF;'); EXECUTE definition;
 END LOOP;
END $$;

CREATE FUNCTION public.arbor_reminders_allowed_v1(p_owner uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE st text;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('arbor-account-lifecycle:'||p_owner::text,0));
 SELECT state INTO st FROM arbor_private.account_lifecycle WHERE user_id=p_owner;
 RETURN st IS NULL OR st='active';
END $$;
REVOKE ALL ON FUNCTION public.arbor_reminders_allowed_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arbor_reminders_allowed_v1(uuid) TO service_role;
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.arbor_claim_pending_recording_reminder()'::regprocedure);
 definition:=replace(definition,'where sent_at is null and stopped_at is null','where sent_at is null and stopped_at is null and closure_suppressed_at is null');
 definition:=replace(definition,'p.status = ''pending'' and p.reminder_delivery_id is null','p.status = ''pending'' and p.reminder_delivery_id is null and p.closure_suppressed_at is null and public.arbor_reminders_allowed_v1(p.user_id)');
 EXECUTE definition;
 definition:=pg_get_functiondef('public.arbor_prepare_pending_recording_reminder(uuid,uuid,text)'::regprocedure);
 definition:=regexp_replace(definition,'\mbegin\M','BEGIN IF NOT public.arbor_reminders_allowed_v1((SELECT user_id FROM public.arbor_pending_recording_reminders WHERE id=p_id)) THEN RETURN false; END IF;','i');
 definition:=replace(definition,'delivery.sent_at is not null or delivery.stopped_at is not null','delivery.sent_at is not null or delivery.stopped_at is not null or delivery.closure_suppressed_at is not null or not public.arbor_reminders_allowed_v1(delivery.user_id)');
 EXECUTE definition;
 definition:=pg_get_functiondef('public.arbor_finish_pending_recording_reminder(uuid,uuid,text,text)'::regprocedure);
 definition:=replace(definition,'elsif p_result = ''retry'' then','elsif p_result = ''retry'' and delivery.closure_suppressed_at is not null then update public.arbor_pending_recording_reminders set stopped_at=now(),lease_until=now() where id=p_id; elsif p_result = ''retry'' then');
 EXECUTE definition;
 -- Existing export remains available while deactivated/pending; deny only erasing.
 definition:=pg_get_functiondef('public.arbor_account_export_current_v1()'::regprocedure);
 definition:=replace(definition,'owner_id:=auth.uid();','owner_id:=auth.uid(); PERFORM pg_advisory_xact_lock_shared(hashtextextended(''arbor-account-lifecycle:''||owner_id::text,0)); IF EXISTS(SELECT 1 FROM arbor_private.account_lifecycle WHERE user_id=owner_id AND state=''erasing'') THEN RAISE EXCEPTION ''account_restricted'' USING ERRCODE=''PT403''; END IF;');
 EXECUTE definition;
 -- Include new owner data in the existing bounded snapshot kernel, no secrets.
 definition:=pg_get_functiondef('public.arbor_account_export_v1(uuid,uuid)'::regprocedure);
 definition:=replace(definition,'RETURN result;',
 'result:=result||jsonb_build_object(''account_lifecycle'',coalesce((SELECT jsonb_agg(jsonb_build_object(''state'',state,''version'',version,''deactivated_at'',deactivated_at,''changed_at'',changed_at)) FROM arbor_private.account_lifecycle WHERE user_id=p_verified_owner),''[]''::jsonb),''deletion_requests'',coalesce((SELECT jsonb_agg(jsonb_build_object(''request_id'',request_id,''status'',status,''requested_at'',requested_at,''withdrawn_at'',withdrawn_at)) FROM arbor_private.account_deletion_requests WHERE user_id=p_verified_owner),''[]''::jsonb)); IF octet_length(result::text)>20971520 THEN RAISE EXCEPTION ''export_too_large''; END IF; RETURN result;');
 definition:=replace(definition,'''reminder_sent_at'',to_jsonb(t)->>''reminder_sent_at''','''reminder_sent_at'',to_jsonb(t)->>''reminder_sent_at'',''closure_suppressed_at'',to_jsonb(t)->>''closure_suppressed_at''');
 definition:=replace(definition,'''stopped_at'',to_jsonb(t)->>''stopped_at''','''stopped_at'',to_jsonb(t)->>''stopped_at'',''closure_suppressed_at'',to_jsonb(t)->>''closure_suppressed_at''');
 EXECUTE definition;
END $$;
COMMIT;
