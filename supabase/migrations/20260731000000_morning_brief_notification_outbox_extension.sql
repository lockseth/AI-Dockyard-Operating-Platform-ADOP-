-- ADOP Gate 6J-E1 — Owner Morning Brief Foundation: delivery tracking
--
-- Extends the existing generic WhatsApp outbox (notification_events,
-- 20260721000000_owner_control_notification_outbox.sql) instead of building
-- a second delivery-tracking table, per the "don't create a parallel source
-- of truth if the outbox can be safely extended" instruction. The claim/
-- complete/fail lifecycle (lease, bounded retry, service_role-only access,
-- append-only) is fully reused as-is — nothing below touches those three
-- RPCs or /api/internal/notifications/{claim,complete,fail}, which continue
-- to serve Gate 1L's cash-import notifications unmodified.
--
-- What is genuinely new for Morning Brief:
--   - notification_events.business_date (nullable) — the existing dedup key
--     (tenant_id, event_type, source_event_id) is keyed to a domain-event
--     row id, which Morning Brief has none of (it is schedule/on-demand
--     triggered, not raised from another table's insert). A nullable date
--     column plus a partial unique index gives "at most one Morning Brief
--     per tenant per business_date" without touching any existing row
--     (every pre-existing row keeps business_date = null, untouched).
--   - notification_event_type gains 'morning_brief'.
--   - public.enqueue_and_claim_morning_brief_notification — the only new
--     RPC. It is service_role-only (n8n never talks to Postgres directly;
--     it goes through ADOP's own secret-gated internal route, same as every
--     other notification RPC). Unlike private.enqueue_notification_event
--     (which only ever inserts, called from inside another domain RPC's own
--     transaction), this one both enqueues AND claims in a single atomic
--     statement, because Morning Brief has no separate domain transaction to
--     piggyback on — the internal route composes the message and calls this
--     RPC directly. Insert-or-fetch is idempotent via
--     ON CONFLICT ... DO NOTHING against the new partial unique index; the
--     immediately-following `for update` + conditional claim makes "was this
--     call the one that (re)claimed it" observable to the caller (compare
--     the returned row's claimed_by to the worker id it just sent), without
--     needing a second return value — mirrors how claimNextNotificationForDelivery
--     already treats a null id as "nothing claimable".

-- =============================================================================
-- 1. New enum value — its own top-level statement + commit, since
--    ALTER TYPE ... ADD VALUE cannot be used in the same transaction that
--    added it (unchanged since PG12). Supabase applies each top-level
--    statement in a migration file as its own implicit transaction (no
--    explicit BEGIN in this file), so this is expected to already be safe by
--    the time later statements run — the explicit commit is a defensive
--    no-op in that case and a real safety net if it is not (same pattern as
--    20260719160000_expense_cancel_and_eod_guard.sql §1).
-- =============================================================================

alter type public.notification_event_type add value 'morning_brief';
commit;

-- =============================================================================
-- 2. business_date column + partial unique index — additive, backward
--    compatible (every existing row gets business_date = null, which the
--    partial index ignores entirely).
-- =============================================================================

alter table public.notification_events add column business_date date;

create unique index notification_events_tenant_event_business_date_unique
  on public.notification_events (tenant_id, event_type, business_date)
  where business_date is not null;

-- =============================================================================
-- 3. public.enqueue_and_claim_morning_brief_notification — service_role
--    only. Atomic insert-or-fetch (idempotent per tenant+business_date) plus
--    an immediate conditional claim, reusing the same pending/processing
--    status semantics and lease clamp as claim_next_notification_event.
-- =============================================================================

create function public.enqueue_and_claim_morning_brief_notification(
  p_tenant_id uuid,
  p_business_date date,
  p_worker_id text,
  p_message_line1 text,
  p_link_path text default null,
  p_lease_seconds integer default 300
)
returns public.notification_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lease_seconds integer;
  v_result public.notification_events;
begin
  if p_tenant_id is null then
    raise exception 'tenant id is required';
  end if;

  if p_business_date is null then
    raise exception 'business date is required';
  end if;

  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception 'worker id is required';
  end if;

  if p_message_line1 is null or btrim(p_message_line1) = '' then
    raise exception 'message is required';
  end if;

  v_lease_seconds := least(greatest(coalesce(p_lease_seconds, 300), 30), 3600);

  -- Idempotent enqueue: a second call for the same tenant+business_date
  -- (retry, overlapping trigger, manual re-run) never inserts a second row.
  insert into public.notification_events (
    tenant_id, event_type, channel, subject_type, subject_id, source_event_id,
    business_date, payload
  ) values (
    p_tenant_id, 'morning_brief', 'whatsapp', 'morning_brief', gen_random_uuid(), gen_random_uuid(),
    p_business_date,
    jsonb_build_object('message_line1', p_message_line1, 'link_path', p_link_path)
  )
  on conflict (tenant_id, event_type, business_date) where business_date is not null do nothing;

  -- Row-lock the (now guaranteed-to-exist) row for this tenant+business_date
  -- before deciding whether to claim it — serializes concurrent callers the
  -- same way claim_next_notification_event's FOR UPDATE SKIP LOCKED does,
  -- except here there is exactly one candidate row, not a queue to skip
  -- across, so a plain FOR UPDATE (blocking, not skip-locked) is correct: a
  -- concurrent caller must wait and then see the first caller's claim, not
  -- silently skip past it into a second insert.
  select * into v_result
  from public.notification_events
  where tenant_id = p_tenant_id
    and event_type = 'morning_brief'
    and business_date = p_business_date
  for update;

  if v_result.status = 'pending' or (v_result.status = 'processing' and v_result.lease_expires_at < now()) then
    update public.notification_events
    set
      status = 'processing',
      claimed_by = p_worker_id,
      claimed_at = now(),
      lease_expires_at = now() + make_interval(secs => v_lease_seconds),
      attempt_count = attempt_count + 1
    where id = v_result.id
    returning * into v_result;
  end if;

  -- Caller contract: this call is the one that (re)claimed the row iff
  -- v_result.status = 'processing' and v_result.claimed_by = p_worker_id.
  -- Any other outcome (status = 'processing' with a different/older
  -- claimed_by whose lease has not expired, or a terminal 'sent'/'failed')
  -- means today's Morning Brief is already in flight or already delivered —
  -- the caller must treat that as a duplicate, not send anything.
  return v_result;
end;
$$;

-- Named explicitly (not just `from public`) — this project carries default
-- privileges that grant directly to anon/authenticated at object-creation
-- time, bypassing the PUBLIC pseudo-role entirely (root cause documented in
-- 20260729040000_assistant_identity_privilege_hardening.sql §Gate 6J-B1).
-- Naming both roles here is the corrective pattern from that gate, applied
-- to this brand-new RPC so it does not reintroduce the same gap.
revoke execute on function public.enqueue_and_claim_morning_brief_notification(
  uuid, date, text, text, text, integer
) from public, anon, authenticated;
grant execute on function public.enqueue_and_claim_morning_brief_notification(
  uuid, date, text, text, text, integer
) to service_role;
