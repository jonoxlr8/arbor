-- Prepared only. Apply after the released snapshot-context migration, before
-- deploying the reconstructed-history reader. Never backfill observed snapshots.
begin;

-- Shared operator-owned source observations. Browser roles cannot retrieve or
-- write a standalone vendor data set; the owner RPC below returns valuations.
create table public.arbor_historical_market_observations (
  price_key text not null check (price_key in ('gotrade_vt','gotrade_vgt','gotrade_bnd','btc_php','usd_php',
    'gcash_global_equity','gcash_technology','gcash_defensive',
    'dragonfi_global_equity','dragonfi_technology','dragonfi_defensive')),
  observed_at timestamptz not null,
  observation_date date not null,
  value numeric not null check (value > 0 and value < 1000000000000 and value = round(value,12)),
  source text not null check (
    (price_key in ('gotrade_vt','gotrade_vgt','gotrade_bnd') and source='marketstack') or
    (price_key='btc_php' and source='coinranking') or
    (price_key='usd_php' and source='bsp') or
    (price_key in ('gcash_global_equity','gcash_technology','gcash_defensive',
      'dragonfi_global_equity','dragonfi_technology','dragonfi_defensive') and source='toap')),
  currency text not null check (
    (price_key in ('gotrade_vt','gotrade_vgt','gotrade_bnd') and currency='USD') or
    (price_key in ('btc_php','usd_php','gcash_global_equity','gcash_technology',
      'gcash_defensive','dragonfi_global_equity','dragonfi_technology','dragonfi_defensive')
      and currency='PHP')),
  kind text,
  unit_class text,
  reference_id text,
  provenance text not null check (length(provenance) between 10 and 500),
  fetched_at timestamptz not null default now(),
  primary key (price_key, observed_at),
  check (observation_date=(observed_at at time zone 'UTC')::date),
  check (observed_at <= fetched_at),
  check (source <> 'toap' or (
    kind='nav' and length(unit_class) between 2 and 100
    and length(reference_id) between 10 and 200
    and observed_at=(observation_date::timestamp at time zone 'UTC')))
);
create index arbor_historical_prices_day_idx on public.arbor_historical_market_observations
  (price_key, observation_date desc, observed_at desc);
alter table public.arbor_historical_market_observations enable row level security;
revoke all on public.arbor_historical_market_observations from public,anon,authenticated;
grant select,insert,update on public.arbor_historical_market_observations to service_role;

-- A repeated daily NAV is idempotent, but a later conflicting NAV on the same
-- product/source date needs an explicit operator correction, never an upsert.
create function public.arbor_guard_historical_nav_update() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.source='toap' then
    if new.price_key is distinct from old.price_key
       or new.observed_at is distinct from old.observed_at
       or new.observation_date is distinct from old.observation_date
       or new.value is distinct from old.value
       or new.source is distinct from old.source
       or new.currency is distinct from old.currency
       or new.kind is distinct from old.kind
       or new.unit_class is distinct from old.unit_class
       or new.reference_id is distinct from old.reference_id then
      raise exception 'Conflicting historical NAV requires operator review' using errcode='P0001';
    end if;
    return old;
  end if;
  return new;
end $$;
revoke all on function public.arbor_guard_historical_nav_update() from public,anon,authenticated;
create trigger arbor_guard_historical_nav_update before update
  on public.arbor_historical_market_observations for each row
  execute function public.arbor_guard_historical_nav_update();

-- Only an operator may confirm a specific source non-publishing day. A missing
-- weekday quote is never presumed to be a holiday.
create table public.arbor_historical_nonpublishing_days (
  source text not null check (source in ('marketstack','bsp','toap')),
  day date not null,
  provenance text not null check (length(provenance) between 10 and 500),
  primary key (source,day)
);
alter table public.arbor_historical_nonpublishing_days enable row level security;
revoke all on public.arbor_historical_nonpublishing_days from public,anon,authenticated;
grant select,insert,update on public.arbor_historical_nonpublishing_days to service_role;

-- The old effective date is captured atomically before a revision overwrites it.
-- No derived valuation rows are persisted: each owner read rebuilds from facts.
create table public.arbor_portfolio_history_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  affected_from date not null,
  changed_at timestamptz not null default clock_timestamp(),
  reason text not null check (reason in ('entry','opening'))
);
create index arbor_history_changes_owner_idx on public.arbor_portfolio_history_changes
  (user_id,affected_from,changed_at);
alter table public.arbor_portfolio_history_changes enable row level security;
revoke all on public.arbor_portfolio_history_changes from public,anon,authenticated;
grant select on public.arbor_portfolio_history_changes to authenticated;
create policy arbor_history_changes_owner on public.arbor_portfolio_history_changes
  for select to authenticated using ((select auth.uid())=user_id);

create function public.arbor_note_portfolio_history_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='arbor_investment_entries' then
    if tg_op='INSERT' then
      insert into public.arbor_portfolio_history_changes(user_id,affected_from,reason)
        values(new.user_id,new.investment_date,'entry');
    elsif old.investment_date is distinct from new.investment_date
       or old.units is distinct from new.units
       or old.amount_paid_php is distinct from new.amount_paid_php
       or old.voided_at is distinct from new.voided_at then
      insert into public.arbor_portfolio_history_changes(user_id,affected_from,reason)
        values(new.user_id,least(old.investment_date,new.investment_date),'entry');
    end if;
  elsif tg_op='INSERT' and new.opening_units>0 then
    insert into public.arbor_portfolio_history_changes(user_id,affected_from,reason)
      values(new.user_id,date '0001-01-01','opening');
  elsif tg_op='UPDATE' and (old.opening_units is distinct from new.opening_units
       or old.opening_cost_php is distinct from new.opening_cost_php) then
    insert into public.arbor_portfolio_history_changes(user_id,affected_from,reason)
      values(new.user_id,date '0001-01-01','opening');
  elsif tg_op='DELETE' and old.opening_units>0 then
    insert into public.arbor_portfolio_history_changes(user_id,affected_from,reason)
      values(old.user_id,date '0001-01-01','opening');
    return old;
  end if;
  return new;
end $$;
revoke all on function public.arbor_note_portfolio_history_change() from public,anon,authenticated;
create trigger arbor_entry_history_change after insert or update on public.arbor_investment_entries
  for each row execute function public.arbor_note_portfolio_history_change();
create trigger arbor_opening_history_change after insert or update or delete
  on public.arbor_portfolio_holdings for each row execute function public.arbor_note_portfolio_history_change();

-- Keep the original observation view intact. This view discloses compatibility
-- without mutating the observation or its captured value/cost/FX.
create view public.arbor_portfolio_observed_history_status with (security_invoker=true) as
select s.user_id,s.day,s.value_php::text,s.captured_at,
  exists(select 1 from public.arbor_portfolio_history_changes c
    where c.user_id=s.user_id and c.affected_from<=s.day and c.changed_at>s.captured_at)
  or exists(select 1 from public.arbor_investment_entries e
    where e.user_id=s.user_id and e.updated_at>s.captured_at
      and (e.investment_date<=s.day or e.revision>1))
  or exists(select 1 from public.arbor_portfolio_holdings h
    where h.user_id=s.user_id and h.updated_at>s.captured_at and h.opening_units>0)
  as superseded
from public.arbor_portfolio_snapshots s;
revoke all on public.arbor_portfolio_observed_history_status from public,anon,authenticated;
grant select on public.arbor_portfolio_observed_history_status to authenticated;

-- A small-beta, deterministic owner read. It never calls a vendor or writes a
-- derived row. A later bounded materialization may replace this calculation
-- without changing the market observations, ledger, or snapshot authority.
create function public.arbor_reconstructed_portfolio_history(
  p_offset integer default 0, p_limit integer default 1000) returns setof jsonb
language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid := auth.uid(); first_day date; first_dated_investment date;
  valuation_day date; last_day date;
  h record; snap record; quote record;
  entry_units numeric; entry_cost numeric; missing_cost integer;
  owned_units numeric; total_php numeric; total_usd numeric; total_cost numeric; holding_count integer;
  php_complete boolean; cost_complete boolean;
  fx_allowed_prior boolean; etf_allowed_prior boolean; nav_allowed_prior boolean;
  fx_value numeric; fx_day date; fx_observed_at timestamptz; fx_fetched_at timestamptz;
  fx_provenance text; source_dates jsonb;
  next_segment integer := 0; previous_was_missing boolean := false;
  seen_points integer := 0; emitted_points integer := 0;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_offset<0 or p_limit<1 or p_limit>1000 then
    raise exception 'Invalid history page' using errcode='P0001';
  end if;
  select min(e.investment_date) into first_dated_investment
    from public.arbor_investment_entries e
    where e.user_id=owner_id and e.voided_at is null;
  select least(
    first_dated_investment,
    (select min(s.day) from public.arbor_portfolio_snapshots s where s.user_id=owner_id))
    into first_day;
  -- LEAST ignores a NULL operand in PostgreSQL, so dated-only and observed-only
  -- portfolios each retain their real first date.
  if first_day is null then return; end if;
  last_day := (now() at time zone 'UTC')::date;
  for valuation_day in select generate_series(first_day,last_day,interval '1 day')::date loop
    total_php := 0; total_usd := 0; total_cost := 0; holding_count := 0;
    php_complete := true; cost_complete := true;
    source_dates := '[]'::jsonb;
    etf_allowed_prior := extract(isodow from valuation_day) in (6,7) or exists(
      select 1 from public.arbor_historical_nonpublishing_days d
      where d.source='marketstack' and d.day=valuation_day);
    fx_allowed_prior := extract(isodow from valuation_day) in (6,7) or exists(
      select 1 from public.arbor_historical_nonpublishing_days d
      where d.source='bsp' and d.day=valuation_day);
    nav_allowed_prior := extract(isodow from valuation_day) in (6,7) or exists(
      select 1 from public.arbor_historical_nonpublishing_days d
      where d.source='toap' and d.day=valuation_day);
    fx_value := null; fx_day := null; fx_observed_at := null;
    fx_fetched_at := null; fx_provenance := null;
    select p.value,p.observation_date,p.observed_at,p.fetched_at,p.provenance
      into fx_value,fx_day,fx_observed_at,fx_fetched_at,fx_provenance
      from public.arbor_historical_market_observations p
      where p.price_key='usd_php' and p.source='bsp'
        and p.observation_date between valuation_day-4 and valuation_day
        and (fx_allowed_prior or p.observation_date=valuation_day)
        -- Every intervening weekday also needs an official closure record;
        -- a missing expected publication must not be bridged by a later holiday.
        and not exists (
          select 1 from pg_catalog.generate_series(
            (p.observation_date+1)::timestamp,(valuation_day-1)::timestamp,
            interval '1 day') as intervening(day)
          where extract(isodow from intervening.day) not in (6,7)
            and not exists (select 1 from public.arbor_historical_nonpublishing_days d
              where d.source='bsp' and d.day=intervening.day::date))
      order by p.observation_date desc,p.observed_at desc limit 1;
    if fx_value is not null then
      source_dates := source_dates || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'price_key','usd_php','source','bsp','observation_date',fx_day,
        'observed_at',fx_observed_at,'rate',fx_value::text,
        'fetched_at',fx_fetched_at,'provenance',fx_provenance,
        'valuation_date',valuation_day));
    end if;
    for h in select id,product_id,provider,opening_units,opening_cost_php
      from public.arbor_portfolio_holdings where user_id=owner_id loop
      select coalesce(sum(e.units),0),coalesce(sum(e.amount_paid_php),0),
        count(*) filter (where e.amount_paid_php is null)
        into entry_units,entry_cost,missing_cost
        from public.arbor_investment_entries e
        where e.user_id=owner_id and e.holding_id=h.id and e.voided_at is null
          and e.investment_date<=valuation_day;
      owned_units := h.opening_units+entry_units;
      if owned_units=0 then continue; end if;
      holding_count := holding_count+1;
      -- An undated opening balance does not establish historical ownership.
      if h.opening_units>0 then php_complete := false; end if;
      if missing_cost>0 or (h.opening_units>0 and h.opening_cost_php is null) then
        cost_complete := false;
      else
        total_cost := total_cost+entry_cost+coalesce(h.opening_cost_php,0);
      end if;
      if h.provider='gotrade' then
        select p.value,p.observation_date,p.observed_at,p.fetched_at,p.provenance into quote
          from public.arbor_historical_market_observations p
          where p.price_key=h.product_id and p.source='marketstack'
            and p.observation_date between valuation_day-4 and valuation_day
            and (etf_allowed_prior or p.observation_date=valuation_day)
            -- A holiday is not permission to cross a missing trading-day EOD.
            and not exists (
              select 1 from pg_catalog.generate_series(
                (p.observation_date+1)::timestamp,(valuation_day-1)::timestamp,
                interval '1 day') as intervening(day)
              where extract(isodow from intervening.day) not in (6,7)
                and not exists (select 1 from public.arbor_historical_nonpublishing_days d
                  where d.source='marketstack' and d.day=intervening.day::date))
          order by p.observation_date desc,p.observed_at desc limit 1;
        if not found or fx_value is null then php_complete := false;
        else
          total_php := total_php+round(owned_units*quote.value*fx_value,2);
          total_usd := total_usd+round(owned_units*quote.value,2);
          source_dates := source_dates || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'price_key',h.product_id,'source','marketstack',
            'observation_date',quote.observation_date,'observed_at',quote.observed_at,
            'fetched_at',quote.fetched_at,'provenance',quote.provenance,
            'valuation_date',valuation_day));
        end if;
      elsif h.product_id in ('gcrypto_btc','coins_btc','pdax_btc') then
        -- Crypto trades continuously. Require a genuine timestamp on this date;
        -- never accept Coinranking's future-nearest response.
        select p.value,p.observation_date,p.observed_at,p.fetched_at,p.provenance into quote
          from public.arbor_historical_market_observations p
          where p.price_key='btc_php' and p.source='coinranking'
            and p.observation_date=valuation_day
            and p.observed_at < ((valuation_day+1)::timestamp at time zone 'UTC')
          order by p.observed_at desc limit 1;
        if not found then php_complete := false;
        else
          total_php := total_php+round(owned_units*quote.value,2);
          if fx_value>0 then
            total_usd := total_usd+round(owned_units*quote.value/fx_value,2);
          end if;
          source_dates := source_dates || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'price_key','btc_php','source','coinranking',
            'observation_date',quote.observation_date,'observed_at',quote.observed_at,
            'fetched_at',quote.fetched_at,'provenance',quote.provenance,
            'valuation_date',valuation_day));
        end if;
      elsif h.product_id in ('gcash_global_equity','gcash_technology','gcash_defensive',
          'dragonfi_global_equity','dragonfi_technology','dragonfi_defensive') then
        select p.value,p.observation_date,p.observed_at,p.fetched_at,p.provenance,
          p.reference_id,p.unit_class into quote
          from public.arbor_historical_market_observations p
          where p.price_key=h.product_id and p.source='toap' and p.kind='nav'
            and p.observation_date between valuation_day-4 and valuation_day
            and (nav_allowed_prior or p.observation_date=valuation_day)
            and not exists (
              select 1 from pg_catalog.generate_series(
                (p.observation_date+1)::timestamp,(valuation_day-1)::timestamp,
                interval '1 day') as intervening(day)
              where extract(isodow from intervening.day) not in (6,7)
                and not exists (select 1 from public.arbor_historical_nonpublishing_days d
                  where d.source='toap' and d.day=intervening.day::date))
          order by p.observation_date desc limit 1;
        if not found then php_complete := false;
        else
          total_php := total_php+round(owned_units*quote.value,2);
          if fx_value>0 then
            total_usd := total_usd+round(owned_units*quote.value/fx_value,2);
          end if;
          source_dates := source_dates || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'price_key',h.product_id,'source','toap','kind','nav',
            'observation_date',quote.observation_date,'observed_at',quote.observed_at,
            'fetched_at',quote.fetched_at,'provenance',quote.provenance,
            'reference_id',quote.reference_id,'unit_class',quote.unit_class,
            'valuation_date',valuation_day));
        end if;
      else
        php_complete := false;
      end if;
    end loop;
    if php_complete and holding_count>0 then
      if previous_was_missing then next_segment := next_segment+1; end if;
      previous_was_missing := false;
      seen_points := seen_points+1;
      if seen_points>p_offset then
        return next pg_catalog.jsonb_build_object(
        'day',valuation_day,'value_php',round(total_php,2)::text,
        'value_usd',case when fx_value>0 then round(total_usd,2)::text end,
        'recorded_cost_php',case when cost_complete then round(total_cost,2)::text end,
        'recorded_gain_php',case when cost_complete then round(total_php-total_cost,2)::text end,
        'recorded_gain_percentage',case when cost_complete and total_cost>0
          then round((total_php-total_cost)*100/total_cost,2)::text end,
        'cost_complete',cost_complete,'cost_context_captured',false,
        'captured_at',null,'origin','reconstructed','segment',next_segment,
        'earliest_recorded_date',first_dated_investment,
        'source_dates',source_dates);
        emitted_points := emitted_points+1;
        if emitted_points>=p_limit then return; end if;
      end if;
      continue;
    end if;
    select v.day,v.value_php,v.captured_at,v.recorded_cost_php,
      v.recorded_gain_php,v.recorded_gain_percentage,v.cost_complete,
      v.cost_context_captured,v.value_usd,s.superseded into snap
      from public.arbor_portfolio_history v
      join public.arbor_portfolio_observed_history_status s
        on s.user_id=v.user_id and s.day=v.day
      where v.user_id=owner_id and v.day=valuation_day;
    if found and not snap.superseded then
      if previous_was_missing then next_segment := next_segment+1; end if;
      previous_was_missing := false;
      seen_points := seen_points+1;
      if seen_points>p_offset then
        return next pg_catalog.jsonb_build_object(
        'day',snap.day,'value_php',snap.value_php,'value_usd',snap.value_usd,
        'recorded_cost_php',snap.recorded_cost_php,
        'recorded_gain_php',snap.recorded_gain_php,
        'recorded_gain_percentage',snap.recorded_gain_percentage,
        'cost_complete',snap.cost_complete,
        'cost_context_captured',snap.cost_context_captured,
        'captured_at',snap.captured_at,'origin','observed','segment',next_segment,
        'earliest_recorded_date',first_dated_investment,
        'source_dates','[]'::jsonb);
        emitted_points := emitted_points+1;
        if emitted_points>=p_limit then return; end if;
      end if;
    else
      previous_was_missing := true;
    end if;
  end loop;
end $$;
revoke all on function public.arbor_reconstructed_portfolio_history(integer,integer) from public,anon,authenticated;
grant execute on function public.arbor_reconstructed_portfolio_history(integer,integer) to authenticated;

commit;
