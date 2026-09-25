-- PREPARED ONLY. Apply separately after 3U-B.5, before enabling TOAP refresh.
-- No holding/schema/math change: authorize exact source identities and daily leases.
begin;
alter table public.arbor_market_refresh drop constraint arbor_market_refresh_source_id_check;
alter table public.arbor_market_refresh add constraint arbor_market_refresh_source_id_check
 check(source_id in ('marketstack','coinranking','exchangerate_api','atram_nav','bpi_nav'));
create or replace function public.arbor_claim_market_refresh(source_id text, cooldown_seconds integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare claimed text;
begin
 if source_id not in ('marketstack','coinranking','exchangerate_api','atram_nav','bpi_nav') or cooldown_seconds <
    (case when source_id='coinranking' then 600 else 86400 end) then
   raise exception 'Invalid refresh cadence';
 end if;
 insert into public.arbor_market_refresh as r values(source_id,now())
 on conflict on constraint arbor_market_refresh_pkey do update set attempted_at=excluded.attempted_at
 where case when r.source_id in ('atram_nav','bpi_nav') then
   (r.attempted_at at time zone 'Asia/Manila')::date < (now() at time zone 'Asia/Manila')::date
 else r.attempted_at <= now()-make_interval(secs=>cooldown_seconds) end
 returning r.source_id into claimed;
 return claimed is not null;
end $$;
revoke all on function public.arbor_claim_market_refresh(text,integer) from public,anon,authenticated;
grant execute on function public.arbor_claim_market_refresh(text,integer) to service_role;

-- Enforce NAV effective-date precedence at the write boundary too, including races
-- between a refresh's read and upsert. Same-date manual correction remains possible.
create function public.arbor_guard_nav_precedence() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if old.kind='nav' and new.kind='nav' and old.verified and
    (new.as_of < old.as_of or (new.source='toap' and new.as_of=old.as_of)) then
   return null;
 end if;
 return new;
end $$;
revoke all on function public.arbor_guard_nav_precedence() from public,anon,authenticated;
create trigger guard_nav_precedence before update on public.arbor_market_prices
 for each row execute function public.arbor_guard_nav_precedence();

-- Only the source-identity predicate differs from the 3U-B.5 capture function.
-- PHP math, freshness thresholds, owner scoping and manual fallback are unchanged.
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
 ) v where h.user_id=owner_id;
 if total_rows=0 or total_rows<>valued_rows then return false; end if;
 insert into public.arbor_portfolio_snapshots(user_id,day,value_php)
 values(owner_id,(now() at time zone 'UTC')::date,amount) on conflict do nothing;
 return true;
end $$;
revoke all on function public.arbor_capture_portfolio() from public,anon,authenticated;
grant execute on function public.arbor_capture_portfolio() to authenticated;
commit;
