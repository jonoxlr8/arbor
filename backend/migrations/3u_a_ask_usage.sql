-- PREPARED ONLY. Apply intentionally before enabling production Free accounts.
-- No prompt text, payment data, entitlement assignment, or profile changes.
begin;
create schema if not exists arbor_private;
revoke all on schema arbor_private from public, anon;
grant usage on schema arbor_private to authenticated;

create table public.arbor_ask_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  period date not null,
  successful_count integer not null check (successful_count between 0 and 10),
  primary key (user_id, period),
  check (extract(day from period) = 1)
);
alter table public.arbor_ask_usage_monthly enable row level security;
revoke all on public.arbor_ask_usage_monthly from public, anon, authenticated;
grant select on public.arbor_ask_usage_monthly to authenticated;
create policy ask_usage_owner_read on public.arbor_ask_usage_monthly
  for select to authenticated using ((select auth.uid()) = user_id);

-- Only this narrow function can mutate counts. Identity and period are derived
-- server-side. An authenticated caller cannot reset a count or name another user.
create function arbor_private.ask_usage(p_consume boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  month_start date := date_trunc('month', clock_timestamp() at time zone 'UTC')::date;
  used integer;
  admitted boolean;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_consume is null then
    raise exception 'Invalid operation' using errcode = '22023';
  end if;
  if p_consume then
    insert into public.arbor_ask_usage_monthly as usage (user_id, period, successful_count)
    values (owner_id, month_start, 1)
    on conflict (user_id, period) do update
      set successful_count = usage.successful_count + 1
      where usage.successful_count < 10
    returning successful_count into used;
    admitted := used is not null;
    used := coalesce(used, 10);
  else
    select successful_count into used from public.arbor_ask_usage_monthly
      where user_id = owner_id and period = month_start;
    used := coalesce(used, 0);
    admitted := used < 10;
  end if;
  return jsonb_build_object('used', used, 'remaining', 10-used,
    'allowed', admitted, 'period', month_start::text);
end;
$$;
revoke all on function arbor_private.ask_usage(boolean) from public, anon;
grant execute on function arbor_private.ask_usage(boolean) to authenticated;

-- Public PostgREST RPC wrapper is invoker-only; privileged logic is unexposed.
create function public.arbor_ask_usage(p_consume boolean default false)
returns jsonb language sql security invoker set search_path = '' as $$
  select arbor_private.ask_usage(p_consume);
$$;
revoke all on function public.arbor_ask_usage(boolean) from public, anon;
grant execute on function public.arbor_ask_usage(boolean) to authenticated;
commit;
