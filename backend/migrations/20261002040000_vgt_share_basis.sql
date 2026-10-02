-- Local review only. No price import or existing transaction rewrite.
begin;
alter table public.arbor_investment_entries add column share_basis text check (share_basis in ('before_split','after_split'));
alter table public.arbor_portfolio_holdings add column opening_share_basis text check (opening_share_basis in ('before_split','after_split'));

-- Sole verified VGT action: Vanguard8:1 effective2026-04-21. Raw closes are
-- denominated on their observation date. This helper is shared by live,
-- snapshot and historical valuation, never by recorded cost reconciliation.
create function public.arbor_vgt_units_at_quote(p_units numeric,p_basis text,p_acquired date,p_quote_day date)
returns numeric language sql immutable security invoker set search_path='' as $$
 select case when p_units=0 then 0
 when p_acquired>=date '2026-04-21' then p_units*case when p_quote_day<date '2026-04-21' then 0.125 else 1 end
 when p_basis='before_split' then p_units*case when p_quote_day>=date '2026-04-21' then 8 else 1 end
 when p_basis='after_split' then p_units*case when p_quote_day<date '2026-04-21' then 0.125 else 1 end
 else null end
$$;
revoke all on function public.arbor_vgt_units_at_quote(numeric,text,date,date) from public,anon;
grant execute on function public.arbor_vgt_units_at_quote(numeric,text,date,date) to authenticated;

create function public.arbor_vgt_holding_units(p_id uuid,p_valuation_day date,p_quote_day date,p_include_opening boolean)
returns numeric language sql stable security invoker set search_path='' as $$
 select case when count(*) filter(where x.units is null)>0 then null else coalesce(sum(x.units),0) end
 from (
   select public.arbor_vgt_units_at_quote(e.units,e.share_basis,e.investment_date,p_quote_day) as units
   from public.arbor_investment_entries e join public.arbor_portfolio_holdings h on h.id=e.holding_id
   where h.id=p_id and h.product_id='gotrade_vgt' and h.user_id=auth.uid() and e.user_id=auth.uid()
   and e.voided_at is null and e.investment_date<=p_valuation_day
   union all
   select public.arbor_vgt_units_at_quote(h.opening_units,h.opening_share_basis,null,p_quote_day)
   from public.arbor_portfolio_holdings h where h.id=p_id and h.user_id=auth.uid()
     and h.product_id='gotrade_vgt' and p_include_opening and h.opening_units>0
 ) x
$$;
revoke all on function public.arbor_vgt_holding_units(uuid,date,date,boolean) from public,anon;
grant execute on function public.arbor_vgt_holding_units(uuid,date,date,boolean) to authenticated;

-- Retain the strict original holding view; extra valuation metadata is separate.
create or replace view public.arbor_portfolio_holding_ledger_values with(security_invoker=true) as
select h.id,h.user_id,h.opening_units::text,h.opening_cost_php::text,exists(select 1 from public.arbor_investment_entries e where e.holding_id=h.id) as has_entries,h.opening_share_basis,(p.as_of at time zone 'UTC')::date as quote_date,
 public.arbor_vgt_holding_units(h.id,(now() at time zone 'Asia/Manila')::date,(p.as_of at time zone 'UTC')::date,true)::text as valuation_units,
 public.arbor_vgt_holding_units(h.id,(now() at time zone 'Asia/Manila')::date,(now() at time zone 'UTC')::date,true)::text as effective_units
from public.arbor_portfolio_holdings h left join public.arbor_market_prices p on p.price_key=h.product_id
where not h.is_archived;
revoke all on public.arbor_portfolio_holding_ledger_values from public,anon;
grant select on public.arbor_portfolio_holding_ledger_values to authenticated;

create or replace view public.arbor_investment_entry_values with(security_invoker=true) as
 select e.id,e.user_id,e.holding_id,h.product_id,h.provider,e.investment_date,
 e.units::text,e.amount_paid_php::text,e.recorded_at,e.updated_at,e.revision,e.voided_at,e.share_basis
 from public.arbor_investment_entries e join public.arbor_portfolio_holdings h on h.id=e.holding_id;
create or replace function public.arbor_record_investment_with_share_basis(
  p_product_id text, p_provider text, p_investment_date date, p_units numeric,
  p_amount_paid_php numeric, p_idempotency_key uuid,
  p_opening_units numeric default null, p_opening_cost_php numeric default null,
  p_confirm_conversion boolean default false, p_share_basis text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid(); h public.arbor_portfolio_holdings%rowtype;
  prior public.arbor_investment_entries%rowtype; entry_id uuid;
  digest text;
begin
  perform arbor_private.require_active_account();
  if owner_id is null then raise exception 'authentication_required' using errcode='P0001'; end if;
  if p_idempotency_key is null or p_investment_date is null or p_investment_date > (now() at time zone 'Asia/Manila')::date
     or p_units is null or p_units <= 0 or p_units >= 1000000000000 or p_units <> round(p_units,12)
     or (p_amount_paid_php is not null and (p_amount_paid_php < 0 or p_amount_paid_php >= 10000000000000000 or p_amount_paid_php <> round(p_amount_paid_php,2)))
     or (p_opening_units is not null and (p_opening_units <= 0 or p_opening_units >= 1000000000000 or p_opening_units <> round(p_opening_units,12)))
     or (p_opening_cost_php is not null and (p_opening_units is null or p_opening_cost_php < 0 or p_opening_cost_php >= 10000000000000000 or p_opening_cost_php <> round(p_opening_cost_php,2)))
     or not exists (select 1 from public.arbor_portfolio_products where product_id=p_product_id and provider=p_provider)
  then raise exception 'invalid_investment_entry' using errcode='P0001'; end if;
  if p_product_id<>'gotrade_vgt' or p_investment_date>=date '2026-04-21' then p_share_basis:=null;
  else p_share_basis:=coalesce(p_share_basis,'before_split'); end if;
  if p_share_basis is not null and p_share_basis not in ('before_split','after_split') then raise exception 'invalid_share_basis' using errcode='P0001'; end if;
  digest := pg_catalog.jsonb_build_array(p_product_id,p_provider,p_investment_date,p_units,
    p_amount_paid_php,p_opening_units,p_opening_cost_php,p_confirm_conversion,p_share_basis)::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text || ':' || p_idempotency_key::text,0));
  select * into prior from public.arbor_investment_entries where user_id=owner_id and idempotency_key=p_idempotency_key;
  if found then
    if prior.payload_digest <> digest then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
    return pg_catalog.jsonb_build_object('entry_id',prior.id,'holding_id',prior.holding_id,'replayed',true);
  end if;
  if p_amount_paid_php is null or p_amount_paid_php <= 0 then
    raise exception 'invalid_investment_entry' using errcode='P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text || ':' || p_product_id,1));
  insert into public.arbor_portfolio_holdings(user_id,product_id,provider,units,opening_units,is_archived)
    values(owner_id,p_product_id,p_provider,0,0,true)
    on conflict (user_id,product_id) do nothing;
  select * into h from public.arbor_portfolio_holdings where user_id=owner_id and product_id=p_product_id for update;
  if h.provider <> p_provider then raise exception 'invalid_investment_entry' using errcode='P0001'; end if;
  if h.units is null then
    if not p_confirm_conversion or p_opening_units is null then
      raise exception 'opening_position_confirmation_required' using errcode='P0001';
    end if;
    -- The previous whole-position manual value cannot truthfully include this
    -- new addition. Clear it; the user can enter a fresh whole-position value.
    update public.arbor_portfolio_holdings set units=p_opening_units,opening_units=p_opening_units,
      opening_cost_php=p_opening_cost_php,cost_basis_php=p_opening_cost_php,
      manual_value_php=null,is_archived=false
      where id=h.id;
  elsif p_opening_units is not null or p_opening_cost_php is not null or p_confirm_conversion then
    raise exception 'opening_position_not_applicable' using errcode='P0001';
  end if;
  insert into public.arbor_investment_entries(user_id,holding_id,idempotency_key,payload_digest,
    investment_date,units,amount_paid_php,share_basis)
    values(owner_id,h.id,p_idempotency_key,digest,p_investment_date,p_units,p_amount_paid_php,p_share_basis)
    returning id into entry_id;
  perform public.arbor_reconcile_investment_holding(h.id);
  return pg_catalog.jsonb_build_object('entry_id',entry_id,'holding_id',h.id,'replayed',false);
end $$;
revoke all on function public.arbor_record_investment_with_share_basis(text,text,date,numeric,numeric,uuid,numeric,numeric,boolean,text) from public,anon,authenticated;
grant execute on function public.arbor_record_investment_with_share_basis(text,text,date,numeric,numeric,uuid,numeric,numeric,boolean,text) to authenticated;
create or replace function public.arbor_revise_investment_with_share_basis(
  p_entry_id uuid, p_expected_revision integer, p_investment_date date,
  p_units numeric, p_amount_paid_php numeric, p_void boolean default false,p_share_basis text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid(); entry public.arbor_investment_entries%rowtype;
  target uuid;
begin
  perform arbor_private.require_active_account();
  if owner_id is null then raise exception 'authentication_required' using errcode='P0001'; end if;
  select holding_id into target from public.arbor_investment_entries
    where id=p_entry_id and user_id=owner_id;
  if target is null then raise exception 'entry_not_found' using errcode='P0001'; end if;
  perform 1 from public.arbor_portfolio_holdings where id=target and user_id=owner_id for update;
  select * into entry from public.arbor_investment_entries where id=p_entry_id and user_id=owner_id for update;
  if entry.voided_at is not null or entry.revision <> p_expected_revision then
    raise exception 'stale_entry_revision' using errcode='P0001'; end if;
  if not p_void and (p_investment_date is null or p_investment_date > (now() at time zone 'Asia/Manila')::date
    or p_units is null or p_units <= 0 or p_units >= 1000000000000 or p_units <> round(p_units,12)
    or (p_amount_paid_php is not null and (p_amount_paid_php < 0 or p_amount_paid_php >= 10000000000000000 or p_amount_paid_php <> round(p_amount_paid_php,2)))
    or (entry.amount_paid_php > 0 and (p_amount_paid_php is null or p_amount_paid_php = 0))
    or (entry.amount_paid_php is null and p_amount_paid_php = 0)
    or (entry.amount_paid_php = 0 and p_amount_paid_php is null))
  then raise exception 'invalid_investment_entry' using errcode='P0001'; end if;
  if not p_void and exists(select 1 from public.arbor_portfolio_holdings h where h.id=target and h.product_id='gotrade_vgt') then
    if p_investment_date<date '2026-04-21' and (p_share_basis is null or p_share_basis not in ('before_split','after_split')) then
      raise exception 'share_basis_required' using errcode='P0001';
    end if;
  end if;
  update public.arbor_investment_entries set
    share_basis=case when p_void then share_basis when p_investment_date>=date '2026-04-21' then null else p_share_basis end,
    investment_date=case when p_void then investment_date else p_investment_date end,
    units=case when p_void then units else p_units end,
    amount_paid_php=case when p_void then amount_paid_php else p_amount_paid_php end,
    voided_at=case when p_void then now() else null end,
    revision=revision+1,updated_at=now()
    where id=p_entry_id and user_id=owner_id;
  perform public.arbor_reconcile_investment_holding(target);
  return pg_catalog.jsonb_build_object('entry_id',p_entry_id,'holding_id',target,'revision',p_expected_revision+1);
end $$;
revoke all on function public.arbor_revise_investment_with_share_basis(uuid,integer,date,numeric,numeric,boolean,text) from public,anon,authenticated;
grant execute on function public.arbor_revise_investment_with_share_basis(uuid,integer,date,numeric,numeric,boolean,text) to authenticated;
create function public.arbor_correct_opening_with_share_basis(
  p_holding_id uuid, p_expected_updated_at timestamptz, p_opening_units numeric,
  p_opening_cost_php numeric,p_share_basis text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid(); h public.arbor_portfolio_holdings%rowtype;
begin
  perform arbor_private.require_active_account();
  if owner_id is null then raise exception 'authentication_required' using errcode='P0001'; end if;
  if p_opening_units is null or p_opening_units < 0 or p_opening_units >= 1000000000000
    or p_opening_units <> round(p_opening_units,12)
    or (p_opening_cost_php is not null and (p_opening_cost_php < 0 or p_opening_cost_php >= 10000000000000000
      or p_opening_cost_php <> round(p_opening_cost_php,2)))
  then raise exception 'invalid_investment_entry' using errcode='P0001'; end if;
  select * into h from public.arbor_portfolio_holdings where id=p_holding_id and user_id=owner_id for update;
  if not found then raise exception 'holding_not_found' using errcode='P0001'; end if;
  if h.updated_at <> p_expected_updated_at then raise exception 'stale_entry_revision' using errcode='P0001'; end if;
  if h.product_id='gotrade_vgt' and p_opening_units>0 and (p_share_basis is null or p_share_basis not in ('before_split','after_split')) then
    raise exception 'share_basis_required' using errcode='P0001'; end if;
  update public.arbor_portfolio_holdings set opening_share_basis=case when p_opening_units>0 then p_share_basis end,opening_units=p_opening_units,
    opening_cost_php=p_opening_cost_php where id=p_holding_id;
  perform public.arbor_reconcile_investment_holding(p_holding_id);
  return pg_catalog.jsonb_build_object('holding_id',p_holding_id);
end $$;
revoke all on function public.arbor_correct_opening_with_share_basis(uuid,timestamptz,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.arbor_correct_opening_with_share_basis(uuid,timestamptz,numeric,numeric,text) to authenticated;

-- Also protect legacy/direct revision RPCs: an ambiguous count cannot be moved
-- across the split or edited without an explicit basis. Void remains available.
create function public.arbor_guard_vgt_basis_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.investment_date>=date '2026-04-21' then new.share_basis:=null; end if;
 if new.voided_at is null and new.investment_date<date '2026-04-21' and new.share_basis is null
    and (old.investment_date is distinct from new.investment_date or old.units is distinct from new.units)
    and exists(select 1 from public.arbor_portfolio_holdings h where h.id=new.holding_id and h.product_id='gotrade_vgt') then
   raise exception 'share_basis_required' using errcode='P0001'; end if;
 return new;
end $$;
revoke all on function public.arbor_guard_vgt_basis_revision() from public,anon,authenticated;
create trigger arbor_guard_vgt_basis_revision before update on public.arbor_investment_entries
 for each row execute function public.arbor_guard_vgt_basis_revision();

-- Patch existing guarded definitions in place; retain Terms/lifecycle admission,
-- erasure authority, freshness, calendar and financial bodies unchanged.
do $patch$ declare d text; begin
 d:=pg_get_functiondef('public.arbor_note_portfolio_history_change()'::regprocedure);
 if d not like '%or old.units is distinct from new.units%' then raise exception 'history_guard_incompatible'; end if;
 d:=replace(d,'or old.units is distinct from new.units','or old.share_basis is distinct from new.share_basis or old.units is distinct from new.units');
 d:=replace(d,'old.opening_units is distinct from new.opening_units','old.opening_share_basis is distinct from new.opening_share_basis or old.opening_units is distinct from new.opening_units');
 execute d;
 d:=pg_get_functiondef('public.arbor_reconstructed_portfolio_history(integer,integer)'::regprocedure);
 if d not like '%owned_units*quote.value%' then raise exception 'history_body_incompatible'; end if;
 d:=replace(d,'if not found or fx_value is null then php_complete := false;',
   'if found and h.product_id=''gotrade_vgt'' then owned_units:=public.arbor_vgt_holding_units(h.id,valuation_day,quote.observation_date,false); end if; if quote.value is null or fx_value is null or owned_units is null then php_complete := false;');
 d:=replace(d,'where v.user_id=owner_id and v.day=valuation_day;',
   'where v.user_id=owner_id and v.day=valuation_day and not exists(select 1 from public.arbor_portfolio_holdings bh where bh.user_id=owner_id and bh.product_id=''gotrade_vgt'' and ((bh.opening_units>0 and bh.opening_share_basis is null) or exists(select 1 from public.arbor_investment_entries be where be.holding_id=bh.id and be.user_id=owner_id and be.voided_at is null and be.investment_date<date ''2026-04-21'' and be.investment_date<=valuation_day and be.share_basis is null)));');
 execute d;
 d:=pg_get_functiondef('public.arbor_correct_opening_position(uuid,timestamp with time zone,numeric,numeric)'::regprocedure);
 if d not like '%set opening_units=p_opening_units%' then raise exception 'opening_body_incompatible'; end if;
 d:=replace(d,'set opening_units=p_opening_units','set opening_share_basis=case when h.product_id=''gotrade_vgt'' then null else opening_share_basis end,opening_units=p_opening_units');
 execute d;
 d:=pg_get_functiondef('public.arbor_capture_portfolio()'::regprocedure);
 if d not like '%h.units*price.value%' then raise exception 'capture_body_incompatible'; end if;
 d:=replace(d,'h.units*price.value','(case when h.product_id=''gotrade_vgt'' then public.arbor_vgt_holding_units(h.id,(now() at time zone ''Asia/Manila'')::date,(price.as_of at time zone ''UTC'')::date,true) else h.units end)*price.value');
 execute d;
 d:=pg_get_functiondef('public.arbor_account_export_v1(uuid,uuid)'::regprocedure);
 if d not like '%''opening_units'',to_jsonb(t)->>''opening_units''%' or d not like '%''investment_date'',to_jsonb(t)->>''investment_date''%' then raise exception 'export_body_incompatible'; end if;
 d:=replace(d,'''opening_units'',to_jsonb(t)->>''opening_units''','''opening_share_basis'',to_jsonb(t)->>''opening_share_basis'',''opening_units'',to_jsonb(t)->>''opening_units''');
 d:=replace(d,'''investment_date'',to_jsonb(t)->>''investment_date''','''share_basis'',to_jsonb(t)->>''share_basis'',''investment_date'',to_jsonb(t)->>''investment_date''');
 execute d;
end $patch$;
commit;
