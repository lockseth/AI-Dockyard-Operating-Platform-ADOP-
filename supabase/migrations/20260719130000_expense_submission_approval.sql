-- ADOP Phase 1 Gate 1E — Expense Submission & Owner Approval Foundation
--
-- Introduces a submission/review workflow in front of the immutable
-- project cost ledger Gate 1D established: admin/owner draft and submit an
-- expense, only the owner can approve/reject/request correction, and only
-- an approve decision posts exactly one entry to
-- public.project_cost_ledger_entries. Financial data on a submitted
-- submission is never overwritten — a correction always creates a new
-- append-only revision (public.expense_submission_revisions); every status
-- transition is recorded append-only
-- (public.expense_submission_status_events).
--
-- Does not edit any prior migration file — reuses private.
-- current_user_is_active_tenant_member, private.current_user_has_tenant_role,
-- private.block_audit_mutation, and private.set_updated_at from earlier
-- gates. Two Gate 1D RPCs are intentionally tightened here via
-- `create or replace function` (same technique Gate 1D itself used to
-- replace Gate 1C's cash_pool_daily_summary view without editing its
-- migration file) and a REVOKE:
--   - public.reverse_project_expense: role check narrowed from
--     owner+admin to owner-only (task LOCK: "admin tidak boleh mereversal
--     expense secara langsung").
--   - public.record_project_expense: EXECUTE revoked from `authenticated`
--     entirely — the only remaining caller is
--     public.approve_expense_submission below, which the function owner
--     can still invoke regardless of grants (owners implicitly retain
--     EXECUTE on their own functions). This closes the direct-posting
--     bypass; ledger posting is now reachable only through the atomic
--     approval RPC.

-- =============================================================================
-- 1. Enum
-- =============================================================================

create type public.expense_submission_status as enum (
  'draft', 'submitted', 'approved', 'rejected', 'needs_correction'
);

-- =============================================================================
-- 2. Tables
-- =============================================================================

-- --- expense_submissions (header) -------------------------------------------
-- Mutable only through the RPCs in §5 (no UPDATE/INSERT grant exists for
-- `authenticated`; see §7) — status, current_revision_id,
-- needs_correction_revision_id, ledger_entry_id, decided_by, and decided_at
-- can never be forged by a direct table write. current_revision_id and
-- needs_correction_revision_id reference expense_submission_revisions, which
-- is defined below this table (circular dependency) — their FK constraints
-- are added via ALTER TABLE in §3 once that table exists; both start out as
-- plain nullable uuid columns here.
create table public.expense_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  status public.expense_submission_status not null default 'draft',
  current_revision_id uuid,
  needs_correction_revision_id uuid,
  ledger_entry_id uuid references public.project_cost_ledger_entries (id),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  -- Composite target for the child tables' tenant-safe composite FKs below.
  unique (id, tenant_id)
);

create index expense_submissions_tenant_id_idx on public.expense_submissions (tenant_id);
create index expense_submissions_status_idx on public.expense_submissions (tenant_id, status);

-- One ledger entry per submission, enforced at the database level (not just
-- the "for update" lock in §5e) — mirrors
-- project_cost_ledger_entries_reverses_entry_id_unique's "cannot happen
-- twice" posture from Gate 1D.
create unique index expense_submissions_ledger_entry_id_unique
  on public.expense_submissions (ledger_entry_id)
  where ledger_entry_id is not null;

-- --- expense_submission_revisions -------------------------------------------
-- Append-only financial snapshot per revision. Every field the submission
-- "contains" (pool/project/category/vendor/amount/description/reference)
-- lives here, never on the header — a correction always inserts a new row,
-- the previous revision is never updated or deleted, matching the ledger's
-- own append-only + reversal shape from Gate 1D.
create table public.expense_submission_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  submission_id uuid not null,
  revision_number integer not null check (revision_number > 0),
  pool_id uuid not null,
  project_id uuid not null,
  category_id uuid not null,
  vendor_id uuid,
  amount numeric(16, 2) not null check (amount > 0),
  description text not null check (btrim(description) <> ''),
  reference_number text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (submission_id, tenant_id) references public.expense_submissions (id, tenant_id) on delete cascade,
  foreign key (pool_id, tenant_id) references public.cash_pools (id, tenant_id) on delete cascade,
  foreign key (project_id, tenant_id) references public.vessel_projects (id, tenant_id) on delete cascade,
  foreign key (category_id, tenant_id) references public.expense_categories (id, tenant_id) on delete cascade,
  foreign key (vendor_id, tenant_id) references public.vendors (id, tenant_id) on delete cascade,
  unique (submission_id, revision_number)
);

create index expense_submission_revisions_tenant_id_idx on public.expense_submission_revisions (tenant_id);
create index expense_submission_revisions_submission_id_idx on public.expense_submission_revisions (tenant_id, submission_id);

-- =============================================================================
-- 3. Circular FK closure — header -> revisions, added now that both tables
--    exist
-- =============================================================================

alter table public.expense_submissions
  add constraint expense_submissions_current_revision_id_fkey
  foreign key (current_revision_id) references public.expense_submission_revisions (id);

alter table public.expense_submissions
  add constraint expense_submissions_needs_correction_revision_id_fkey
  foreign key (needs_correction_revision_id) references public.expense_submission_revisions (id);

-- --- expense_submission_status_events ---------------------------------------
-- Append-only trail of every status transition, including the initial
-- null -> draft creation event (logged automatically, see §4) — same
-- automatic-trigger pattern Gate 1B used for
-- vessel_project_lifecycle_events. revision_id records which revision was
-- current at the moment of the transition (in particular, which revision an
-- owner reviewed) — request_expense_correction uses this via
-- needs_correction_revision_id on the header to prove a resubmission
-- happened only after a NEW revision was created.
create table public.expense_submission_status_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  submission_id uuid not null,
  revision_id uuid references public.expense_submission_revisions (id),
  from_status public.expense_submission_status,
  to_status public.expense_submission_status not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (submission_id, tenant_id) references public.expense_submissions (id, tenant_id) on delete cascade,
  -- Role-independent, database-level guarantee that a reject or
  -- needs_correction decision always carries a reason — not just a client-
  -- side form requirement.
  constraint expense_submission_status_events_reason_required check (
    to_status not in ('rejected', 'needs_correction') or (reason is not null and btrim(reason) <> '')
  )
);

create index expense_submission_status_events_tenant_id_idx on public.expense_submission_status_events (tenant_id);
create index expense_submission_status_events_submission_id_idx on public.expense_submission_status_events (tenant_id, submission_id);

-- =============================================================================
-- 4. Triggers
-- =============================================================================

-- updated_at bookkeeping — reused from Gate 0A, same as vessel_projects.
create trigger set_updated_at before update on public.expense_submissions
  for each row execute function private.set_updated_at();

-- Append-only guarantees — reused from Gate 1A, role-independent.
create trigger expense_submission_revisions_append_only
  before update or delete on public.expense_submission_revisions
  for each row execute function private.block_audit_mutation();

create trigger expense_submission_status_events_append_only
  before update or delete on public.expense_submission_status_events
  for each row execute function private.block_audit_mutation();

-- --- 4a. Role-independent status transition guard ---------------------------
-- BEFORE UPDATE OF status, fires regardless of caller — the real database
-- constraint for the allowed state machine, not just RPC-level validation.
-- Only fires when the `status` column is part of the UPDATE's target list,
-- so revise_expense_draft's current_revision_id-only update (§5b) never
-- triggers it. Mirrors
-- private.enforce_vessel_project_lifecycle_transition's shape from Gate 1B.
create function private.enforce_expense_submission_status_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = old.status then
    raise exception 'expense submission status unchanged: already %', old.status;
  end if;

  if not (
    (old.status = 'draft' and new.status = 'submitted')
    or (old.status = 'submitted' and new.status = 'approved')
    or (old.status = 'submitted' and new.status = 'rejected')
    or (old.status = 'submitted' and new.status = 'needs_correction')
    or (old.status = 'needs_correction' and new.status = 'submitted')
  ) then
    raise exception 'invalid expense submission status transition from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_expense_submission_status_transition() from public;

create trigger expense_submissions_enforce_status_transition
  before update of status on public.expense_submissions
  for each row execute function private.enforce_expense_submission_status_transition();

-- --- 4b. Automatic creation event --------------------------------------------
-- Mirrors private.log_vessel_project_creation from Gate 1B: every insert
-- logs its own null -> draft event in the same statement, so a submission
-- can never exist without a matching initial status event.
create function private.log_expense_submission_creation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.expense_submission_status_events (
    tenant_id, submission_id, revision_id, from_status, to_status, actor_user_id, reason
  ) values (
    new.tenant_id, new.id, new.current_revision_id, null, new.status, auth.uid(), null
  );
  return new;
end;
$$;

revoke execute on function private.log_expense_submission_creation() from public;

create trigger expense_submission_creation_log
  after insert on public.expense_submissions
  for each row execute function private.log_expense_submission_creation();

-- =============================================================================
-- 5. RPCs — the only mutation path (no INSERT/UPDATE/DELETE grant exists for
--    `authenticated` on any of the three tables; see §7)
-- =============================================================================

-- --- 5a. create_expense_draft ------------------------------------------------
-- tenant_id necessarily arrives as an argument (this is the first write for
-- the submission), same trust model as get_or_create_daily_cash_pool from
-- Gate 1C: private.current_user_has_tenant_role immediately rejects any
-- tenant_id the caller is not an active owner/admin member of. Creates the
-- header and its first revision (revision_number 1) in the same statement
-- sequence, then points current_revision_id at it — the AFTER INSERT
-- trigger in §4b logs the creation event automatically.
create function public.create_expense_draft(
  p_tenant_id uuid,
  p_pool_id uuid,
  p_project_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_description text,
  p_vendor_id uuid default null,
  p_reference_number text default null
)
returns public.expense_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_submission_id uuid;
  v_revision_id uuid;
  v_result public.expense_submissions;
begin
  if not private.current_user_has_tenant_role(p_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to create expense submission';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  if p_description is null or btrim(p_description) = '' then
    raise exception 'expense description is required';
  end if;

  insert into public.expense_submissions (tenant_id, status, created_by)
  values (p_tenant_id, 'draft', auth.uid())
  returning id into v_submission_id;

  insert into public.expense_submission_revisions (
    tenant_id, submission_id, revision_number, pool_id, project_id, category_id, vendor_id,
    amount, description, reference_number, created_by
  ) values (
    p_tenant_id, v_submission_id, 1, p_pool_id, p_project_id, p_category_id, p_vendor_id,
    p_amount, p_description, p_reference_number, auth.uid()
  )
  returning id into v_revision_id;

  update public.expense_submissions
  set current_revision_id = v_revision_id
  where id = v_submission_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.create_expense_draft(uuid, uuid, uuid, uuid, numeric, text, uuid, text) from public;
grant execute on function public.create_expense_draft(uuid, uuid, uuid, uuid, numeric, text, uuid, text) to authenticated;

-- --- 5b. revise_expense_draft ------------------------------------------------
-- tenant_id is re-derived from the submission row itself, never accepted as
-- an argument. `for update` locks the header so concurrent revisions cannot
-- race on the next revision_number. Allowed only while status is 'draft' or
-- 'needs_correction' — a submitted/approved/rejected submission's financial
-- data can never be overwritten, only draft or a correction cycle may add a
-- new revision. Does not touch `status`, so the transition trigger in §4a
-- never fires here.
create function public.revise_expense_draft(
  p_submission_id uuid,
  p_pool_id uuid,
  p_project_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_description text,
  p_vendor_id uuid default null,
  p_reference_number text default null
)
returns public.expense_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_status public.expense_submission_status;
  v_next_revision_number integer;
  v_revision_id uuid;
  v_result public.expense_submissions;
begin
  select tenant_id, status into v_tenant_id, v_status
  from public.expense_submissions
  where id = p_submission_id
  for update;

  if v_tenant_id is null then
    raise exception 'expense submission not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to revise expense submission';
  end if;

  if v_status not in ('draft', 'needs_correction') then
    raise exception 'expense submission cannot be revised in its current status';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  if p_description is null or btrim(p_description) = '' then
    raise exception 'expense description is required';
  end if;

  select coalesce(max(revision_number), 0) + 1 into v_next_revision_number
  from public.expense_submission_revisions
  where submission_id = p_submission_id;

  insert into public.expense_submission_revisions (
    tenant_id, submission_id, revision_number, pool_id, project_id, category_id, vendor_id,
    amount, description, reference_number, created_by
  ) values (
    v_tenant_id, p_submission_id, v_next_revision_number, p_pool_id, p_project_id, p_category_id, p_vendor_id,
    p_amount, p_description, p_reference_number, auth.uid()
  )
  returning id into v_revision_id;

  update public.expense_submissions
  set current_revision_id = v_revision_id
  where id = p_submission_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.revise_expense_draft(uuid, uuid, uuid, uuid, numeric, text, uuid, text) from public;
grant execute on function public.revise_expense_draft(uuid, uuid, uuid, uuid, numeric, text, uuid, text) to authenticated;

-- --- 5c. submit_expense -------------------------------------------------------
-- From 'draft', submission is unconditional. From 'needs_correction',
-- resubmission is only allowed once current_revision_id differs from
-- needs_correction_revision_id (the revision that was current when the
-- owner requested correction) — i.e. a new revision must have been created
-- first via revise_expense_draft. This is the database-level proof behind
-- "needs_correction hanya dapat disubmit ulang setelah revision baru".
create function public.submit_expense(
  p_submission_id uuid
)
returns public.expense_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_status public.expense_submission_status;
  v_current_revision_id uuid;
  v_needs_correction_revision_id uuid;
  v_result public.expense_submissions;
begin
  select tenant_id, status, current_revision_id, needs_correction_revision_id
    into v_tenant_id, v_status, v_current_revision_id, v_needs_correction_revision_id
    from public.expense_submissions
    where id = p_submission_id
    for update;

  if v_tenant_id is null then
    raise exception 'expense submission not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to submit expense submission';
  end if;

  if v_status = 'needs_correction' then
    if v_current_revision_id is not distinct from v_needs_correction_revision_id then
      raise exception 'expense submission requires a new revision before resubmission';
    end if;
  elsif v_status <> 'draft' then
    raise exception 'expense submission cannot be submitted from its current status';
  end if;

  update public.expense_submissions
  set status = 'submitted'
  where id = p_submission_id
  returning * into v_result;

  insert into public.expense_submission_status_events (
    tenant_id, submission_id, revision_id, from_status, to_status, actor_user_id, reason
  ) values (
    v_tenant_id, p_submission_id, v_current_revision_id, v_status, 'submitted', auth.uid(), null
  );

  return v_result;
end;
$$;

revoke execute on function public.submit_expense(uuid) from public;
grant execute on function public.submit_expense(uuid) to authenticated;

-- --- 5d. approve_expense_submission ------------------------------------------
-- Owner-only. `for update` locks the header first — a concurrent second
-- approval attempt blocks until the first commits, then sees status already
-- 'approved' and raises, so double-approval cannot post two ledger entries
-- (the partial unique index on ledger_entry_id in §2 is the backstop
-- guarantee even under weaker isolation, same posture as
-- reverse_project_expense's "already reversed" check from Gate 1D).
-- Delegates the actual posting to public.record_project_expense — reusing
-- it re-validates tenant/pool/project/category/vendor via its own composite
-- FKs and rejects a closed project via its own trigger, so none of that
-- logic is duplicated here. record_project_expense's EXECUTE grant to
-- `authenticated` is revoked in §8 below; calling it from here still works
-- because this function's owner implicitly retains EXECUTE on its own
-- functions regardless of grants.
create function public.approve_expense_submission(
  p_submission_id uuid
)
returns public.expense_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_status public.expense_submission_status;
  v_current_revision_id uuid;
  v_revision public.expense_submission_revisions;
  v_entry public.project_cost_ledger_entries;
  v_result public.expense_submissions;
begin
  select tenant_id, status, current_revision_id
    into v_tenant_id, v_status, v_current_revision_id
    from public.expense_submissions
    where id = p_submission_id
    for update;

  if v_tenant_id is null then
    raise exception 'expense submission not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'not authorized to review expense submission';
  end if;

  if v_status <> 'submitted' then
    raise exception 'expense submission is not awaiting review';
  end if;

  select * into v_revision
  from public.expense_submission_revisions
  where id = v_current_revision_id;

  v_entry := public.record_project_expense(
    v_revision.pool_id, v_revision.project_id, v_revision.category_id,
    v_revision.amount, v_revision.description, v_revision.vendor_id, v_revision.reference_number
  );

  update public.expense_submissions
  set status = 'approved', ledger_entry_id = v_entry.id, decided_by = auth.uid(), decided_at = now()
  where id = p_submission_id
  returning * into v_result;

  insert into public.expense_submission_status_events (
    tenant_id, submission_id, revision_id, from_status, to_status, actor_user_id, reason
  ) values (
    v_tenant_id, p_submission_id, v_current_revision_id, 'submitted', 'approved', auth.uid(), null
  );

  return v_result;
end;
$$;

revoke execute on function public.approve_expense_submission(uuid) from public;
grant execute on function public.approve_expense_submission(uuid) to authenticated;

-- --- 5e. reject_expense_submission --------------------------------------------
-- Owner-only. Reason required (also enforced at the table level by
-- expense_submission_status_events_reason_required in §2).
create function public.reject_expense_submission(
  p_submission_id uuid,
  p_reason text
)
returns public.expense_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_status public.expense_submission_status;
  v_current_revision_id uuid;
  v_result public.expense_submissions;
begin
  select tenant_id, status, current_revision_id
    into v_tenant_id, v_status, v_current_revision_id
    from public.expense_submissions
    where id = p_submission_id
    for update;

  if v_tenant_id is null then
    raise exception 'expense submission not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'not authorized to review expense submission';
  end if;

  if v_status <> 'submitted' then
    raise exception 'expense submission is not awaiting review';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'rejection reason is required';
  end if;

  update public.expense_submissions
  set status = 'rejected', decided_by = auth.uid(), decided_at = now()
  where id = p_submission_id
  returning * into v_result;

  insert into public.expense_submission_status_events (
    tenant_id, submission_id, revision_id, from_status, to_status, actor_user_id, reason
  ) values (
    v_tenant_id, p_submission_id, v_current_revision_id, 'submitted', 'rejected', auth.uid(), p_reason
  );

  return v_result;
end;
$$;

revoke execute on function public.reject_expense_submission(uuid, text) from public;
grant execute on function public.reject_expense_submission(uuid, text) to authenticated;

-- --- 5f. request_expense_correction -------------------------------------------
-- Owner-only. Reason required. Stores needs_correction_revision_id = the
-- revision that was current at the moment of this decision — submit_expense
-- (§5c) later compares against this to prove a new revision was created
-- before resubmission.
create function public.request_expense_correction(
  p_submission_id uuid,
  p_reason text
)
returns public.expense_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_status public.expense_submission_status;
  v_current_revision_id uuid;
  v_result public.expense_submissions;
begin
  select tenant_id, status, current_revision_id
    into v_tenant_id, v_status, v_current_revision_id
    from public.expense_submissions
    where id = p_submission_id
    for update;

  if v_tenant_id is null then
    raise exception 'expense submission not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'not authorized to review expense submission';
  end if;

  if v_status <> 'submitted' then
    raise exception 'expense submission is not awaiting review';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'correction reason is required';
  end if;

  update public.expense_submissions
  set status = 'needs_correction', decided_by = auth.uid(), decided_at = now(),
      needs_correction_revision_id = v_current_revision_id
  where id = p_submission_id
  returning * into v_result;

  insert into public.expense_submission_status_events (
    tenant_id, submission_id, revision_id, from_status, to_status, actor_user_id, reason
  ) values (
    v_tenant_id, p_submission_id, v_current_revision_id, 'submitted', 'needs_correction', auth.uid(), p_reason
  );

  return v_result;
end;
$$;

revoke execute on function public.request_expense_correction(uuid, text) from public;
grant execute on function public.request_expense_correction(uuid, text) to authenticated;

-- =============================================================================
-- 6. Read model — current revision joined to its header, server-computed
-- =============================================================================
-- security_invoker = true: no elevated privilege of its own — evaluates
-- under the querying role's own grants and RLS, so cross-tenant rows are
-- excluded by the underlying tables' own SELECT policies exactly as a
-- direct table query would be. Saves the repository layer from a manual
-- two-query join for the common "submission with its current financial
-- data" read.
create view public.expense_submission_current
with (security_invoker = true) as
select
  s.id as submission_id,
  s.tenant_id,
  s.status,
  s.created_by,
  s.created_at,
  s.updated_at,
  s.decided_by,
  s.decided_at,
  s.ledger_entry_id,
  r.id as revision_id,
  r.revision_number,
  r.pool_id,
  r.project_id,
  r.category_id,
  r.vendor_id,
  r.amount,
  r.description,
  r.reference_number,
  r.created_by as revision_created_by,
  r.created_at as revision_created_at
from public.expense_submissions s
join public.expense_submission_revisions r on r.id = s.current_revision_id;

grant select on public.expense_submission_current to authenticated;
grant select on public.expense_submission_current to service_role;

-- =============================================================================
-- 7. RLS & Grants
-- =============================================================================
-- auto_expose_new_tables is off, so all three tables start with zero
-- privileges for anon/authenticated/service_role; the REVOKE below is
-- defensive belt-and-suspenders on top of that. No INSERT/UPDATE/DELETE
-- grant exists for `authenticated` on any of the three tables — the RPCs in
-- §5 (SECURITY DEFINER, running as the table owner) are the only mutation
-- path.

alter table public.expense_submissions enable row level security;
alter table public.expense_submission_revisions enable row level security;
alter table public.expense_submission_status_events enable row level security;

revoke all on public.expense_submissions from public;
revoke all on public.expense_submission_revisions from public;
revoke all on public.expense_submission_status_events from public;

-- Same visibility as project_cost_ledger_entries: every active tenant
-- member (including viewer) can read submissions and their revisions.
create policy expense_submissions_select_member
  on public.expense_submissions for select
  to authenticated
  using (private.current_user_is_active_tenant_member (tenant_id));

grant select on public.expense_submissions to authenticated;
grant all on public.expense_submissions to service_role;

create policy expense_submission_revisions_select_member
  on public.expense_submission_revisions for select
  to authenticated
  using (private.current_user_is_active_tenant_member (tenant_id));

grant select on public.expense_submission_revisions to authenticated;
grant all on public.expense_submission_revisions to service_role;

-- Same visibility as vessel_project_lifecycle_events from Gate 1B:
-- owner/admin/reviewer can read the status trail, viewer cannot.
create policy expense_submission_status_events_select_owner_admin_reviewer
  on public.expense_submission_status_events for select
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin', 'reviewer']::public.tenant_role[]));

grant select on public.expense_submission_status_events to authenticated;
grant select, insert on public.expense_submission_status_events to service_role;

-- =============================================================================
-- 8. Close the direct-posting bypass (task LOCK §5/§6)
-- =============================================================================

-- --- 8a. record_project_expense: authenticated can no longer call it
--     directly. approve_expense_submission (§5d) remains able to call it —
--     function ownership implicitly grants EXECUTE regardless of this
--     revoke.
revoke execute on function public.record_project_expense(uuid, uuid, uuid, numeric, text, uuid, text) from authenticated;

-- --- 8b. reverse_project_expense: owner-only (was owner+admin in Gate 1D).
--     Identical body to the Gate 1D original except the role array;
--     `create or replace function` — the Gate 1D migration file itself is
--     not edited.
create or replace function public.reverse_project_expense(
  p_entry_id uuid,
  p_reason text
)
returns public.project_cost_ledger_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_original public.project_cost_ledger_entries;
  v_result public.project_cost_ledger_entries;
begin
  select * into v_original
  from public.project_cost_ledger_entries
  where id = p_entry_id
  for update;

  if v_original.id is null then
    raise exception 'project cost ledger entry not found';
  end if;

  if v_original.entry_kind <> 'expense' then
    raise exception 'only an original expense can be reversed';
  end if;

  if not private.current_user_has_tenant_role(v_original.tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'not authorized to reverse project expense';
  end if;

  if exists (select 1 from public.project_cost_ledger_entries where reverses_entry_id = p_entry_id) then
    raise exception 'project expense already reversed';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reversal reason is required';
  end if;

  insert into public.project_cost_ledger_entries (
    tenant_id, pool_id, project_id, category_id, vendor_id, entry_kind,
    amount, description, reference_number, reverses_entry_id, actor_user_id
  ) values (
    v_original.tenant_id, v_original.pool_id, v_original.project_id, v_original.category_id, v_original.vendor_id,
    'reversal', v_original.amount, p_reason, null, p_entry_id, auth.uid()
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.reverse_project_expense(uuid, text) from public;
grant execute on function public.reverse_project_expense(uuid, text) to authenticated;
