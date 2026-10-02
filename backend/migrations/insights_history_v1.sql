-- LOCAL REVIEW PROPOSAL ONLY. Apply after the published VGT/chart migrations.
-- Existing records are seeded only from deployment time, never backdated.
begin;
create table public.arbor_budget_versions (
 user_id uuid not null references public.profiles(user_id) on delete cascade,
 month date not null check (extract(day from month)=1),
 amount_php numeric check (amount_php is null or (amount_php>=0 and amount_php<1e16 and amount_php=round(amount_php,2))),
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(user_id,month)
);
create table public.arbor_plan_versions (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.profiles(user_id) on delete cascade,
 valid_from timestamptz not null default clock_timestamp(),
 profile_data jsonb not null
);
create index arbor_plan_versions_owner_time on public.arbor_plan_versions(user_id,valid_from desc,id desc);
alter table public.arbor_budget_versions enable row level security;
alter table public.arbor_plan_versions enable row level security;
revoke all on public.arbor_budget_versions,public.arbor_plan_versions from public,anon,authenticated,service_role;
grant select on public.arbor_budget_versions,public.arbor_plan_versions to authenticated;
-- Hosted default sequence grants must not expose global history IDs.
revoke all on sequence public.arbor_plan_versions_id_seq from public,anon,authenticated,service_role;
create policy budget_version_owner on public.arbor_budget_versions for select to authenticated using ((select auth.uid())=user_id);
create policy plan_version_owner on public.arbor_plan_versions for select to authenticated using ((select auth.uid())=user_id);

create policy arbor_lifecycle_active on public.arbor_budget_versions as restrictive to authenticated using ((select public.arbor_account_active_v1()));
create policy arbor_lifecycle_active on public.arbor_plan_versions as restrictive to authenticated using ((select public.arbor_account_active_v1()));

-- Database trigger only: callers cannot choose history timestamps/owners.
-- Profile row locking and its existing CAS revision serialize concurrent edits.
create function public.arbor_record_plan_history() returns trigger
language plpgsql security definer set search_path='' as $$
declare data jsonb; old_data jsonb;
begin
 if auth.uid() is null or auth.uid()<>new.user_id then raise exception 'History owner mismatch'; end if;
 if not public.arbor_account_active_v1() then raise exception 'account_restricted'; end if;
 if new.strategy_engine_version<>'2.0' then return new; end if;
 if tg_op='INSERT' or old.strategy_engine_version is distinct from '2.0' or new.monthly_investment is distinct from old.monthly_investment then
  insert into public.arbor_budget_versions(user_id,month,amount_php)
  values(new.user_id,date_trunc('month',clock_timestamp() at time zone 'Asia/Manila')::date,new.monthly_investment)
  on conflict(user_id,month) do update set amount_php=excluded.amount_php,recorded_at=clock_timestamp();
 end if;
 -- Retain only canonical allocation inputs. Goal text/date, implementation
 -- choices, profile money and live revision nonces are unnecessary here.
 data:=jsonb_build_object('strategy_engine_version',new.strategy_engine_version,'full_name','Recorded plan',
   'country',new.country,'currency',new.currency,'goal_target',null,
   'current_portfolio_value',null,'monthly_investment',null,'v2_inputs',case when new.v2_inputs ? 'plan_state' then jsonb_set(new.v2_inputs - array['goal_name','goal_date','implementation_choices'],'{plan_state,revision_nonce}','"recorded-plan"'::jsonb) else new.v2_inputs - array['goal_name','goal_date','implementation_choices'] end);
 if tg_op='UPDATE' then
  old_data:=jsonb_build_object('strategy_engine_version',old.strategy_engine_version,'full_name','Recorded plan',
   'country',old.country,'currency',old.currency,'goal_target',null,
   'current_portfolio_value',null,'monthly_investment',null,'v2_inputs',case when old.v2_inputs ? 'plan_state' then jsonb_set(old.v2_inputs - array['goal_name','goal_date','implementation_choices'],'{plan_state,revision_nonce}','"recorded-plan"'::jsonb) else old.v2_inputs - array['goal_name','goal_date','implementation_choices'] end);
 end if;
 if data is distinct from old_data then
  insert into public.arbor_plan_versions(user_id,profile_data) values(new.user_id,data);
 end if;
 return new;
end $$;
revoke all on function public.arbor_record_plan_history() from public,anon,authenticated,service_role;
create trigger arbor_record_plan_history after insert or update on public.profiles
 for each row execute function public.arbor_record_plan_history();
insert into public.arbor_budget_versions(user_id,month,amount_php)
 select user_id,date_trunc('month',clock_timestamp() at time zone 'Asia/Manila')::date,monthly_investment
 from public.profiles where strategy_engine_version='2.0';
insert into public.arbor_plan_versions(user_id,profile_data)
 select user_id,jsonb_build_object('strategy_engine_version',strategy_engine_version,'full_name','Recorded plan',
   'country',country,'currency',currency,'goal_target',null,'current_portfolio_value',null,
   'monthly_investment',null,'v2_inputs',case when v2_inputs ? 'plan_state' then jsonb_set(v2_inputs - array['goal_name','goal_date','implementation_choices'],'{plan_state,revision_nonce}','"recorded-plan"'::jsonb) else v2_inputs - array['goal_name','goal_date','implementation_choices'] end) from public.profiles where strategy_engine_version='2.0';

-- Future immutable observations retain the values calculated in the SAME query,
-- including the published VGT basis/freshness/provenance rules. No historical fill.
alter table public.arbor_portfolio_snapshots add column allocation_values jsonb;
do $$declare d text; begin
 d:=pg_get_functiondef('public.arbor_capture_portfolio()'::regprocedure);
 if d not like '%captured_fx numeric;%' or d not like '%sum(v.amount),%' or
    d not like '%costed_rows,recorded_cost,captured_fx%' or
    d not like '%true,captured_fx) on conflict%' then raise exception 'insights_capture_body_incompatible'; end if;
 d:=replace(d,'captured_fx numeric;','captured_fx numeric; allocation_values jsonb;');
 d:=replace(d,'sum(v.amount),','sum(v.amount), jsonb_agg(jsonb_build_object(''product_id'',h.product_id,''value_php'',v.amount::text)),');
 d:=replace(d,'amount,costed_rows,recorded_cost,captured_fx','amount,allocation_values,costed_rows,recorded_cost,captured_fx');
 d:=replace(d,'cost_context_captured,usd_php_rate_at_capture)','cost_context_captured,usd_php_rate_at_capture,allocation_values)');
 d:=replace(d,'true,captured_fx) on conflict','true,captured_fx,allocation_values) on conflict');
 execute d;
end $$;
-- Extend the existing single-snapshot allowlisted export without changing its
-- fresh-session authorization, cooldown or grants. Fail on incompatible body.
do $patch$ declare d text; begin
 d:=pg_get_functiondef('public.arbor_account_export_v1(uuid,uuid)'::regprocedure);
 if d not like '%RETURN result;%' or d not like '%''captured_at'',to_jsonb(t)->>''captured_at'') FROM public.arbor_portfolio_snapshots%' then raise exception 'insights_export_body_incompatible'; end if;
 d:=replace(d,'RETURN result;', $export$
 IF (SELECT count(*) FROM public.arbor_budget_versions WHERE user_id=p_verified_owner)>10000 OR
    (SELECT count(*) FROM public.arbor_plan_versions WHERE user_id=p_verified_owner)>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
 result:=result||jsonb_build_object('budget_versions',(SELECT coalesce(jsonb_agg(jsonb_build_object('month',month,'amount_php',amount_php::text,'recorded_at',recorded_at) ORDER BY month),'[]'::jsonb) FROM public.arbor_budget_versions WHERE user_id=p_verified_owner));
 result:=result||jsonb_build_object('plan_versions',(SELECT coalesce(jsonb_agg(jsonb_build_object('valid_from',valid_from,'profile_data',jsonb_build_object('strategy_engine_version',profile_data->'strategy_engine_version','country',profile_data->'country','currency',profile_data->'currency','goal_target',profile_data->'goal_target','current_portfolio_value',profile_data->'current_portfolio_value','monthly_investment',profile_data->'monthly_investment','v2_inputs',arbor_private.export_project_json(profile_data->'v2_inputs','{"kind":"object","fields":{"emergency_savings":{"kind":"scalar"},"high_interest_debt":{"kind":"scalar"},"horizon":{"kind":"scalar"},"risk_response":{"kind":"scalar"},"goal_name":{"kind":"scalar"},"goal_date":{"kind":"scalar"},"saved_preferences":{"kind":"object","fields":{"technology_tilt":{"kind":"scalar"},"bitcoin":{"kind":"scalar"}}},"selected_approach":{"kind":"scalar"},"explicit_customization":{"kind":"object","fields":{"technology_tilt":{"kind":"scalar"},"bitcoin":{"kind":"scalar"}}},"implementation_choices":{"kind":"object","fields":{"global_equity":{"kind":"scalar"},"defensive":{"kind":"scalar"},"technology_tilt":{"kind":"scalar"},"crypto":{"kind":"scalar"}}},"plan_state":{"kind":"object","fields":{"historical_plan":{"kind":"object","fields":{"plan_basis":{"kind":"scalar"},"strategy_engine_version":{"kind":"scalar"},"selection":{"kind":"object","fields":{"risk_response":{"kind":"scalar"},"horizon":{"kind":"scalar"},"requested_strategy":{"kind":"scalar"},"horizon_maximum_strategy":{"kind":"scalar"},"strategy_path":{"kind":"object","fields":{"path":{"kind":"scalar"},"strategy_engine_version":{"kind":"scalar"},"base_strategy":{"kind":"scalar"}}},"selected_strategy":{"kind":"scalar"},"is_short_term":{"kind":"scalar"},"cap_applied":{"kind":"scalar"},"reason":{"kind":"scalar"}}},"readiness":{"kind":"object","fields":{"readiness":{"kind":"scalar"},"core_strategy_can_be_shown":{"kind":"scalar"},"actionable_contribution_guidance_allowed":{"kind":"scalar"},"technology_satellite_readiness_eligible":{"kind":"scalar"},"bitcoin_satellite_readiness_eligible":{"kind":"scalar"},"message_requirement":{"kind":"scalar"}}},"inflation_pct":{"kind":"scalar"},"preference_result":{"kind":"object","fields":{"technology_tilt":{"kind":"object","fields":{"requested_percentage_points":{"kind":"scalar"},"effective_percentage_points":{"kind":"scalar"},"strategy_cap_percentage_points":{"kind":"scalar"},"reasons":{"kind":"array","item":{"kind":"scalar"}}}},"bitcoin":{"kind":"object","fields":{"requested_percentage_points":{"kind":"scalar"},"effective_percentage_points":{"kind":"scalar"},"strategy_cap_percentage_points":{"kind":"scalar"},"reasons":{"kind":"array","item":{"kind":"scalar"}}}},"effective_target":{"kind":"object","fields":{"strategy_engine_version":{"kind":"scalar"},"base_strategy":{"kind":"scalar"},"allocation":{"kind":"object","fields":{"weights":{"kind":"array","item":{"kind":"object","fields":{"role":{"kind":"scalar"},"percentage_points":{"kind":"scalar"}}}}}}}}}},"dormant_selected_approach":{"kind":"scalar"},"historical_allocation_preserved":{"kind":"scalar"},"customization":{"kind":"object","fields":{"technology_tilt":{"kind":"scalar"},"bitcoin":{"kind":"scalar"},"provenance":{"kind":"scalar"}}},"final_allocation":{"kind":"array","item":{"kind":"object","fields":{"role":{"kind":"scalar"},"percentage_points":{"kind":"scalar"}}}},"path":{"kind":"scalar"},"selected_strategy":{"kind":"scalar"},"base_allocation":{"kind":"scalar"},"planning_return_pct":{"kind":"scalar"}}},"revision_nonce":{"kind":"scalar"},"explicit_target":{"kind":"object","fields":{"strategy_engine_version":{"kind":"scalar"},"base_strategy":{"kind":"scalar"},"allocation":{"kind":"object","fields":{"weights":{"kind":"array","item":{"kind":"object","fields":{"role":{"kind":"scalar"},"percentage_points":{"kind":"scalar"}}}}}}}},"customization_provenance":{"kind":"scalar"}},"omit":["revision_nonce"]}}}'::jsonb,0))) ORDER BY valid_from,id),'[]'::jsonb) FROM public.arbor_plan_versions WHERE user_id=p_verified_owner));
 IF octet_length(result::text)>20971520 THEN RAISE EXCEPTION 'export_too_large'; END IF;
 RETURN result;
$export$);
 d:=replace(d,'''captured_at'',to_jsonb(t)->>''captured_at'') FROM public.arbor_portfolio_snapshots',
 '''captured_at'',to_jsonb(t)->>''captured_at'',''allocation_values'',to_jsonb(t)->''allocation_values'') FROM public.arbor_portfolio_snapshots');
 execute d;
end $patch$;
-- Histories cascade with profile erasure; existing lifecycle/RLS profile guards
-- still govern writes. No hosted application is authorized.
commit;
