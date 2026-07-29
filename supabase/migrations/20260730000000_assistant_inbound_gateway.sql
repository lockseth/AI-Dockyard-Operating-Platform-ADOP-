-- ADOP — Gate 6J-C: Inbound WhatsApp Gateway & PAIR/VERIFY Command Handler
--
-- Closes two gaps left open by Gate 6J-B (20260729030000) so a real n8n ->
-- ADOP webhook can exist without ever trusting the inbound provider payload
-- as an authorization source (engine_chatbot.md §1 "Identity before
-- Intelligence", §3.2 "Nomor mentah tidak boleh digunakan sebagai tenant
-- key atau authorization proof"):
--
--   A. Message-level idempotency for the inbound webhook itself
--      (assistant_inbound_events + claim/count/record RPCs below) — distinct
--      from the identity-level single-use challenge idempotency
--      assistant_complete_pairing/assistant_complete_client_verification
--      already provide (engine_chatbot.md §12 "side effect domain memiliki
--      idempotency key terpisah dari message delivery"). Raw provider
--      payload/message text is never stored — only a payload digest,
--      normalized sender, channel and parsed command type.
--
--   B. A cross-tenant VERIFY resolution path. assistant_complete_pairing
--      already resolves purely by channel+address+code (no tenant_id
--      input, see 20260729030000 §5) because n8n never knows the tenant.
--      assistant_complete_client_verification, by contrast, took p_tenant_id
--      as a REQUIRED input (that migration's own header, §10: "tenant_id IS
--      a required input here... that remains a Gate 6J-C webhook-resolution
--      concern") — which an inbound webhook cannot supply without trusting
--      the sender or raw payload. assistant_complete_client_verification_by_
--      address below closes that gap the same way assistant_complete_pairing
--      already does: resolve every pending candidate across ALL tenants by
--      channel+number+code, requiring EXACTLY ONE digest match to succeed,
--      and failing closed (ambiguous) on more than one.
--
-- No AI/LLM, no message text storage, no Fonnte call, no PAIR/VERIFY command
-- parsing here — this migration is schema/RPC only, mirroring
-- 20260721000000_owner_control_notification_outbox.sql's "no direct table
-- access for anyone; every read/write goes through service_role RPCs" posture
-- and reusing the exact idempotent-insert pattern from
-- private.enqueue_notification_event.

-- =============================================================================
-- 1. assistant_inbound_events — canonical inbound webhook claim/dedupe.
-- =============================================================================

create type public.assistant_inbound_event_status as enum ('received', 'processed');

create table public.assistant_inbound_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_message_id text not null,
  -- sha256 hex of the canonical envelope the endpoint validated — never the
  -- raw provider payload or message text (task LOCK: "jangan simpan raw
  -- provider payload"; "jangan log messageText, challenge, nomor penuh").
  payload_digest text not null,
  channel text not null default 'whatsapp' check (channel = 'whatsapp'),
  -- E.164, same shape as assistant_channel_identities.normalized_address.
  sender_address text not null check (sender_address ~ '^\+[1-9][0-9]{6,14}$'),
  command_type text not null check (command_type in ('pair', 'verify', 'unsupported')),
  status public.assistant_inbound_event_status not null default 'received',
  -- Allowlisted safe result code only (never a raw error/messageText) — see
  -- src/lib/assistant-inbound/safe-replies.ts for the closed vocabulary.
  result_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_inbound_events_provider_message_unique unique (provider, provider_message_id)
);

create index assistant_inbound_events_sender_lookup_idx
  on public.assistant_inbound_events (channel, sender_address, command_type, received_at);

create trigger set_updated_at before update on public.assistant_inbound_events
  for each row execute function private.set_updated_at();

-- No direct table access for anyone, including service_role — every
-- read/write goes through the SECURITY DEFINER RPCs below (owned by the
-- migration role, which has implicit rights on objects it owns regardless
-- of GRANT), exactly mirroring notification_events' posture.
alter table public.assistant_inbound_events enable row level security;
revoke all on public.assistant_inbound_events from public, anon, authenticated, service_role;

-- =============================================================================
-- 2. public.claim_inbound_assistant_event — service_role only. Atomic
--    insert-or-detect-duplicate: a genuine race between two concurrent
--    deliveries of the same provider_message_id resolves via the unique
--    index itself (one insert wins; the other's ON CONFLICT DO NOTHING
--    yields no RETURNING row, so it falls through to the SELECT and picks
--    up the row the winner just committed) — no application-level lock
--    required, matching enqueue_notification_event's proven pattern.
-- =============================================================================

create function public.claim_inbound_assistant_event(
  p_provider text,
  p_provider_message_id text,
  p_payload_digest text,
  p_channel text,
  p_sender_address text,
  p_command_type text
)
returns table (event_id uuid, is_new boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_provider is null or btrim(p_provider) = '' then
    raise exception 'provider is required' using errcode = '22023';
  end if;
  if p_provider_message_id is null or btrim(p_provider_message_id) = '' then
    raise exception 'provider_message_id is required' using errcode = '22023';
  end if;

  insert into public.assistant_inbound_events (
    provider, provider_message_id, payload_digest, channel, sender_address, command_type
  ) values (
    p_provider, p_provider_message_id, p_payload_digest, p_channel, p_sender_address, p_command_type
  )
  on conflict (provider, provider_message_id) do nothing
  returning id into v_id;

  if v_id is not null then
    return query select v_id, true;
    return;
  end if;

  select aie.id into v_id
  from public.assistant_inbound_events aie
  where aie.provider = p_provider and aie.provider_message_id = p_provider_message_id;

  return query select v_id, false;
end;
$$;

revoke execute on function public.claim_inbound_assistant_event(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_inbound_assistant_event(text, text, text, text, text, text) to service_role;

-- =============================================================================
-- 3. public.record_inbound_assistant_event_result — service_role only.
--    Idempotent: only writes once, the first time a 'received' row is
--    resolved — a duplicate delivery that re-enters after the row is
--    already 'processed' is a no-op (the command must never run twice).
-- =============================================================================

create function public.record_inbound_assistant_event_result(
  p_event_id uuid,
  p_result_code text
)
returns public.assistant_inbound_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result public.assistant_inbound_events;
begin
  update public.assistant_inbound_events
  set status = 'processed', result_code = p_result_code, processed_at = now()
  where id = p_event_id and status = 'received'
  returning * into v_result;

  if v_result.id is null then
    select * into v_result from public.assistant_inbound_events where id = p_event_id;
  end if;

  if v_result.id is null then
    raise exception 'Inbound assistant event not found' using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

revoke execute on function public.record_inbound_assistant_event_result(uuid, text) from public, anon, authenticated;
grant execute on function public.record_inbound_assistant_event_result(uuid, text) to service_role;

-- =============================================================================
-- 4. public.count_recent_inbound_assistant_events — service_role only.
--    DB-backed rate-limit counter (engine_chatbot.md §11 "Rate limit
--    diterapkan per address, tenant, intent, dan endpoint") — deterministic
--    and multi-instance-safe, unlike an in-memory-only limiter (task LOCK
--    G: "jangan menggunakan in-memory-only limiter sebagai final enforcement
--    jika multi-instance"). Tenant is deliberately not a dimension here —
--    it is not yet known at the point rate limiting must apply (before
--    identity resolution); per-tenant lockout is already covered downstream
--    by each identity row's own challenge_attempt_count.
-- =============================================================================

create function public.count_recent_inbound_assistant_events(
  p_channel text,
  p_sender_address text,
  p_command_type text,
  p_window_seconds integer default 60
)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
  from public.assistant_inbound_events
  where channel = p_channel
    and sender_address = p_sender_address
    and command_type = p_command_type
    and received_at > now() - make_interval(secs => greatest(p_window_seconds, 1));
$$;

revoke execute on function public.count_recent_inbound_assistant_events(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.count_recent_inbound_assistant_events(text, text, text, integer) to service_role;

-- =============================================================================
-- 5. public.assistant_complete_client_verification_by_address — service_role
--    only. The VERIFY-side counterpart of assistant_complete_pairing:
--    resolves purely by channel+number+code across every tenant, requiring
--    exactly one pending candidate's digest to match. Structured outcome
--    (never raises for a normal failure) for the same reason as
--    assistant_complete_pairing/assistant_complete_client_verification — an
--    attempt-count increment must survive as part of a successful statement,
--    which a `raise exception` would otherwise roll back.
--
--    Outcome vocabulary is deliberately narrower than
--    assistant_complete_client_verification's (verified/invalid_or_expired/
--    locked/ambiguous/contact_inactive/duplicate_number) — invalid_code,
--    expired and not_found all collapse into invalid_or_expired here per
--    task instruction (§F: "zero match -> invalid_or_expired"), since a
--    cross-tenant caller must never be able to distinguish "wrong code" from
--    "no such pending verification exists anywhere" (identity enumeration).
-- =============================================================================

create function public.assistant_complete_client_verification_by_address(
  p_channel text,
  p_whatsapp_number text,
  p_code text
)
returns table (outcome text, contact_id uuid, tenant_id uuid, verified_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.client_contacts%rowtype;
  v_matched_ids uuid[] := '{}';
  v_matched_id uuid;
  v_digest text;
  v_now timestamptz := now();
  v_candidate_count int;
begin
  if p_channel is distinct from 'whatsapp' then
    raise exception 'Unsupported assistant channel: %', p_channel using errcode = '22023';
  end if;

  if p_code is null or btrim(p_code) = '' then
    raise exception 'code is required' using errcode = '22023';
  end if;
  v_digest := encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex');

  select count(*) into v_candidate_count
  from public.client_contacts cc
  where cc.whatsapp_number = p_whatsapp_number and cc.whatsapp_verification_status = 'pending';

  if v_candidate_count = 0 then
    return query select 'invalid_or_expired'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  -- Lock every still-pending candidate for this number across ALL tenants —
  -- a concurrent duplicate reply cannot double-complete the same row, and a
  -- single pass collects every digest match (there should never be more
  -- than one, since each row's code is independently random, but ambiguity
  -- must fail closed rather than pick one).
  for v_row in
    select * from public.client_contacts
    where whatsapp_number = p_whatsapp_number and whatsapp_verification_status = 'pending'
    order by created_at asc
    for update
  loop
    if v_row.whatsapp_verification_digest = v_digest then
      v_matched_ids := array_append(v_matched_ids, v_row.id);
    end if;
  end loop;

  if array_length(v_matched_ids, 1) is null then
    -- No candidate's digest matched: conservatively count the attempt
    -- against every still-pending candidate for this number, since we
    -- cannot tell which one the sender meant to target (mirrors
    -- assistant_complete_pairing's same conservative choice). No raise —
    -- this UPDATE must survive as part of a normal (non-erroring) return.
    update public.client_contacts
    set whatsapp_verification_attempt_count = whatsapp_verification_attempt_count + 1
    where whatsapp_number = p_whatsapp_number and whatsapp_verification_status = 'pending';

    return query select 'invalid_or_expired'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  if array_length(v_matched_ids, 1) > 1 then
    -- Fail closed on cross-tenant ambiguity — never auto-merge/auto-pick.
    insert into public.access_audit_events (
      tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
    )
    select cc.tenant_id, null, 'client_contact_verification', cc.id, 'client_verification_failed', null,
           jsonb_build_object('reason', 'ambiguous_cross_tenant_candidate')
    from public.client_contacts cc
    where cc.id = any (v_matched_ids);

    return query select 'ambiguous'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  v_matched_id := v_matched_ids[1];
  select * into v_row from public.client_contacts where id = v_matched_id for update;

  if v_row.whatsapp_verification_attempt_count >= 5 then
    return query select 'locked'::text, v_matched_id, v_row.tenant_id, null::timestamptz;
    return;
  end if;

  if v_row.whatsapp_verification_expires_at < v_now then
    return query select 'invalid_or_expired'::text, v_matched_id, v_row.tenant_id, null::timestamptz;
    return;
  end if;

  if v_row.status <> 'active' then
    return query select 'contact_inactive'::text, v_matched_id, v_row.tenant_id, null::timestamptz;
    return;
  end if;

  -- Table alias `cc` required — same ambiguous-column reasoning as
  -- assistant_complete_client_verification (this function's own RETURNS
  -- TABLE also declares an OUT column named tenant_id).
  if exists (
    select 1 from public.client_contacts cc
    where cc.tenant_id = v_row.tenant_id and cc.whatsapp_number = p_whatsapp_number
      and cc.whatsapp_verification_status = 'verified' and cc.id <> v_row.id
  ) then
    insert into public.access_audit_events (
      tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
    ) values (
      v_row.tenant_id, null, 'client_contact_verification', v_matched_id, 'client_verification_failed', null,
      jsonb_build_object('reason', 'number_already_verified_on_another_contact')
    );

    return query select 'duplicate_number'::text, v_matched_id, v_row.tenant_id, null::timestamptz;
    return;
  end if;

  update public.client_contacts
  set whatsapp_verification_status = 'verified',
      whatsapp_verified_at = v_now,
      whatsapp_verification_digest = null,
      whatsapp_verification_expires_at = null
  where id = v_matched_id;

  insert into public.access_audit_events (
    tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    v_row.tenant_id, null, 'client_contact_verification', v_matched_id, 'client_verification_completed', null,
    jsonb_build_object('whatsapp_number', p_whatsapp_number, 'resolved_cross_tenant', true)
  );

  return query select 'verified'::text, v_matched_id, v_row.tenant_id, v_now;
end;
$$;

revoke execute on function public.assistant_complete_client_verification_by_address(text, text, text) from public, anon, authenticated;
grant execute on function public.assistant_complete_client_verification_by_address(text, text, text) to service_role;
