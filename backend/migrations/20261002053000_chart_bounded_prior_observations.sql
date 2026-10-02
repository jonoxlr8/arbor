-- Historical chart estimates only. No raw observations, stored units or costs are rewritten.
BEGIN;
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.arbor_reconstructed_portfolio_history(integer,integer)'::regprocedure AND proowner=current_user::regrole AND prosecdef AND 'search_path=""'=ANY(proconfig)) THEN RAISE EXCEPTION 'chart_history_authority_incompatible'; END IF;
 IF md5(pg_get_functiondef('public.arbor_reconstructed_portfolio_history(integer,integer)'::regprocedure)) <> '16b1ededa1ced20466cacb1b0d41d17a' THEN RAISE EXCEPTION 'chart_history_definition_drift'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.arbor_reconstructed_portfolio_history(p_offset integer DEFAULT 0, p_limit integer DEFAULT 1000)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
BEGIN
 PERFORM arbor_private.require_active_account();
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
        -- Latest verified observation on/before valuation day, at most four calendar days old.
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
        -- Latest verified observation on/before valuation day, at most four calendar days old.
          order by p.observation_date desc,p.observed_at desc limit 1;
        if found and h.product_id='gotrade_vgt' then owned_units:=public.arbor_vgt_holding_units(h.id,valuation_day,quote.observation_date,false); end if; if quote.value is null or fx_value is null or owned_units is null then php_complete := false;
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
      v.cost_context_captured,v.value_usd,s.superseded,display_quote.usd_php_rate_at_capture into snap
      from public.arbor_portfolio_history v
      join public.arbor_portfolio_snapshots display_quote on display_quote.user_id=v.user_id and display_quote.day=v.day join public.arbor_portfolio_observed_history_status s
        on s.user_id=v.user_id and s.day=v.day
      where v.user_id=owner_id and v.day=valuation_day and not exists(select 1 from public.arbor_portfolio_holdings bh where bh.user_id=owner_id and bh.product_id='gotrade_vgt' and ((bh.opening_units>0 and bh.opening_share_basis is null) or exists(select 1 from public.arbor_investment_entries be where be.holding_id=bh.id and be.user_id=owner_id and be.voided_at is null and be.investment_date<date '2026-04-21' and be.investment_date<=valuation_day and be.share_basis is null)));
    if found and not snap.superseded then
      if previous_was_missing then next_segment := next_segment+1; end if;
      previous_was_missing := false;
      seen_points := seen_points+1;
      if seen_points>p_offset then
        return next pg_catalog.jsonb_build_object(
        'day',snap.day,'value_php',snap.value_php,'value_usd',snap.value_usd,'display_fx',case when snap.value_usd is not null and snap.usd_php_rate_at_capture>0 and snap.captured_at is not null then pg_catalog.jsonb_build_object('rate',snap.usd_php_rate_at_capture::text,'source','captured_snapshot','valuation_date',snap.day,'captured_at',snap.captured_at,'as_of',null) else null end,
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
end $function$;

COMMIT;
