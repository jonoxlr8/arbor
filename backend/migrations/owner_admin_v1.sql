-- Reviewed investment-request Admin activation. Explicit owner-access approval received.
-- Empty owner allowlist; no UUID/email/name inferred or hard-coded.
begin;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
LOCK TABLE arbor_private.account_erasure_operations IN SHARE MODE;
LOCK TABLE arbor_private.account_lifecycle IN SHARE MODE;
DO $preflight$ BEGIN
 IF EXISTS(SELECT 1 FROM arbor_private.account_erasure_operations WHERE state<>'completed') OR EXISTS(SELECT 1 FROM arbor_private.account_lifecycle WHERE state='erasing') THEN RAISE EXCEPTION 'admin_erasure_transition_not_clear'; END IF;
 IF md5(pg_get_functiondef('public.arbor_account_export_v1(uuid,uuid)'::regprocedure))<>'0573caed928e52e1a2c5334169b37fc7' THEN RAISE EXCEPTION 'admin_kernel_preflight_changed'; END IF;
 IF md5(pg_get_functiondef('arbor_private.erasure_inventory(uuid)'::regprocedure))<>'37bd7f45670cefd2cd5338de3316f8ab' THEN RAISE EXCEPTION 'admin_kernel_preflight_changed'; END IF;
 IF md5(pg_get_functiondef('arbor_private.erasure_data(uuid)'::regprocedure))<>'ca4bb7cc3ed41fcc9331a851d6c429ca' THEN RAISE EXCEPTION 'admin_kernel_preflight_changed'; END IF;
END $preflight$;

create table arbor_private.admin_owner (
 user_id uuid primary key references auth.users(id) on delete cascade,
 singleton boolean not null default true unique check(singleton)
);
alter table arbor_private.admin_owner enable row level security;
revoke all on arbor_private.admin_owner from public,anon,authenticated,service_role;
create table public.arbor_investment_request_reviews (
 request_id uuid primary key references public.arbor_investment_requests(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null check(status in('new','reviewing','resolved')),
 revision bigint not null check(revision>0),
 updated_at timestamptz not null default now()
);
alter table public.arbor_investment_request_reviews enable row level security;
revoke all on public.arbor_investment_request_reviews from public,anon,authenticated,service_role;
create index arbor_request_review_owner on public.arbor_investment_request_reviews(user_id);
create function arbor_private.require_request_admin() returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.arbor_account_active_v1() or not exists(
  select 1 from arbor_private.admin_owner where user_id=auth.uid()) then
  raise exception 'owner_admin_required' using errcode='PT403';
 end if;
 -- account_active_v1 already retains the shared lifecycle lock until commit.
 -- Do not upgrade it: concurrent owner reads/status edits must not deadlock.
end $$;
revoke all on function arbor_private.require_request_admin() from public,anon,authenticated,service_role;
create function public.arbor_admin_access_v1() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 return jsonb_build_object('allowed', public.arbor_account_active_v1() and exists(
  select 1 from arbor_private.admin_owner where user_id=auth.uid()));
end $$;
create function public.arbor_admin_requests_v1(p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb;
begin
 perform arbor_private.require_request_admin();
 if p_limit not between 1 and 50 or p_offset not between 0 and 10000 then
  raise exception 'invalid_page' using errcode='PT422'; end if;
 select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into items from (
  select r.id,r.investment_name,r.provider,r.received_at,
   coalesce(w.status,'new') as status,coalesce(w.revision,0) as revision,w.updated_at
  from public.arbor_investment_requests r
  left join public.arbor_investment_request_reviews w on w.request_id=r.id
  left join arbor_private.account_lifecycle l on l.user_id=r.user_id
  where coalesce(l.state,'active')='active'
  order by r.received_at desc,r.id limit p_limit+1 offset p_offset
 )t;
 return jsonb_build_object('items',case when jsonb_array_length(items)>p_limit then items-p_limit else items end,
  'has_more',jsonb_array_length(items)>p_limit,'offset',p_offset);
end $$;
create function public.arbor_admin_request_v1(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform arbor_private.require_request_admin();
 select jsonb_build_object('id',r.id,'investment_name',r.investment_name,'provider',r.provider,
  'received_at',r.received_at,'status',coalesce(w.status,'new'),'revision',coalesce(w.revision,0),'updated_at',w.updated_at)
 into result from public.arbor_investment_requests r
 left join public.arbor_investment_request_reviews w on w.request_id=r.id
 left join arbor_private.account_lifecycle l on l.user_id=r.user_id
 where r.id=p_id and coalesce(l.state,'active')='active';
 if result is null then raise exception 'request_unavailable' using errcode='PT404'; end if;
 return result;
end $$;
create function public.arbor_admin_request_status_v1(p_id uuid,p_status text,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.arbor_investment_requests%rowtype; actual_revision bigint; actual_status text;
begin
 perform arbor_private.require_request_admin();
 if p_status is null or p_status not in('new','reviewing','resolved') or p_expected_revision is null or p_expected_revision<0 then
  raise exception 'invalid_status' using errcode='PT422'; end if;
 -- Read owner then use the existing closure lock before locking the request.
 select * into r from public.arbor_investment_requests where id=p_id;
 if not found then raise exception 'request_unavailable' using errcode='PT404'; end if;
 -- Fail fast rather than deadlock if owner/submitter lifecycle changes concurrently.
 if not pg_try_advisory_xact_lock_shared(hashtextextended('arbor-account-lifecycle:'||r.user_id::text,0)) then
  raise exception 'request_busy' using errcode='PT409'; end if;
 select * into r from public.arbor_investment_requests where id=p_id for update;
 if not found or exists(select 1 from arbor_private.account_lifecycle where user_id=r.user_id and state<>'active') then
  raise exception 'request_unavailable' using errcode='PT404'; end if;
 select revision,status into actual_revision,actual_status from public.arbor_investment_request_reviews where request_id=p_id;
 actual_revision:=coalesce(actual_revision,0);actual_status:=coalesce(actual_status,'new');
 if actual_revision<>p_expected_revision then raise exception 'stale_status' using errcode='PT409'; end if;
 if actual_status<>p_status then
  insert into public.arbor_investment_request_reviews(request_id,user_id,status,revision,updated_at)
   values(p_id,r.user_id,p_status,actual_revision+1,now())
  on conflict(request_id) do update set status=excluded.status,revision=excluded.revision,updated_at=excluded.updated_at;
 end if;
 return public.arbor_admin_request_v1(p_id);
end $$;
revoke all on function public.arbor_admin_access_v1(),public.arbor_admin_requests_v1(integer,integer),
 public.arbor_admin_request_v1(uuid),public.arbor_admin_request_status_v1(uuid,text,bigint) from public,anon,service_role;
grant execute on function public.arbor_admin_access_v1(),public.arbor_admin_requests_v1(integer,integer),
 public.arbor_admin_request_v1(uuid),public.arbor_admin_request_status_v1(uuid,text,bigint) to authenticated;

-- Extend the existing reviewed owner export and erasure kernels atomically.
do $patch$ declare d text; fn regprocedure; begin
 d:=pg_get_functiondef('public.arbor_account_export_v1(uuid,uuid)'::regprocedure);
 if d not like '%RETURN result;%' or d like '%investment_request_reviews%' then
  raise exception 'admin_export_body_incompatible'; end if;
 d:=replace(d,'RETURN result;', $export$
 result:=result||jsonb_build_object('investment_request_reviews',(
  select coalesce(jsonb_agg(jsonb_build_object('investment_name',r.investment_name,'provider',r.provider,
   'received_at',r.received_at,'status',w.status,'updated_at',w.updated_at) order by r.received_at,r.id),'[]'::jsonb)
  from public.arbor_investment_request_reviews w join public.arbor_investment_requests r on r.id=w.request_id
  where w.user_id=p_verified_owner and r.user_id=p_verified_owner));
 IF octet_length(result::text)>20971520 THEN RAISE EXCEPTION 'export_too_large'; END IF;
 RETURN result;
 $export$);execute d;
 foreach fn in array array['arbor_private.erasure_inventory(uuid)'::regprocedure,'arbor_private.erasure_data(uuid)'::regprocedure] loop
  d:=pg_get_functiondef(fn);
  if d not like '%FOREACH t IN ARRAY ARRAY[%'
    or d not like '%arbor_investment_requests%'
    or d like '%arbor_investment_request_reviews%' then
   raise exception 'admin_erasure_body_incompatible'; end if;
  d:=replace(d,'FOREACH t IN ARRAY ARRAY[','FOREACH t IN ARRAY ARRAY[''arbor_investment_request_reviews'',');
  if fn='arbor_private.erasure_inventory(uuid)'::regprocedure then
   d:=replace(d,'RETURN result;',
    'result:=result||jsonb_build_object(''admin_owner'',(SELECT count(*) FROM arbor_private.admin_owner WHERE user_id=p_owner)); RETURN result;');
  else
   d:=replace(d,'DELETE FROM arbor_private.account_export_cooldowns WHERE user_id=o.owner_id;',
    'DELETE FROM arbor_private.admin_owner WHERE user_id=o.owner_id; DELETE FROM arbor_private.account_export_cooldowns WHERE user_id=o.owner_id;');
  end if;
  execute d;
 end loop;
end $patch$;
commit;
