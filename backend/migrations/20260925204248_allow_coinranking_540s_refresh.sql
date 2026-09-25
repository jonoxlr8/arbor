-- PREPARED ONLY. Apply separately after 20260925114901_toap_nav_ingestion.sql.
-- Match the trusted Coinranking adapter's early-refresh interval. Valuation
-- freshness, all other source cadences, permissions and atomic claims are unchanged.
begin;
create or replace function public.arbor_claim_market_refresh(source_id text, cooldown_seconds integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare claimed text;
begin
 if source_id not in ('marketstack','coinranking','exchangerate_api','atram_nav','bpi_nav') or cooldown_seconds <
    (case when source_id='coinranking' then 540 else 86400 end) then
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
commit;
