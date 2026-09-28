-- Require actual positive PHP cost for new dated additions while preserving
-- exact idempotent replay and corrections of pre-existing unknown-cost entries.
begin;

create or replace function public.arbor_record_investment(
  p_product_id text, p_provider text, p_investment_date date, p_units numeric,
  p_amount_paid_php numeric, p_idempotency_key uuid,
  p_opening_units numeric default null, p_opening_cost_php numeric default null,
  p_confirm_conversion boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid(); h public.arbor_portfolio_holdings%rowtype;
  prior public.arbor_investment_entries%rowtype; entry_id uuid;
  digest text;
begin
  if owner_id is null then raise exception 'authentication_required' using errcode='P0001'; end if;
  if p_idempotency_key is null or p_investment_date is null or p_investment_date > (now() at time zone 'Asia/Manila')::date
     or p_units is null or p_units <= 0 or p_units >= 1000000000000 or p_units <> round(p_units,12)
     or (p_amount_paid_php is not null and (p_amount_paid_php < 0 or p_amount_paid_php >= 10000000000000000 or p_amount_paid_php <> round(p_amount_paid_php,2)))
     or (p_opening_units is not null and (p_opening_units <= 0 or p_opening_units >= 1000000000000 or p_opening_units <> round(p_opening_units,12)))
     or (p_opening_cost_php is not null and (p_opening_units is null or p_opening_cost_php < 0 or p_opening_cost_php >= 10000000000000000 or p_opening_cost_php <> round(p_opening_cost_php,2)))
     or not exists (select 1 from public.arbor_portfolio_products where product_id=p_product_id and provider=p_provider)
  then raise exception 'invalid_investment_entry' using errcode='P0001'; end if;
  digest := pg_catalog.jsonb_build_array(p_product_id,p_provider,p_investment_date,p_units,
    p_amount_paid_php,p_opening_units,p_opening_cost_php,p_confirm_conversion)::text;
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
    investment_date,units,amount_paid_php)
    values(owner_id,h.id,p_idempotency_key,digest,p_investment_date,p_units,p_amount_paid_php)
    returning id into entry_id;
  perform public.arbor_reconcile_investment_holding(h.id);
  return pg_catalog.jsonb_build_object('entry_id',entry_id,'holding_id',h.id,'replayed',false);
end $$;
revoke all on function public.arbor_record_investment(text,text,date,numeric,numeric,uuid,numeric,numeric,boolean) from public,anon,authenticated;
grant execute on function public.arbor_record_investment(text,text,date,numeric,numeric,uuid,numeric,numeric,boolean) to authenticated;

create or replace function public.arbor_revise_investment(
  p_entry_id uuid, p_expected_revision integer, p_investment_date date,
  p_units numeric, p_amount_paid_php numeric, p_void boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid(); entry public.arbor_investment_entries%rowtype;
  target uuid;
begin
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
  update public.arbor_investment_entries set
    investment_date=case when p_void then investment_date else p_investment_date end,
    units=case when p_void then units else p_units end,
    amount_paid_php=case when p_void then amount_paid_php else p_amount_paid_php end,
    voided_at=case when p_void then now() else null end,
    revision=revision+1,updated_at=now()
    where id=p_entry_id and user_id=owner_id;
  perform public.arbor_reconcile_investment_holding(target);
  return pg_catalog.jsonb_build_object('entry_id',p_entry_id,'holding_id',target,'revision',p_expected_revision+1);
end $$;
revoke all on function public.arbor_revise_investment(uuid,integer,date,numeric,numeric,boolean) from public,anon,authenticated;
grant execute on function public.arbor_revise_investment(uuid,integer,date,numeric,numeric,boolean) to authenticated;
commit;
