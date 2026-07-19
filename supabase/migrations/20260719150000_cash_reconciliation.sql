-- ADOP Phase 1 Gate 1G — End-of-Day Cash Reconciliation & Daily Close Foundation
--
-- Introduces a controlled end-of-day reconciliation workflow between the
-- system-computed cash pool summary (Gate 1C/1D's cash_pool_daily_summary)
-- and admin-counted physical cash, plus the daily-close lifecycle that gates
-- it: public.cash_pools grows a server-controlled financial_version (bumped
-- atomically on every cash_pool_entries/project_cost_ledger_entries insert —
-- entry or reversal) and a daily_close_status (open -> pending_close ->
-- closed, with a reopen path back to open). Reconciliation itself follows
-- the same draft -> submitted -> approved|needs_correction|rejected shape
-- Gate 1E established for expense submissions: append-only revisions,
-- append-only status events, needs_correction requiring a fresh revision
-- before resubmission.
--
-- Does not edit 20260719070115_foundation_tenant_isolation.sql,
-- 20260719080000_master_data.sql, 20260719090000_master_data_audit_
-- atomicity.sql, 20260719100000_vessel_project_lifecycle.sql,
-- 20260719120000_project_cost_ledger.sql, 20260719130000_expense_submission_
-- approval.sql, or 20260719140000_expense_duplicate_detection.sql — reuses
-- private.current_user_is_active_tenant_member, private.
-- current_user_has_tenant_role, private.block_audit_mutation, and private.
-- set_updated_at from earlier gates.
--
-- 20260719110000_shared_daily_cash_pool.sql IS touched, but not edited on
-- disk: cash_pools_append_only (a BEFORE UPDATE OR DELETE trigger that
-- unconditionally rejected every mutation) is replaced here with a DELETE-
-- only guard plus a narrow, column-specific transition trigger on the two
-- new columns. This does not weaken Gate 1C's actual guarantee — tenant_id,
-- business_date, created_by, and created_at remain unforgeable (no
-- UPDATE grant to `authenticated` ever existed, and no RPC below touches
-- them) — it only makes room for the controlled lifecycle this gate adds.

-- =============================================================================
-- 1. Enums
-- =============================================================================

create type public.cash_pool_daily_close_status as enum ('open', 'pending_close', 'closed');
create type public.cash_reconciliation_status as enum (
  'draft', 'submitted', 'approved', 'needs_correction', 'rejected'
);

-- =============================================================================
-- 2. cash_pools: financial_version + daily_close_status
-- =============================================================================

alter table public.cash_pools
  add column financial_version bigint not null default 0,
  add column daily_close_status public.cash_pool_daily_close_status not null default 'open';

create index cash_pools_daily_close_status_idx on public.cash_pools (tenant_id, daily_close_status);

-- --- 2a. Replace the Gate 1C append-only trigger -----------------------------
-- cash_pools_append_only (BEFORE UPDATE OR DELETE) blocked every UPDATE
-- unconditionally, which cannot coexist with a mutable daily_close_status/
-- financial_version. It is recreated here under the SAME trigger name,
-- DELETE-only — Gate 1C's own pgTAP file asserts both
-- "has_trigger(..., 'cash_pools_append_only', ...)" and "DELETE on
-- cash_pools raises access_audit_events is append-only"; neither assertion
-- touches UPDATE on cash_pools, so this is a regression-safe narrowing of
-- scope, not a removal of a proven guarantee. DELETE stays blocked (defense
-- in depth, same as every other financial table here); no UPDATE grant to
-- `authenticated` exists anywhere in this schema, so the narrow transition
-- trigger below is the real state-machine guarantee, not just an RPC-level
-- check.

drop trigger cash_pools_append_only on public.cash_pools;

create trigger cash_pools_append_only
  before delete on public.cash_pools
  for each row execute function private.block_audit_mutation();

-- --- 2b. Role-independent daily-close transition guard -----------------------
-- BEFORE UPDATE OF daily_close_status only — fires regardless of caller (the
-- RPCs in §6, or a service-role/background write), same posture as
-- private.enforce_vessel_project_lifecycle_transition from Gate 1B. Does NOT
-- fire on the financial_version-only UPDATE the bump trigger in §5b issues,
-- since that UPDATE never lists daily_close_status in its SET clause.

create function private.enforce_cash_pool_daily_close_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.daily_close_status = old.daily_close_status then
    raise exception 'cash pool daily close status unchanged: already %', old.daily_close_status;
  end if;

  if not (
    (old.daily_close_status = 'open' and new.daily_close_status = 'pending_close')
    or (old.daily_close_status = 'pending_close' and new.daily_close_status = 'closed')
    or (old.daily_close_status = 'pending_close' and new.daily_close_status = 'open')
    or (old.daily_close_status = 'closed' and new.daily_close_status = 'open')
  ) then
    raise exception 'invalid cash pool daily close status transition from % to %', old.daily_close_status, new.daily_close_status;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_cash_pool_daily_close_transition() from public;

create trigger cash_pools_enforce_daily_close_transition
  before update of daily_close_status on public.cash_pools
  for each row execute function private.enforce_cash_pool_daily_close_transition();

-- =============================================================================
-- 3. Tables
-- =============================================================================

-- --- cash_reconciliations (header) -------------------------------------------
-- Mutable only through the RPCs in §6 (no UPDATE/INSERT grant exists for
-- `authenticated`; see §8) — status, current_revision_id,
-- needs_correction_revision_id, submitted_*, decided_by/decided_at, and
-- superseded_at/superseded_by_reopen_event_id can never be forged by a
-- direct table write. current_revision_id/needs_correction_revision_id
-- reference cash_reconciliation_revisions, defined below this table
-- (circular dependency) — added via ALTER TABLE in §4 once that table
-- exists. superseded_by_reopen_event_id similarly references
-- cash_pool_reopen_events, added via ALTER TABLE in §4 once that table
-- exists too.
--
-- submitted_* columns are the server-computed snapshot Task LOCK §3
-- requires ("Saat reconciliation disubmit: snapshot summary dan financial
-- version disimpan server-side") — populated exactly once, by
-- submit_cash_reconciliation, never client-suppliable. approve_cash_
-- reconciliation later compares submitted_financial_version against the
-- pool's CURRENT financial_version, not the closing-cash figures — two
-- different transaction sets can coincidentally net to the same closing
-- balance, so only the version counter is trustworthy proof nothing
-- financial changed underneath the reconciliation between submit and
-- approve (Task LOCK §3: "Jangan hanya membandingkan nilai closing
-- balance").
create table public.cash_reconciliations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  pool_id uuid not null,
  status public.cash_reconciliation_status not null default 'draft',
  current_revision_id uuid,
  needs_correction_revision_id uuid,
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_opening_cash numeric(16, 2),
  submitted_cash_top_up numeric(16, 2),
  submitted_other_cash_in numeric(16, 2),
  submitted_total_cash_out numeric(16, 2),
  submitted_expected_closing_cash numeric(16, 2),
  submitted_variance numeric(16, 2),
  submitted_financial_version bigint,
  submitted_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_reason text,
  superseded_at timestamptz,
  superseded_by_reopen_event_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite target for the child tables' tenant-safe composite FKs below.
  unique (id, tenant_id),
  foreign key (pool_id, tenant_id) references public.cash_pools (id, tenant_id) on delete cascade
);

create index cash_reconciliations_tenant_id_idx on public.cash_reconciliations (tenant_id);
create index cash_reconciliations_pool_id_idx on public.cash_reconciliations (tenant_id, pool_id);
create index cash_reconciliations_status_idx on public.cash_reconciliations (tenant_id, status);

-- --- 3a. Only one active reconciliation per pool -----------------------------
-- Database-level guarantee for Task LOCK §4/§21: draft/submitted/
-- needs_correction are always "in flight"; an approved-and-not-yet-
-- superseded reconciliation is the one that closed the pool. A rejected
-- reconciliation is terminal and inactive — a fresh draft may follow it
-- without a reopen (the pool never left 'open'). After reopen_cash_pool
-- marks the old approved row superseded_at, this partial index no longer
-- counts it, so a new reconciliation cycle can begin.
create unique index cash_reconciliations_active_per_pool_unique
  on public.cash_reconciliations (pool_id)
  where status in ('draft', 'submitted', 'needs_correction')
     or (status = 'approved' and superseded_at is null);

-- --- cash_reconciliation_revisions -------------------------------------------
-- Append-only financial snapshot per revision — actual_counted_cash and
-- explanation live here, never on the header, matching expense_submission_
-- revisions' shape from Gate 1E. A correction always inserts a new row; the
-- previous revision is never updated or deleted.
create table public.cash_reconciliation_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  reconciliation_id uuid not null,
  revision_number integer not null check (revision_number > 0),
  actual_counted_cash numeric(16, 2) not null check (actual_counted_cash >= 0),
  explanation text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (reconciliation_id, tenant_id) references public.cash_reconciliations (id, tenant_id) on delete cascade,
  unique (reconciliation_id, revision_number)
);

create index cash_reconciliation_revisions_tenant_id_idx on public.cash_reconciliation_revisions (tenant_id);
create index cash_reconciliation_revisions_reconciliation_id_idx
  on public.cash_reconciliation_revisions (tenant_id, reconciliation_id);

-- =============================================================================
-- 4. Circular FK closures
-- =============================================================================

alter table public.cash_reconciliations
  add constraint cash_reconciliations_current_revision_id_fkey
  foreign key (current_revision_id) references public.cash_reconciliation_revisions (id);

alter table public.cash_reconciliations
  add constraint cash_reconciliations_needs_correction_revision_id_fkey
  foreign key (needs_correction_revision_id) references public.cash_reconciliation_revisions (id);

-- --- cash_reconciliation_status_events ---------------------------------------
-- Append-only trail of every status transition, including the initial null
-- -> draft creation event (logged automatically, see §5c) — same pattern as
-- expense_submission_status_events from Gate 1E.
create table public.cash_reconciliation_status_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  reconciliation_id uuid not null,
  revision_id uuid references public.cash_reconciliation_revisions (id),
  from_status public.cash_reconciliation_status,
  to_status public.cash_reconciliation_status not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (reconciliation_id, tenant_id) references public.cash_reconciliations (id, tenant_id) on delete cascade,
  -- Role-independent, database-level guarantee that a reject or
  -- needs_correction decision always carries a reason.
  constraint cash_reconciliation_status_events_reason_required check (
    to_status not in ('rejected', 'needs_correction') or (reason is not null and btrim(reason) <> '')
  )
);

create index cash_reconciliation_status_events_tenant_id_idx on public.cash_reconciliation_status_events (tenant_id);
create index cash_reconciliation_status_events_reconciliation_id_idx
  on public.cash_reconciliation_status_events (tenant_id, reconciliation_id);

-- --- cash_pool_reopen_events --------------------------------------------------
-- Append-only trail of every controlled reopen — one row per reopen_cash_pool
-- call. previous_reconciliation_id points at the approved reconciliation this
-- reopen superseded (Task LOCK §6: "reconciliation tersebut ditandai
-- superseded melalui workflow/event terkontrol").
create table public.cash_pool_reopen_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  pool_id uuid not null,
  previous_reconciliation_id uuid not null,
  reason text not null check (btrim(reason) <> ''),
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (pool_id, tenant_id) references public.cash_pools (id, tenant_id) on delete cascade,
  foreign key (previous_reconciliation_id, tenant_id) references public.cash_reconciliations (id, tenant_id) on delete cascade
);

create index cash_pool_reopen_events_tenant_id_idx on public.cash_pool_reopen_events (tenant_id);
create index cash_pool_reopen_events_pool_id_idx on public.cash_pool_reopen_events (tenant_id, pool_id);

alter table public.cash_reconciliations
  add constraint cash_reconciliations_superseded_by_reopen_event_id_fkey
  foreign key (superseded_by_reopen_event_id, tenant_id) references public.cash_pool_reopen_events (id, tenant_id);

-- =============================================================================
-- 5. Triggers
-- =============================================================================

create trigger set_updated_at before update on public.cash_reconciliations
  for each row execute function private.set_updated_at();

-- Append-only guarantees — role-independent, reused from Gate 1A.
create trigger cash_reconciliation_revisions_append_only
  before update or delete on public.cash_reconciliation_revisions
  for each row execute function private.block_audit_mutation();

create trigger cash_reconciliation_status_events_append_only
  before update or delete on public.cash_reconciliation_status_events
  for each row execute function private.block_audit_mutation();

create trigger cash_pool_reopen_events_append_only
  before update or delete on public.cash_pool_reopen_events
  for each row execute function private.block_audit_mutation();

-- --- 5a. Role-independent status transition guard ---------------------------
-- Mirrors private.enforce_expense_submission_status_transition from Gate 1E.
create function private.enforce_cash_reconciliation_status_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = old.status then
    raise exception 'cash reconciliation status unchanged: already %', old.status;
  end if;

  if not (
    (old.status = 'draft' and new.status = 'submitted')
    or (old.status = 'submitted' and new.status = 'approved')
    or (old.status = 'submitted' and new.status = 'rejected')
    or (old.status = 'submitted' and new.status = 'needs_correction')
    or (old.status = 'needs_correction' and new.status = 'submitted')
  ) then
    raise exception 'invalid cash reconciliation status transition from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_cash_reconciliation_status_transition() from public;

create trigger cash_reconciliations_enforce_status_transition
  before update of status on public.cash_reconciliations
  for each row execute function private.enforce_cash_reconciliation_status_transition();

-- --- 5b. Financial version bump ---------------------------------------------
-- AFTER INSERT on both cash_pool_entries and project_cost_ledger_entries —
-- both tables carry a pool_id column, so one shared function covers cash
-- pool entry, project expense, AND reversal (entry_kind is not filtered:
-- Task LOCK §3 requires the version to bump for all three). Fires
-- role-independently: a raw service-role insert bumps the version exactly
-- the same as an RPC-driven one.
create function private.bump_cash_pool_financial_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.cash_pools set financial_version = financial_version + 1 where id = new.pool_id;
  return new;
end;
$$;

revoke execute on function private.bump_cash_pool_financial_version() from public;

create trigger cash_pool_entries_bump_financial_version
  after insert on public.cash_pool_entries
  for each row execute function private.bump_cash_pool_financial_version();

create trigger project_cost_ledger_entries_bump_financial_version
  after insert on public.project_cost_ledger_entries
  for each row execute function private.bump_cash_pool_financial_version();

-- --- 5c. Mutation guard: pool must be 'open' to accept new financial rows ---
-- BEFORE INSERT, role-independent — this is Task LOCK §5's "database-level
-- guard [...] tidak dapat dilewati melalui raw insert/service role fixture":
-- a pending_close/closed pool rejects every new cash_pool_entries row
-- (top-up, other-cash-in, AND reversal) and every new project_cost_ledger_
-- entries row (expense posted via approve_expense_submission, AND
-- reversal). Shared function, same reasoning as §5b.
create function private.enforce_cash_pool_open_for_financial_entry()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.cash_pool_daily_close_status;
begin
  select daily_close_status into v_status from public.cash_pools where id = new.pool_id;

  if v_status is null then
    raise exception 'daily cash pool not found';
  end if;

  if v_status <> 'open' then
    raise exception 'cash pool is not open for new financial entries';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_cash_pool_open_for_financial_entry() from public;

create trigger cash_pool_entries_enforce_pool_open
  before insert on public.cash_pool_entries
  for each row execute function private.enforce_cash_pool_open_for_financial_entry();

create trigger project_cost_ledger_entries_enforce_pool_open
  before insert on public.project_cost_ledger_entries
  for each row execute function private.enforce_cash_pool_open_for_financial_entry();

-- --- 5d. Automatic creation event ---------------------------------------------
-- Mirrors private.log_expense_submission_creation from Gate 1E.
create function private.log_cash_reconciliation_creation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.cash_reconciliation_status_events (
    tenant_id, reconciliation_id, revision_id, from_status, to_status, actor_user_id, reason
  ) values (
    new.tenant_id, new.id, new.current_revision_id, null, new.status, auth.uid(), null
  );
  return new;
end;
$$;

revoke execute on function private.log_cash_reconciliation_creation() from public;

create trigger cash_reconciliation_creation_log
  after insert on public.cash_reconciliations
  for each row execute function private.log_cash_reconciliation_creation();

-- =============================================================================
-- 6. RPCs — the only mutation path (no INSERT/UPDATE/DELETE grant exists for
--    `authenticated` on any of the three new tables, and cash_pools keeps its
--    Gate 1C posture of no UPDATE grant either; see §8)
-- =============================================================================

-- --- 6a. create_cash_reconciliation_draft ------------------------------------
-- tenant_id is re-derived from the pool row (never a caller argument) — the
-- pool already exists by this point (created via get_or_create_daily_cash_
-- pool), so there is no "first write" case requiring tenant_id as an
-- argument, unlike that RPC. Validates actual_counted_cash is non-negative
-- and requires a non-empty explanation whenever the CURRENT variance against
-- the live cash_pool_daily_summary is non-zero (Task LOCK §1). The partial
-- unique index in §3a is the backstop guarantee against a second concurrent
-- draft for the same pool.
create function public.create_cash_reconciliation_draft(
  p_pool_id uuid,
  p_actual_counted_cash numeric,
  p_explanation text default null
)
returns public.cash_reconciliations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_daily_close_status public.cash_pool_daily_close_status;
  v_summary public.cash_pool_daily_summary;
  v_variance numeric(16, 2);
  v_reconciliation_id uuid;
  v_revision_id uuid;
  v_result public.cash_reconciliations;
begin
  select tenant_id, daily_close_status into v_tenant_id, v_daily_close_status
  from public.cash_pools
  where id = p_pool_id;

  if v_tenant_id is null then
    raise exception 'daily cash pool not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to create cash reconciliation';
  end if;

  if v_daily_close_status <> 'open' then
    raise exception 'cash pool is not open for a new reconciliation';
  end if;

  if p_actual_counted_cash is null or p_actual_counted_cash < 0 then
    raise exception 'actual counted cash must not be negative';
  end if;

  select * into v_summary from public.cash_pool_daily_summary where pool_id = p_pool_id;
  v_variance := p_actual_counted_cash - coalesce(v_summary.closing_cash, 0);

  if v_variance <> 0 and (p_explanation is null or btrim(p_explanation) = '') then
    raise exception 'explanation is required when variance is non-zero';
  end if;

  insert into public.cash_reconciliations (tenant_id, pool_id, status, created_by)
  values (v_tenant_id, p_pool_id, 'draft', auth.uid())
  returning id into v_reconciliation_id;

  insert into public.cash_reconciliation_revisions (
    tenant_id, reconciliation_id, revision_number, actual_counted_cash, explanation, created_by
  ) values (
    v_tenant_id, v_reconciliation_id, 1, p_actual_counted_cash, p_explanation, auth.uid()
  )
  returning id into v_revision_id;

  update public.cash_reconciliations
  set current_revision_id = v_revision_id
  where id = v_reconciliation_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.create_cash_reconciliation_draft(uuid, numeric, text) from public;
grant execute on function public.create_cash_reconciliation_draft(uuid, numeric, text) to authenticated;

-- --- 6b. revise_cash_reconciliation_draft ------------------------------------
-- tenant_id/pool_id are re-derived from the reconciliation row itself. Only
-- allowed while status is 'draft' or 'needs_correction' — a submitted/
-- approved/rejected reconciliation's counted-cash data can never be
-- overwritten. `for update` locks the header so concurrent revisions cannot
-- race on the next revision_number.
create function public.revise_cash_reconciliation_draft(
  p_reconciliation_id uuid,
  p_actual_counted_cash numeric,
  p_explanation text default null
)
returns public.cash_reconciliations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_pool_id uuid;
  v_status public.cash_reconciliation_status;
  v_daily_close_status public.cash_pool_daily_close_status;
  v_summary public.cash_pool_daily_summary;
  v_variance numeric(16, 2);
  v_next_revision_number integer;
  v_revision_id uuid;
  v_result public.cash_reconciliations;
begin
  select tenant_id, pool_id, status into v_tenant_id, v_pool_id, v_status
  from public.cash_reconciliations
  where id = p_reconciliation_id
  for update;

  if v_tenant_id is null then
    raise exception 'cash reconciliation not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to revise cash reconciliation';
  end if;

  if v_status not in ('draft', 'needs_correction') then
    raise exception 'cash reconciliation cannot be revised in its current status';
  end if;

  select daily_close_status into v_daily_close_status from public.cash_pools where id = v_pool_id;
  if v_daily_close_status <> 'open' then
    raise exception 'cash pool is not open for reconciliation revision';
  end if;

  if p_actual_counted_cash is null or p_actual_counted_cash < 0 then
    raise exception 'actual counted cash must not be negative';
  end if;

  select * into v_summary from public.cash_pool_daily_summary where pool_id = v_pool_id;
  v_variance := p_actual_counted_cash - coalesce(v_summary.closing_cash, 0);

  if v_variance <> 0 and (p_explanation is null or btrim(p_explanation) = '') then
    raise exception 'explanation is required when variance is non-zero';
  end if;

  select coalesce(max(revision_number), 0) + 1 into v_next_revision_number
  from public.cash_reconciliation_revisions
  where reconciliation_id = p_reconciliation_id;

  insert into public.cash_reconciliation_revisions (
    tenant_id, reconciliation_id, revision_number, actual_counted_cash, explanation, created_by
  ) values (
    v_tenant_id, p_reconciliation_id, v_next_revision_number, p_actual_counted_cash, p_explanation, auth.uid()
  )
  returning id into v_revision_id;

  update public.cash_reconciliations
  set current_revision_id = v_revision_id
  where id = p_reconciliation_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.revise_cash_reconciliation_draft(uuid, numeric, text) from public;
grant execute on function public.revise_cash_reconciliation_draft(uuid, numeric, text) to authenticated;

-- --- 6c. submit_cash_reconciliation -------------------------------------------
-- From 'draft', submission is unconditional (beyond the checks below). From
-- 'needs_correction', resubmission is only allowed once current_revision_id
-- differs from needs_correction_revision_id — mirrors submit_expense's proof
-- that a new revision was created first. Locks the pool row BEFORE reading
-- cash_pool_daily_summary: any concurrent record_cash_pool_entry/
-- record_project_expense/reverse_* call that would bump financial_version
-- must also UPDATE this same cash_pools row (§5b), so it blocks until this
-- transaction commits — the summary read below and the financial_version
-- captured afterward are therefore guaranteed consistent with each other,
-- which is what makes the approve-time staleness check in §6d meaningful.
create function public.submit_cash_reconciliation(
  p_reconciliation_id uuid
)
returns public.cash_reconciliations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_pool_id uuid;
  v_status public.cash_reconciliation_status;
  v_current_revision_id uuid;
  v_needs_correction_revision_id uuid;
  v_pool public.cash_pools;
  v_summary public.cash_pool_daily_summary;
  v_revision public.cash_reconciliation_revisions;
  v_variance numeric(16, 2);
  v_result public.cash_reconciliations;
begin
  select tenant_id, pool_id, status, current_revision_id, needs_correction_revision_id
    into v_tenant_id, v_pool_id, v_status, v_current_revision_id, v_needs_correction_revision_id
    from public.cash_reconciliations
    where id = p_reconciliation_id
    for update;

  if v_tenant_id is null then
    raise exception 'cash reconciliation not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to submit cash reconciliation';
  end if;

  if v_status = 'needs_correction' then
    if v_current_revision_id is not distinct from v_needs_correction_revision_id then
      raise exception 'cash reconciliation requires a new revision before resubmission';
    end if;
  elsif v_status <> 'draft' then
    raise exception 'cash reconciliation cannot be submitted from its current status';
  end if;

  select * into v_pool from public.cash_pools where id = v_pool_id for update;

  if v_pool.daily_close_status <> 'open' then
    raise exception 'cash pool is not open for reconciliation submission';
  end if;

  select * into v_summary from public.cash_pool_daily_summary where pool_id = v_pool_id;
  select * into v_revision from public.cash_reconciliation_revisions where id = v_current_revision_id;

  v_variance := v_revision.actual_counted_cash - coalesce(v_summary.closing_cash, 0);

  if v_variance <> 0 and (v_revision.explanation is null or btrim(v_revision.explanation) = '') then
    raise exception 'explanation is required when variance is non-zero';
  end if;

  update public.cash_reconciliations
  set
    status = 'submitted',
    submitted_by = auth.uid(),
    submitted_opening_cash = v_summary.opening_cash,
    submitted_cash_top_up = v_summary.cash_top_up,
    submitted_other_cash_in = v_summary.other_cash_in,
    submitted_total_cash_out = v_summary.total_cash_out,
    submitted_expected_closing_cash = v_summary.closing_cash,
    submitted_variance = v_variance,
    submitted_financial_version = v_pool.financial_version,
    submitted_at = now()
  where id = p_reconciliation_id
  returning * into v_result;

  insert into public.cash_reconciliation_status_events (
    tenant_id, reconciliation_id, revision_id, from_status, to_status, actor_user_id, reason
  ) values (
    v_tenant_id, p_reconciliation_id, v_current_revision_id, v_status, 'submitted', auth.uid(), null
  );

  update public.cash_pools set daily_close_status = 'pending_close' where id = v_pool_id;

  return v_result;
end;
$$;

revoke execute on function public.submit_cash_reconciliation(uuid) from public;
grant execute on function public.submit_cash_reconciliation(uuid) to authenticated;

-- --- 6d. approve_cash_reconciliation ------------------------------------------
-- Owner-only. `for update` locks the header, then the pool row — a
-- concurrent second approval attempt blocks until the first commits, then
-- sees status already 'approved' and raises. Compares the pool's CURRENT
-- financial_version (read under lock) against the version captured at
-- submit time; any mismatch raises the stable 'RECONCILIATION_STALE' error
-- (Task LOCK §3) rather than approving against possibly-stale numbers.
create function public.approve_cash_reconciliation(
  p_reconciliation_id uuid
)
returns public.cash_reconciliations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_pool_id uuid;
  v_status public.cash_reconciliation_status;
  v_submitted_financial_version bigint;
  v_pool public.cash_pools;
  v_result public.cash_reconciliations;
begin
  select tenant_id, pool_id, status, submitted_financial_version
    into v_tenant_id, v_pool_id, v_status, v_submitted_financial_version
    from public.cash_reconciliations
    where id = p_reconciliation_id
    for update;

  if v_tenant_id is null then
    raise exception 'cash reconciliation not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'not authorized to review cash reconciliation';
  end if;

  if v_status <> 'submitted' then
    raise exception 'cash reconciliation is not awaiting review';
  end if;

  select * into v_pool from public.cash_pools where id = v_pool_id for update;

  if v_pool.daily_close_status <> 'pending_close' then
    raise exception 'cash pool is not pending close';
  end if;

  if v_pool.financial_version <> v_submitted_financial_version then
    raise exception 'RECONCILIATION_STALE';
  end if;

  update public.cash_pools set daily_close_status = 'closed' where id = v_pool_id;

  update public.cash_reconciliations
  set status = 'approved', decided_by = auth.uid(), decided_at = now()
  where id = p_reconciliation_id
  returning * into v_result;

  insert into public.cash_reconciliation_status_events (
    tenant_id, reconciliation_id, revision_id, from_status, to_status, actor_user_id, reason
  ) values (
    v_tenant_id, p_reconciliation_id, v_result.current_revision_id, 'submitted', 'approved', auth.uid(), null
  );

  return v_result;
end;
$$;

revoke execute on function public.approve_cash_reconciliation(uuid) from public;
grant execute on function public.approve_cash_reconciliation(uuid) to authenticated;

-- --- 6e. reject_cash_reconciliation --------------------------------------------
-- Owner-only. Reason required (also enforced at the table level by
-- cash_reconciliation_status_events_reason_required in §3). Returns the pool
-- to 'open' — a rejected reconciliation never closes the pool.
create function public.reject_cash_reconciliation(
  p_reconciliation_id uuid,
  p_reason text
)
returns public.cash_reconciliations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_pool_id uuid;
  v_status public.cash_reconciliation_status;
  v_current_revision_id uuid;
  v_result public.cash_reconciliations;
begin
  select tenant_id, pool_id, status, current_revision_id
    into v_tenant_id, v_pool_id, v_status, v_current_revision_id
    from public.cash_reconciliations
    where id = p_reconciliation_id
    for update;

  if v_tenant_id is null then
    raise exception 'cash reconciliation not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'not authorized to review cash reconciliation';
  end if;

  if v_status <> 'submitted' then
    raise exception 'cash reconciliation is not awaiting review';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'rejection reason is required';
  end if;

  update public.cash_reconciliations
  set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_reason = p_reason
  where id = p_reconciliation_id
  returning * into v_result;

  insert into public.cash_reconciliation_status_events (
    tenant_id, reconciliation_id, revision_id, from_status, to_status, actor_user_id, reason
  ) values (
    v_tenant_id, p_reconciliation_id, v_current_revision_id, 'submitted', 'rejected', auth.uid(), p_reason
  );

  update public.cash_pools set daily_close_status = 'open' where id = v_pool_id;

  return v_result;
end;
$$;

revoke execute on function public.reject_cash_reconciliation(uuid, text) from public;
grant execute on function public.reject_cash_reconciliation(uuid, text) to authenticated;

-- --- 6f. request_cash_reconciliation_correction --------------------------------
-- Owner-only. Reason required. Stores needs_correction_revision_id = the
-- revision that was current at the moment of this decision — submit_cash_
-- reconciliation later compares against this to prove a new revision was
-- created before resubmission. Returns the pool to 'open'.
create function public.request_cash_reconciliation_correction(
  p_reconciliation_id uuid,
  p_reason text
)
returns public.cash_reconciliations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_pool_id uuid;
  v_status public.cash_reconciliation_status;
  v_current_revision_id uuid;
  v_result public.cash_reconciliations;
begin
  select tenant_id, pool_id, status, current_revision_id
    into v_tenant_id, v_pool_id, v_status, v_current_revision_id
    from public.cash_reconciliations
    where id = p_reconciliation_id
    for update;

  if v_tenant_id is null then
    raise exception 'cash reconciliation not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'not authorized to review cash reconciliation';
  end if;

  if v_status <> 'submitted' then
    raise exception 'cash reconciliation is not awaiting review';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'correction reason is required';
  end if;

  update public.cash_reconciliations
  set status = 'needs_correction', decided_by = auth.uid(), decided_at = now(),
      decision_reason = p_reason, needs_correction_revision_id = v_current_revision_id
  where id = p_reconciliation_id
  returning * into v_result;

  insert into public.cash_reconciliation_status_events (
    tenant_id, reconciliation_id, revision_id, from_status, to_status, actor_user_id, reason
  ) values (
    v_tenant_id, p_reconciliation_id, v_current_revision_id, 'submitted', 'needs_correction', auth.uid(), p_reason
  );

  update public.cash_pools set daily_close_status = 'open' where id = v_pool_id;

  return v_result;
end;
$$;

revoke execute on function public.request_cash_reconciliation_correction(uuid, text) from public;
grant execute on function public.request_cash_reconciliation_correction(uuid, text) to authenticated;

-- --- 6g. reopen_cash_pool -------------------------------------------------------
-- Owner-only (Task LOCK §6: "admin tidak dapat reopen"). Requires a reason.
-- Locks the pool row, then the active approved reconciliation (status =
-- 'approved' and superseded_at is null) — there is always exactly one for a
-- 'closed' pool, since approve_cash_reconciliation is the only path that
-- sets daily_close_status = 'closed'. Marks it superseded via a controlled
-- append-only event rather than deleting or overwriting it (the approved
-- row and its revisions remain queryable forever), then reopens the pool.
-- Does not bump financial_version itself — only actual ledger mutations
-- (§5b) do that; subsequent cash-pool-entry/expense activity after reopen
-- bumps it normally, and a fresh EOD reconciliation is required before the
-- pool can close again (enforced by §3a's partial unique index once this
-- reconciliation is marked superseded).
create function public.reopen_cash_pool(
  p_pool_id uuid,
  p_reason text
)
returns public.cash_pools
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_daily_close_status public.cash_pool_daily_close_status;
  v_reconciliation_id uuid;
  v_event_id uuid;
  v_result public.cash_pools;
begin
  select tenant_id, daily_close_status into v_tenant_id, v_daily_close_status
  from public.cash_pools
  where id = p_pool_id
  for update;

  if v_tenant_id is null then
    raise exception 'daily cash pool not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'not authorized to reopen cash pool';
  end if;

  if v_daily_close_status <> 'closed' then
    raise exception 'cash pool is not closed';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reopen reason is required';
  end if;

  select id into v_reconciliation_id
  from public.cash_reconciliations
  where pool_id = p_pool_id and status = 'approved' and superseded_at is null
  for update;

  if v_reconciliation_id is null then
    raise exception 'no active approved reconciliation found to supersede';
  end if;

  insert into public.cash_pool_reopen_events (
    tenant_id, pool_id, previous_reconciliation_id, reason, actor_user_id
  ) values (
    v_tenant_id, p_pool_id, v_reconciliation_id, p_reason, auth.uid()
  )
  returning id into v_event_id;

  update public.cash_reconciliations
  set superseded_at = now(), superseded_by_reopen_event_id = v_event_id
  where id = v_reconciliation_id;

  update public.cash_pools
  set daily_close_status = 'open'
  where id = p_pool_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.reopen_cash_pool(uuid, text) from public;
grant execute on function public.reopen_cash_pool(uuid, text) to authenticated;

-- =============================================================================
-- 7. Read model — tenant-safe, server-computed
-- =============================================================================
-- security_invoker = true: no elevated privilege of its own — evaluates
-- under the querying role's own grants and RLS, so cross-tenant rows are
-- excluded by the underlying tables' own SELECT policies exactly as a
-- direct table query would be.

create view public.cash_pool_reconciliation_current
with (security_invoker = true) as
select
  r.id as reconciliation_id,
  r.tenant_id,
  r.pool_id,
  p.business_date,
  p.daily_close_status as pool_daily_close_status,
  p.financial_version as pool_financial_version,
  r.status,
  r.current_revision_id,
  rev.revision_number,
  rev.actual_counted_cash,
  rev.explanation,
  r.created_by,
  r.created_at,
  r.updated_at,
  r.submitted_by,
  r.submitted_opening_cash,
  r.submitted_cash_top_up,
  r.submitted_other_cash_in,
  r.submitted_total_cash_out,
  r.submitted_expected_closing_cash,
  r.submitted_variance,
  r.submitted_financial_version,
  r.submitted_at,
  (r.submitted_financial_version is not null and r.submitted_financial_version <> p.financial_version) as is_stale,
  r.decided_by,
  r.decided_at,
  r.decision_reason,
  r.superseded_at,
  r.superseded_by_reopen_event_id
from public.cash_reconciliations r
join public.cash_pools p on p.id = r.pool_id
join public.cash_reconciliation_revisions rev on rev.id = r.current_revision_id;

grant select on public.cash_pool_reconciliation_current to authenticated;
grant select on public.cash_pool_reconciliation_current to service_role;

-- =============================================================================
-- 8. RLS & Grants
-- =============================================================================
-- auto_expose_new_tables is off, so all three new tables start with zero
-- privileges for anon/authenticated/service_role; the REVOKE below is
-- defensive belt-and-suspenders on top of that. No INSERT/UPDATE/DELETE
-- grant exists for `authenticated` on any of them — the RPCs in §6
-- (SECURITY DEFINER, running as the table owner) are the only mutation path.

alter table public.cash_reconciliations enable row level security;
alter table public.cash_reconciliation_revisions enable row level security;
alter table public.cash_reconciliation_status_events enable row level security;
alter table public.cash_pool_reopen_events enable row level security;

revoke all on public.cash_reconciliations from public;
revoke all on public.cash_reconciliation_revisions from public;
revoke all on public.cash_reconciliation_status_events from public;
revoke all on public.cash_pool_reopen_events from public;

-- Same visibility as expense_submissions/expense_submission_revisions from
-- Gate 1E: every active tenant member (including viewer) can read the
-- reconciliation header and its revisions.
create policy cash_reconciliations_select_member
  on public.cash_reconciliations for select
  to authenticated
  using (private.current_user_is_active_tenant_member (tenant_id));

grant select on public.cash_reconciliations to authenticated;
grant all on public.cash_reconciliations to service_role;

create policy cash_reconciliation_revisions_select_member
  on public.cash_reconciliation_revisions for select
  to authenticated
  using (private.current_user_is_active_tenant_member (tenant_id));

grant select on public.cash_reconciliation_revisions to authenticated;
grant all on public.cash_reconciliation_revisions to service_role;

-- Same visibility as expense_submission_status_events: owner/admin/reviewer
-- can read the trail, plain viewer cannot.
create policy cash_reconciliation_status_events_select_owner_admin_reviewer
  on public.cash_reconciliation_status_events for select
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin', 'reviewer']::public.tenant_role[]));

grant select on public.cash_reconciliation_status_events to authenticated;
grant select, insert on public.cash_reconciliation_status_events to service_role;

create policy cash_pool_reopen_events_select_owner_admin_reviewer
  on public.cash_pool_reopen_events for select
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin', 'reviewer']::public.tenant_role[]));

grant select on public.cash_pool_reopen_events to authenticated;
grant select, insert on public.cash_pool_reopen_events to service_role;
