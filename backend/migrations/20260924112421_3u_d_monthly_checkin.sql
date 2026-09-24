-- PREPARED ONLY. Apply intentionally before MONTHLY_CHECKIN_ENABLED=true.
-- Self-reported activity only: no holdings, snapshots, prices or quota writes.
begin;
create schema if not exists arbor_private;
revoke all on schema arbor_private from public, anon;
grant usage on schema arbor_private to authenticated;

create table public.arbor_monthly_checkins (
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount_php numeric not null check (
    amount_php > 0 and amount_php < 1000000000000 and scale(amount_php) <= 2),
  completed_at timestamptz not null,
  undone_at timestamptz,
  primary key (user_id, month)
);
alter table public.arbor_monthly_checkins enable row level security;
revoke all on public.arbor_monthly_checkins from public, anon, authenticated;
grant select on public.arbor_monthly_checkins to authenticated;
create policy monthly_checkin_owner_read on public.arbor_monthly_checkins
  for select to authenticated using ((select auth.uid()) = user_id);

-- Private privileged body: no caller-supplied owner or timestamp. Direct writes
-- are revoked; this is the only user-accessible mutation path. Backend checks
-- canonical readiness and entitlement. This guard additionally rejects blocked
-- or absent profiles even when the RPC is called directly.
create function arbor_private.monthly_checkin(p_action text, p_month text, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  owner_id uuid := auth.uid();
  stamp timestamptz := clock_timestamp();
  period date := date_trunc('month', stamp at time zone 'UTC')::date;
  result jsonb;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('read','complete','undo') then
    raise exception 'Invalid operation' using errcode = '22023';
  end if;
  if p_action <> 'read' and p_month is distinct from to_char(period,'YYYY-MM') then
    raise exception 'Month changed' using errcode = '22023';
  end if;
  if p_action = 'complete' then
    if p_amount is null or not (p_amount > 0 and p_amount < 1000000000000 and scale(p_amount) <= 2) then
      raise exception 'Invalid amount' using errcode = '22023';
    end if;
    if not exists (select 1 from public.profiles p where p.user_id = owner_id
      and p.strategy_engine_version = '2.0' and p.currency = 'PHP'
      and p.v2_inputs->>'selected_approach' in ('Conservative','Balanced','Growth','Aggressive')
      and p.v2_inputs->>'horizon' in ('three_to_five_years','five_to_ten_years','ten_plus_years')
      and p.v2_inputs->>'high_interest_debt' in ('none','paying_down','not_sure')) then
      raise exception 'Profile does not permit completion' using errcode = '22023';
    end if;
    insert into public.arbor_monthly_checkins(user_id,month,amount_php,completed_at)
      values(owner_id,period,p_amount,stamp)
      on conflict (user_id,month) do update
      set amount_php=excluded.amount_php,completed_at=excluded.completed_at,undone_at=null
      where public.arbor_monthly_checkins.undone_at is not null;
  elsif p_action = 'undo' then
    update public.arbor_monthly_checkins set undone_at=stamp
      where user_id=owner_id and month=period and undone_at is null;
  end if;
  select jsonb_build_object('month',to_char(period,'YYYY-MM'),
    'current',(select jsonb_build_object('month',to_char(c.month,'YYYY-MM'),
      'amount_php',c.amount_php::text,'completed_at',c.completed_at,'undone_at',c.undone_at)
      from public.arbor_monthly_checkins c where c.user_id=owner_id and c.month=period and c.undone_at is null),
    'history',coalesce((select jsonb_agg(row_data order by m desc) from
      (select c.month m,jsonb_build_object('month',to_char(c.month,'YYYY-MM'),
        'amount_php',c.amount_php::text,'completed_at',c.completed_at,'undone_at',c.undone_at) row_data
       from public.arbor_monthly_checkins c where c.user_id=owner_id order by c.month desc limit 12) recent),'[]'::jsonb)) into result;
  return result;
end;
$$;
revoke all on function arbor_private.monthly_checkin(text,text,numeric) from public, anon;
grant execute on function arbor_private.monthly_checkin(text,text,numeric) to authenticated;

create function public.arbor_monthly_checkin(p_action text default 'read', p_month text default null, p_amount numeric default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select arbor_private.monthly_checkin(p_action,p_month,p_amount);
$$;
revoke all on function public.arbor_monthly_checkin(text,text,numeric) from public, anon;
grant execute on function public.arbor_monthly_checkin(text,text,numeric) to authenticated;
commit;
