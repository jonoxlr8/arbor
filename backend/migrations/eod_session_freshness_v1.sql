-- LOCAL REVIEW PROPOSAL ONLY. Requires the published VGT/lifecycle capture.
-- No price/date/fetched-at rewrite, new tables, refresh, backfill or cron change.
begin;
create function public.arbor_reference_age_seconds(
 p_key text,p_as_of timestamptz,p_source text,p_kind text,p_currency text,
 p_verified boolean,p_fetched_at timestamptz,p_now timestamptz)
returns numeric language plpgsql stable security invoker set search_path='' as $$
declare calendar constant jsonb := '{"version":"verified-2026-v1","timezone":"America/New_York","verified_years":[2026],"regular_close":"16:00","products":{"gotrade_vt":"NYSE Arca","gotrade_vgt":"NYSE Arca","gotrade_bnd":"Nasdaq"},"holidays":["2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25"],"early_closes":{"2026-11-27":"13:00","2026-12-24":"13:00"},"sources":["https://www.nyse.com/trade/hours-calendars","https://www.nasdaq.com/market-activity/stock-market-holiday-schedule","https://advisors.vanguard.com/investments/products/vt/vanguard-total-world-stock-etf","https://advisors.vanguard.com/investments/products/vgt/vanguard-information-technology-etf","https://advisors.vanguard.com/investments/products/bnd/vanguard-total-bond-market-etf"]}'::jsonb;
 raw_age numeric; age numeric; observed_day date; today date; cursor_day date;
 session_close timestamptz; closed_start timestamptz; closed_end timestamptz;
 close_time time;
begin
 if p_as_of is null or p_now is null or p_verified is distinct from true or p_as_of>p_now
    or (p_fetched_at is not null and (p_fetched_at>p_now or p_as_of>p_fetched_at)) then return null; end if;
 raw_age:=extract(epoch from p_now-p_as_of);
 observed_day:=(p_as_of at time zone 'UTC')::date;
 today:=(p_now at time zone 'America/New_York')::date;
 if not (calendar->'products' ? coalesce(p_key,'')) or p_source is distinct from 'marketstack'
    or p_kind is distinct from 'etf_eod' or p_currency is distinct from 'USD' or p_fetched_at is null
    or (p_as_of at time zone 'UTC')::time<>time '00:00'
    or not (calendar->'verified_years' @> pg_catalog.jsonb_build_array(extract(year from observed_day)::integer))
    or not (calendar->'verified_years' @> pg_catalog.jsonb_build_array(extract(year from today)::integer))
 then return raw_age; end if;
 if extract(isodow from observed_day)>=6 or calendar->'holidays' ? observed_day::text then return null; end if;
 close_time:=coalesce(calendar->'early_closes'->>observed_day::text,calendar->>'regular_close')::time;
 session_close:=(observed_day+close_time) at time zone 'America/New_York';
 if session_close>p_now or session_close>p_fetched_at then return null; end if;
 age:=extract(epoch from p_now-session_close);
 if age>604800 then return raw_age; end if; -- seven-day outer wall-clock bound
 cursor_day:=observed_day+1;
 while cursor_day<=today loop
  if extract(isodow from cursor_day)>=6 or calendar->'holidays' ? cursor_day::text then
   closed_start:=cursor_day::timestamp at time zone 'America/New_York';
   closed_end:=(cursor_day+1)::timestamp at time zone 'America/New_York';
   age:=age-greatest(0,extract(epoch from least(p_now,closed_end)-greatest(session_close,closed_start)));
  end if;
  cursor_day:=cursor_day+1;
 end loop;
 return greatest(0,age);
end $$;
revoke all on function public.arbor_reference_age_seconds(text,timestamptz,text,text,text,boolean,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.arbor_reference_age_seconds(text,timestamptz,text,text,text,boolean,timestamptz,timestamptz) to authenticated,service_role;

-- Keep the deployed capture body (including VGT/lifecycle checks) authoritative.
-- Calendar adjustment is ETF-only. FX/crypto/NAV budgets remain literal;
-- reject future receipt metadata consistently with backend valuation.
do $patch$ declare d text; old_clause text; new_clause text; begin
 d:=pg_get_functiondef('public.arbor_capture_portfolio()'::regprocedure);
 old_clause:=$old$price.verified and price.as_of between
       now()-case when p.price_key='btc_php' then interval '10 minutes' else interval '48 hours' end and now()$old$;
 new_clause:=$new$price.verified and public.arbor_reference_age_seconds(p.price_key,price.as_of,price.source,price.kind,price.currency,price.verified,price.fetched_at,now()) between 0 and case when p.price_key='btc_php' then 600 else 172800 end$new$;
 if position(old_clause in d)=0 or d not like '%arbor_vgt_holding_units%' then raise exception 'eod_capture_body_incompatible'; end if;
 d:=replace(d,old_clause,new_clause);
 old_clause:=$old$fx.verified and fx.as_of between now()-interval '48 hours' and now()$old$;
 new_clause:=$new$fx.verified and public.arbor_reference_age_seconds('usd_php',fx.as_of,fx.source,fx.kind,fx.currency,fx.verified,fx.fetched_at,now()) between 0 and 172800$new$;
 if position(old_clause in d)=0 or position('price.as_of <= price.fetched_at' in d)=0 then raise exception 'eod_capture_provenance_incompatible'; end if;
 d:=replace(d,old_clause,new_clause);
 d:=replace(d,'price.as_of <= price.fetched_at','price.as_of <= price.fetched_at and price.fetched_at <= now()');
 execute d;
end $patch$;
commit;
