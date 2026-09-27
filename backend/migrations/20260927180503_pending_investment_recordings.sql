-- Prepared locally only. Pending recording is a resumable task, never a trade.
begin;

create table public.arbor_pending_investment_recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  provider text not null,
  source text not null default 'monthly' check (source = 'monthly'),
  status text not null default 'pending' check (status in ('pending', 'recorded', 'dismissed')),
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (product_id, provider) references public.arbor_portfolio_products(product_id, provider),
  constraint arbor_pending_resolution_check check ((status = 'pending') = (resolved_at is null))
);
create unique index arbor_one_unresolved_recording on public.arbor_pending_investment_recordings
  (user_id, product_id, provider) where status = 'pending';
create index arbor_pending_recordings_owner on public.arbor_pending_investment_recordings
  (user_id, started_at desc, id desc);

-- One generic delivery covers an owner's eligible items. No recipient, email
-- content, or financial data is retained here. Unapplied migration only.
create table public.arbor_pending_recording_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  claim_token uuid not null default gen_random_uuid(),
  lease_until timestamptz not null default now() + interval '5 minutes',
  next_attempt_at timestamptz not null default now(),
  first_attempt_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  request_fingerprint text check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  sent_at timestamptz,
  stopped_at timestamptz,
  provider_message_id text,
  unique (id, user_id),
  check (sent_at is null or stopped_at is null),
  check (sent_at is null or first_attempt_at is not null)
);
create unique index arbor_one_active_pending_reminder
  on public.arbor_pending_recording_reminders(user_id)
  where sent_at is null and stopped_at is null;
create index arbor_pending_reminder_owner_sent
  on public.arbor_pending_recording_reminders(user_id, sent_at desc);
alter table public.arbor_pending_investment_recordings
  add column reminder_delivery_id uuid,
  add column reminder_sent_at timestamptz,
  add constraint arbor_pending_reminder_owner_fk
    foreign key (reminder_delivery_id, user_id)
    references public.arbor_pending_recording_reminders(id, user_id),
  add constraint arbor_pending_reminder_sent_check
    check (reminder_sent_at is null or reminder_delivery_id is not null);
create index arbor_pending_recordings_reminder_due
  on public.arbor_pending_investment_recordings(started_at, user_id)
  where status = 'pending' and reminder_delivery_id is null;

alter table public.arbor_pending_recording_reminders enable row level security;
revoke all on public.arbor_pending_recording_reminders from public, anon, authenticated;
grant select, insert, update on public.arbor_pending_recording_reminders to service_role;

alter table public.arbor_pending_investment_recordings enable row level security;
revoke all on public.arbor_pending_investment_recordings from public, anon, authenticated;
grant select on public.arbor_pending_investment_recordings to authenticated;
grant select, update on public.arbor_pending_investment_recordings to service_role;
create policy arbor_pending_recordings_owner_read on public.arbor_pending_investment_recordings
  for select to authenticated using ((select auth.uid()) = user_id);

-- The user JWT supplies ownership. Direct table writes remain denied.
create function public.arbor_start_pending_recording(p_product_id text, p_provider text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  item public.arbor_pending_investment_recordings%rowtype;
begin
  if owner_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not exists (select 1 from public.arbor_portfolio_products
                 where product_id = p_product_id and provider = p_provider) then
    raise exception 'unsupported_investment' using errcode = '22023';
  end if;
  insert into public.arbor_pending_investment_recordings(user_id, product_id, provider)
    values (owner_id, p_product_id, p_provider)
    on conflict (user_id, product_id, provider) where status = 'pending'
    do update set started_at = public.arbor_pending_investment_recordings.started_at
    returning * into item;
  return jsonb_build_object('id', item.id, 'product_id', item.product_id,
    'provider', item.provider, 'source', item.source, 'status', item.status,
    'started_at', item.started_at, 'resolved_at', item.resolved_at);
end;
$$;
revoke all on function public.arbor_start_pending_recording(text, text) from public, anon;
grant execute on function public.arbor_start_pending_recording(text, text) to authenticated;

create function public.arbor_resolve_pending_recording(p_id uuid, p_resolution text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  item public.arbor_pending_investment_recordings%rowtype;
begin
  if owner_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_resolution not in ('recorded', 'dismissed') or p_resolution is null then
    raise exception 'invalid_resolution' using errcode = '22023';
  end if;
  update public.arbor_pending_investment_recordings
     set status = p_resolution, resolved_at = now()
   where id = p_id and user_id = owner_id and status = 'pending'
   returning * into item;
  if not found then
    select * into item from public.arbor_pending_investment_recordings
     where id = p_id and user_id = owner_id;
    if not found or item.status <> p_resolution then
      raise exception 'pending_recording_conflict' using errcode = '22023';
    end if;
  end if;
  return jsonb_build_object('id', item.id, 'product_id', item.product_id,
    'provider', item.provider, 'source', item.source, 'status', item.status,
    'started_at', item.started_at, 'resolved_at', item.resolved_at);
end;
$$;
revoke all on function public.arbor_resolve_pending_recording(uuid, text) from public, anon;
grant execute on function public.arbor_resolve_pending_recording(uuid, text) to authenticated;

-- Only the trusted scheduled worker can claim reminder work. An owner-level
-- advisory lock plus the partial unique index prevent two workers from claiming
-- separate products for the same owner. The transaction ends before HTTP send.
create function public.arbor_claim_pending_recording_reminder()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  delivery public.arbor_pending_recording_reminders%rowtype;
  owner_id uuid;
begin
  select * into delivery from public.arbor_pending_recording_reminders
   where sent_at is null and stopped_at is null
     and lease_until <= now() and next_attempt_at <= now()
   order by created_at, id limit 1 for update skip locked;
  if found then
    if delivery.created_at <= now() - interval '7 days' or
       (delivery.first_attempt_at is not null and
        delivery.first_attempt_at <= now() - interval '23 hours') or
       delivery.attempt_count >= 3 then
      update public.arbor_pending_recording_reminders set stopped_at = now()
       where id = delivery.id;
      return null;
    end if;
    update public.arbor_pending_recording_reminders
       set claim_token = gen_random_uuid(), lease_until = now() + interval '5 minutes'
     where id = delivery.id returning * into delivery;
    return jsonb_build_object('id', delivery.id, 'user_id', delivery.user_id,
      'claim_token', delivery.claim_token);
  end if;

  select p.user_id into owner_id
    from public.arbor_pending_investment_recordings p
   where p.status = 'pending' and p.reminder_delivery_id is null
     and p.started_at <= now() - interval '24 hours'
     and not exists (
       select 1 from public.arbor_pending_recording_reminders r
        where r.user_id = p.user_id and
          ((r.sent_at is null and r.stopped_at is null) or
           r.sent_at > now() - interval '7 days'))
   group by p.user_id order by min(p.started_at), p.user_id limit 1;
  if owner_id is null or not pg_try_advisory_xact_lock(hashtextextended(owner_id::text, 27612)) then
    return null;
  end if;
  insert into public.arbor_pending_recording_reminders(user_id)
    select owner_id where not exists (
      select 1 from public.arbor_pending_recording_reminders r
       where r.user_id = owner_id and
         ((r.sent_at is null and r.stopped_at is null) or
          r.sent_at > now() - interval '7 days'))
    on conflict (user_id) where sent_at is null and stopped_at is null do nothing
    returning * into delivery;
  if not found then return null; end if;
  update public.arbor_pending_investment_recordings
     set reminder_delivery_id = delivery.id
   where user_id = owner_id and status = 'pending'
     and reminder_delivery_id is null
     and started_at <= now() - interval '24 hours';
  return jsonb_build_object('id', delivery.id, 'user_id', delivery.user_id,
    'claim_token', delivery.claim_token);
end;
$$;
revoke all on function public.arbor_claim_pending_recording_reminder() from public, anon, authenticated;
grant execute on function public.arbor_claim_pending_recording_reminder() to service_role;

-- Final eligibility check and durable attempt identity happen immediately
-- before delivery. A changed payload stops retry rather than changing the
-- provider idempotency request under the same key.
create function public.arbor_prepare_pending_recording_reminder(
  p_id uuid, p_token uuid, p_fingerprint text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  delivery public.arbor_pending_recording_reminders%rowtype;
begin
  select * into delivery from public.arbor_pending_recording_reminders
   where id = p_id for update;
  if not found or delivery.claim_token <> p_token or delivery.lease_until <= now()
     or delivery.sent_at is not null or delivery.stopped_at is not null then
    return false;
  end if;
  if p_fingerprint !~ '^[0-9a-f]{64}$' or p_fingerprint is null then
    raise exception 'invalid_reminder_fingerprint' using errcode = '22023';
  end if;
  if delivery.attempt_count >= 3 or
     (delivery.first_attempt_at is not null and
      delivery.first_attempt_at <= now() - interval '23 hours') or
     (delivery.request_fingerprint is not null and
      delivery.request_fingerprint <> p_fingerprint) or
     not exists (
       select 1 from public.arbor_pending_investment_recordings p
        where p.reminder_delivery_id = p_id and p.user_id = delivery.user_id
          and p.status = 'pending' and p.reminder_sent_at is null
          and p.started_at <= now() - interval '24 hours') then
    update public.arbor_pending_recording_reminders set stopped_at = now()
      where id = p_id;
    return false;
  end if;
  update public.arbor_pending_recording_reminders
     set request_fingerprint = coalesce(request_fingerprint, p_fingerprint),
         first_attempt_at = coalesce(first_attempt_at, now()),
         attempt_count = attempt_count + 1,
         next_attempt_at = now() + interval '15 minutes'
   where id = p_id;
  return true;
end;
$$;
revoke all on function public.arbor_prepare_pending_recording_reminder(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.arbor_prepare_pending_recording_reminder(uuid, uuid, text)
  to service_role;

create function public.arbor_finish_pending_recording_reminder(
  p_id uuid, p_token uuid, p_result text, p_provider_message_id text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  delivery public.arbor_pending_recording_reminders%rowtype;
begin
  select * into delivery from public.arbor_pending_recording_reminders
   where id = p_id for update;
  if not found or delivery.claim_token <> p_token or delivery.sent_at is not null
     or delivery.stopped_at is not null then return false; end if;
  if p_result = 'sent' and delivery.first_attempt_at is not null and
     p_provider_message_id is not null and length(p_provider_message_id) between 1 and 200 then
    update public.arbor_pending_recording_reminders
      set sent_at = now(), lease_until = now(), provider_message_id = p_provider_message_id
      where id = p_id;
    update public.arbor_pending_investment_recordings
      set reminder_sent_at = now()
      where reminder_delivery_id = p_id and status = 'pending'
        and reminder_sent_at is null and started_at <= now() - interval '24 hours';
  elsif p_result = 'retry' then
    update public.arbor_pending_recording_reminders
      set lease_until = now(), next_attempt_at = now() + interval '15 minutes'
      where id = p_id;
  elsif p_result = 'stop' then
    update public.arbor_pending_recording_reminders
      set stopped_at = now(), lease_until = now() where id = p_id;
  else
    raise exception 'invalid_reminder_result' using errcode = '22023';
  end if;
  return true;
end;
$$;
revoke all on function public.arbor_finish_pending_recording_reminder(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.arbor_finish_pending_recording_reminder(uuid, uuid, text, text)
  to service_role;

commit;
