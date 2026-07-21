-- ADOP Phase 1 Gate 1L — Owner Control WhatsApp Notification Outbox
--
-- Minimal, reliable notification outbox for exactly one flow: admin submits
-- a cash import batch for review -> owner gets a WhatsApp text via n8n +
-- Fonnte -> owner opens an owner-only review link -> owner approves through
-- the EXISTING Gate 1J-C flow (approve_and_commit_cash_import_batch) -> a
-- confirmation WhatsApp text goes out. No second approval engine is built
-- here: this migration only widens the two existing RPCs
-- (mark_cash_import_batch_ready_for_review from 20260720000000_cash_import_
-- staging.sql, approve_and_commit_cash_import_batch from 20260720120000_
-- owner_approved_cash_import_commit.sql) via CREATE OR REPLACE to also
-- enqueue one outbox row each, in the SAME transaction as the state
-- transition they already perform. Reject/draft/staging never enqueue
-- anything — no new code path can create a notification.
--
-- Outbox design:
--   - notification_events is append-only from `authenticated`'s point of
--     view (no INSERT/UPDATE/DELETE grant to authenticated OR service_role
--     — every mutation goes through a SECURITY DEFINER RPC owned by the
--     migration role, which always has implicit rights on functions/tables
--     it owns regardless of GRANT, mirroring cash_import_batches' own
--     RPC-only-mutation posture).
--   - private.enqueue_notification_event does the actual INSERT, idempotent
--     via a unique (tenant_id, event_type, source_event_id) constraint —
--     source_event_id is the fresh cash_import_events.id the calling RPC
--     just inserted in the SAME statement, so a genuine duplicate call can
--     only occur if the RPC itself somehow ran twice for the same
--     underlying event (belt-and-suspenders; the state-transition trigger
--     already blocks the ordinary "double click" retry case by rejecting a
--     same-status update outright).
--   - claim_next_notification_event / complete_notification_event / fail_
--     notification_event are the ONLY way to move a row through pending ->
--     processing -> sent|failed. All three are service_role-only — n8n
--     never talks to Postgres directly; it calls ADOP's own secret-gated
--     /api/internal/notifications/* routes, which use the service-role
--     admin client. n8n can therefore claim/complete/fail a notification
--     but has no path to approve anything or touch financial tables.
--   - FOR UPDATE SKIP LOCKED in the claim query makes concurrent claims
--     tenant-safe and duplicate-safe without an application-level lock.
--   - Lease-based reclaim (processing rows past lease_expires_at become
--     claimable again) plus a bounded attempt_count/max_attempts pair gives
--     retry without infinite retry.
--
-- Does not edit 20260720000000_cash_import_staging.sql or 20260720120000_
-- owner_approved_cash_import_commit.sql on disk — both are extended here via
-- CREATE OR REPLACE FUNCTION, the same non-destructive technique every prior
-- gate in this schema already uses. No import/approval/ledger/rollback/
-- history rule changes — the two functions' existing bodies are reproduced
-- verbatim plus the new enqueue call at the very end, after their own
-- transition/commit logic already succeeded.

-- =============================================================================
-- 1. Enums
-- =============================================================================

create type public.notification_event_type as enum ('import_review_requested', 'import_approved');
create type public.notification_status as enum ('pending', 'processing', 'sent', 'failed');

-- =============================================================================
-- 2. Table
-- =============================================================================

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  event_type public.notification_event_type not null,
  channel text not null default 'whatsapp',
  subject_type text not null,
  subject_id uuid not null,
  -- The domain-event row (e.g. cash_import_events.id) this notification was
  -- raised from. Deliberately not an FK — the outbox is generic across
  -- future domains, not wired to cash_import_events specifically.
  source_event_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  status public.notification_status not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  claimed_by text,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_events_tenant_event_source_unique unique (tenant_id, event_type, source_event_id),
  constraint notification_events_attempt_count_nonnegative check (attempt_count >= 0),
  constraint notification_events_max_attempts_positive check (max_attempts > 0)
);

create index notification_events_claimable_idx
  on public.notification_events (created_at)
  where status = 'pending';

create index notification_events_processing_lease_idx
  on public.notification_events (lease_expires_at)
  where status = 'processing';

create index notification_events_tenant_id_idx on public.notification_events (tenant_id);

create trigger set_updated_at before update on public.notification_events
  for each row execute function private.set_updated_at();

-- Append-only guarantee, same technique as access_audit_events (20260719070115):
-- role-independent, fires regardless of any future grant drift.
create function private.block_notification_event_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'notification_events rows cannot be deleted';
end;
$$;

revoke execute on function private.block_notification_event_delete() from public;

create trigger notification_events_no_delete
  before delete on public.notification_events
  for each row execute function private.block_notification_event_delete();

-- =============================================================================
-- 3. RLS & grants — no direct table access for anyone; every read/write goes
--    through the RPCs below, all of which are SECURITY DEFINER and owned by
--    the migration role, so REVOKE ALL does not block the RPCs themselves.
-- =============================================================================

alter table public.notification_events enable row level security;

revoke all on public.notification_events from public, anon, authenticated, service_role;

-- =============================================================================
-- 4. private.enqueue_notification_event — idempotent insert, called only from
--    other SECURITY DEFINER RPCs that already proved tenant/role/row-lock
--    themselves. Not exposed via PostgREST regardless of grants (private is
--    not in api.schemas); no grant to authenticated is added on purpose.
-- =============================================================================

create function private.enqueue_notification_event(
  p_tenant_id uuid,
  p_event_type public.notification_event_type,
  p_subject_type text,
  p_subject_id uuid,
  p_source_event_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notification_events (
    tenant_id, event_type, subject_type, subject_id, source_event_id, payload
  ) values (
    p_tenant_id, p_event_type, p_subject_type, p_subject_id, p_source_event_id, p_payload
  )
  on conflict (tenant_id, event_type, source_event_id) do nothing;
end;
$$;

revoke execute on function private.enqueue_notification_event(
  uuid, public.notification_event_type, text, uuid, uuid, jsonb
) from public;

-- =============================================================================
-- 5. public.claim_next_notification_event — service_role only. Claims the
--    oldest pending row, or a processing row whose lease has expired
--    (stuck-worker recovery), skipping rows already locked by a concurrent
--    caller. Returns a NULL composite when nothing is claimable.
-- =============================================================================

create function public.claim_next_notification_event(
  p_worker_id text,
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
  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception 'worker id is required';
  end if;

  -- Clamp to a sane range so a misconfigured caller can neither hold a lease
  -- forever nor thrash with a near-zero lease.
  v_lease_seconds := least(greatest(coalesce(p_lease_seconds, 300), 30), 3600);

  with candidate as (
    select id
    from public.notification_events
    where status = 'pending'
       or (status = 'processing' and lease_expires_at < now())
    -- id as a secondary key makes FIFO order deterministic even when two
    -- rows share the same created_at (same-millisecond inserts, or — as in
    -- the pgTAP suite — the whole test running inside one transaction where
    -- now() is frozen) instead of falling back to unstable physical order.
    order by created_at asc, id asc
    for update skip locked
    limit 1
  )
  update public.notification_events e
  set
    status = 'processing',
    claimed_by = p_worker_id,
    claimed_at = now(),
    lease_expires_at = now() + make_interval(secs => v_lease_seconds),
    attempt_count = e.attempt_count + 1
  from candidate
  where e.id = candidate.id
  returning e.* into v_result;

  return v_result;
end;
$$;

revoke execute on function public.claim_next_notification_event(text, integer) from public;
grant execute on function public.claim_next_notification_event(text, integer) to service_role;

-- =============================================================================
-- 6. public.complete_notification_event — service_role only. Only the
--    worker that currently holds the claim can complete it; a reclaimed
--    (lease-expired) row that a slower worker tries to complete late is
--    rejected, not silently accepted.
-- =============================================================================

create function public.complete_notification_event(
  p_event_id uuid,
  p_worker_id text,
  p_provider_message_id text default null
)
returns public.notification_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result public.notification_events;
begin
  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception 'worker id is required';
  end if;

  update public.notification_events
  set
    status = 'sent',
    provider_message_id = p_provider_message_id,
    sent_at = now(),
    last_error = null
  where id = p_event_id
    and status = 'processing'
    and claimed_by = p_worker_id
  returning * into v_result;

  if v_result.id is null then
    raise exception 'NOTIFICATION_CLAIM_MISMATCH';
  end if;

  return v_result;
end;
$$;

revoke execute on function public.complete_notification_event(uuid, text, text) from public;
grant execute on function public.complete_notification_event(uuid, text, text) to service_role;

-- =============================================================================
-- 7. public.fail_notification_event — service_role only. Bounded retry:
--    below max_attempts it goes back to 'pending' (claimable again by
--    anyone once re-selected); at/above max_attempts it becomes terminal
--    'failed'. attempt_count is incremented once per claim (§5), not here.
-- =============================================================================

create function public.fail_notification_event(
  p_event_id uuid,
  p_worker_id text,
  p_error text
)
returns public.notification_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current public.notification_events;
  v_result public.notification_events;
begin
  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception 'worker id is required';
  end if;

  select * into v_current
  from public.notification_events
  where id = p_event_id
    and status = 'processing'
    and claimed_by = p_worker_id
  for update;

  if v_current.id is null then
    raise exception 'NOTIFICATION_CLAIM_MISMATCH';
  end if;

  if v_current.attempt_count >= v_current.max_attempts then
    update public.notification_events
    set status = 'failed', last_error = p_error
    where id = p_event_id
    returning * into v_result;
  else
    update public.notification_events
    set status = 'pending', last_error = p_error, claimed_by = null, claimed_at = null, lease_expires_at = null
    where id = p_event_id
    returning * into v_result;
  end if;

  return v_result;
end;
$$;

revoke execute on function public.fail_notification_event(uuid, text, text) from public;
grant execute on function public.fail_notification_event(uuid, text, text) to service_role;

-- =============================================================================
-- 8. Wire the outbox into the two existing flows — CREATE OR REPLACE, bodies
--    otherwise byte-for-byte identical to their originals.
-- =============================================================================

-- --- 8a. mark_cash_import_batch_ready_for_review -----------------------------
-- Original: 20260720000000_cash_import_staging.sql §5e. Adds v_event_id (the
-- cash_import_events row this call itself inserts) and one enqueue call at
-- the end — every precondition check above is untouched.
create or replace function public.mark_cash_import_batch_ready_for_review(p_batch_id uuid)
returns public.cash_import_batches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_status public.cash_import_batch_status;
  v_error_count integer;
  v_calculated_closing numeric(16, 2);
  v_workbook_closing numeric(16, 2);
  v_result public.cash_import_batches;
  v_event_id uuid;
begin
  select tenant_id, status, error_count, calculated_closing_balance, workbook_closing_balance
    into v_tenant_id, v_status, v_error_count, v_calculated_closing, v_workbook_closing
  from public.cash_import_batches
  where id = p_batch_id
  for update;

  if v_tenant_id is null then
    raise exception 'cash import batch not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['admin']::public.tenant_role[]) then
    raise exception 'not authorized to prepare cash import batch for review';
  end if;

  if v_status not in ('draft', 'mapping_required') then
    raise exception 'BATCH_NOT_ELIGIBLE_FOR_REVIEW';
  end if;

  if v_error_count > 0 then
    raise exception 'VALIDATION_ERRORS_PRESENT';
  end if;

  if v_workbook_closing is null or v_workbook_closing <> v_calculated_closing then
    raise exception 'RECONCILIATION_VARIANCE';
  end if;

  if exists (
    select 1 from public.cash_import_rows
    where batch_id = p_batch_id
      and provisional_classification <> 'opening_cash'
      and (
        mapping_kind is null
        or (mapping_kind = 'existing_vessel_project' and mapped_vessel_project_id is null)
      )
  ) then
    raise exception 'MAPPING_INCOMPLETE';
  end if;

  if exists (
    select 1 from public.cash_import_rows
    where batch_id = p_batch_id
      and provisional_classification <> 'opening_cash'
      and disposition is null
  ) then
    raise exception 'DISPOSITION_INCOMPLETE';
  end if;

  update public.cash_import_batches
  set status = 'ready_for_review'
  where id = p_batch_id
  returning * into v_result;

  insert into public.cash_import_events (tenant_id, batch_id, event_type, actor_user_id, event_payload)
  values (v_tenant_id, p_batch_id, 'ready_for_review', auth.uid(), '{}'::jsonb)
  returning id into v_event_id;

  -- Gate 1L: notify the owner a batch is waiting. Idempotent per (tenant,
  -- event_type, this cash_import_events row) — see private.enqueue_
  -- notification_event. The review link carries only the batch id, never a
  -- token or tenant id; /owner/review/cash-import/[batchId] re-verifies
  -- session, tenant and Owner role itself before ever redirecting anywhere.
  perform private.enqueue_notification_event(
    v_tenant_id,
    'import_review_requested',
    'cash_import_batch',
    p_batch_id,
    v_event_id,
    jsonb_build_object(
      'message_line1', 'Pak Hanafi, ada hasil import kas yang menunggu pemeriksaan.',
      'link_path', '/owner/review/cash-import/' || p_batch_id::text
    )
  );

  return v_result;
end;
$$;

-- Grants unchanged from the original migration (CREATE OR REPLACE FUNCTION
-- keeps existing grants) — revoke/grant is not re-issued here.

-- --- 8b. approve_and_commit_cash_import_batch --------------------------------
-- Original: 20260720120000_owner_approved_cash_import_commit.sql §6b. Adds
-- v_event_id (the cash_import_events row this call itself inserts) and one
-- enqueue call at the very end, after the commit has already succeeded —
-- every canonical-posting rule above is untouched.
create or replace function public.approve_and_commit_cash_import_batch(
  p_batch_id uuid
)
returns public.cash_import_batches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.cash_import_batches;
  v_pool public.cash_pools;
  v_existing_financial_count integer;
  v_opening_row_id uuid;
  v_row record;
  v_description text;
  v_canonical_opening numeric(16, 2) := 0;
  v_canonical_cash_top_up numeric(16, 2) := 0;
  v_canonical_project_refund numeric(16, 2) := 0;
  v_canonical_project_expense numeric(16, 2) := 0;
  v_canonical_shared_overhead numeric(16, 2) := 0;
  v_result public.cash_import_batches;
  v_event_id uuid;
begin
  select * into v_batch from public.cash_import_batches where id = p_batch_id for update;

  if v_batch.id is null then
    raise exception 'cash import batch not found';
  end if;

  if not private.current_user_has_tenant_role(v_batch.tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'not authorized to approve cash import batch';
  end if;

  if v_batch.status = 'committed' then
    raise exception 'BATCH_ALREADY_COMMITTED';
  end if;

  if v_batch.status <> 'ready_for_review' then
    raise exception 'BATCH_NOT_READY_FOR_REVIEW';
  end if;

  -- Revalidation (defense in depth) — mirrors mark_cash_import_batch_ready_
  -- for_review's own checks exactly.
  if v_batch.error_count > 0 then
    raise exception 'VALIDATION_ERRORS_PRESENT';
  end if;

  if v_batch.workbook_closing_balance is null or v_batch.workbook_closing_balance <> v_batch.calculated_closing_balance then
    raise exception 'RECONCILIATION_VARIANCE';
  end if;

  if exists (
    select 1 from public.cash_import_rows
    where batch_id = p_batch_id
      and provisional_classification <> 'opening_cash'
      and (
        mapping_kind is null
        or (mapping_kind = 'existing_vessel_project' and mapped_vessel_project_id is null)
      )
  ) then
    raise exception 'MAPPING_INCOMPLETE';
  end if;

  if exists (
    select 1 from public.cash_import_rows
    where batch_id = p_batch_id
      and provisional_classification <> 'opening_cash'
      and disposition is null
  ) then
    raise exception 'DISPOSITION_INCOMPLETE';
  end if;

  -- Additional gates unique to the commit step.
  if exists (
    select 1 from public.cash_import_rows
    where batch_id = p_batch_id and disposition = 'manual_review'
  ) then
    raise exception 'MANUAL_REVIEW_UNRESOLVED';
  end if;

  if exists (
    select 1 from public.cash_import_rows
    where batch_id = p_batch_id
      and disposition = 'include'
      and mapping_kind in ('new_project_candidate', 'unresolved')
  ) then
    raise exception 'MAPPING_NOT_COMMITTABLE';
  end if;

  -- Pool for this batch's business date — owner is within
  -- get_or_create_daily_cash_pool's own ['owner','admin'] role check, and
  -- the batch-row lock above already proved the caller is an owner of this
  -- exact tenant.
  v_pool := public.get_or_create_daily_cash_pool(v_batch.tenant_id, v_batch.business_date);

  -- Re-select with a row lock: get_or_create's own ON CONFLICT DO NOTHING
  -- only takes a lock on the brand-new-insert path — the "pool already
  -- existed" branch returns an unlocked snapshot. Locking here (BEFORE the
  -- financial-entry-count read below) is what actually serializes two
  -- concurrent commits targeting the same pool.
  select * into v_pool from public.cash_pools where id = v_pool.id for update;

  if v_pool.daily_close_status <> 'open' then
    raise exception 'CASH_POOL_NOT_OPEN';
  end if;

  select count(*) into v_existing_financial_count
  from (
    select 1 from public.cash_pool_entries where pool_id = v_pool.id
    union all
    select 1 from public.project_cost_ledger_entries where pool_id = v_pool.id
  ) x;

  if v_existing_financial_count > 0 then
    raise exception 'OPENING_BALANCE_CONFLICT';
  end if;

  -- A. Opening balance — posted once, from the batch header (the synthetic
  -- opening_cash row itself carries no debit/credit; it exists for
  -- provenance linkage only). Zero opening balance posts no entry (amount
  -- must be > 0 per cash_pool_entries' own check constraint) — the pool
  -- simply opens at zero, which is a legitimate value, not an error.
  select id into v_opening_row_id
  from public.cash_import_rows
  where batch_id = p_batch_id and provisional_classification = 'opening_cash'
  limit 1;

  if v_batch.opening_balance > 0 then
    insert into public.cash_pool_entries (
      tenant_id, pool_id, entry_type, entry_kind, amount, description,
      import_batch_id, import_row_id, created_by
    ) values (
      v_batch.tenant_id, v_pool.id, 'opening_cash', 'entry', v_batch.opening_balance,
      'Saldo awal — import ' || v_batch.source_filename, v_batch.id, v_opening_row_id, auth.uid()
    );
    v_canonical_opening := v_batch.opening_balance;
  end if;

  -- B-E. Every included, non-opening row, in source order — one canonical
  -- posting (or, for a refund, one paired posting) per row.
  for v_row in
    select * from public.cash_import_rows
    where batch_id = p_batch_id
      and provisional_classification <> 'opening_cash'
      and disposition = 'include'
    order by source_row_number
  loop
    v_description := coalesce(
      nullif(btrim(v_row.description), ''),
      'Import baris ' || v_row.source_row_number || ' — ' || to_char(v_batch.business_date, 'YYYY-MM-DD')
    );

    if v_row.mapping_kind = 'cash' then
      -- B. Cash top-up.
      if coalesce(v_row.debit, 0) <= 0 or coalesce(v_row.credit, 0) > 0 then
        raise exception 'UNEXPECTED_ROW_DIRECTION';
      end if;

      insert into public.cash_pool_entries (
        tenant_id, pool_id, entry_type, entry_kind, amount, description,
        import_batch_id, import_row_id, created_by
      ) values (
        v_batch.tenant_id, v_pool.id, 'cash_top_up', 'entry', v_row.debit, v_description,
        v_batch.id, v_row.id, auth.uid()
      );
      v_canonical_cash_top_up := v_canonical_cash_top_up + v_row.debit;

    elsif v_row.mapping_kind = 'shared_overhead' then
      -- D. Shared overhead.
      if coalesce(v_row.credit, 0) <= 0 or coalesce(v_row.debit, 0) > 0 then
        raise exception 'UNEXPECTED_ROW_DIRECTION';
      end if;

      insert into public.project_cost_ledger_entries (
        tenant_id, pool_id, project_id, category_id, vendor_id, entry_kind, entry_scope,
        amount, description, reference_number, import_batch_id, import_row_id, actor_user_id
      ) values (
        v_batch.tenant_id, v_pool.id, null, null, null, 'expense', 'shared_overhead',
        v_row.credit, v_description, null, v_batch.id, v_row.id, auth.uid()
      );
      v_canonical_shared_overhead := v_canonical_shared_overhead + v_row.credit;

    elsif v_row.mapping_kind = 'existing_vessel_project' then
      if coalesce(v_row.debit, 0) > 0 and coalesce(v_row.credit, 0) <= 0 then
        -- E. Project refund — paired atomic posting, same import_row_id on
        -- both sides.
        insert into public.cash_pool_entries (
          tenant_id, pool_id, entry_type, entry_kind, amount, description,
          import_batch_id, import_row_id, created_by
        ) values (
          v_batch.tenant_id, v_pool.id, 'project_refund', 'entry', v_row.debit, v_description,
          v_batch.id, v_row.id, auth.uid()
        );

        insert into public.project_cost_ledger_entries (
          tenant_id, pool_id, project_id, category_id, vendor_id, entry_kind, entry_scope,
          amount, description, reference_number, import_batch_id, import_row_id, actor_user_id
        ) values (
          v_batch.tenant_id, v_pool.id, v_row.mapped_vessel_project_id, null, null, 'refund', 'project',
          v_row.debit, v_description, null, v_batch.id, v_row.id, auth.uid()
        );
        v_canonical_project_refund := v_canonical_project_refund + v_row.debit;

      elsif coalesce(v_row.credit, 0) > 0 and coalesce(v_row.debit, 0) <= 0 then
        -- C. Project expense.
        insert into public.project_cost_ledger_entries (
          tenant_id, pool_id, project_id, category_id, vendor_id, entry_kind, entry_scope,
          amount, description, reference_number, import_batch_id, import_row_id, actor_user_id
        ) values (
          v_batch.tenant_id, v_pool.id, v_row.mapped_vessel_project_id, null, null, 'expense', 'project',
          v_row.credit, v_description, null, v_batch.id, v_row.id, auth.uid()
        );
        v_canonical_project_expense := v_canonical_project_expense + v_row.credit;
      else
        raise exception 'INVALID_ROW_AMOUNT';
      end if;

    else
      -- mapping_kind is 'new_project_candidate' or 'unresolved' — already
      -- blocked above; this branch exists only as a defensive backstop.
      raise exception 'MAPPING_NOT_COMMITTABLE';
    end if;
  end loop;

  update public.cash_import_batches
  set
    status = 'committed',
    committed_at = now(),
    committed_by = auth.uid(),
    canonical_opening_cash = v_canonical_opening,
    canonical_cash_top_up_total = v_canonical_cash_top_up,
    canonical_project_refund_total = v_canonical_project_refund,
    canonical_project_expense_total = v_canonical_project_expense,
    canonical_shared_overhead_total = v_canonical_shared_overhead,
    canonical_closing_cash = v_canonical_opening + v_canonical_cash_top_up + v_canonical_project_refund
      - v_canonical_project_expense - v_canonical_shared_overhead
  where id = p_batch_id
  returning * into v_result;

  insert into public.cash_import_events (tenant_id, batch_id, event_type, actor_user_id, event_payload)
  values (
    v_batch.tenant_id, p_batch_id, 'owner_approved_and_committed', auth.uid(),
    jsonb_build_object(
      'pool_id', v_pool.id,
      'canonical_opening_cash', v_canonical_opening,
      'canonical_cash_top_up_total', v_canonical_cash_top_up,
      'canonical_project_refund_total', v_canonical_project_refund,
      'canonical_project_expense_total', v_canonical_project_expense,
      'canonical_shared_overhead_total', v_canonical_shared_overhead,
      'canonical_closing_cash', v_result.canonical_closing_cash
    )
  )
  returning id into v_event_id;

  -- Gate 1L: confirm to the owner that the import is now recorded. No
  -- amount is included in the WhatsApp text itself (task LOCK: never
  -- fabricate/echo a number into the message) — the confirmation is a
  -- fixed sentence; the actual canonical totals remain queryable in ADOP
  -- only, from this same committed batch row.
  perform private.enqueue_notification_event(
    v_batch.tenant_id,
    'import_approved',
    'cash_import_batch',
    p_batch_id,
    v_event_id,
    jsonb_build_object(
      'message_line1', 'Pak Hanafi, hasil import telah disetujui dan berhasil dicatat di ADOP.'
    )
  );

  return v_result;
end;
$$;

-- Grants unchanged from the original migration (CREATE OR REPLACE FUNCTION
-- keeps existing grants) — revoke/grant is not re-issued here.
