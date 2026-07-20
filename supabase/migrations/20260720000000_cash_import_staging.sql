-- ADOP Phase 1 Gate 1J-B — Cash Import Staging, Mapping & Upload Idempotency
--
-- Continues Gate 1J-A's XLSX dry-run parser (src/lib/cash-import/parser.ts)
-- into a real, tenant-safe staging area: an uploaded workbook's parsed rows
-- are now persisted (never a direct client write — the server action
-- re-parses the actual uploaded bytes and hands the validated analysis to
-- the RPC below), a human (admin) maps each unique vessel/kapal label and
-- decides a disposition per row, and a batch can only become
-- 'ready_for_review' once every reconciliation/mapping/disposition
-- invariant holds. This gate still performs NO canonical operational
-- mutation — no cash_pools, cash_pool_entries, project_cost_ledger_entries,
-- vessel_projects, expense_submissions, or cash_reconciliations row is ever
-- read for writing or written by anything in this file. That commit step is
-- Gate 1J-C.
--
-- Does not edit 20260719070115_foundation_tenant_isolation.sql,
-- 20260719080000_master_data.sql, or 20260719100000_vessel_project_
-- lifecycle.sql — reuses private.current_user_has_tenant_role,
-- private.set_updated_at, and private.block_audit_mutation from those gates,
-- and vessel_projects' existing unique(id, tenant_id) as the tenant-safe FK
-- target for label-to-project mapping. Purely additive.

-- =============================================================================
-- 1. Enums
-- =============================================================================

-- Mirrors src/lib/cash-import/types.ts ProvisionalClassification exactly —
-- the server action passes the parser's own classification straight through,
-- never re-derives it in SQL.
create type public.cash_import_provisional_classification as enum (
  'opening_cash',
  'cash_top_up_candidate',
  'project_cash_in_or_refund_review',
  'project_expense_candidate',
  'unallocated_expense_review',
  'manual_mapping_required'
);

-- Mirrors src/lib/cash-import/types.ts CashImportRowStatus exactly.
create type public.cash_import_row_status as enum ('valid', 'warning', 'error');

create type public.cash_import_batch_status as enum (
  'draft', 'mapping_required', 'ready_for_review', 'superseded'
);

-- 'superseded' is intentionally unreachable in this gate — no RPC here
-- transitions into it (see the transition guard in §5a). It exists so the
-- enum already covers the re-stage/replace case a later gate may need,
-- without that later gate having to widen the type.
create type public.cash_import_mapping_kind as enum (
  'cash', 'existing_vessel_project', 'new_project_candidate', 'shared_overhead', 'unresolved'
);

create type public.cash_import_row_disposition as enum ('include', 'skip', 'manual_review');

-- =============================================================================
-- 2. Tables
-- =============================================================================

-- --- cash_import_batches -----------------------------------------------------
-- One row per distinct uploaded file per tenant. (tenant_id, source_sha256)
-- is the upload-identity constraint that makes re-upload idempotent (§6a):
-- same tenant + same bytes always resolves to the same batch row, never a
-- second one; the same hash in a different tenant is a structurally separate
-- row because tenant_id is part of the key.

create table public.cash_import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  source_filename text not null,
  source_sha256 text not null,
  source_sheet_name text not null,
  business_date date not null,
  opening_balance numeric(16, 2) not null,
  total_debit numeric(16, 2) not null default 0,
  total_credit numeric(16, 2) not null default 0,
  calculated_closing_balance numeric(16, 2) not null default 0,
  workbook_closing_balance numeric(16, 2),
  transaction_count integer not null default 0,
  warning_count integer not null default 0,
  error_count integer not null default 0,
  status public.cash_import_batch_status not null default 'draft',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite target for cash_import_rows'/cash_import_events' tenant-safe
  -- composite FKs below.
  unique (id, tenant_id),
  -- Upload-identity constraint — the database-level guarantee behind §6a.
  unique (tenant_id, source_sha256)
);

create index cash_import_batches_tenant_id_idx on public.cash_import_batches (tenant_id);
create index cash_import_batches_status_idx on public.cash_import_batches (tenant_id, status);

-- --- cash_import_rows ---------------------------------------------------------
-- Full raw provenance: every row the parser produced is persisted, including
-- the synthetic opening-balance row (provisional_classification =
-- 'opening_cash') — never dropped, never silently normalized away. Mapping
-- and disposition start unset (null): a suggested mapping_kind is a UI-only
-- hint (src/lib/cash-import/mapping-suggestions.ts) never written here — a
-- row only carries a mapping_kind once an admin has actually confirmed it
-- via set_cash_import_label_mapping (§5c), matching the LOCK "saran bukan
-- commit otomatis".

create table public.cash_import_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  batch_id uuid not null,
  source_row_number integer not null,
  source_fingerprint text not null,
  description text,
  vessel_label text,
  debit numeric(16, 2),
  credit numeric(16, 2),
  workbook_balance numeric(16, 2),
  calculated_balance numeric(16, 2),
  provisional_classification public.cash_import_provisional_classification not null,
  status public.cash_import_row_status not null,
  mapping_kind public.cash_import_mapping_kind,
  mapped_vessel_project_id uuid,
  disposition public.cash_import_row_disposition,
  disposition_reason text,
  validation_issues jsonb not null default '[]'::jsonb,
  duplicate_group_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (batch_id, tenant_id) references public.cash_import_batches (id, tenant_id) on delete cascade,
  -- Tenant-safe composite FK: a row can only be mapped to a vessel project in
  -- the SAME tenant — structurally impossible to map cross-tenant, even via
  -- a service-role bug. Nullable column, so rows with no project mapping
  -- (every kind except 'existing_vessel_project') simply skip the check
  -- (MATCH SIMPLE, the Postgres default).
  foreign key (mapped_vessel_project_id, tenant_id) references public.vessel_projects (id, tenant_id),
  unique (batch_id, source_row_number),
  -- Row error tidak boleh 'include' — database-level, not just RPC-level.
  constraint cash_import_rows_error_not_includable check (
    status <> 'error' or disposition is distinct from 'include'
  ),
  -- Skip wajib memiliki alasan — database-level backstop for the RPC check.
  constraint cash_import_rows_skip_reason_required check (
    disposition <> 'skip' or (disposition_reason is not null and btrim(disposition_reason) <> '')
  ),
  -- existing_vessel_project mapping must carry a project id; every other
  -- kind (including null) must not.
  constraint cash_import_rows_mapped_project_matches_kind check (
    (mapping_kind = 'existing_vessel_project' and mapped_vessel_project_id is not null)
    or (mapping_kind is distinct from 'existing_vessel_project' and mapped_vessel_project_id is null)
  )
);

create index cash_import_rows_tenant_id_idx on public.cash_import_rows (tenant_id);
create index cash_import_rows_batch_id_idx on public.cash_import_rows (tenant_id, batch_id);
create index cash_import_rows_vessel_label_idx on public.cash_import_rows (batch_id, vessel_label);
create index cash_import_rows_duplicate_group_key_idx on public.cash_import_rows (batch_id, duplicate_group_key)
  where duplicate_group_key is not null;

-- --- cash_import_events -------------------------------------------------------
-- Append-only. Every mapping/disposition/lifecycle decision on a batch
-- writes exactly one event here — the audit timeline the UI renders.
-- event_payload deliberately never carries the full parsed workbook (only
-- small per-decision fields) — see file header of Gate 1J-A's parser for why
-- the raw workbook itself is never persisted wholesale.

create table public.cash_import_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  batch_id uuid not null,
  event_type text not null check (
    event_type in ('batch_created', 'batch_reopened', 'label_mapping_set', 'row_disposition_set', 'ready_for_review')
  ),
  actor_user_id uuid references auth.users (id) on delete set null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (batch_id, tenant_id) references public.cash_import_batches (id, tenant_id) on delete cascade
);

create index cash_import_events_tenant_id_idx on public.cash_import_events (tenant_id);
create index cash_import_events_batch_id_idx on public.cash_import_events (tenant_id, batch_id);

-- =============================================================================
-- 3. Composite creation-result type
-- =============================================================================
-- create_cash_import_batch (§5b) needs to tell the caller whether it staged
-- a genuinely new batch or resolved to an existing one (for the "file ini
-- sudah pernah dianalisis" UI message) without overloading the batch row
-- itself with a transient flag.

create type public.cash_import_batch_creation_result as (
  batch public.cash_import_batches,
  is_new boolean
);

-- =============================================================================
-- 4. Triggers
-- =============================================================================

create trigger set_updated_at before update on public.cash_import_batches
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.cash_import_rows
  for each row execute function private.set_updated_at();

create trigger cash_import_events_append_only
  before update or delete on public.cash_import_events
  for each row execute function private.block_audit_mutation();

-- --- 4a. Role-independent batch status transition guard ----------------------
-- Fires regardless of caller. draft/ready_for_review both fold forward into
-- mapping_required on the first edit after staging or after a prior
-- ready-for-review mark (private.touch_cash_import_batch_after_edit, §5a);
-- mapping_required only advances to ready_for_review through
-- mark_cash_import_batch_ready_for_review's own invariant checks (§5f).
-- 'superseded' has no inbound arm here — genuinely unreachable this gate.
create function private.enforce_cash_import_batch_status_transition()
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
  ) then
    raise exception 'invalid cash import batch status transition from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_cash_import_batch_status_transition() from public;

create trigger cash_import_batches_enforce_status_transition
  before update of status on public.cash_import_batches
  for each row execute function private.enforce_cash_import_batch_status_transition();

-- --- 4b. Role-independent row mapping/disposition status-transition guard ----
-- expense_duplicate_candidates (Gate 1F) only allows pending -> {resolved}
-- once; this table is different — mapping/disposition may be revised
-- repeatedly by the admin while the batch is still in staging (LOCK doesn't
-- freeze a decision the moment it's made, only once the canonical commit in
-- Gate 1J-C happens) — so no status-transition trigger is attached to
-- cash_import_rows. The CHECK constraints in §2 are the row-shape
-- invariants that must hold at every write regardless of how many times a
-- row is revised.

-- =============================================================================
-- 5. RPCs — the only mutation path (no INSERT/UPDATE/DELETE grant exists for
--    `authenticated` on any of the three tables; see §7)
-- =============================================================================

-- --- 5a. touch_cash_import_batch_after_edit -----------------------------------
-- Called at the end of every mapping/disposition RPC. A batch that was
-- 'draft' or 'ready_for_review' folds forward to 'mapping_required' — the
-- latter case keeps "ready_for_review implies every invariant currently
-- holds" honest: an edit after being marked ready must be re-verified by
-- mark_cash_import_batch_ready_for_review before the batch can claim that
-- status again. No-op (and no status_events noise) if already
-- 'mapping_required' or 'superseded'.
create function private.touch_cash_import_batch_after_edit(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.cash_import_batches
  set status = 'mapping_required'
  where id = p_batch_id and status in ('draft', 'ready_for_review');
end;
$$;

revoke execute on function private.touch_cash_import_batch_after_edit(uuid) from public;

-- --- 5b. create_cash_import_batch ---------------------------------------------
-- The only path that stages a batch. p_tenant_id is re-checked against the
-- caller's own active admin membership before anything is trusted (same
-- trust model Gate 1C's get_or_create_daily_cash_pool uses for its own
-- first-write-for-a-tenant case). p_rows is the ALREADY-VALIDATED analysis
-- produced server-side by parseCashReportWorkbook() (never a client-editable
-- form field) — this function still independently recomputes
-- total_debit/total_credit/calculated_closing_balance/transaction_count/
-- warning_count/error_count from p_rows itself rather than trusting any
-- separately-passed totals, so a direct RPC call with a forged totals
-- argument (there isn't one — those aren't even parameters) or a
-- mismatched row/summary pair can never produce a batch whose header
-- disagrees with its own rows. Batch header + every row + the initial audit
-- event are written in one function invocation, which Postgres already runs
-- as a single transaction — any exception (malformed row shape, missing
-- required fields) rolls back the entire insert, so a partial batch can
-- never be left behind.
create function public.create_cash_import_batch(
  p_tenant_id uuid,
  p_source_filename text,
  p_source_sha256 text,
  p_source_sheet_name text,
  p_business_date date,
  p_opening_balance numeric,
  p_workbook_closing_balance numeric,
  p_rows jsonb
)
returns public.cash_import_batch_creation_result
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.cash_import_batches;
  v_batch public.cash_import_batches;
  v_total_debit numeric(16, 2);
  v_total_credit numeric(16, 2);
  v_calculated_closing numeric(16, 2);
  v_transaction_count integer;
  v_warning_count integer;
  v_error_count integer;
  v_row_count integer;
  v_result public.cash_import_batch_creation_result;
begin
  if not private.current_user_has_tenant_role(p_tenant_id, array['admin']::public.tenant_role[]) then
    raise exception 'not authorized to stage cash import batch';
  end if;

  if p_source_filename is null or btrim(p_source_filename) = '' then
    raise exception 'source filename is required';
  end if;
  if p_source_sha256 is null or btrim(p_source_sha256) = '' then
    raise exception 'source file hash is required';
  end if;

  select * into v_existing
  from public.cash_import_batches
  where tenant_id = p_tenant_id and source_sha256 = p_source_sha256
  for update;

  if v_existing.id is not null then
    insert into public.cash_import_events (tenant_id, batch_id, event_type, actor_user_id, event_payload)
    values (
      p_tenant_id, v_existing.id, 'batch_reopened', auth.uid(),
      jsonb_build_object('source_filename', p_source_filename)
    );

    v_result.batch := v_existing;
    v_result.is_new := false;
    return v_result;
  end if;

  select count(*) into v_row_count from jsonb_array_elements(p_rows);
  if v_row_count = 0 then
    raise exception 'no rows to stage';
  end if;

  select
    coalesce(sum(x.debit) filter (where x.provisional_classification <> 'opening_cash'), 0),
    coalesce(sum(x.credit) filter (where x.provisional_classification <> 'opening_cash'), 0),
    count(*) filter (where x.provisional_classification <> 'opening_cash'),
    count(*) filter (where x.provisional_classification <> 'opening_cash' and x.status = 'warning'),
    count(*) filter (where x.provisional_classification <> 'opening_cash' and x.status = 'error')
  into v_total_debit, v_total_credit, v_transaction_count, v_warning_count, v_error_count
  from jsonb_to_recordset(p_rows) as x(
    provisional_classification public.cash_import_provisional_classification,
    status public.cash_import_row_status,
    debit numeric,
    credit numeric
  );

  v_calculated_closing := coalesce(p_opening_balance, 0) + v_total_debit - v_total_credit;

  begin
    insert into public.cash_import_batches (
      tenant_id, source_filename, source_sha256, source_sheet_name, business_date,
      opening_balance, total_debit, total_credit, calculated_closing_balance, workbook_closing_balance,
      transaction_count, warning_count, error_count, status, created_by
    ) values (
      p_tenant_id, p_source_filename, p_source_sha256, p_source_sheet_name, p_business_date,
      p_opening_balance, v_total_debit, v_total_credit, v_calculated_closing, p_workbook_closing_balance,
      v_transaction_count, v_warning_count, v_error_count, 'draft', auth.uid()
    )
    returning * into v_batch;
  exception when unique_violation then
    -- Lost a concurrent race against another upload of the same bytes —
    -- fall back to the now-committed existing row exactly like the
    -- already-existing branch above. No row has been inserted yet at this
    -- point, so there is nothing to roll back beyond this statement.
    select * into v_existing
    from public.cash_import_batches
    where tenant_id = p_tenant_id and source_sha256 = p_source_sha256;

    v_result.batch := v_existing;
    v_result.is_new := false;
    return v_result;
  end;

  insert into public.cash_import_rows (
    tenant_id, batch_id, source_row_number, source_fingerprint, description, vessel_label,
    debit, credit, workbook_balance, calculated_balance, provisional_classification, status,
    validation_issues, duplicate_group_key
  )
  select
    p_tenant_id, v_batch.id, x.source_row_number, x.source_fingerprint, x.description, x.vessel_label,
    x.debit, x.credit, x.workbook_balance, x.calculated_balance,
    x.provisional_classification, x.status,
    coalesce(x.validation_issues, '[]'::jsonb),
    case
      when exists (
        select 1 from jsonb_array_elements(coalesce(x.validation_issues, '[]'::jsonb)) e
        where e ->> 'code' = 'DUPLICATE_ROW_CANDIDATE'
      ) then x.source_fingerprint
      else null
    end
  from jsonb_to_recordset(p_rows) as x(
    source_row_number integer,
    source_fingerprint text,
    description text,
    vessel_label text,
    debit numeric,
    credit numeric,
    workbook_balance numeric,
    calculated_balance numeric,
    provisional_classification public.cash_import_provisional_classification,
    status public.cash_import_row_status,
    validation_issues jsonb
  );

  insert into public.cash_import_events (tenant_id, batch_id, event_type, actor_user_id, event_payload)
  values (
    p_tenant_id, v_batch.id, 'batch_created', auth.uid(),
    jsonb_build_object(
      'source_filename', p_source_filename,
      'transaction_count', v_transaction_count,
      'warning_count', v_warning_count,
      'error_count', v_error_count
    )
  );

  v_result.batch := v_batch;
  v_result.is_new := true;
  return v_result;
end;
$$;

revoke execute on function public.create_cash_import_batch(uuid, text, text, text, date, numeric, numeric, jsonb) from public;
grant execute on function public.create_cash_import_batch(uuid, text, text, text, date, numeric, numeric, jsonb) to authenticated;

-- --- 5c. set_cash_import_label_mapping ----------------------------------------
-- Applies one mapping decision to every row sharing p_vessel_label within
-- the batch in a single statement (the UI's "unique-label mapping panel" is
-- one decision per label, fanned out to however many rows carry it — never
-- a per-row mapping choice). `is not distinct from` matches the
-- null-vessel-label group (rows the parser could not attach a label to)
-- exactly like any other label. Tenant is re-derived from the batch row
-- (`for update` locked), never accepted as an argument.
create function public.set_cash_import_label_mapping(
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
  v_project_tenant_id uuid;
  v_affected integer;
begin
  select tenant_id into v_tenant_id
  from public.cash_import_batches
  where id = p_batch_id
  for update;

  if v_tenant_id is null then
    raise exception 'cash import batch not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['admin']::public.tenant_role[]) then
    raise exception 'not authorized to edit cash import batch mapping';
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

revoke execute on function public.set_cash_import_label_mapping(uuid, text, public.cash_import_mapping_kind, uuid) from public;
grant execute on function public.set_cash_import_label_mapping(uuid, text, public.cash_import_mapping_kind, uuid) to authenticated;

-- --- 5d. set_cash_import_row_disposition --------------------------------------
-- Per-row decision (unlike mapping, disposition is never fanned out across a
-- label — two rows sharing a vessel_label can have different dispositions,
-- e.g. one duplicate kept and its twin skipped). Tenant/batch are re-derived
-- from the row itself, `for update` locked.
create function public.set_cash_import_row_disposition(
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

revoke execute on function public.set_cash_import_row_disposition(uuid, public.cash_import_row_disposition, text) from public;
grant execute on function public.set_cash_import_row_disposition(uuid, public.cash_import_row_disposition, text) to authenticated;

-- --- 5e. mark_cash_import_batch_ready_for_review -------------------------------
-- The one gate that flips a batch to 'ready_for_review'. Every precondition
-- from the LOCK's "READY FOR REVIEW" section is re-checked here, against
-- server-held state only — never a client-asserted "everything is mapped"
-- flag. Each failure raises a distinct, stable error code so the UI can
-- explain exactly what remains (mirrors the DUPLICATE_REVIEW_REQUIRED /
-- DUPLICATE_CONFIRMED stable-string convention Gate 1F established).
create function public.mark_cash_import_batch_ready_for_review(p_batch_id uuid)
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
  values (v_tenant_id, p_batch_id, 'ready_for_review', auth.uid(), '{}'::jsonb);

  return v_result;
end;
$$;

revoke execute on function public.mark_cash_import_batch_ready_for_review(uuid) from public;
grant execute on function public.mark_cash_import_batch_ready_for_review(uuid) to authenticated;

-- =============================================================================
-- 6. RLS & Grants
-- =============================================================================
-- auto_expose_new_tables is off, so all three tables start with zero
-- privileges for anon/authenticated/service_role; the REVOKE below is
-- defensive belt-and-suspenders on top of that. No INSERT/UPDATE/DELETE
-- grant exists for `authenticated` on any of the three tables — the five
-- SECURITY DEFINER functions in §5 (running as the table owner, which
-- bypasses RLS) are the only mutation path. Read access is owner+admin
-- only — reviewer/viewer are deliberately excluded (the LOCK only grants
-- "Owner hanya boleh membaca... Admin membuat dan mengubah"; no other role
-- is mentioned), and anon has no grant at all so it is rejected before RLS
-- is even evaluated.

alter table public.cash_import_batches enable row level security;
alter table public.cash_import_rows enable row level security;
alter table public.cash_import_events enable row level security;

revoke all on public.cash_import_batches from public;
revoke all on public.cash_import_rows from public;
revoke all on public.cash_import_events from public;

create policy cash_import_batches_select_owner_admin
  on public.cash_import_batches for select
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]));

grant select on public.cash_import_batches to authenticated;
grant all on public.cash_import_batches to service_role;

create policy cash_import_rows_select_owner_admin
  on public.cash_import_rows for select
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]));

grant select on public.cash_import_rows to authenticated;
grant all on public.cash_import_rows to service_role;

create policy cash_import_events_select_owner_admin
  on public.cash_import_events for select
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]));

grant select on public.cash_import_events to authenticated;
grant select, insert on public.cash_import_events to service_role;
