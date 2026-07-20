-- ADOP Phase 1 Gate 1J-D — Append-Only Cash Import Rollback
--
-- Lets the Owner undo one COMMITTED cash import batch (20260720120000)
-- through compensating reversal rows — never a DELETE/UPDATE of a canonical
-- amount, never a removed audit event. Every canonical posting the commit
-- RPC created (opening_cash, cash_top_up, project expense, shared overhead,
-- and the paired project_refund cash-in + cost-reduction) gets its own
-- 'reversal' row, using the SAME reverses_entry_id + append-only shape Gate
-- 1C/1D already established for single-entry corrections
-- (reverse_cash_pool_entry / reverse_project_expense) — this migration does
-- not invent a new correction mechanism, it drives the existing one from a
-- batch-level RPC and additionally stamps import_batch_id/import_row_id onto
-- each reversal so the rollback's own provenance is traceable back to the
-- import that created it.
--
-- Does not edit 20260719070115_foundation_tenant_isolation.sql,
-- 20260719080000_master_data.sql, 20260719100000_vessel_project_
-- lifecycle.sql, 20260719130000_expense_submission_approval.sql,
-- 20260719140000_expense_duplicate_detection.sql,
-- 20260719160000_expense_cancel_and_eod_guard.sql, or
-- 20260720000000_cash_import_staging.sql on disk.
-- 20260719110000_shared_daily_cash_pool.sql, 20260719120000_project_cost_
-- ledger.sql, 20260719150000_cash_reconciliation.sql, and
-- 20260720120000_owner_approved_cash_import_commit.sql ARE touched via ALTER
-- TABLE / CREATE OR REPLACE / index replacement, the same non-destructive
-- extension technique every prior gate in this schema uses:
--
--   1. cash_import_batch_status gains 'rolled_back' (ALTER TYPE ADD VALUE);
--      private.enforce_cash_import_batch_status_transition (Gate 1J-B/1J-C)
--      gains the committed -> rolled_back arm.
--   2. cash_import_batches grows a server-computed rollback snapshot
--      (rolled_back_at/rolled_back_by/rollback_reason/rollback_reversal_
--      count/rollback_reversed_cash_effect/rollback_reversed_project_cost/
--      rollback_reversed_shared_overhead/rollback_reversed_refund_effect) —
--      populated exactly once, by rollback_cash_import_batch, never
--      client-suppliable, matching committed_at/committed_by/canonical_*
--      from Gate 1J-C.
--   3. cash_import_events (Gate 1J-B) gains event_type
--      'owner_rolled_back_import' plus a reason-required check, mirroring
--      Gate 1J-C's own owner_rejected_reason_required constraint.
--   4. cash_pool_entries_import_row_id_unique / project_cost_ledger_entries_
--      import_row_id_unique (Gate 1J-C) are REPLACED (drop + recreate under
--      the SAME name) to add an entry_kind filter. Gate 1J-C's own comment
--      documents these as "one posting per import row, PER TABLE" — that
--      invariant is preserved for ORIGINAL postings (entry_kind = 'entry' /
--      'expense'/'refund'); what changes is that a 'reversal' row is now
--      permitted to carry the SAME import_row_id as the original it
--      reverses (this migration's own requirement: "Setiap reversal
--      menyimpan import_batch_id dan import_row_id" pointing at the
--      canonical entry it reverses) without violating the one-original-
--      posting-per-row guarantee the index exists to enforce. The
--      independent reverses_entry_id partial unique index (Gate 1C/1D) is
--      what actually still guarantees "at most one reversal per original
--      entry" — this index was never that guarantee, only "one ORIGINAL
--      posting per import row", which is unchanged.
--   5. private.enforce_project_cost_ledger_reversal_integrity (Gate 1D) is
--      widened from "only entry_kind = 'expense' can be reversed" to "expense
--      OR refund" — Gate 1J-C introduced the 'refund' entry_kind but this
--      trigger (written before 'refund' existed) never admitted reversing
--      one; rolling back a project-refund pair requires reversing BOTH its
--      cash-in (cash_pool_entries, already reversible) and its cost-
--      reduction (project_cost_ledger_entries, entry_kind = 'refund') side.
--      The project_id comparison also switches from `<>` to `IS DISTINCT
--      FROM` for null-safety (a shared_overhead reversal has project_id
--      null on both sides; `<>` against two nulls is already not-true in
--      Postgres so behavior is unchanged, this is a defensive clarity fix).
--   6. vessel_project_cost_summary (Gate 1J-C) is fixed: its refund
--      subtraction never excluded an already-reversed refund row (reversing
--      a refund was structurally impossible before this migration, so the
--      gap was latent, never reachable) — now mirrors the expense side's
--      own "not exists (... where reverses_entry_id = c.id)" exclusion, so
--      reversing a refund correctly un-does its cost-reducing effect.
--   7. shared_overhead_ledger_current / project_refund_ledger_current
--      (Gate 1J-C) gain the same "not exists reversed" exclusion — both are
--      named "_current", i.e. active/non-reversed by their own naming
--      contract, but neither filter actually excluded a reversed row before
--      (same latent gap as #6, for the same reason).
--   8. set_cash_import_label_mapping / set_cash_import_row_disposition
--      (Gate 1J-B/1J-C) widen their immutability guard from "status =
--      'committed'" to "status in ('committed', 'rolled_back')" — Gate
--      1J-C's guard only ever anticipated 'committed' as the terminal
--      state; a rolled-back batch's mapping/disposition must stay frozen
--      too (a rollback un-does the CANONICAL postings, it does not reopen
--      staging for a second, different commit attempt), otherwise an edit
--      here would silently drift from what was actually posted and later
--      reversed.
--
-- cash_pool_daily_summary needs NO change here: its cash_pool_entries join
-- already filters `entry_kind = 'entry' and not exists (... reversed)`,
-- which already covers opening_cash/cash_top_up/project_refund cash-in
-- symmetrically; its total_cash_out lateral join already filters
-- `entry_kind = 'expense' and not exists (... reversed)`, which already
-- covers project expense AND shared-overhead expense (both entry_kind =
-- 'expense', only entry_scope differs) — reversing either already flows
-- through with zero further changes.

-- =============================================================================
-- 1. cash_import_batch_status gains 'rolled_back'
-- =============================================================================

alter type public.cash_import_batch_status add value 'rolled_back';
commit;

-- =============================================================================
-- 2. cash_import_batches — rollback snapshot columns
-- =============================================================================

alter table public.cash_import_batches
  add column rolled_back_at timestamptz,
  add column rolled_back_by uuid references auth.users (id) on delete set null,
  add column rollback_reason text,
  add column rollback_reversal_count integer,
  add column rollback_reversed_cash_effect numeric(16, 2),
  add column rollback_reversed_project_cost numeric(16, 2),
  add column rollback_reversed_shared_overhead numeric(16, 2),
  add column rollback_reversed_refund_effect numeric(16, 2);

-- =============================================================================
-- 3. Status transition guard — committed -> rolled_back
-- =============================================================================
-- Identical body to the Gate 1J-C version plus one new arm; `create or
-- replace function` — that migration file itself is not edited.
-- 'rolled_back' remains terminal: no arm below ever transitions out of it,
-- so a second rollback attempt on an already-rolled-back batch fails this
-- trigger even if the RPC's own status check were somehow bypassed.
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
    or (old.status = 'committed' and new.status = 'rolled_back')
  ) then
    raise exception 'invalid cash import batch status transition from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;

-- =============================================================================
-- 4. cash_import_events — new event type + reason-required constraint
-- =============================================================================

alter table public.cash_import_events
  drop constraint cash_import_events_event_type_check;

alter table public.cash_import_events
  add constraint cash_import_events_event_type_check check (
    event_type in (
      'batch_created', 'batch_reopened', 'label_mapping_set', 'row_disposition_set',
      'ready_for_review', 'owner_approved_and_committed', 'owner_rejected',
      'owner_rolled_back_import'
    )
  );

alter table public.cash_import_events
  add constraint cash_import_events_owner_rolled_back_reason_required check (
    event_type <> 'owner_rolled_back_import'
    or ((event_payload ->> 'reason') is not null and btrim(event_payload ->> 'reason') <> '')
  );

-- =============================================================================
-- 5. Import-row-id uniqueness — relax to admit one reversal alongside the
--    one original posting per (table, import row)
-- =============================================================================

drop index public.cash_pool_entries_import_row_id_unique;

create unique index cash_pool_entries_import_row_id_unique
  on public.cash_pool_entries (import_row_id)
  where import_row_id is not null and entry_kind = 'entry';

drop index public.project_cost_ledger_entries_import_row_id_unique;

create unique index project_cost_ledger_entries_import_row_id_unique
  on public.project_cost_ledger_entries (import_row_id)
  where import_row_id is not null and entry_kind in ('expense', 'refund');

-- =============================================================================
-- 6. project_cost_ledger_entries reversal integrity — admit reversing a
--    'refund' entry (Gate 1D's original only ever admitted 'expense',
--    written before 'refund' existed)
-- =============================================================================

create or replace function private.enforce_project_cost_ledger_reversal_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_target public.project_cost_ledger_entries;
begin
  if new.entry_kind = 'reversal' then
    select * into v_target from public.project_cost_ledger_entries where id = new.reverses_entry_id;

    if v_target.id is null then
      raise exception 'reversal target entry not found';
    end if;
    if v_target.entry_kind not in ('expense', 'refund') then
      raise exception 'cannot reverse a reversal';
    end if;
    if v_target.tenant_id <> new.tenant_id then
      raise exception 'reversal must reference an entry in the same tenant';
    end if;
    if v_target.pool_id <> new.pool_id then
      raise exception 'reversal must reference an entry in the same cash pool';
    end if;
    if v_target.project_id is distinct from new.project_id then
      raise exception 'reversal must reference an entry in the same vessel project';
    end if;
  end if;

  return new;
end;
$$;

-- =============================================================================
-- 7. Read model fixes — exclude reversed refund / shared-overhead rows
-- =============================================================================

-- --- 7a. vessel_project_cost_summary — same signature as Gate 1J-C's own
--     CREATE OR REPLACE (project_id, tenant_id, total_cost); only the refund
--     filter changes, mirroring the expense filter's existing exclusion.
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
    - coalesce(sum(c.amount) filter (
      where c.entry_kind = 'refund'
        and not exists (select 1 from public.project_cost_ledger_entries r where r.reverses_entry_id = c.id)
    ), 0)
  )::numeric(16, 2) as total_cost
from public.vessel_projects vp
left join public.project_cost_ledger_entries c
  on c.project_id = vp.id
group by vp.id, vp.tenant_id;

grant select on public.vessel_project_cost_summary to authenticated;
grant select on public.vessel_project_cost_summary to service_role;

-- --- 7b. shared_overhead_ledger_current — same column signature as Gate
--     1J-C's original; only the reversed-row exclusion is added.
create or replace view public.shared_overhead_ledger_current
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
where c.entry_scope = 'shared_overhead'
  and c.entry_kind = 'expense'
  and not exists (select 1 from public.project_cost_ledger_entries r where r.reverses_entry_id = c.id);

grant select on public.shared_overhead_ledger_current to authenticated;
grant select on public.shared_overhead_ledger_current to service_role;

-- --- 7c. project_refund_ledger_current — same column signature as Gate
--     1J-C's original; only the reversed-row exclusion is added.
create or replace view public.project_refund_ledger_current
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
where c.entry_kind = 'refund'
  and not exists (select 1 from public.project_cost_ledger_entries r where r.reverses_entry_id = c.id);

grant select on public.project_refund_ledger_current to authenticated;
grant select on public.project_refund_ledger_current to service_role;

-- =============================================================================
-- 8. set_cash_import_label_mapping / set_cash_import_row_disposition —
--    widen immutability guard to also cover 'rolled_back'
-- =============================================================================
-- Identical bodies to the Gate 1J-C versions except `= 'committed'` becomes
-- `in ('committed', 'rolled_back')`; `create or replace function` — that
-- migration file itself is not edited.

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

  if v_batch_status in ('committed', 'rolled_back') then
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

  if v_batch_status in ('committed', 'rolled_back') then
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
-- 9. rollback_cash_import_batch — owner-only, single-transaction, atomic
--    append-only rollback
-- =============================================================================
-- Locking order mirrors approve_and_commit_cash_import_batch exactly (batch
-- row, then the pool row) — a concurrent commit and a concurrent rollback of
-- the SAME batch can never interleave into a partial state: whichever
-- acquires the batch lock first runs to completion, the other blocks and
-- then re-reads a status that no longer matches what it expected (raising
-- deterministically). Two concurrent rollback calls on the SAME batch:
-- the second blocks on the batch lock until the first commits, then sees
-- status already 'rolled_back' and raises 'BATCH_ALREADY_ROLLED_BACK' —
-- exactly one reversal set is ever created. Every reversal insert below
-- also flows through the pre-existing role-independent guards (Gate 1G's
-- private.enforce_cash_pool_open_for_financial_entry BEFORE INSERT trigger,
-- Gate 1C/1D's own reversal-integrity triggers, and both tables' partial
-- unique indexes) — this function does not bypass any of them, it is not
-- SECURITY DEFINER magic exempting these rows from the same structural
-- guarantees every other financial write obeys.
create function public.rollback_cash_import_batch(
  p_batch_id uuid,
  p_reason text
)
returns public.cash_import_batches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.cash_import_batches;
  v_pool public.cash_pools;
  v_row record;
  v_original_entry public.cash_pool_entries;
  v_original_cost_entry public.project_cost_ledger_entries;
  v_opening_row_id uuid;
  v_reversal_count integer := 0;
  v_reversed_cash_effect numeric(16, 2) := 0;
  v_reversed_project_cost numeric(16, 2) := 0;
  v_reversed_shared_overhead numeric(16, 2) := 0;
  v_reversed_refund_effect numeric(16, 2) := 0;
  v_result public.cash_import_batches;
begin
  select * into v_batch from public.cash_import_batches where id = p_batch_id for update;

  if v_batch.id is null then
    raise exception 'cash import batch not found';
  end if;

  if not private.current_user_has_tenant_role(v_batch.tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'not authorized to rollback cash import batch';
  end if;

  if v_batch.status = 'rolled_back' then
    raise exception 'BATCH_ALREADY_ROLLED_BACK';
  end if;

  if v_batch.status <> 'committed' then
    raise exception 'BATCH_NOT_COMMITTED';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'rollback reason is required';
  end if;

  select * into v_pool
  from public.cash_pools
  where tenant_id = v_batch.tenant_id and business_date = v_batch.business_date
  for update;

  if v_pool.id is null then
    raise exception 'cash pool not found for import batch';
  end if;

  -- Fail-closed on both "cash pool sudah closed" and "rekonsiliasi EOD
  -- sudah approved": approve_cash_reconciliation (Gate 1G) is the only path
  -- that ever sets daily_close_status = 'closed', so this single check
  -- structurally covers both safety guards at once — an approved EOD
  -- reconciliation cannot exist over an 'open' pool.
  if v_pool.daily_close_status <> 'open' then
    raise exception 'CASH_POOL_NOT_OPEN_FOR_ROLLBACK';
  end if;

  -- A. Opening balance reversal.
  select id into v_opening_row_id
  from public.cash_import_rows
  where batch_id = p_batch_id and provisional_classification = 'opening_cash'
  limit 1;

  if v_batch.canonical_opening_cash > 0 then
    select * into v_original_entry
    from public.cash_pool_entries
    where import_batch_id = p_batch_id and import_row_id = v_opening_row_id and entry_kind = 'entry'
    for update;

    if v_original_entry.id is null then
      raise exception 'IMPORT_PROVENANCE_INCOMPLETE';
    end if;

    insert into public.cash_pool_entries (
      tenant_id, pool_id, entry_type, entry_kind, amount, description, reverses_entry_id,
      import_batch_id, import_row_id, created_by
    ) values (
      v_batch.tenant_id, v_pool.id, v_original_entry.entry_type, 'reversal', v_original_entry.amount,
      p_reason, v_original_entry.id, p_batch_id, v_opening_row_id, auth.uid()
    );

    v_reversal_count := v_reversal_count + 1;
    v_reversed_cash_effect := v_reversed_cash_effect + v_original_entry.amount;
  end if;

  -- B-E. Every included, non-opening row, in source order — reverse
  -- whatever it originally posted (mirrors approve_and_commit_cash_import_
  -- batch's own per-row branch shape).
  for v_row in
    select * from public.cash_import_rows
    where batch_id = p_batch_id
      and provisional_classification <> 'opening_cash'
      and disposition = 'include'
    order by source_row_number
  loop
    if v_row.mapping_kind = 'cash' then
      -- B. Cash top-up reversal.
      select * into v_original_entry
      from public.cash_pool_entries
      where import_batch_id = p_batch_id and import_row_id = v_row.id and entry_kind = 'entry'
      for update;

      if v_original_entry.id is null then
        raise exception 'IMPORT_PROVENANCE_INCOMPLETE';
      end if;

      insert into public.cash_pool_entries (
        tenant_id, pool_id, entry_type, entry_kind, amount, description, reverses_entry_id,
        import_batch_id, import_row_id, created_by
      ) values (
        v_batch.tenant_id, v_pool.id, v_original_entry.entry_type, 'reversal', v_original_entry.amount,
        p_reason, v_original_entry.id, p_batch_id, v_row.id, auth.uid()
      );

      v_reversal_count := v_reversal_count + 1;
      v_reversed_cash_effect := v_reversed_cash_effect + v_original_entry.amount;

    elsif v_row.mapping_kind = 'shared_overhead' then
      -- D. Shared overhead reversal.
      select * into v_original_cost_entry
      from public.project_cost_ledger_entries
      where import_batch_id = p_batch_id and import_row_id = v_row.id and entry_kind = 'expense'
      for update;

      if v_original_cost_entry.id is null then
        raise exception 'IMPORT_PROVENANCE_INCOMPLETE';
      end if;

      insert into public.project_cost_ledger_entries (
        tenant_id, pool_id, project_id, category_id, vendor_id, entry_kind, entry_scope,
        amount, description, reference_number, reverses_entry_id, import_batch_id, import_row_id, actor_user_id
      ) values (
        v_batch.tenant_id, v_pool.id, v_original_cost_entry.project_id, v_original_cost_entry.category_id,
        v_original_cost_entry.vendor_id, 'reversal', v_original_cost_entry.entry_scope,
        v_original_cost_entry.amount, p_reason, null, v_original_cost_entry.id, p_batch_id, v_row.id, auth.uid()
      );

      v_reversal_count := v_reversal_count + 1;
      v_reversed_shared_overhead := v_reversed_shared_overhead + v_original_cost_entry.amount;

    elsif v_row.mapping_kind = 'existing_vessel_project' then
      if coalesce(v_row.debit, 0) > 0 and coalesce(v_row.credit, 0) <= 0 then
        -- E. Project refund — reverse BOTH the cash-in and the cost-
        -- reduction posting, atomically, same as they were originally
        -- posted together.
        select * into v_original_entry
        from public.cash_pool_entries
        where import_batch_id = p_batch_id and import_row_id = v_row.id and entry_kind = 'entry'
        for update;

        select * into v_original_cost_entry
        from public.project_cost_ledger_entries
        where import_batch_id = p_batch_id and import_row_id = v_row.id and entry_kind = 'refund'
        for update;

        if v_original_entry.id is null or v_original_cost_entry.id is null then
          raise exception 'IMPORT_PROVENANCE_INCOMPLETE';
        end if;

        insert into public.cash_pool_entries (
          tenant_id, pool_id, entry_type, entry_kind, amount, description, reverses_entry_id,
          import_batch_id, import_row_id, created_by
        ) values (
          v_batch.tenant_id, v_pool.id, v_original_entry.entry_type, 'reversal', v_original_entry.amount,
          p_reason, v_original_entry.id, p_batch_id, v_row.id, auth.uid()
        );

        insert into public.project_cost_ledger_entries (
          tenant_id, pool_id, project_id, category_id, vendor_id, entry_kind, entry_scope,
          amount, description, reference_number, reverses_entry_id, import_batch_id, import_row_id, actor_user_id
        ) values (
          v_batch.tenant_id, v_pool.id, v_original_cost_entry.project_id, v_original_cost_entry.category_id,
          v_original_cost_entry.vendor_id, 'reversal', v_original_cost_entry.entry_scope,
          v_original_cost_entry.amount, p_reason, null, v_original_cost_entry.id, p_batch_id, v_row.id, auth.uid()
        );

        v_reversal_count := v_reversal_count + 2;
        v_reversed_refund_effect := v_reversed_refund_effect + v_original_entry.amount;

      elsif coalesce(v_row.credit, 0) > 0 and coalesce(v_row.debit, 0) <= 0 then
        -- C. Project expense reversal.
        select * into v_original_cost_entry
        from public.project_cost_ledger_entries
        where import_batch_id = p_batch_id and import_row_id = v_row.id and entry_kind = 'expense'
        for update;

        if v_original_cost_entry.id is null then
          raise exception 'IMPORT_PROVENANCE_INCOMPLETE';
        end if;

        insert into public.project_cost_ledger_entries (
          tenant_id, pool_id, project_id, category_id, vendor_id, entry_kind, entry_scope,
          amount, description, reference_number, reverses_entry_id, import_batch_id, import_row_id, actor_user_id
        ) values (
          v_batch.tenant_id, v_pool.id, v_original_cost_entry.project_id, v_original_cost_entry.category_id,
          v_original_cost_entry.vendor_id, 'reversal', v_original_cost_entry.entry_scope,
          v_original_cost_entry.amount, p_reason, null, v_original_cost_entry.id, p_batch_id, v_row.id, auth.uid()
        );

        v_reversal_count := v_reversal_count + 1;
        v_reversed_project_cost := v_reversed_project_cost + v_original_cost_entry.amount;
      end if;
    end if;
  end loop;

  update public.cash_import_batches
  set
    status = 'rolled_back',
    rolled_back_at = now(),
    rolled_back_by = auth.uid(),
    rollback_reason = p_reason,
    rollback_reversal_count = v_reversal_count,
    rollback_reversed_cash_effect = v_reversed_cash_effect,
    rollback_reversed_project_cost = v_reversed_project_cost,
    rollback_reversed_shared_overhead = v_reversed_shared_overhead,
    rollback_reversed_refund_effect = v_reversed_refund_effect
  where id = p_batch_id
  returning * into v_result;

  insert into public.cash_import_events (tenant_id, batch_id, event_type, actor_user_id, event_payload)
  values (
    v_batch.tenant_id, p_batch_id, 'owner_rolled_back_import', auth.uid(),
    jsonb_build_object(
      'reason', p_reason,
      'pool_id', v_pool.id,
      'reversal_count', v_reversal_count,
      'reversed_cash_effect', v_reversed_cash_effect,
      'reversed_project_cost', v_reversed_project_cost,
      'reversed_shared_overhead', v_reversed_shared_overhead,
      'reversed_refund_effect', v_reversed_refund_effect
    )
  );

  return v_result;
end;
$$;

revoke execute on function public.rollback_cash_import_batch(uuid, text) from public;
grant execute on function public.rollback_cash_import_batch(uuid, text) to authenticated;
