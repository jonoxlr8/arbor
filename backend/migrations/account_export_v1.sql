-- Expected privileged migration owner: postgres; verify auth.sessions SELECT and private helper access.
-- No service_role auth.sessions SELECT or arbor_private USAGE grant is required or added.
-- table_absent describes this database source only, not historical collection or external logs.
-- Locally qualified additive export migration. Hosted application requires separate approval.
-- Backend-only endpoint; ordinary anon/authenticated roles have no EXECUTE.
BEGIN;
CREATE SCHEMA IF NOT EXISTS arbor_private;
REVOKE ALL ON SCHEMA arbor_private FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION arbor_private.export_project_json(v jsonb, spec jsonb, depth integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE k text; item jsonb; out_value jsonb; allowed jsonb := spec->'fields';
BEGIN
 IF depth>32 OR octet_length(v::text)>65536 THEN RAISE EXCEPTION 'export_invalid_or_oversized_record'; END IF;
 IF v IS NULL OR v='null'::jsonb THEN RETURN 'null'::jsonb; END IF;
 IF spec->>'kind'='object' THEN
  IF jsonb_typeof(v)<>'object' THEN RAISE EXCEPTION 'export_invalid_record'; END IF;
  out_value := '{}'::jsonb;
  FOR k,item IN SELECT key,value FROM jsonb_each(v) LOOP
   IF NOT allowed ? k THEN RAISE EXCEPTION 'export_unknown_nested_field'; END IF;
   IF NOT coalesce(spec->'omit','[]'::jsonb) ? k THEN
    out_value := out_value || jsonb_build_object(k,arbor_private.export_project_json(item,allowed->k,depth+1));
   END IF;
  END LOOP;
  RETURN out_value;
 ELSIF spec->>'kind'='array' THEN
  IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)>100 THEN RAISE EXCEPTION 'export_invalid_record'; END IF;
  out_value := '[]'::jsonb;
  FOR item IN SELECT value FROM jsonb_array_elements(v) LOOP
   out_value := out_value || jsonb_build_array(arbor_private.export_project_json(item,spec->'item',depth+1));
  END LOOP;
  RETURN out_value;
 ELSE
  IF jsonb_typeof(v) NOT IN ('string','number','boolean') THEN RAISE EXCEPTION 'export_invalid_record'; END IF;
  IF octet_length(v::text)>16384 THEN RAISE EXCEPTION 'export_invalid_or_oversized_record'; END IF;
  -- Numerics serialize as exact text rather than a JavaScript floating-point value.
  RETURN CASE WHEN jsonb_typeof(v)='number' THEN to_jsonb(v #>> '{}') ELSE v END;
 END IF;
END $$;
REVOKE ALL ON FUNCTION arbor_private.export_project_json(jsonb,jsonb,integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.arbor_account_export_v1(p_verified_owner uuid,p_verified_session uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='' SET timezone='UTC' SET statement_timeout='8s'
AS $$
DECLARE result jsonb; section jsonb; section_items jsonb[]; item jsonb; n integer; used_bytes bigint:=0;
 deadline timestamptz:=clock_timestamp()+interval '7 seconds';
BEGIN
 -- Arguments are never taken from HTTP query/body; backend passes verified JWT sub/session_id.
 -- Grant denial is the direct-call boundary, not these trusted arguments alone.
 IF p_verified_owner IS NULL OR p_verified_session IS NULL OR NOT EXISTS (
  SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
  WHERE s.id=p_verified_session AND s.user_id=p_verified_owner
   AND s.created_at IS NOT NULL
   AND (s.not_after IS NULL OR s.not_after>statement_timestamp())
   AND s.created_at>=statement_timestamp()-interval '15 minutes'
   AND s.created_at<=statement_timestamp()
 ) THEN RAISE EXCEPTION 'export_reauthentication_required' USING ERRCODE='28000'; END IF;
 SELECT jsonb_build_object('schema_version','1','generated_at',statement_timestamp(),
  'complete',true,'consistency','single PostgreSQL statement snapshot',
  'account',jsonb_build_object('id',u.id,'email',u.email,'created_at',u.created_at,'email_confirmed_at',u.email_confirmed_at))
 INTO result FROM auth.users u WHERE u.id=p_verified_owner;
 IF result IS NULL THEN RAISE EXCEPTION 'export_unauthorized'; END IF;

 section_items:=ARRAY[]::jsonb[]; n:=0;
 IF (SELECT count(*) FROM (SELECT 1 FROM public.profiles WHERE user_id=p_verified_owner LIMIT 10001) bounded)>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
 FOR item IN SELECT jsonb_build_object('full_name',to_jsonb(t)->>'full_name','country',to_jsonb(t)->>'country','currency',to_jsonb(t)->>'currency','goal_target',to_jsonb(t)->>'goal_target','current_portfolio_value',to_jsonb(t)->>'current_portfolio_value','monthly_investment',to_jsonb(t)->>'monthly_investment','investment_horizon',to_jsonb(t)->>'investment_horizon','risk_tolerance',to_jsonb(t)->>'risk_tolerance','risk_score',to_jsonb(t)->>'risk_score','risk_level',to_jsonb(t)->>'risk_level','strategy_engine_version',to_jsonb(t)->>'strategy_engine_version','created_at',to_jsonb(t)->>'created_at','updated_at',to_jsonb(t)->>'updated_at','v2_inputs',arbor_private.export_project_json(to_jsonb(t)->'v2_inputs','{"kind":"object","fields":{"emergency_savings":{"kind":"scalar"},"high_interest_debt":{"kind":"scalar"},"horizon":{"kind":"scalar"},"risk_response":{"kind":"scalar"},"goal_name":{"kind":"scalar"},"goal_date":{"kind":"scalar"},"saved_preferences":{"kind":"object","fields":{"technology_tilt":{"kind":"scalar"},"bitcoin":{"kind":"scalar"}}},"selected_approach":{"kind":"scalar"},"explicit_customization":{"kind":"object","fields":{"technology_tilt":{"kind":"scalar"},"bitcoin":{"kind":"scalar"}}},"implementation_choices":{"kind":"object","fields":{"global_equity":{"kind":"scalar"},"defensive":{"kind":"scalar"},"technology_tilt":{"kind":"scalar"},"crypto":{"kind":"scalar"}}},"plan_state":{"kind":"object","fields":{"historical_plan":{"kind":"object","fields":{"plan_basis":{"kind":"scalar"},"strategy_engine_version":{"kind":"scalar"},"selection":{"kind":"object","fields":{"risk_response":{"kind":"scalar"},"horizon":{"kind":"scalar"},"requested_strategy":{"kind":"scalar"},"horizon_maximum_strategy":{"kind":"scalar"},"strategy_path":{"kind":"object","fields":{"path":{"kind":"scalar"},"strategy_engine_version":{"kind":"scalar"},"base_strategy":{"kind":"scalar"}}},"selected_strategy":{"kind":"scalar"},"is_short_term":{"kind":"scalar"},"cap_applied":{"kind":"scalar"},"reason":{"kind":"scalar"}}},"readiness":{"kind":"object","fields":{"readiness":{"kind":"scalar"},"core_strategy_can_be_shown":{"kind":"scalar"},"actionable_contribution_guidance_allowed":{"kind":"scalar"},"technology_satellite_readiness_eligible":{"kind":"scalar"},"bitcoin_satellite_readiness_eligible":{"kind":"scalar"},"message_requirement":{"kind":"scalar"}}},"inflation_pct":{"kind":"scalar"},"preference_result":{"kind":"object","fields":{"technology_tilt":{"kind":"object","fields":{"requested_percentage_points":{"kind":"scalar"},"effective_percentage_points":{"kind":"scalar"},"strategy_cap_percentage_points":{"kind":"scalar"},"reasons":{"kind":"array","item":{"kind":"scalar"}}}},"bitcoin":{"kind":"object","fields":{"requested_percentage_points":{"kind":"scalar"},"effective_percentage_points":{"kind":"scalar"},"strategy_cap_percentage_points":{"kind":"scalar"},"reasons":{"kind":"array","item":{"kind":"scalar"}}}},"effective_target":{"kind":"object","fields":{"strategy_engine_version":{"kind":"scalar"},"base_strategy":{"kind":"scalar"},"allocation":{"kind":"object","fields":{"weights":{"kind":"array","item":{"kind":"object","fields":{"role":{"kind":"scalar"},"percentage_points":{"kind":"scalar"}}}}}}}}}},"dormant_selected_approach":{"kind":"scalar"},"historical_allocation_preserved":{"kind":"scalar"},"customization":{"kind":"object","fields":{"technology_tilt":{"kind":"scalar"},"bitcoin":{"kind":"scalar"},"provenance":{"kind":"scalar"}}},"final_allocation":{"kind":"array","item":{"kind":"object","fields":{"role":{"kind":"scalar"},"percentage_points":{"kind":"scalar"}}}},"path":{"kind":"scalar"},"selected_strategy":{"kind":"scalar"},"base_allocation":{"kind":"scalar"},"planning_return_pct":{"kind":"scalar"}}},"revision_nonce":{"kind":"scalar"},"explicit_target":{"kind":"object","fields":{"strategy_engine_version":{"kind":"scalar"},"base_strategy":{"kind":"scalar"},"allocation":{"kind":"object","fields":{"weights":{"kind":"array","item":{"kind":"object","fields":{"role":{"kind":"scalar"},"percentage_points":{"kind":"scalar"}}}}}}}},"customization_provenance":{"kind":"scalar"}},"omit":["revision_nonce"]}}}'::jsonb,0)) FROM public.profiles t
  WHERE t.user_id=p_verified_owner LIMIT 10001 LOOP
  n:=n+1;
  IF n>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'export_timed_out'; END IF;
  IF octet_length(item::text)>65536 THEN RAISE EXCEPTION 'export_oversized_record'; END IF;
  used_bytes:=used_bytes+octet_length(item::text)+2;
  IF used_bytes>20900000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  section_items:=array_append(section_items,item);
 END LOOP;
 section:=to_jsonb(section_items);
 result:=result||jsonb_build_object('profile',section);

 section_items:=ARRAY[]::jsonb[]; n:=0;
 IF (SELECT count(*) FROM (SELECT 1 FROM public.holdings WHERE user_id=p_verified_owner LIMIT 10001) bounded)>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
 FOR item IN SELECT jsonb_build_object('id',to_jsonb(t)->>'id','ticker',to_jsonb(t)->>'ticker','asset_name',to_jsonb(t)->>'asset_name','asset_type',to_jsonb(t)->>'asset_type','quantity',to_jsonb(t)->>'quantity','average_cost',to_jsonb(t)->>'average_cost','currency',to_jsonb(t)->>'currency','created_at',to_jsonb(t)->>'created_at','updated_at',to_jsonb(t)->>'updated_at') FROM public.holdings t
  WHERE t.user_id=p_verified_owner LIMIT 10001 LOOP
  n:=n+1;
  IF n>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'export_timed_out'; END IF;
  IF octet_length(item::text)>65536 THEN RAISE EXCEPTION 'export_oversized_record'; END IF;
  used_bytes:=used_bytes+octet_length(item::text)+2;
  IF used_bytes>20900000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  section_items:=array_append(section_items,item);
 END LOOP;
 section:=to_jsonb(section_items);
 result:=result||jsonb_build_object('legacy_holdings',section);

 section_items:=ARRAY[]::jsonb[]; n:=0;
 IF (SELECT count(*) FROM (SELECT 1 FROM public.arbor_portfolio_holdings WHERE user_id=p_verified_owner LIMIT 10001) bounded)>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
 FOR item IN SELECT jsonb_build_object('id',to_jsonb(t)->>'id','product_id',to_jsonb(t)->>'product_id','provider',to_jsonb(t)->>'provider','units',to_jsonb(t)->>'units','cost_basis_php',to_jsonb(t)->>'cost_basis_php','manual_value_php',to_jsonb(t)->>'manual_value_php','manual_value_updated_at',to_jsonb(t)->>'manual_value_updated_at','opening_units',to_jsonb(t)->>'opening_units','opening_cost_php',to_jsonb(t)->>'opening_cost_php','is_archived',to_jsonb(t)->>'is_archived','created_at',to_jsonb(t)->>'created_at','updated_at',to_jsonb(t)->>'updated_at') FROM public.arbor_portfolio_holdings t
  WHERE t.user_id=p_verified_owner LIMIT 10001 LOOP
  n:=n+1;
  IF n>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'export_timed_out'; END IF;
  IF octet_length(item::text)>65536 THEN RAISE EXCEPTION 'export_oversized_record'; END IF;
  used_bytes:=used_bytes+octet_length(item::text)+2;
  IF used_bytes>20900000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  section_items:=array_append(section_items,item);
 END LOOP;
 section:=to_jsonb(section_items);
 result:=result||jsonb_build_object('portfolio_holdings',section);

 section_items:=ARRAY[]::jsonb[]; n:=0;
 IF (SELECT count(*) FROM (SELECT 1 FROM public.arbor_investment_entries WHERE user_id=p_verified_owner LIMIT 10001) bounded)>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
 FOR item IN SELECT jsonb_build_object('id',to_jsonb(t)->>'id','holding_id',to_jsonb(t)->>'holding_id','investment_date',to_jsonb(t)->>'investment_date','units',to_jsonb(t)->>'units','amount_paid_php',to_jsonb(t)->>'amount_paid_php','recorded_at',to_jsonb(t)->>'recorded_at','updated_at',to_jsonb(t)->>'updated_at','revision',to_jsonb(t)->>'revision','voided_at',to_jsonb(t)->>'voided_at') FROM public.arbor_investment_entries t
  WHERE t.user_id=p_verified_owner LIMIT 10001 LOOP
  n:=n+1;
  IF n>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'export_timed_out'; END IF;
  IF octet_length(item::text)>65536 THEN RAISE EXCEPTION 'export_oversized_record'; END IF;
  used_bytes:=used_bytes+octet_length(item::text)+2;
  IF used_bytes>20900000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  section_items:=array_append(section_items,item);
 END LOOP;
 section:=to_jsonb(section_items);
 result:=result||jsonb_build_object('investment_entries',section);

 section_items:=ARRAY[]::jsonb[]; n:=0;
 IF (SELECT count(*) FROM (SELECT 1 FROM public.arbor_portfolio_snapshots WHERE user_id=p_verified_owner LIMIT 10001) bounded)>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
 FOR item IN SELECT jsonb_build_object('day',to_jsonb(t)->>'day','value_php',to_jsonb(t)->>'value_php','recorded_cost_php',to_jsonb(t)->>'recorded_cost_php','cost_context_captured',to_jsonb(t)->>'cost_context_captured','usd_php_rate_at_capture',to_jsonb(t)->>'usd_php_rate_at_capture','captured_at',to_jsonb(t)->>'captured_at') FROM public.arbor_portfolio_snapshots t
  WHERE t.user_id=p_verified_owner LIMIT 10001 LOOP
  n:=n+1;
  IF n>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'export_timed_out'; END IF;
  IF octet_length(item::text)>65536 THEN RAISE EXCEPTION 'export_oversized_record'; END IF;
  used_bytes:=used_bytes+octet_length(item::text)+2;
  IF used_bytes>20900000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  section_items:=array_append(section_items,item);
 END LOOP;
 section:=to_jsonb(section_items);
 result:=result||jsonb_build_object('snapshots',section);

 section_items:=ARRAY[]::jsonb[]; n:=0;
 IF (SELECT count(*) FROM (SELECT 1 FROM public.arbor_portfolio_history_changes WHERE user_id=p_verified_owner LIMIT 10001) bounded)>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
 FOR item IN SELECT jsonb_build_object('id',to_jsonb(t)->>'id','affected_from',to_jsonb(t)->>'affected_from','changed_at',to_jsonb(t)->>'changed_at','reason',to_jsonb(t)->>'reason') FROM public.arbor_portfolio_history_changes t
  WHERE t.user_id=p_verified_owner LIMIT 10001 LOOP
  n:=n+1;
  IF n>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'export_timed_out'; END IF;
  IF octet_length(item::text)>65536 THEN RAISE EXCEPTION 'export_oversized_record'; END IF;
  used_bytes:=used_bytes+octet_length(item::text)+2;
  IF used_bytes>20900000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  section_items:=array_append(section_items,item);
 END LOOP;
 section:=to_jsonb(section_items);
 result:=result||jsonb_build_object('history_changes',section);

 section_items:=ARRAY[]::jsonb[]; n:=0;
 IF (SELECT count(*) FROM (SELECT 1 FROM public.arbor_monthly_checkins WHERE user_id=p_verified_owner LIMIT 10001) bounded)>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
 FOR item IN SELECT jsonb_build_object('month',to_jsonb(t)->>'month','amount_php',to_jsonb(t)->>'amount_php','completed_at',to_jsonb(t)->>'completed_at','undone_at',to_jsonb(t)->>'undone_at') FROM public.arbor_monthly_checkins t
  WHERE t.user_id=p_verified_owner LIMIT 10001 LOOP
  n:=n+1;
  IF n>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'export_timed_out'; END IF;
  IF octet_length(item::text)>65536 THEN RAISE EXCEPTION 'export_oversized_record'; END IF;
  used_bytes:=used_bytes+octet_length(item::text)+2;
  IF used_bytes>20900000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  section_items:=array_append(section_items,item);
 END LOOP;
 section:=to_jsonb(section_items);
 result:=result||jsonb_build_object('monthly_checkins',section);

 IF to_regclass('public.arbor_ask_usage_monthly') IS NULL THEN
  result:=result||jsonb_build_object('ask_usage','[]'::jsonb,'source_availability',jsonb_build_object('ask_usage','table_absent'));
 ELSE
 section_items:=ARRAY[]::jsonb[]; n:=0;
 IF (SELECT count(*) FROM (SELECT 1 FROM public.arbor_ask_usage_monthly WHERE user_id=p_verified_owner LIMIT 10001) bounded)>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
 FOR item IN SELECT jsonb_build_object('period',t.period::text,'successful_count',t.successful_count::text) FROM public.arbor_ask_usage_monthly t
  WHERE t.user_id=p_verified_owner LIMIT 10001 LOOP
  n:=n+1;
  IF n>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'export_timed_out'; END IF;
  IF octet_length(item::text)>65536 THEN RAISE EXCEPTION 'export_oversized_record'; END IF;
  used_bytes:=used_bytes+octet_length(item::text)+2;
  IF used_bytes>20900000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  section_items:=array_append(section_items,item);
 END LOOP;
 section:=to_jsonb(section_items);
 result:=result||jsonb_build_object('ask_usage',section);

  result:=result||jsonb_build_object('source_availability',jsonb_build_object('ask_usage','table_present'));
 END IF;
 section_items:=ARRAY[]::jsonb[]; n:=0;
 IF (SELECT count(*) FROM (SELECT 1 FROM public.arbor_pending_investment_recordings WHERE user_id=p_verified_owner LIMIT 10001) bounded)>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
 FOR item IN SELECT jsonb_build_object('id',to_jsonb(t)->>'id','product_id',to_jsonb(t)->>'product_id','provider',to_jsonb(t)->>'provider','source',to_jsonb(t)->>'source','status',to_jsonb(t)->>'status','started_at',to_jsonb(t)->>'started_at','resolved_at',to_jsonb(t)->>'resolved_at','reminder_sent_at',to_jsonb(t)->>'reminder_sent_at') FROM public.arbor_pending_investment_recordings t
  WHERE t.user_id=p_verified_owner LIMIT 10001 LOOP
  n:=n+1;
  IF n>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'export_timed_out'; END IF;
  IF octet_length(item::text)>65536 THEN RAISE EXCEPTION 'export_oversized_record'; END IF;
  used_bytes:=used_bytes+octet_length(item::text)+2;
  IF used_bytes>20900000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  section_items:=array_append(section_items,item);
 END LOOP;
 section:=to_jsonb(section_items);
 result:=result||jsonb_build_object('pending_recordings',section);

 section_items:=ARRAY[]::jsonb[]; n:=0;
 IF (SELECT count(*) FROM (SELECT 1 FROM public.arbor_pending_recording_reminders WHERE user_id=p_verified_owner LIMIT 10001) bounded)>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
 FOR item IN SELECT jsonb_build_object('created_at',to_jsonb(t)->>'created_at','first_attempt_at',to_jsonb(t)->>'first_attempt_at','attempt_count',to_jsonb(t)->>'attempt_count','sent_at',to_jsonb(t)->>'sent_at','stopped_at',to_jsonb(t)->>'stopped_at','provider_message_id',to_jsonb(t)->>'provider_message_id') FROM public.arbor_pending_recording_reminders t
  WHERE t.user_id=p_verified_owner LIMIT 10001 LOOP
  n:=n+1;
  IF n>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'export_timed_out'; END IF;
  IF octet_length(item::text)>65536 THEN RAISE EXCEPTION 'export_oversized_record'; END IF;
  used_bytes:=used_bytes+octet_length(item::text)+2;
  IF used_bytes>20900000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  section_items:=array_append(section_items,item);
 END LOOP;
 section:=to_jsonb(section_items);
 result:=result||jsonb_build_object('reminder_metadata',section);

 IF octet_length(result::text)>20971520 THEN RAISE EXCEPTION 'export_too_large'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.arbor_account_export_v1(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arbor_account_export_v1(uuid,uuid) TO service_role;
COMMIT;
-- Local rollback: DROP FUNCTION public.arbor_account_export_v1(uuid,uuid);
-- DROP FUNCTION arbor_private.export_project_json(jsonb,jsonb,integer);
-- No shared schema/table/role changes in rollback.
