-- PREPARED ONLY; apply after 3u_b_live_portfolio.sql, never with the quota migration.
-- Personal whole-holding values, NOT shared prices or published NAVs.
begin;
alter table public.arbor_portfolio_holdings
 add column manual_value_php numeric,
 add column manual_value_updated_at timestamptz,
 alter column units drop not null,
 add constraint holding_tracking_input check (
   units is not null or (product_id in ('gcash_global_equity','gcash_technology','gcash_defensive',
     'dragonfi_global_equity','dragonfi_technology','dragonfi_defensive') and manual_value_php is not null)),
 add constraint manual_fund_value check (
   (manual_value_php is null and manual_value_updated_at is null) or
   (manual_value_php is not null and manual_value_updated_at is not null
    and product_id in ('gcash_global_equity','gcash_technology','gcash_defensive',
      'dragonfi_global_equity','dragonfi_technology','dragonfi_defensive')
    and manual_value_php > 0 and manual_value_php < 10000000000000000
    and manual_value_php = round(manual_value_php,2)));

-- No caller timestamp or source. UPDATE of the amount reaffirms it even unchanged.
create function public.arbor_stamp_manual_fund_value() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 new.manual_value_updated_at := case when new.manual_value_php is null then null else now() end;
 new.updated_at := now();
 return new;
end $$;
revoke all on function public.arbor_stamp_manual_fund_value() from public,anon,authenticated;
create trigger stamp_manual_fund_value before insert or update of manual_value_php
 on public.arbor_portfolio_holdings for each row execute function public.arbor_stamp_manual_fund_value();
-- Existing owner RLS remains unchanged. No write grant for the timestamp.
grant insert(manual_value_php), update(manual_value_php) on public.arbor_portfolio_holdings to authenticated;
create or replace view public.arbor_portfolio_holding_values with (security_invoker=true) as
 select id,user_id,product_id,provider,units::text,cost_basis_php::text,created_at,updated_at,
 manual_value_php::text,manual_value_updated_at from public.arbor_portfolio_holdings;

-- Same first-complete-observation policy. Acceptable stale NAV takes precedence
-- over manual data but blocks capture. Expired manual values also block capture.
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
    and price.source='official_nav' and price.as_of <= price.fetched_at
    and price.as_of between now()-interval '7 days' and now()
    and price.provenance ~ (case when h.provider='gcash'
      then '^https://([A-Za-z0-9-]+\.)*atram\.com\.ph(:443)?(/[^?#]*)?$'
      else '^https://([A-Za-z0-9-]+\.)*bpi\.com\.ph(:443)?(/[^?#]*)?$' end)
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
 ) v where h.user_id=owner_id;
 if total_rows=0 or total_rows<>valued_rows then return false; end if;
 insert into public.arbor_portfolio_snapshots(user_id,day,value_php)
 values(owner_id,(now() at time zone 'UTC')::date,amount) on conflict do nothing;
 return true;
end $$;
revoke all on function public.arbor_capture_portfolio() from public,anon,authenticated;
grant execute on function public.arbor_capture_portfolio() to authenticated;
commit;
