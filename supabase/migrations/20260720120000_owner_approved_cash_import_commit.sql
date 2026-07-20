-- ADOP Phase 1 Gate 1J-C — Owner-Approved Canonical Cash Import Commit
--
-- Turns a 'ready_for_review' cash import batch (Gate 1J-B) into real
-- operational transactions through one owner-only, single-transaction RPC.
-- Reuses the EXISTING trusted ledgers rather than building a parallel one:
--   - cash_pools / cash_pool_entries (Gate 1C) for opening_cash, cash_top_up,
--     and the new project_refund cash-in entry type;
--   - project_cost_ledger_entries (Gate 1D) for project expense AND the new
--     scope='shared_overhead' expense AND the new entry_kind='refund'.
-- Both tables grow a nullable (import_batch_id, import_row_id) provenance
-- pair — paired-non-null (never one without the other), tenant-safe
-- composite FK, and unique per table when set — so an import row can post at
-- most once per table, and a project-refund row's two postings (cash-in +
-- cost reduction) carry the SAME import_row_id, proven paired at commit time
-- by construction (one INSERT statement pair per row, same transaction).
--
-- Locked design decisions this migration encodes (see task LOCK):
--   - shared_overhead: entry_scope='shared_overhead', project_id NULL,
--     entry_kind='expense' — reduces the cash pool, is never a vessel
--     project's cost (excluded from vessel_project_cost_summary by
--     construction — project_id never matches any vessel_projects.id), and
--     still counts toward cash_pool_daily_summary.total_cash_out (that view
--     already sums every entry_kind='expense' row regardless of scope).
--   - project_cash_in_or_refund: treated as a project cost REFUND —
--     cash-in (cash_pool_entries.entry_type='project_refund') paired
--     atomically with a project cost reduction
--     (project_cost_ledger_entries.entry_kind='refund', positive amount,
--     subtracted from vessel_project_cost_summary — never a bare negative
--     amount masquerading as an expense).
--   - Opening balance can only be posted into a pool that has zero prior
--     financial entries (cash_pool_entries OR project_cost_ledger_entries) —
--     checked, locked, fail-closed — before anything else is posted.
--
-- Does not edit 20260719070115_foundation_tenant_isolation.sql,
-- 20260719080000_master_data.sql, 20260719100000_vessel_project_
-- lifecycle.sql, or 20260720000000_cash_import_staging.sql on disk.
-- 20260719110000_shared_daily_cash_pool.sql, 20260719120000_project_cost_
-- ledger.sql, and 20260720000000_cash_import_staging.sql ARE touched via
-- ALTER TABLE / CREATE OR REPLACE, the same non-destructive extension
-- technique every prior gate in this schema already uses:
--   - cash_pool_entry_type gains 'project_refund' (ALTER TYPE ADD VALUE).
--   - project_cost_ledger_entry_kind gains 'refund' (ALTER TYPE ADD VALUE).
--   - project_cost_ledger_entries.project_id/category_id become nullable
--     (an import-sourced expense/overhead carries no expense_categories
--     value — the source workbook has no category column; this is an
--     explicit, documented scope decision, not silent data loss: every
--     OTHER caller of record_project_expense/approve_expense_submission
--     still always supplies category_id, so this only widens what the
--     column PERMITS, it never weakens an existing write path).
--   - private.enforce_cash_import_batch_status_transition (Gate 1J-B) gains
--     the ready_for_review -> committed arm.
--   - public.set_cash_import_label_mapping / public.set_cash_import_row_
--     disposition (Gate 1J-B) gain a committed-batch immutability guard.
--   - public.vessel_project_cost_summary / public.cash_pool_daily_summary
--     (Gate 1D) are extended to account for refunds / project_refund cash-in
--     — same technique Gate 1D itself used on Gate 1C's view.

-- =============================================================================
-- 1. New enum values — each ADD VALUE is its own top-level statement (no
--    explicit BEGIN in this file, so each autocommits independently); the
--    explicit commit; below is the same defensive belt-and-suspenders Gate
--    1G.1 used for expense_submission_status's 'cancelled' value, in case
--    any tooling wraps this file in one transaction.
-- =============================================================================

alter type public.cash_import_batch_status add value 'committed';
commit;

alter type public.cash_pool_entry_type add value 'project_refund';
commit;

alter type public.project_cost_ledger_entry_kind add value 'refund';
commit;

-- =============================================================================
-- 2. project_cost_ledger_entries — nullable project_id/category_id, entry
--    scope, import provenance
-- =============================================================================

alter table public.project_cost_ledger_entries
  alter column project_id drop not null,
  alter column category_id drop not null;

create type public.project_cost_ledger_entry_scope as enum ('project', 'shared_overhead');

alter table public.project_cost_ledger_entries
  add column entry_scope public.project_cost_ledger_entry_scope not null default 'project';

alter table public.project_cost_ledger_entries
  add constraint project_cost_ledger_entries_scope_matches_project check (
    (entry_scope = 'project' and project_id is not null)
    or (entry_scope = 'shared_overhead' and project_id is null)
  );

-- 'refund' rows carry no reverses_entry_id (they are not a reversal of a
-- prior entry — they are their own first-class cost adjustment) — widen the
-- Gate 1D reversal-shape constraint to admit them alongside 'expense'.
alter table public.project_cost_ledger_entries
  drop constraint project_cost_ledger_entries_reversal_shape;

alter table public.project_cost_ledger_entries
  add constraint project_cost_ledger_entries_reversal_shape check (
    (entry_kind in ('expense', 'refund') and reverses_entry_id is null)
    or (entry_kind = 'reversal' and reverses_entry_id is not null)
  );

alter table public.project_cost_ledger_entries
  add column import_batch_id uuid,
  add column import_row_id uuid;

-- Tenant-safe composite FK target — cash_import_rows did not previously need
-- one (nothing referenced it).
alter table public.cash_import_rows
  add constraint cash_import_rows_id_tenant_id_key unique (id, tenant_id);

alter table public.project_cost_ledger_entries
  add constraint project_cost_ledger_entries_import_batch_id_fkey
    foreign key (import_batch_id, tenant_id) references public.cash_import_batches (id, tenant_id),
  add constraint project_cost_ledger_entries_import_row_id_fkey
    foreign key (import_row_id, tenant_id) references public.cash_import_rows (id, tenant_id),
  -- Paired-non-null: canonical provenance can never be half-set — a row
  -- either carries no import provenance at all, or carries both fields.
  add constraint project_cost_ledger_entries_import_provenance_paired check (
    (import_batch_id is null) = (import_row_id is null)
  );

-- One posting per import row, PER TABLE — a project refund's cash-in
-- (cash_pool_entries) and cost-reduction (this table) postings legitimately
-- share one import_row_id across the two tables; this index only prevents a
-- second posting into THIS table for the same row.
create unique index project_cost_ledger_entries_import_row_id_unique
  on public.project_cost_ledger_entries (import_row_id)
  where import_row_id is not null;

create index project_cost_ledger_entries_import_batch_id_idx
  on public.project_cost_ledger_entries (tenant_id, import_batch_id)
  where import_batch_id is not null;

-- =============================================================================
-- 3. cash_pool_entries — import provenance
-- =============================================================================

alter table public.cash_pool_entries
  add column import_batch_id uuid,
  add column import_row_id uuid;

alter table public.cash_pool_entries
  add constraint cash_pool_entries_import_batch_id_fkey
    foreign key (import_batch_id, tenant_id) references public.cash_import_batches (id, tenant_id),
  add constraint cash_pool_entries_import_row_id_fkey
    foreign key (import_row_id, tenant_id) references public.cash_import_rows (id, tenant_id),
  add constraint cash_pool_entries_import_provenance_paired check (
    (import_batch_id is null) = (import_row_id is null)
  );

create unique index cash_pool_entries_import_row_id_unique
  on public.cash_pool_entries (import_row_id)
  where import_row_id is not null;

create index cash_pool_entries_import_batch_id_idx
  on public.cash_pool_entries (tenant_id, import_batch_id)
  where import_batch_id is not null;

-- =============================================================================
-- 4. cash_import_batches — committed-state + canonical totals snapshot
-- =============================================================================
-- Populated exactly once, by approve_and_commit_cash_import_batch (§6b) —
-- never client-suppliable, matching every other server-computed snapshot in
-- this schema (e.g. expense_submissions.submitted_* from Gate 1G).

alter table public.cash_import_batches
  add column committed_at timestamptz,
  add column committed_by uuid references auth.users (id) on delete set null,
  add column canonical_opening_cash numeric(16, 2),
  add column canonical_cash_top_up_total numeric(16, 2),
  add column canonical_project_refund_total numeric(16, 2),
  add column canonical_project_expense_total numeric(16, 2),
  add column canonical_shared_overhead_total numeric(16, 2),
  add column canonical_closing_cash numeric(16, 2);

-- =============================================================================
-- 5. Status transition + immutability
-- =============================================================================

-- --- 5a. Transition guard: add ready_for_review -> committed -----------------
-- Identical body to the Gate 1J-B original plus one new arm; `create or
-- replace function` — that migration file itself is not edited. 'committed'
-- remains terminal: no arm below ever transitions out of it.
create or replace function private.enforce_cash_import_batch_status_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = old.status then
    raise exception 'cash import batch status unchanged: already %', old.status;
  end if;

  if not (
    (old.status = 'draft' and new.status = 'mapping_required')
    or (old.status = 'mapping_required' and new.status = 'ready_for_review')
    or (old.status = 'ready_for_review' and new.status = 'mapping_required')
    or (old.status = 'ready_for_review' and new.status = 'committed')
  ) then
    raise exception 'invalid cash import batch status transition from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;

-- --- 5b. cash_import_events — widen event_type + reason-required for
--     owner_rejected -------------------------------------------------------
alter table public.cash_import_events
  drop constraint cash_import_events_event_type_check;

alter table public.cash_import_events
  add constraint cash_import_events_event_type_check check (
    event_type in (
      'batch_created', 'batch_reopened', 'label_mapping_set', 'row_disposition_set',
      'ready_for_review', 'owner_approved_and_committed', 'owner_rejected'
    )
  );

alter table public.cash_import_events
  add constraint cash_import_events_owner_rejected_reason_required check (
    event_type <> 'owner_rejected'
    or ((event_payload ->> 'reason') is not null and btrim(event_payload ->> 'reason') <> '')
  );

-- --- 5c. set_cash_import_label_mapping — committed-batch immutability -------
-- Identical body to the Gate 1J-B original except the batch status is now
-- selected too (still `for update` locked) and checked before any row
-- mutation; `create or replace function` — that migration file itself is not
-- edited.
create or replace function public.set_cash_import_label_mapping(
  p_batch_id uuid,
  p_vessel_label text,
  p_mapping_kind public.cash_import_mapping_kind,
  p_mapped_vessel_project_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_batch_status public.cash_import_batch_status;
  v_project_tenant_id uuid;
  v_affected integer;
begin
  select tenant_id, status into v_tenant_id, v_batch_status
  from public.cash_import_batches
  where id = p_batch_id
  for update;

  if v_tenant_id is null then
    raise exception 'cash import batch not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['admin']::public.tenant_role[]) then
    raise exception 'not authorized to edit cash import batch mapping';
  end if;

  if v_batch_status = 'committed' then
    raise exception 'BATCH_COMMITTED_IMMUTABLE';
  end if;

  if p_mapping_kind = 'existing_vessel_project' then
    if p_mapped_vessel_project_id is null then
      raise exception 'MAPPING_PROJECT_REQUIRED';
    end if;

    select tenant_id into v_project_tenant_id
    from public.vessel_projects
    where id = p_mapped_vessel_project_id;

    if v_project_tenant_id is null or v_project_tenant_id <> v_tenant_id then
      raise exception 'CROSS_TENANT_PROJECT_MAPPING_REJECTED';
    end if;
  end if;

  update public.cash_import_rows
  set
    mapping_kind = p_mapping_kind,
    mapped_vessel_project_id = case when p_mapping_kind = 'existing_vessel_project' then p_mapped_vessel_project_id else null end
  where batch_id = p_batch_id
    and vessel_label is not distinct from p_vessel_label
    and provisional_classification <> 'opening_cash';

  get diagnostics v_affected = row_count;

  insert into public.cash_import_events (tenant_id, batch_id, event_type, actor_user_id, event_payload)
  values (
    v_tenant_id, p_batch_id, 'label_mapping_set', auth.uid(),
    jsonb_build_object(
      'vessel_label', p_vessel_label,
      'mapping_kind', p_mapping_kind,
      'mapped_vessel_project_id', p_mapped_vessel_project_id,
      'affected_row_count', v_affected
    )
  );

  perform private.touch_cash_import_batch_after_edit(p_batch_id);

  return v_affected;
end;
$$;

-- --- 5d. set_cash_import_row_disposition — committed-batch immutability ----
-- Identical body to the Gate 1J-B original except the owning batch's status
-- is now also locked and checked; `create or replace function` — that
-- migration file itself is not edited.
create or replace function public.set_cash_import_row_disposition(
  p_row_id uuid,
  p_disposition public.cash_import_row_disposition,
  p_disposition_reason text default null
)
returns public.cash_import_rows
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_batch_id uuid;
  v_status public.cash_import_row_status;
  v_classification public.cash_import_provisional_classification;
  v_batch_status public.cash_import_batch_status;
  v_result public.cash_import_rows;
begin
  select tenant_id, batch_id, status, provisional_classification
    into v_tenant_id, v_batch_id, v_status, v_classification
  from public.cash_import_rows
  where id = p_row_id
  for update;

  if v_tenant_id is null then
    raise exception 'cash import row not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['admin']::public.tenant_role[]) then
    raise exception 'not authorized to edit cash import row disposition';
  end if;

  select status into v_batch_status from public.cash_import_batches where id = v_batch_id for update;

  if v_batch_status = 'committed' then
    raise exception 'BATCH_COMMITTED_IMMUTABLE';
  end if;

  if v_classification = 'opening_cash' then
    raise exception 'opening balance row does not accept a disposition';
  end if;

  if v_status = 'error' and p_disposition = 'include' then
    raise exception 'ERROR_ROW_CANNOT_INCLUDE';
  end if;

  if p_disposition = 'skip' and (p_disposition_reason is null or btrim(p_disposition_reason) = '') then
    raise exception 'SKIP_REASON_REQUIRED';
  end if;

  update public.cash_import_rows
  set disposition = p_disposition, disposition_reason = p_disposition_reason
  where id = p_row_id
  returning * into v_result;

  insert into public.cash_import_events (tenant_id, batch_id, event_type, actor_user_id, event_payload)
  values (
    v_tenant_id, v_batch_id, 'row_disposition_set', auth.uid(),
    jsonb_build_object('row_id', p_row_id, 'disposition', p_disposition, 'disposition_reason', p_disposition_reason)
  );

  perform private.touch_cash_import_batch_after_edit(v_batch_id);

  return v_result;
end;
$$;

-- =============================================================================
-- 6. RPCs — owner-approved atomic canonical commit
-- =============================================================================

-- --- 6a. reject_cash_import_batch --------------------------------------------
-- Owner-only, only from 'ready_for_review'. Returns the batch to
-- 'mapping_required' (an arm the Gate 1J-B transition trigger already
-- allows) — admin can then revise mapping/disposition and re-submit for
-- review. No canonical mutation of any kind. Reason required — enforced both
-- here and, defensively, by cash_import_events_owner_rejected_reason_
-- required (§5b) at the table level.
create function public.reject_cash_import_batch(
  p_batch_id uuid,
  p_reason text
)
returns public.cash_import_batches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_status public.cash_import_batch_status;
  v_result public.cash_import_batches;
begin
  select tenant_id, status into v_tenant_id, v_status
  from public.cash_import_batches
  where id = p_batch_id
  for update;

  if v_tenant_id is null then
    raise exception 'cash import batch not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'not authorized to reject cash import batch';
  end if;

  if v_status <> 'ready_for_review' then
    raise exception 'BATCH_NOT_READY_FOR_REVIEW';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'rejection reason is required';
  end if;

  update public.cash_import_batches
  set status = 'mapping_required'
  where id = p_batch_id
  returning * into v_result;

  insert into public.cash_import_events (tenant_id, batch_id, event_type, actor_user_id, event_payload)
  values (v_tenant_id, p_batch_id, 'owner_rejected', auth.uid(), jsonb_build_object('reason', p_reason));

  return v_result;
end;
$$;

revoke execute on function public.reject_cash_import_batch(uuid, text) from public;
grant execute on function public.reject_cash_import_batch(uuid, text) to authenticated;

-- --- 6b. approve_and_commit_cash_import_batch --------------------------------
-- Owner-only, single-transaction, single-invocation canonical commit — the
-- only path from 'ready_for_review' to 'committed'.
--
-- Locking order: this batch row, then (after get_or_create_daily_cash_pool)
-- the pool row — the SAME header-then-pool order submit_expense/submit_cash_
-- reconciliation/approve_cash_reconciliation (Gate 1G/1G.1) already use, so
-- no new deadlock ordering is introduced. A concurrent second approval call
-- on the SAME batch blocks on the batch lock until the first commits, then
-- sees status already 'committed' and raises deterministically — no second
-- posting is possible. A concurrent commit of a DIFFERENT batch for the same
-- tenant/business_date blocks on the pool lock (get_or_create_daily_cash_
-- pool's own INSERT ... ON CONFLICT for a brand-new pool, or this function's
-- own `for update` re-select for an existing one) and then fails the
-- opening-balance-conflict check below — fail-closed, exactly per LOCK.
--
-- Every check mark_cash_import_batch_ready_for_review already performed is
-- re-verified here against current server state (defense in depth — the
-- batch could not have drifted since status is still 'ready_for_review' and
-- every mutating RPC folds status back to 'mapping_required' on edit, but
-- this function does not trust that invariant blindly), plus two additional
-- gates mark_ready never needed: no row may still carry disposition =
-- 'manual_review' (an unresolved duplicate decision), and no included row's
-- mapping_kind may be 'new_project_candidate' or 'unresolved' — Gate 1J-C is
-- explicitly out-of-scope for auto-creating a project from a label, so there
-- is no valid posting target for either.
create function public.approve_and_commit_cash_import_batch(
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
  );

  return v_result;
end;
$$;

revoke execute on function public.approve_and_commit_cash_import_batch(uuid) from public;
grant execute on function public.approve_and_commit_cash_import_batch(uuid) to authenticated;

-- =============================================================================
-- 7. Read models
-- =============================================================================

-- --- 7a. vessel_project_cost_summary — subtract refunds ----------------------
-- Same column signature as the Gate 1D original (project_id, tenant_id,
-- total_cost) — CREATE OR REPLACE VIEW permits changing the query as long as
-- the output column list is unchanged. Shared-overhead rows are excluded by
-- construction: their project_id is always null, so they never match any
-- vp.id in the join, with no extra filter needed.
create or replace view public.vessel_project_cost_summary
with (security_invoker = true) as
select
  vp.id as project_id,
  vp.tenant_id,
  (
    coalesce(sum(c.amount) filter (
      where c.entry_kind = 'expense'
        and not exists (select 1 from public.project_cost_ledger_entries r where r.reverses_entry_id = c.id)
    ), 0)
    - coalesce(sum(c.amount) filter (where c.entry_kind = 'refund'), 0)
  )::numeric(16, 2) as total_cost
from public.vessel_projects vp
left join public.project_cost_ledger_entries c
  on c.project_id = vp.id
group by vp.id, vp.tenant_id;

grant select on public.vessel_project_cost_summary to authenticated;
grant select on public.vessel_project_cost_summary to service_role;

-- --- 7b. cash_pool_daily_summary — add project_refund_in ---------------------
-- The first 9 output columns are byte-for-byte identical in name/order/type
-- to the Gate 1D version (CREATE OR REPLACE VIEW forbids reordering existing
-- columns, only appending) — project_refund_in is appended at the end.
-- total_cash_out is UNCHANGED here (still sums every entry_kind='expense'
-- row regardless of scope, so shared-overhead expense already flows through
-- without modification); closing_cash now also adds project_refund_in.
create or replace view public.cash_pool_daily_summary
with (security_invoker = true) as
select
  p.id as pool_id,
  p.tenant_id,
  p.business_date,
  p.created_at,
  coalesce(sum(e.amount) filter (where e.entry_type = 'opening_cash'), 0)::numeric(16, 2) as opening_cash,
  coalesce(sum(e.amount) filter (where e.entry_type = 'cash_top_up'), 0)::numeric(16, 2) as cash_top_up,
  coalesce(sum(e.amount) filter (where e.entry_type = 'other_cash_in'), 0)::numeric(16, 2) as other_cash_in,
  coalesce(pce.total_cash_out, 0)::numeric(16, 2) as total_cash_out,
  (
    coalesce(sum(e.amount) filter (where e.entry_type = 'opening_cash'), 0)
    + coalesce(sum(e.amount) filter (where e.entry_type = 'cash_top_up'), 0)
    + coalesce(sum(e.amount) filter (where e.entry_type = 'other_cash_in'), 0)
    + coalesce(sum(e.amount) filter (where e.entry_type = 'project_refund'), 0)
    - coalesce(pce.total_cash_out, 0)
  )::numeric(16, 2) as closing_cash,
  coalesce(sum(e.amount) filter (where e.entry_type = 'project_refund'), 0)::numeric(16, 2) as project_refund_in
from public.cash_pools p
left join public.cash_pool_entries e
  on e.pool_id = p.id
  and e.entry_kind = 'entry'
  and not exists (
    select 1 from public.cash_pool_entries r where r.reverses_entry_id = e.id
  )
left join lateral (
  select sum(c.amount) as total_cash_out
  from public.project_cost_ledger_entries c
  where c.pool_id = p.id
    and c.entry_kind = 'expense'
    and not exists (
      select 1 from public.project_cost_ledger_entries r where r.reverses_entry_id = c.id
    )
) pce on true
group by p.id, p.tenant_id, p.business_date, p.created_at, pce.total_cash_out;

grant select on public.cash_pool_daily_summary to authenticated;
grant select on public.cash_pool_daily_summary to service_role;

-- --- 7c. shared_overhead_ledger_current --------------------------------------
-- Tenant-safe read model for the canonical shared-overhead ledger — every
-- posted shared-overhead row, joined to its pool's business_date. Never
-- joined against vessel_projects (there is nothing to join — project_id is
-- always null here), which is the structural proof shared overhead can never
-- leak into a project cost view.
create view public.shared_overhead_ledger_current
with (security_invoker = true) as
select
  c.id,
  c.tenant_id,
  c.pool_id,
  p.business_date,
  c.amount,
  c.description,
  c.import_batch_id,
  c.import_row_id,
  c.actor_user_id,
  c.created_at
from public.project_cost_ledger_entries c
join public.cash_pools p on p.id = c.pool_id
where c.entry_scope = 'shared_overhead' and c.entry_kind = 'expense';

grant select on public.shared_overhead_ledger_current to authenticated;
grant select on public.shared_overhead_ledger_current to service_role;

-- --- 7d. project_refund_ledger_current ---------------------------------------
create view public.project_refund_ledger_current
with (security_invoker = true) as
select
  c.id,
  c.tenant_id,
  c.pool_id,
  c.project_id,
  p.business_date,
  c.amount,
  c.description,
  c.import_batch_id,
  c.import_row_id,
  c.actor_user_id,
  c.created_at
from public.project_cost_ledger_entries c
join public.cash_pools p on p.id = c.pool_id
where c.entry_kind = 'refund';

grant select on public.project_refund_ledger_current to authenticated;
grant select on public.project_refund_ledger_current to service_role;
