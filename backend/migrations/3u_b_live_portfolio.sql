-- PREPARED ONLY. Apply intentionally; independent of 3u_a_ask_usage.sql.
-- Reference prices are shared, trusted server data. No browser price writes.
begin;
create table public.arbor_portfolio_products (
  product_id text primary key, provider text not null, price_key text not null,
  unique(product_id, provider)
);
insert into public.arbor_portfolio_products values
 ('gcash_global_equity','gcash','gcash_global_equity'),
 ('gcash_technology','gcash','gcash_technology'),
 ('gcash_defensive','gcash','gcash_defensive'),
 ('dragonfi_global_equity','dragonfi','dragonfi_global_equity'),
 ('dragonfi_technology','dragonfi','dragonfi_technology'),
 ('dragonfi_defensive','dragonfi','dragonfi_defensive'),
 ('gotrade_vt','gotrade','gotrade_vt'), ('gotrade_vgt','gotrade','gotrade_vgt'),
 ('gotrade_bnd','gotrade','gotrade_bnd'),
 ('gcrypto_btc','gcrypto','btc_php'), ('coins_btc','coins_ph','btc_php'), ('pdax_btc','pdax','btc_php');

create table public.arbor_portfolio_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id text not null, provider text not null,
  units numeric not null check (units > 0 and units < 1000000000000 and units = round(units,12)),
  cost_basis_php numeric check (cost_basis_php >= 0 and cost_basis_php < 10000000000000000 and cost_basis_php = round(cost_basis_php,2)),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(product_id, provider) references public.arbor_portfolio_products(product_id, provider),
  unique(user_id, product_id)
);
create table public.arbor_market_prices (
  price_key text primary key check (price_key in (
   'gcash_global_equity','gcash_technology','gcash_defensive',
   'dragonfi_global_equity','dragonfi_technology','dragonfi_defensive',
   'gotrade_vt','gotrade_vgt','gotrade_bnd','btc_php','usd_php')),
  value numeric not null check(value > 0 and value < 1000000000000 and value = round(value,12)),
  as_of timestamptz not null check(as_of <= now()),
  source text not null check(length(source) between 1 and 200),
  currency text not null default 'PHP' check(currency in ('PHP','USD')),
  kind text not null default 'nav' check(kind in ('etf_eod','btc_reference','fx','nav')),
  fetched_at timestamptz not null default now(),
  provenance text, unit_class text, reference_id text,
  verified boolean not null default false
);
-- Operator-only coordination, not user activity/history. Survives worker restarts.
create table public.arbor_market_refresh (
 source_id text primary key check(source_id in ('marketstack','coinranking','exchangerate_api')),
 attempted_at timestamptz not null
);
alter table public.arbor_market_refresh enable row level security;
revoke all on public.arbor_market_refresh from public,anon,authenticated;
grant select,insert,update on public.arbor_market_refresh to service_role;
create function public.arbor_claim_market_refresh(source_id text, cooldown_seconds integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare claimed text;
begin
 if source_id not in ('marketstack','coinranking','exchangerate_api') or cooldown_seconds <
    (case when source_id='coinranking' then 600 else 86400 end) then
   raise exception 'Invalid refresh cadence';
 end if;
 insert into public.arbor_market_refresh as r values(source_id,now())
 on conflict on constraint arbor_market_refresh_pkey do update set attempted_at=excluded.attempted_at
 where r.attempted_at <= now()-make_interval(secs=>cooldown_seconds)
 returning r.source_id into claimed;
 return claimed is not null;
end $$;
revoke all on function public.arbor_claim_market_refresh(text,integer) from public,anon,authenticated;
grant execute on function public.arbor_claim_market_refresh(text,integer) to service_role;
create table public.arbor_portfolio_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null, value_php numeric not null check(value_php >= 0),
  captured_at timestamptz not null default now(), primary key(user_id,day)
);
alter table public.arbor_portfolio_products enable row level security;
alter table public.arbor_portfolio_holdings enable row level security;
alter table public.arbor_market_prices enable row level security;
alter table public.arbor_portfolio_snapshots enable row level security;
revoke all on public.arbor_portfolio_products, public.arbor_portfolio_holdings,
 public.arbor_market_prices, public.arbor_portfolio_snapshots from public, anon, authenticated;
grant select on public.arbor_portfolio_products, public.arbor_portfolio_holdings,
 public.arbor_market_prices, public.arbor_portfolio_snapshots to authenticated;
grant insert(product_id,provider,units,cost_basis_php), update(units,cost_basis_php,updated_at), delete
 on public.arbor_portfolio_holdings to authenticated;
-- Future approved feed runs server-side only. No key is added by this migration.
grant select, insert, update, delete on public.arbor_market_prices to service_role;
create policy product_read on public.arbor_portfolio_products for select to authenticated using(true);
create policy price_read on public.arbor_market_prices for select to authenticated using(true);
create policy holding_owner on public.arbor_portfolio_holdings to authenticated
 using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy snapshot_owner on public.arbor_portfolio_snapshots for select to authenticated
 using ((select auth.uid()) = user_id);

-- Text views preserve exact decimals through PostgREST/JSON clients.
create view public.arbor_portfolio_holding_values with (security_invoker=true) as
 select id,user_id,product_id,provider,units::text,cost_basis_php::text,created_at,updated_at
 from public.arbor_portfolio_holdings;
create view public.arbor_market_price_values with (security_invoker=true) as
 select price_key,value::text,as_of,source,currency,kind,fetched_at,provenance,unit_class,reference_id,verified from public.arbor_market_prices;
create view public.arbor_portfolio_history with (security_invoker=true) as
 select user_id,day,value_php::text,captured_at from public.arbor_portfolio_snapshots;
revoke all on public.arbor_portfolio_holding_values,public.arbor_market_price_values,
 public.arbor_portfolio_history from public,anon,authenticated;
grant select on public.arbor_portfolio_holding_values,public.arbor_market_price_values,
 public.arbor_portfolio_history to authenticated;

-- Only privileged operation: record a DB-derived complete FRESH valuation.
-- No caller-supplied owner, prices, amounts, timestamps or historical dates.
-- One first complete observation per UTC day, no invented prehistory.
create function public.arbor_capture_portfolio() returns boolean
language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid(); amount numeric; total_rows integer; valued_rows integer;
begin
 if owner_id is null then raise exception 'Authentication required'; end if;
 select count(*), count(v.amount), sum(v.amount) into total_rows,valued_rows,amount
 from public.arbor_portfolio_holdings h
 join public.arbor_portfolio_products p on p.product_id=h.product_id
 left join lateral (
   select round(h.units * price.value * case when h.provider='gotrade' then fx.value else 1 end, 2) as amount
   from public.arbor_market_prices price
   left join public.arbor_market_prices fx on fx.price_key='usd_php'
   where price.price_key=p.price_key
    and price.as_of <= now()
    and price.verified
    and (h.provider not in ('gcash','dragonfi') or
      (h.product_id='gcash_global_equity' and price.unit_class='PHP Unit Class') or
      (h.product_id='gcash_technology' and price.unit_class='A PHP Unit Class') or
      (h.product_id='gcash_defensive' and price.unit_class='A Unit Class') or
      (h.product_id in ('dragonfi_global_equity','dragonfi_technology') and price.unit_class='PHP / Class P') or
      (h.product_id='dragonfi_defensive' and price.unit_class='PHP'))
    and price.as_of >= now() - case when h.provider in ('gcash','dragonfi') then interval '48 hours'
       when p.price_key='btc_php' then interval '10 minutes' else interval '48 hours' end
    and (h.provider <> 'gotrade' or (fx.verified and fx.as_of between now()-interval '48 hours' and now()))
 ) v on true where h.user_id=owner_id;
 if total_rows=0 or total_rows<>valued_rows then return false; end if;
 insert into public.arbor_portfolio_snapshots(user_id,day,value_php)
 values(owner_id,(now() at time zone 'UTC')::date,amount) on conflict do nothing;
 return true;
end $$;
revoke all on function public.arbor_capture_portfolio() from public,anon,authenticated;
grant execute on function public.arbor_capture_portfolio() to authenticated;
commit;
