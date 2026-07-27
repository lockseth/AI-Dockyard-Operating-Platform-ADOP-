-- ADOP Gate 4F — Invoice Delivery & Acknowledgment Closure
--
-- Adds an append-only, tenant-scoped delivery/acknowledgment event log for
-- `issued` invoices: PRD.md §7.12 "Invoice Delivery & Acknowledgement — LOCK"
-- requires per-channel delivery tracking and an explicit customer
-- acknowledgement that is never inferred from a read/open signal. This gate
-- implements the operational/manual recording slice of that LOCK — admin
-- manually logs what happened on WhatsApp/email/in-person outside the
-- system (no production provider integration, per task EXCLUSIONS) — not
-- the full per-channel queued->sent->delivered->read/open->failed/bounced
-- richness or automated reminders, which stay Phase 2/3 scope.
--
-- Purely additive on top of 20260726000000_billing_cardinality_structural_
-- guards.sql — no existing column, constraint, or RPC signature changes.
-- Reuses private.current_user_has_tenant_role (Gate 0A) and
-- public.access_audit_events (Gate 0A) for authorization/audit, and
-- public.invoices' existing unique(id, tenant_id) (Gate 4B) for the
-- tenant-safe composite FK.
--
-- `public.invoice_delivery_channel` (whatsapp/email/both) already exists
-- from 20260721030000_client_billing_profile_and_pic_roles.sql as a
-- client-level delivery *preference* — a different concept (a hint with a
-- "both" option, not a single per-event channel) from what an actual event
-- row needs (exactly one concrete channel it happened on, including
-- `manual` for in-person/out-of-band delivery). The event-level enum is
-- therefore named `invoice_delivery_event_channel` to avoid colliding with
-- that existing type.

-- =============================================================================
-- 1. Enums
-- =============================================================================

create type public.invoice_delivery_event_channel as enum ('email', 'whatsapp', 'manual');
create type public.invoice_delivery_event_type as enum ('sent', 'delivered', 'acknowledged', 'failed');

-- =============================================================================
-- 2. Table
-- =============================================================================

-- One row per delivery/acknowledgment event. Never updated or deleted (§5
-- below) — the "status pengiriman terbaru" the UI shows is always derived
-- by reading the latest row, never by mutating a single status column.
--
-- `event_seq` (not `created_at`) is the authoritative insertion-order
-- tiebreaker: `now()` is transaction-start time in Postgres, so two events
-- recorded within the same database transaction would otherwise share an
-- identical `created_at` and make "the latest event" ambiguous — exactly
-- the kind of ordering bug invoice_evidence_versions avoids by tracking an
-- explicit `current_version_id` pointer instead of inferring "current" from
-- a timestamp. A `bigserial` gives a real monotonic order regardless of
-- how many events land in one transaction; `created_at` remains purely
-- informational/display timestamp.
create table public.invoice_delivery_events (
  id uuid primary key default gen_random_uuid(),
  event_seq bigserial not null,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  invoice_id uuid not null,
  channel public.invoice_delivery_event_channel not null,
  event_type public.invoice_delivery_event_type not null,
  recipient_snapshot text not null check (btrim(recipient_snapshot) <> ''),
  provider_reference text,
  failure_reason text,
  acknowledgment_note text,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_seq),
  foreign key (invoice_id, tenant_id) references public.invoices (id, tenant_id) on delete cascade,
  constraint invoice_delivery_events_failure_shape check (
    (event_type = 'failed' and failure_reason is not null and btrim(failure_reason) <> '')
    or (event_type <> 'failed' and failure_reason is null)
  ),
  constraint invoice_delivery_events_acknowledgment_shape check (
    event_type = 'acknowledged' or acknowledgment_note is null
  )
);

create index invoice_delivery_events_tenant_id_idx on public.invoice_delivery_events (tenant_id);
create index invoice_delivery_events_invoice_id_idx on public.invoice_delivery_events (tenant_id, invoice_id, event_seq desc);

-- =============================================================================
-- 3. Append-only guard (role-independent — fires for any caller, including
--    a raw insert/update as service_role or superuser)
-- =============================================================================

create function private.enforce_invoice_delivery_event_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'invoice_delivery_events is append-only: % not allowed', tg_op;
end;
$$;

revoke execute on function private.enforce_invoice_delivery_event_append_only() from public;

create trigger invoice_delivery_events_append_only
  before update or delete on public.invoice_delivery_events
  for each row execute function private.enforce_invoice_delivery_event_append_only();

-- =============================================================================
-- 4. record_invoice_delivery_event — the only mutation path
-- =============================================================================
-- `for update` on the parent invoice serializes concurrent calls for the
-- same invoice (two "Catat Pengiriman"/"Catat Diterima" clicks racing),
-- which makes both the idempotent-repeat check and the state-machine/
-- precondition checks below deterministic — mirrors issue_invoice/
-- finalize_invoice_evidence_version's locking posture.
--
-- Idempotency: an exact repeat of the immediately-latest event (same
-- channel + event_type + recipient_snapshot) is a no-op that returns the
-- existing row rather than inserting a duplicate or raising — covers a
-- double-submitted "Catat Pengiriman"/"Catat Diterima" click.
--
-- Validity: `acknowledged` requires some earlier `sent` or `delivered`
-- event to already exist for this invoice (PRD §7.12 "meminta explicit
-- customer acknowledgement" — acknowledgment presupposes an attempted/
-- completed delivery); `delivered` requires an earlier `sent` event.
-- Once the latest event is `acknowledged`, the invoice's delivery/
-- acknowledgment history is terminal — no further event of any kind may be
-- appended (an identical repeat is still idempotent per above).
create function public.record_invoice_delivery_event(
  p_invoice_id uuid,
  p_channel public.invoice_delivery_event_channel,
  p_event_type public.invoice_delivery_event_type,
  p_recipient_snapshot text,
  p_provider_reference text default null,
  p_failure_reason text default null,
  p_acknowledgment_note text default null
)
returns public.invoice_delivery_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice public.invoices;
  v_latest public.invoice_delivery_events;
  v_recipient text;
  v_has_sent_or_delivered boolean;
  v_has_sent boolean;
  v_result public.invoice_delivery_events;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if v_invoice.id is null then
    raise exception 'invoice not found';
  end if;

  if not private.current_user_has_tenant_role(v_invoice.tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to record invoice delivery event';
  end if;

  if v_invoice.status <> 'issued' then
    raise exception 'invoice must be issued before recording a delivery event';
  end if;

  v_recipient := btrim(p_recipient_snapshot);
  if v_recipient is null or v_recipient = '' then
    raise exception 'recipient snapshot is required';
  end if;

  if p_event_type = 'failed' and (p_failure_reason is null or btrim(p_failure_reason) = '') then
    raise exception 'failure reason is required for a failed delivery event';
  end if;
  if p_event_type <> 'failed' and p_failure_reason is not null then
    raise exception 'failure reason is only allowed for a failed delivery event';
  end if;
  if p_event_type <> 'acknowledged' and p_acknowledgment_note is not null then
    raise exception 'acknowledgment note is only allowed for an acknowledged delivery event';
  end if;

  select *
    into v_latest
    from public.invoice_delivery_events
    where invoice_id = p_invoice_id
    order by event_seq desc
    limit 1;

  -- Idempotent repeat of the immediately-latest event: return it, no insert.
  if v_latest.id is not null
     and v_latest.event_type = p_event_type
     and v_latest.channel = p_channel
     and v_latest.recipient_snapshot = v_recipient
  then
    return v_latest;
  end if;

  if v_latest.id is not null and v_latest.event_type = 'acknowledged' then
    raise exception 'invoice delivery is already acknowledged; no further events allowed';
  end if;

  if p_event_type = 'acknowledged' then
    select exists (
      select 1 from public.invoice_delivery_events
      where invoice_id = p_invoice_id and event_type in ('sent', 'delivered')
    ) into v_has_sent_or_delivered;
    if not v_has_sent_or_delivered then
      raise exception 'acknowledgment requires a prior sent or delivered event';
    end if;
  end if;

  if p_event_type = 'delivered' then
    select exists (
      select 1 from public.invoice_delivery_events
      where invoice_id = p_invoice_id and event_type = 'sent'
    ) into v_has_sent;
    if not v_has_sent then
      raise exception 'delivered requires a prior sent event';
    end if;
  end if;

  insert into public.invoice_delivery_events (
    tenant_id, invoice_id, channel, event_type, recipient_snapshot,
    provider_reference, failure_reason, acknowledgment_note, recorded_by
  ) values (
    v_invoice.tenant_id, p_invoice_id, p_channel, p_event_type, v_recipient,
    p_provider_reference, p_failure_reason, p_acknowledgment_note, auth.uid()
  )
  returning * into v_result;

  insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (
    v_invoice.tenant_id, auth.uid(), 'invoice_delivery_event', v_result.id,
    'invoice_delivery.' || p_event_type::text, null, to_jsonb(v_result)
  );

  return v_result;
end;
$$;

revoke execute on function public.record_invoice_delivery_event(
  uuid, public.invoice_delivery_event_channel, public.invoice_delivery_event_type, text, text, text, text
) from public;
grant execute on function public.record_invoice_delivery_event(
  uuid, public.invoice_delivery_event_channel, public.invoice_delivery_event_type, text, text, text, text
) to authenticated;

-- =============================================================================
-- 5. RLS & Grants
-- =============================================================================
-- Same posture as invoices/invoice_evidence/invoice_evidence_versions (Gate
-- 4A Contract §7 precedent): read access restricted to owner+admin, no
-- INSERT/UPDATE/DELETE grant to `authenticated` at all — §4's RPC (SECURITY
-- DEFINER) is the only mutation path.

alter table public.invoice_delivery_events enable row level security;

revoke all on public.invoice_delivery_events from public;

create policy invoice_delivery_events_select_owner_admin
  on public.invoice_delivery_events for select
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]));

grant select on public.invoice_delivery_events to authenticated;
grant all on public.invoice_delivery_events to service_role;
