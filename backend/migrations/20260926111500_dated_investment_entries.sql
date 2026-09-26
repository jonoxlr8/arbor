-- PREPARED ONLY. Apply before deploying the dated-entry API and UI.
-- Existing holdings become opening positions with unknown acquisition dates.
begin;

alter table public.arbor_portfolio_holdings
  add column opening_units numeric,
  add column opening_cost_php numeric,
  add column is_archived boolean not null default false;
update public.arbor_portfolio_holdings
  set opening_units = coalesce(units, 0), opening_cost_php = cost_basis_php;
alter table public.arbor_portfolio_holdings
  alter column opening_units set default 0,
  alter column opening_units set not null,
  drop constraint arbor_portfolio_holdings_units_check,
  add constraint arbor_portfolio_holdings_units_check
    check (units is null or (units >= 0 and units < 1000000000000 and units = round(units,12))),
  add constraint arbor_opening_units_check
    check (opening_units >= 0 and opening_units < 1000000000000 and opening_units = round(opening_units,12)),
  add constraint arbor_opening_cost_check
    check (opening_cost_php is null or (opening_cost_php >= 0 and opening_cost_php < 10000000000000000 and opening_cost_php = round(opening_cost_php,2))),
  add constraint arbor_archived_units_check check (
    (units is null and not is_archived)
    or (units = 0 and is_archived)
    or (units > 0 and not is_archived)
  ),
  add constraint arbor_holdings_id_user_unique unique (id, user_id);

create table public.arbor_investment_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  holding_id uuid not null,
  idempotency_key uuid not null,
  payload_digest text not null,
  investment_date date not null,
  units numeric not null check (units > 0 and units < 1000000000000 and units = round(units,12)),
  amount_paid_php numeric check (amount_paid_php >= 0 and amount_paid_php < 10000000000000000 and amount_paid_php = round(amount_paid_php,2)),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  voided_at timestamptz,
  unique(user_id,idempotency_key),
  constraint arbor_entry_holding_owner_fkey foreign key (holding_id,user_id)
    references public.arbor_portfolio_holdings(id,user_id) on delete restrict
);
create index arbor_investment_entries_activity_idx on public.arbor_investment_entries
  (user_id,holding_id,investment_date desc,recorded_at desc,id desc);
alter table public.arbor_investment_entries enable row level security;
revoke all on public.arbor_investment_entries from public,anon,authenticated;
grant select on public.arbor_investment_entries to authenticated;
create policy arbor_investment_entries_owner on public.arbor_investment_entries
  for select to authenticated using ((select auth.uid()) = user_id);

-- Direct legacy writes remain possible only before a position has ledger activity.
-- The RPC below runs as its trusted owner; no user can edit ledger rows directly.
create function public.arbor_guard_legacy_holding_write() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.opening_units := coalesce(new.units,0);
      new.opening_cost_php := new.cost_basis_php;
    elsif tg_op = 'DELETE' then
      if exists (select 1 from public.arbor_investment_entries where holding_id=old.id) then
        raise exception 'ledger_managed_holding' using errcode='P0001';
      end if;
      return old;
    elsif new.units is distinct from old.units or new.cost_basis_php is distinct from old.cost_basis_php
       or new.opening_units is distinct from old.opening_units or new.opening_cost_php is distinct from old.opening_cost_php
       or new.is_archived is distinct from old.is_archived then
      if exists (select 1 from public.arbor_investment_entries where holding_id=old.id) then
        raise exception 'ledger_managed_holding' using errcode='P0001';
      end if;
      new.opening_units := coalesce(new.units,0);
      new.opening_cost_php := new.cost_basis_php;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.arbor_guard_legacy_holding_write() from public,anon,authenticated;
create trigger arbor_guard_legacy_holding_write before insert or update or delete
  on public.arbor_portfolio_holdings for each row execute function public.arbor_guard_legacy_holding_write();

-- Keep the deployed reader's strict SELECT * contract unchanged during the
-- migration -> backend -> frontend rollout. Ledger metadata has its own view.
create or replace view public.arbor_portfolio_holding_values with (security_invoker=true) as
  select id,user_id,product_id,provider,units::text,cost_basis_php::text,
    created_at,updated_at,manual_value_php::text,manual_value_updated_at
  from public.arbor_portfolio_holdings h where not is_archived;
revoke all on public.arbor_portfolio_holding_values from public,anon,authenticated;
grant select on public.arbor_portfolio_holding_values to authenticated;

create view public.arbor_portfolio_holding_ledger_values with (security_invoker=true) as
  select id,user_id,opening_units::text,opening_cost_php::text,
    exists(select 1 from public.arbor_investment_entries e where e.holding_id=h.id) as has_entries
  from public.arbor_portfolio_holdings h where not is_archived;
revoke all on public.arbor_portfolio_holding_ledger_values from public,anon,authenticated;
grant select on public.arbor_portfolio_holding_ledger_values to authenticated;

-- Returns the aggregate recorded cost only when every nonzero component has cost.
create function public.arbor_reconcile_investment_holding(target_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare h public.arbor_portfolio_holdings%rowtype; active_units numeric; active_cost numeric; unknown_cost boolean; total_units numeric;
begin
  select * into h from public.arbor_portfolio_holdings where id=target_id for update;
  if not found then raise exception 'holding_not_found' using errcode='P0001'; end if;
  select coalesce(sum(units),0),coalesce(sum(amount_paid_php),0),bool_or(amount_paid_php is null)
    into active_units,active_cost,unknown_cost
    from public.arbor_investment_entries where holding_id=target_id and voided_at is null;
  total_units := h.opening_units + active_units;
  if total_units >= 1000000000000 then raise exception 'position_limit' using errcode='P0001'; end if;
  update public.arbor_portfolio_holdings set units=total_units,
    cost_basis_php=case when total_units=0 or (h.opening_units>0 and h.opening_cost_php is null)
      or coalesce(unknown_cost,false) then null else coalesce(h.opening_cost_php,0)+active_cost end,
    is_archived=(total_units=0),updated_at=now()
  where id=target_id;
end $$;
revoke all on function public.arbor_reconcile_investment_holding(uuid) from public,anon,authenticated;

-- The authenticated JWT supplies the owner. Both locks and writes live in one
-- PostgreSQL transaction; direct client table writes cannot create entries.
create function public.arbor_record_investment(
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

create function public.arbor_revise_investment(
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
    or (p_amount_paid_php is not null and (p_amount_paid_php < 0 or p_amount_paid_php >= 10000000000000000 or p_amount_paid_php <> round(p_amount_paid_php,2))))
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

-- A deliberate correction to the pre-ledger opening balance, never a purchase.
create function public.arbor_correct_opening_position(
  p_holding_id uuid, p_expected_updated_at timestamptz, p_opening_units numeric,
  p_opening_cost_php numeric
) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid(); h public.arbor_portfolio_holdings%rowtype;
begin
  if owner_id is null then raise exception 'authentication_required' using errcode='P0001'; end if;
  if p_opening_units is null or p_opening_units < 0 or p_opening_units >= 1000000000000
    or p_opening_units <> round(p_opening_units,12)
    or (p_opening_cost_php is not null and (p_opening_cost_php < 0 or p_opening_cost_php >= 10000000000000000
      or p_opening_cost_php <> round(p_opening_cost_php,2)))
  then raise exception 'invalid_investment_entry' using errcode='P0001'; end if;
  select * into h from public.arbor_portfolio_holdings where id=p_holding_id and user_id=owner_id for update;
  if not found then raise exception 'holding_not_found' using errcode='P0001'; end if;
  if h.updated_at <> p_expected_updated_at then raise exception 'stale_entry_revision' using errcode='P0001'; end if;
  update public.arbor_portfolio_holdings set opening_units=p_opening_units,
    opening_cost_php=p_opening_cost_php where id=p_holding_id;
  perform public.arbor_reconcile_investment_holding(p_holding_id);
  return pg_catalog.jsonb_build_object('holding_id',p_holding_id);
end $$;
revoke all on function public.arbor_correct_opening_position(uuid,timestamptz,numeric,numeric) from public,anon,authenticated;
grant execute on function public.arbor_correct_opening_position(uuid,timestamptz,numeric,numeric) to authenticated;

-- Text decimals preserve NUMERIC precision through JSON clients. The archived
-- holding's entries remain owner-readable after its active units reach zero.
create view public.arbor_investment_entry_values with (security_invoker=true) as
  select e.id,e.user_id,e.holding_id,h.product_id,h.provider,e.investment_date,
    e.units::text,e.amount_paid_php::text,e.recorded_at,e.updated_at,e.revision,e.voided_at
  from public.arbor_investment_entries e
  join public.arbor_portfolio_holdings h on h.id=e.holding_id;
revoke all on public.arbor_investment_entry_values from public,anon,authenticated;
grant select on public.arbor_investment_entry_values to authenticated;

-- Preserve the deployed capture arithmetic and provenance checks verbatim;
-- archived zero-unit positions are history, not current portfolio holdings.
create or replace function public.arbor_capture_portfolio() returns boolean
language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid(); amount numeric; total_rows integer; valued_rows integer;
begin
 if owner_id is null then raise exception 'Authentication required'; end if;
 select count(*),count(v.amount),sum(v.amount) into total_rows,valued_rows,amount
 from public.arbor_portfolio_holdings h
 join public.arbor_portfolio_products p on p.product_id=h.product_id
 left join public.arbor_market_prices price on price.price_key=p.price_key
 left join public.arbor_market_prices fx on fx.price_key='usd_php'
 cross join lateral (
   select price.verified and price.currency='PHP' and price.kind='nav'
    and price.as_of <= price.fetched_at
    and price.as_of between now()-interval '7 days' and now()
    and (
      (price.source='official_nav' and price.provenance ~ (case when h.provider='gcash'
        then '^https://([A-Za-z0-9-]+\.)*atram\.com\.ph(:443)?(/[^?#]*)?$'
        else '^https://([A-Za-z0-9-]+\.)*bpi\.com\.ph(:443)?(/[^?#]*)?$' end))
      or (price.source='toap'
        and price.provenance = case when h.provider='gcash'
          then 'https://uitf.com.ph/daily_navpu.php?bank_id=31'
          else 'https://uitf.com.ph/daily_navpu.php?bank_id=3' end
        and lower(btrim(regexp_replace(price.reference_id, '\s+', ' ', 'g'))) = lower(case h.product_id
          when 'gcash_global_equity' then 'ATRAM Global Equity Opportunity Feeder Fund (PHP Unit Class)'
          when 'gcash_technology' then 'ATRAM Global Technology Feeder Fund (A PHP Unit Class)'
          when 'gcash_defensive' then 'ATRAM Medium Term Peso Bond Fund (A Unit Class)'
          when 'dragonfi_global_equity' then 'BPI GLOBAL EQUITY FUND-OF-FUNDS CLASS P (PHP CLASS)'
          when 'dragonfi_technology' then 'BPI WORLD TECHNOLOGY FEEDER FUND CLASS P (PHP CLASS)'
          when 'dragonfi_defensive' then 'BPI PREMIUM BOND FUND' end))
    )
    and price.unit_class = case h.product_id
      when 'gcash_global_equity' then 'PHP Unit Class'
      when 'gcash_technology' then 'A PHP Unit Class'
      when 'gcash_defensive' then 'A Unit Class'
      when 'dragonfi_global_equity' then 'PHP / Class P'
      when 'dragonfi_technology' then 'PHP / Class P'
      when 'dragonfi_defensive' then 'PHP' end as usable_nav
 ) n
 cross join lateral (
   select case when h.provider in ('gcash','dragonfi') then
     case when h.units is not null and n.usable_nav then
       case when price.as_of >= now()-interval '48 hours' then round(h.units*price.value,2) end
     when h.manual_value_updated_at between now()-interval '7 days' and now()
       then round(h.manual_value_php,2) end
   else case when price.verified and price.as_of between
       now()-case when p.price_key='btc_php' then interval '10 minutes' else interval '48 hours' end and now()
       and (h.provider <> 'gotrade' or (fx.verified and fx.as_of between now()-interval '48 hours' and now()))
     then round(h.units*price.value*case when h.provider='gotrade' then fx.value else 1 end,2) end
   end as amount
 ) v where h.user_id=owner_id and not h.is_archived;
 if total_rows=0 or total_rows<>valued_rows then return false; end if;
 insert into public.arbor_portfolio_snapshots(user_id,day,value_php)
 values(owner_id,(now() at time zone 'UTC')::date,amount) on conflict do nothing;
 return true;
end $$;
revoke all on function public.arbor_capture_portfolio() from public,anon,authenticated;
grant execute on function public.arbor_capture_portfolio() to authenticated;
commit;
