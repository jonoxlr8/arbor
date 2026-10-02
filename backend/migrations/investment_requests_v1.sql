-- PREPARED LOCAL PROPOSAL ONLY; do not apply to a hosted database without review.
-- Repository uses standalone SQL proposals; Supabase CLI is unavailable locally.
begin;

create table public.arbor_investment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  investment_name text not null check (char_length(investment_name) between 1 and 120
    and investment_name = btrim(regexp_replace(investment_name,'[[:space:]]+',' ','g'))
    and investment_name !~ '[[:cntrl:]]'),
  provider text not null check (char_length(provider) between 1 and 80
    and provider = btrim(regexp_replace(provider,'[[:space:]]+',' ','g'))
    and provider !~ '[[:cntrl:]]'),
  idempotency_key uuid not null,
  received_at timestamptz not null default now(),
  unique(user_id,idempotency_key)
);
-- One person's repeated request is one demand signal, even after reopening the form.
create unique index arbor_investment_request_owner_product
  on public.arbor_investment_requests(user_id,lower(investment_name),lower(provider));
create index arbor_investment_request_owner_date
  on public.arbor_investment_requests(user_id,received_at desc);
alter table public.arbor_investment_requests enable row level security;
revoke all on public.arbor_investment_requests from public,anon,authenticated,service_role;
grant select on public.arbor_investment_requests to authenticated;
grant insert(investment_name,provider,idempotency_key) on public.arbor_investment_requests to authenticated;
create policy investment_request_read on public.arbor_investment_requests
  for select to authenticated using ((select auth.uid())=user_id);
create policy investment_request_insert on public.arbor_investment_requests
  for insert to authenticated with check ((select auth.uid())=user_id);
create policy arbor_lifecycle_active on public.arbor_investment_requests as restrictive
  to authenticated using ((select public.arbor_account_active_v1()))
  with check ((select public.arbor_account_active_v1()));
-- Reuse existing reviewed admission/revoked-session/closure serialization.
create trigger arbor_lifecycle_write before insert or update or delete
  on public.arbor_investment_requests for each row
  execute function arbor_private.guard_lifecycle_write();

create function public.arbor_guard_investment_request_insert_v1() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('arbor-investment-requests:'||new.user_id::text,0));
  if not exists (select 1 from public.arbor_investment_requests
      where user_id=new.user_id and lower(investment_name)=lower(new.investment_name)
        and lower(provider)=lower(new.provider))
     and (select count(*) from public.arbor_investment_requests where user_id=new.user_id
       and received_at >= (date_trunc('day',now() at time zone 'Asia/Manila') at time zone 'Asia/Manila'))>=10
  then raise exception 'request_daily_limit' using errcode='PT429'; end if;
  return new;
end $$;
revoke all on function public.arbor_guard_investment_request_insert_v1() from public,anon,authenticated,service_role;
create trigger arbor_request_insert_guard before insert on public.arbor_investment_requests
  for each row execute function public.arbor_guard_investment_request_insert_v1();

create function public.arbor_request_investment_v1(p_investment_name text,p_provider text,p_idempotency_key uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid(); r public.arbor_investment_requests%rowtype; is_new boolean:=false;
begin
  if owner_id is null or not public.arbor_account_active_v1() then
    raise exception 'active_account_required' using errcode='PT403';
  end if;
  p_investment_name:=btrim(regexp_replace(p_investment_name,'[[:space:]]+',' ','g'));
  p_provider:=btrim(regexp_replace(p_provider,'[[:space:]]+',' ','g'));
  if p_investment_name is null or char_length(p_investment_name) not between 1 and 120
     or p_provider is null or char_length(p_provider) not between 1 and 80
     or p_idempotency_key is null or p_investment_name ~ '[[:cntrl:]]' or p_provider ~ '[[:cntrl:]]'
  then raise exception 'invalid_request' using errcode='PT422'; end if;
  -- Serializes identical/different retry keys and the bounded daily count per owner.
  perform pg_advisory_xact_lock(hashtextextended('arbor-investment-requests:'||owner_id::text,0));
  select * into r from public.arbor_investment_requests where user_id=owner_id and idempotency_key=p_idempotency_key;
  if found then
    if lower(r.investment_name)<>lower(p_investment_name) or lower(r.provider)<>lower(p_provider) then
      raise exception 'idempotency_conflict' using errcode='PT409';
    end if;
  else
    select * into r from public.arbor_investment_requests where user_id=owner_id
      and lower(investment_name)=lower(p_investment_name) and lower(provider)=lower(p_provider);
    if not found then
      insert into public.arbor_investment_requests(investment_name,provider,idempotency_key)
        values(p_investment_name,p_provider,p_idempotency_key) returning * into r;
      is_new:=true;
    end if;
  end if;
  return jsonb_build_object('id',r.id,'investment_name',r.investment_name,'provider',r.provider,
    'received_at',r.received_at,'status',case when is_new then 'received' else 'already_received' end);
end $$;
revoke all on function public.arbor_request_investment_v1(text,text,uuid) from public,anon,service_role;
grant execute on function public.arbor_request_investment_v1(text,text,uuid) to authenticated;

-- Extend the existing single-snapshot, fresh-session export with only requested data.
do $patch$ declare d text; begin
  d:=pg_get_functiondef('public.arbor_account_export_v1(uuid,uuid)'::regprocedure);
  if d not like '%RETURN result;%' or d like '%investment_requests%' then
    raise exception 'request_export_body_incompatible';
  end if;
  d:=replace(d,'RETURN result;', $export$
  IF (SELECT count(*) FROM public.arbor_investment_requests WHERE user_id=p_verified_owner)>10000 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  result:=result||jsonb_build_object('investment_requests',(SELECT coalesce(jsonb_agg(jsonb_build_object('investment_name',investment_name,'provider',provider,'received_at',received_at) ORDER BY received_at,id),'[]'::jsonb) FROM public.arbor_investment_requests WHERE user_id=p_verified_owner));
  IF octet_length(result::text)>20971520 THEN RAISE EXCEPTION 'export_too_large'; END IF;
  RETURN result;
$export$);
  execute d;
end $patch$;
commit;
