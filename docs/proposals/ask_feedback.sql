-- LOCAL PROPOSAL ONLY. No hosted schema/access activation authorized.
BEGIN;
CREATE TABLE public.arbor_ask_feedback(
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 helpful boolean NOT NULL,reason text CHECK(reason IN('unclear','not_my_question','numbers_look_wrong','missing_detail')),
 intent text NOT NULL CHECK(intent IN('education','instrument_education','plan','actual_holdings','holdings_help','recorded_cost','goal_progress','monthly_plan','monthly_checkin','pending_recording','contribution','projection','assessment','readiness','preferences','risk','implementation','overlap','next_action','change_plan','assumptions','plus','help','out_of_scope','decision_boundary','clarification','legacy_plan')),
 answer_version text NOT NULL CHECK(answer_version='deterministic-ask-1'),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX arbor_ask_feedback_owner_created ON public.arbor_ask_feedback(user_id,created_at);
ALTER TABLE public.arbor_ask_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arbor_ask_feedback FROM PUBLIC,anon,authenticated,service_role;
-- Installation alone does not authorize collection. Reviewed activation is separate.
CREATE FUNCTION arbor_private.ask_feedback_enabled() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT false $$;
REVOKE ALL ON FUNCTION arbor_private.ask_feedback_enabled() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.arbor_ask_feedback_access_v1() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT jsonb_build_object('available',arbor_private.ask_feedback_enabled() AND public.arbor_account_active_v1()) $$;
CREATE FUNCTION public.arbor_ask_feedback_save_v1(p_id uuid,p_helpful boolean,p_reason text,p_intent text,p_answer_version text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE actor uuid; existing public.arbor_ask_feedback%rowtype; BEGIN
 IF NOT arbor_private.ask_feedback_enabled() OR NOT public.arbor_account_active_v1() THEN RAISE EXCEPTION 'feedback_access_denied' USING errcode='PT403'; END IF;
 actor:=auth.uid();
 IF p_id IS NULL OR p_helpful IS NULL OR p_answer_version IS DISTINCT FROM 'deterministic-ask-1'
 OR p_intent IS NULL OR p_intent NOT IN('education','instrument_education','plan','actual_holdings','holdings_help','recorded_cost','goal_progress','monthly_plan','monthly_checkin','pending_recording','contribution','projection','assessment','readiness','preferences','risk','implementation','overlap','next_action','change_plan','assumptions','plus','help','out_of_scope','decision_boundary','clarification','legacy_plan')
 OR p_reason IS NOT NULL AND p_reason NOT IN('unclear','not_my_question','numbers_look_wrong','missing_detail')
 THEN RAISE EXCEPTION 'feedback_invalid' USING errcode='PT422'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('arbor-ask-feedback:'||actor::text,0));
 SELECT * INTO existing FROM public.arbor_ask_feedback WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF existing.user_id<>actor OR existing.intent<>p_intent OR existing.answer_version<>p_answer_version OR existing.created_at<=clock_timestamp()-interval '90 days'
  THEN RAISE EXCEPTION 'feedback_unavailable' USING errcode='PT409'; END IF;
  UPDATE public.arbor_ask_feedback SET helpful=p_helpful,reason=p_reason WHERE id=p_id AND user_id=actor;
 ELSE
  IF (SELECT count(*) FROM public.arbor_ask_feedback WHERE user_id=actor AND created_at>=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')>=20
  THEN RAISE EXCEPTION 'feedback_daily_limit' USING errcode='PT429'; END IF;
  INSERT INTO public.arbor_ask_feedback(id,user_id,helpful,reason,intent,answer_version) VALUES(p_id,actor,p_helpful,p_reason,p_intent,p_answer_version) ON CONFLICT(id) DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'feedback_unavailable' USING errcode='PT409'; END IF;
 END IF;
 RETURN jsonb_build_object('saved',true,'helpful',p_helpful,'reason',p_reason);
END $$;
REVOKE ALL ON FUNCTION public.arbor_ask_feedback_access_v1(),public.arbor_ask_feedback_save_v1(uuid,boolean,text,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.arbor_ask_feedback_access_v1(),public.arbor_ask_feedback_save_v1(uuid,boolean,text,text,text) TO authenticated;
-- Existing export/erasure authorities remain responsible for these new rows.
DO $patch$ DECLARE d text; fn regprocedure; BEGIN
 d:=pg_get_functiondef('public.arbor_account_export_v1(uuid,uuid)'::regprocedure);
 IF d NOT LIKE '%RETURN result;%' OR d LIKE '%ask_feedback%' OR d NOT LIKE '%p_verified_owner%' THEN RAISE EXCEPTION 'feedback_export_shape_changed'; END IF;
 d:=replace(d,'RETURN result;',$export$
 result:=result||jsonb_build_object('ask_feedback',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'helpful',helpful,'reason',reason,'intent',intent,'answer_version',answer_version,'created_at',created_at) ORDER BY created_at) FROM public.arbor_ask_feedback WHERE user_id=p_verified_owner),'[]'::jsonb));
 IF octet_length(result::text)>20971520 THEN RAISE EXCEPTION 'export_too_large'; END IF;
 RETURN result;
 $export$);EXECUTE d;
 FOREACH fn IN ARRAY ARRAY['arbor_private.erasure_inventory(uuid)'::regprocedure,'arbor_private.erasure_data(uuid)'::regprocedure] LOOP
  d:=pg_get_functiondef(fn);
  IF d NOT LIKE '%FOREACH t IN ARRAY ARRAY[%' OR d NOT LIKE '%arbor_investment_request_reviews%' OR d LIKE '%arbor_ask_feedback%' THEN RAISE EXCEPTION 'feedback_erasure_shape_changed'; END IF;
  d:=replace(d,'FOREACH t IN ARRAY ARRAY[','FOREACH t IN ARRAY ARRAY[''arbor_ask_feedback'',');EXECUTE d;
 END LOOP;
END $patch$;
CREATE FUNCTION arbor_private.prune_ask_feedback(p_limit integer DEFAULT 200) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE candidate record; n integer; removed integer:=0; BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'feedback_prune_limit'; END IF;
 FOR candidate IN SELECT f.id,f.user_id FROM public.arbor_ask_feedback f WHERE f.created_at<=clock_timestamp()-interval '90 days'
 AND NOT EXISTS(SELECT 1 FROM arbor_private.account_erasure_operations o WHERE o.owner_id=f.user_id
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(o.holds) h WHERE h->>'category'='support'))
 ORDER BY f.created_at,f.id LIMIT p_limit LOOP
  -- Same exclusive owner barrier as hold review and erasure. Skip busy owners.
  IF NOT pg_try_advisory_xact_lock(hashtextextended('arbor-account-lifecycle:'||candidate.user_id::text,0)) THEN CONTINUE; END IF;
  DELETE FROM public.arbor_ask_feedback f WHERE f.id=candidate.id AND f.created_at<=clock_timestamp()-interval '90 days'
  AND NOT EXISTS(SELECT 1 FROM arbor_private.account_erasure_operations o WHERE o.owner_id=f.user_id
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(o.holds) h WHERE h->>'category'='support'));
  GET DIAGNOSTICS n=ROW_COUNT;removed:=removed+n;
 END LOOP;
 RETURN removed;
END $$;
REVOKE ALL ON FUNCTION arbor_private.prune_ask_feedback(integer) FROM PUBLIC,anon,authenticated,service_role;
-- No scheduler or hosted operator grant. Cleanup operational cadence requires review.
COMMIT;
