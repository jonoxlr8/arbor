-- Preserve old observations as value-only history. Cost is captured only for
-- future complete observations; no historical cost or value is reconstructed.
begin;
alter table public.arbor_portfolio_snapshots
  add column recorded_cost_php numeric
  check (recorded_cost_php is null or recorded_cost_php >= 0);
alter table public.arbor_portfolio_snapshots
  add column cost_context_captured boolean;
-- Legacy observations have no captured FX; never convert them with today's rate.
alter table public.arbor_portfolio_snapshots
  add column usd_php_rate_at_capture numeric
  check (usd_php_rate_at_capture is null or usd_php_rate_at_capture > 0);

create or replace view public.arbor_portfolio_history with (security_invoker=true) as
select user_id, day, value_php::text, captured_at,
  recorded_cost_php::text,
  case when recorded_cost_php is not null
    then round(value_php-recorded_cost_php,2)::text end as recorded_gain_php,
  case when recorded_cost_php > 0
    then round((value_php-recorded_cost_php)*100/recorded_cost_php,2)::text end
    as recorded_gain_percentage,
  recorded_cost_php is not null as cost_complete,
  cost_context_captured is true as cost_context_captured,
  case when usd_php_rate_at_capture > 0
    then round(value_php/usd_php_rate_at_capture,2)::text end as value_usd
from public.arbor_portfolio_snapshots;
revoke all on public.arbor_portfolio_history from public,anon,authenticated;
grant select on public.arbor_portfolio_history to authenticated;

-- Identical valuation/provenance/freshness rules to the latest deployed capture
-- function. The aggregate cost comes from the same MVCC observation as value.
create or replace function public.arbor_capture_portfolio() returns boolean
language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid(); amount numeric; total_rows integer; valued_rows integer;
  costed_rows integer; recorded_cost numeric; captured_fx numeric;
begin
 if owner_id is null then raise exception 'Authentication required'; end if;
 select count(*),count(v.amount),sum(v.amount),
   count(*) filter (where h.cost_basis_php > 0),sum(h.cost_basis_php),
   max(case when fx.verified and fx.source='exchangerate_api'
     and fx.currency='PHP' and fx.kind='fx' and fx.value > 0
     and fx.as_of <= fx.fetched_at
     and fx.as_of between now()-interval '4 days' and now()
     then fx.value end)
 into total_rows,valued_rows,amount,costed_rows,recorded_cost,captured_fx
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
 insert into public.arbor_portfolio_snapshots(user_id,day,value_php,recorded_cost_php,cost_context_captured,usd_php_rate_at_capture)
 values(owner_id,(now() at time zone 'UTC')::date,amount,
   case when total_rows=costed_rows then recorded_cost end,true,captured_fx) on conflict do nothing;
 return true;
end $$;
revoke all on function public.arbor_capture_portfolio() from public,anon,authenticated;
grant execute on function public.arbor_capture_portfolio() to authenticated;
commit;
