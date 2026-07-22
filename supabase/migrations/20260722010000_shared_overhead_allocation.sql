-- ADOP Phase 1 Gate 1N — Shared Overhead Allocation
--
-- "Biaya Bersama/Overhead" can be recorded without a single project (Gate
-- 1J-C for import, Gate 1M for direct entry) — it lands in the shared
-- overhead pool. Before a project's final cost summary is trustworthy, every
-- overhead entry that applies to it must be explicitly allocated to one or
-- more Project Kapal, and the allocated total must equal the entry's amount.
-- This migration adds that allocation mechanism: append-only
-- shared_overhead_allocations, a derived (never mutable/stored) allocation
-- status per overhead entry, and the two RPCs that mutate it.
--
-- Allocation is deliberately its own append-only ledger, separate from
-- project_cost_ledger_entries — an allocation does not change how much cash
-- left the pool (project_cost_ledger_entries already recorded that once,
-- when the overhead was posted); it only assigns responsibility for an
-- already-recorded cost to specific projects. Status is always derived from
-- the live sum of non-reversed allocation rows against the entry's amount —
-- never a separately stored/mutable flag — so it cannot drift out of sync
-- with the rows that actually justify it.
--
-- Does not edit 20260719120000_project_cost_ledger.sql or
-- 20260722000000_shared_overhead_recording.sql — reuses
-- private.current_user_has_tenant_role, private.block_audit_mutation, and
-- public.shared_overhead_ledger_current's filter shape (entry_scope =
-- 'shared_overhead', entry_kind = 'expense', not reversed).

-- =============================================================================
-- 1. Composite tenant-safe FK target on project_cost_ledger_entries
-- =============================================================================
-- project_cost_ledger_entries did not previously need a composite
-- (id, tenant_id) target — no other table referenced it by id. The
-- allocation table below references it and must do so tenant-safely,
-- matching every other composite FK in this schema.

alter table public.project_cost_ledger_entries
  add constraint project_cost_ledger_entries_id_tenant_id_key unique (id, tenant_id);

-- =============================================================================
-- 2. Enum
-- =============================================================================

create type public.shared_overhead_allocation_kind as enum ('allocation', 'reversal');

-- =============================================================================
-- 3. Table
-- =============================================================================
-- Append-only. A reversal points back at the original 'allocation' row via
-- reverses_allocation_id, copies its overhead_entry_id/project_id/amount for
-- audit symmetry (enforced by the trigger in §5b), and never overwrites or
-- deletes it — same shape project_cost_ledger_entries itself uses for
-- expense/reversal.

create table public.shared_overhead_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  overhead_entry_id uuid not null,
  project_id uuid not null,
  allocation_kind public.shared_overhead_allocation_kind not null default 'allocation',
  amount numeric(16, 2) not null check (amount > 0),
  note text,
  reverses_allocation_id uuid references public.shared_overhead_allocations (id),
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (overhead_entry_id, tenant_id) references public.project_cost_ledger_entries (id, tenant_id) on delete cascade,
  foreign key (project_id, tenant_id) references public.vessel_projects (id, tenant_id) on delete cascade,
  constraint shared_overhead_allocations_reversal_shape check (
    (allocation_kind = 'allocation' and reverses_allocation_id is null)
    or (allocation_kind = 'reversal' and reverses_allocation_id is not null)
  )
);

create index shared_overhead_allocations_tenant_id_idx on public.shared_overhead_allocations (tenant_id);
create index shared_overhead_allocations_overhead_entry_id_idx on public.shared_overhead_allocations (tenant_id, overhead_entry_id);
create index shared_overhead_allocations_project_id_idx on public.shared_overhead_allocations (tenant_id, project_id);

-- One reversal per original allocation, at the database level.
create unique index shared_overhead_allocations_reverses_allocation_id_unique
  on public.shared_overhead_allocations (reverses_allocation_id)
  where reverses_allocation_id is not null;

-- =============================================================================
-- 4. Append-only guard
-- =============================================================================

create trigger shared_overhead_allocations_append_only
  before update or delete on public.shared_overhead_allocations
  for each row execute function private.block_audit_mutation();

-- =============================================================================
-- 5. Role-independent structural guards (fire regardless of caller — the
--    RPCs in §6, or a service-role/background write)
-- =============================================================================

-- --- 5a. Amount guard --------------------------------------------------------
-- Locks the overhead entry row FOR UPDATE before computing the existing
-- allocated sum, so two concurrent allocation attempts against the same
-- entry serialize on this row rather than both reading a stale sum and both
-- passing the "does not exceed" check — the classic lost-update race. Only
-- fires for 'allocation' rows: a 'reversal' row reduces the effective sum
-- and must never be blocked by this check.

create function private.enforce_shared_overhead_allocation_amount()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_entry public.project_cost_ledger_entries;
  v_allocated numeric;
begin
  if new.allocation_kind = 'allocation' then
    select * into v_entry from public.project_cost_ledger_entries where id = new.overhead_entry_id for update;

    if v_entry.id is null or v_entry.entry_scope <> 'shared_overhead' or v_entry.entry_kind <> 'expense' then
      raise exception 'allocation must reference an original shared overhead expense entry';
    end if;

    if exists (select 1 from public.project_cost_ledger_entries where reverses_entry_id = new.overhead_entry_id) then
      raise exception 'cannot allocate a reversed shared overhead entry';
    end if;

    select coalesce(sum(amount) filter (where allocation_kind = 'allocation'), 0)
         - coalesce(sum(amount) filter (where allocation_kind = 'reversal'), 0)
      into v_allocated
    from public.shared_overhead_allocations
    where overhead_entry_id = new.overhead_entry_id;

    if v_allocated + new.amount > v_entry.amount then
      raise exception 'allocation exceeds shared overhead entry amount';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_shared_overhead_allocation_amount() from public;

create trigger shared_overhead_allocations_enforce_amount
  before insert on public.shared_overhead_allocations
  for each row execute function private.enforce_shared_overhead_allocation_amount();

-- --- 5b. Reversal integrity --------------------------------------------------
-- Same posture as private.enforce_project_cost_ledger_reversal_integrity: a
-- reversal must target a real, same-tenant, same-entry, same-project,
-- same-amount, original (non-reversal) allocation.

create function private.enforce_shared_overhead_allocation_reversal_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_target public.shared_overhead_allocations;
begin
  if new.allocation_kind = 'reversal' then
    select * into v_target from public.shared_overhead_allocations where id = new.reverses_allocation_id;

    if v_target.id is null then
      raise exception 'shared overhead allocation reversal target not found';
    end if;
    if v_target.allocation_kind <> 'allocation' then
      raise exception 'cannot reverse a reversal';
    end if;
    if v_target.tenant_id <> new.tenant_id then
      raise exception 'reversal must reference an allocation in the same tenant';
    end if;
    if v_target.overhead_entry_id <> new.overhead_entry_id then
      raise exception 'reversal must reference the same shared overhead entry';
    end if;
    if v_target.project_id <> new.project_id then
      raise exception 'reversal must reference the same vessel project';
    end if;
    if v_target.amount <> new.amount then
      raise exception 'reversal amount must match the original allocation amount';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_shared_overhead_allocation_reversal_integrity() from public;

create trigger shared_overhead_allocations_enforce_reversal_integrity
  before insert on public.shared_overhead_allocations
  for each row execute function private.enforce_shared_overhead_allocation_reversal_integrity();

-- =============================================================================
-- 6. RPCs — the only mutation path (no INSERT/UPDATE/DELETE grant exists for
--    `authenticated`; see §8)
-- =============================================================================

-- --- 6a. allocate_shared_overhead_entry --------------------------------------
-- `for update` on the overhead entry row is the same lock §5a's trigger
-- takes — reentrant within one transaction, so this RPC's own lock plus the
-- trigger's lock together make the "does not exceed" check safe even if the
-- table were ever written some other way. project_id's tenant match is
-- re-verified explicitly (not just left to the composite FK's 23503) so the
-- caller gets a clear domain error instead of a bare constraint violation.

create function public.allocate_shared_overhead_entry(
  p_overhead_entry_id uuid,
  p_project_id uuid,
  p_amount numeric,
  p_note text default null
)
returns public.shared_overhead_allocations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry public.project_cost_ledger_entries;
  v_project public.vessel_projects;
  v_allocated numeric;
  v_result public.shared_overhead_allocations;
begin
  select * into v_entry
  from public.project_cost_ledger_entries
  where id = p_overhead_entry_id
  for update;

  if v_entry.id is null then
    raise exception 'shared overhead entry not found';
  end if;

  if not private.current_user_has_tenant_role(v_entry.tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to allocate shared overhead';
  end if;

  if v_entry.entry_scope <> 'shared_overhead' or v_entry.entry_kind <> 'expense' then
    raise exception 'only an original shared overhead expense can be allocated';
  end if;

  if exists (select 1 from public.project_cost_ledger_entries where reverses_entry_id = p_overhead_entry_id) then
    raise exception 'cannot allocate a reversed shared overhead entry';
  end if;

  select * into v_project
  from public.vessel_projects
  where id = p_project_id and tenant_id = v_entry.tenant_id;

  if v_project.id is null then
    raise exception 'vessel project not found';
  end if;

  if v_project.lifecycle_status = 'closed' then
    raise exception 'cannot allocate shared overhead to a closed vessel project';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'allocation amount must be greater than zero';
  end if;

  select coalesce(sum(amount) filter (where allocation_kind = 'allocation'), 0)
       - coalesce(sum(amount) filter (where allocation_kind = 'reversal'), 0)
    into v_allocated
  from public.shared_overhead_allocations
  where overhead_entry_id = p_overhead_entry_id;

  if v_allocated + p_amount > v_entry.amount then
    raise exception 'allocation exceeds shared overhead entry amount';
  end if;

  insert into public.shared_overhead_allocations (
    tenant_id, overhead_entry_id, project_id, allocation_kind, amount, note, actor_user_id
  ) values (
    v_entry.tenant_id, p_overhead_entry_id, p_project_id, 'allocation', p_amount, p_note, auth.uid()
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.allocate_shared_overhead_entry(uuid, uuid, numeric, text) from public;
grant execute on function public.allocate_shared_overhead_entry(uuid, uuid, numeric, text) to authenticated;

-- --- 6b. reverse_shared_overhead_allocation ----------------------------------
-- Owner-only, matching reverse_project_expense's posture. `for update` locks
-- the original allocation row so two concurrent reversal attempts cannot
-- both pass the "already reversed" check before either inserts — the
-- partial unique index in §3 is the backstop guarantee even under weaker
-- isolation.

create function public.reverse_shared_overhead_allocation(
  p_allocation_id uuid,
  p_reason text
)
returns public.shared_overhead_allocations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_original public.shared_overhead_allocations;
  v_result public.shared_overhead_allocations;
begin
  select * into v_original
  from public.shared_overhead_allocations
  where id = p_allocation_id
  for update;

  if v_original.id is null then
    raise exception 'shared overhead allocation not found';
  end if;

  if not private.current_user_has_tenant_role(v_original.tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'not authorized to reverse shared overhead allocation';
  end if;

  if v_original.allocation_kind <> 'allocation' then
    raise exception 'only an original allocation can be reversed';
  end if;

  if exists (select 1 from public.shared_overhead_allocations where reverses_allocation_id = p_allocation_id) then
    raise exception 'shared overhead allocation already reversed';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reversal reason is required';
  end if;

  insert into public.shared_overhead_allocations (
    tenant_id, overhead_entry_id, project_id, allocation_kind, amount, note, reverses_allocation_id, actor_user_id
  ) values (
    v_original.tenant_id, v_original.overhead_entry_id, v_original.project_id, 'reversal', v_original.amount,
    p_reason, p_allocation_id, auth.uid()
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.reverse_shared_overhead_allocation(uuid, text) from public;
grant execute on function public.reverse_shared_overhead_allocation(uuid, text) to authenticated;

-- =============================================================================
-- 7. Read models — server-computed, never client-supplied
-- =============================================================================

-- --- 7a. shared_overhead_allocations_current ---------------------------------
-- Active (non-reversed) allocation rows only — same "exclude if reversed"
-- shape every *_current view in this schema uses.

create view public.shared_overhead_allocations_current
with (security_invoker = true) as
select
  a.id,
  a.tenant_id,
  a.overhead_entry_id,
  a.project_id,
  a.amount,
  a.note,
  a.actor_user_id,
  a.created_at
from public.shared_overhead_allocations a
where a.allocation_kind = 'allocation'
  and not exists (select 1 from public.shared_overhead_allocations r where r.reverses_allocation_id = a.id);

grant select on public.shared_overhead_allocations_current to authenticated;
grant select on public.shared_overhead_allocations_current to service_role;

-- --- 7b. shared_overhead_allocation_status -----------------------------------
-- Per shared-overhead entry (never per-project — one entry can be split
-- across several projects): the entry's own tenant/pool/business_date/
-- facility/amount/description, the live allocated sum (never stored), and
-- the derived status. business_date and facility_location_id are exposed
-- because the project-close guard (next migration) matches overhead against
-- a project's applicable cost period and facility through this view alone.

create view public.shared_overhead_allocation_status
with (security_invoker = true) as
select
  o.id as overhead_entry_id,
  o.tenant_id,
  o.pool_id,
  p.business_date,
  o.facility_location_id,
  o.amount as overhead_amount,
  o.description,
  coalesce(sum(a.amount) filter (where a.allocation_kind = 'allocation'), 0)
    - coalesce(sum(a.amount) filter (where a.allocation_kind = 'reversal'), 0) as allocated_amount,
  case
    when coalesce(sum(a.amount) filter (where a.allocation_kind = 'allocation'), 0)
       - coalesce(sum(a.amount) filter (where a.allocation_kind = 'reversal'), 0) <= 0
      then 'unallocated'
    when coalesce(sum(a.amount) filter (where a.allocation_kind = 'allocation'), 0)
       - coalesce(sum(a.amount) filter (where a.allocation_kind = 'reversal'), 0) >= o.amount
      then 'fully_allocated'
    else 'partially_allocated'
  end as allocation_status
from public.project_cost_ledger_entries o
join public.cash_pools p on p.id = o.pool_id
left join public.shared_overhead_allocations a on a.overhead_entry_id = o.id
where o.entry_scope = 'shared_overhead'
  and o.entry_kind = 'expense'
  and not exists (select 1 from public.project_cost_ledger_entries r where r.reverses_entry_id = o.id)
group by o.id, o.tenant_id, o.pool_id, p.business_date, o.facility_location_id, o.amount, o.description;

grant select on public.shared_overhead_allocation_status to authenticated;
grant select on public.shared_overhead_allocation_status to service_role;

-- =============================================================================
-- 8. RLS & Grants
-- =============================================================================
-- auto_expose_new_tables is off, so the table starts with zero privileges
-- for anon/authenticated/service_role; the REVOKE below is defensive
-- belt-and-suspenders on top of that. No INSERT/UPDATE/DELETE grant exists
-- for `authenticated` at all — the two RPCs in §6 (SECURITY DEFINER, running
-- as the table owner) are the only mutation path.

alter table public.shared_overhead_allocations enable row level security;

revoke all on public.shared_overhead_allocations from public;

create policy shared_overhead_allocations_select_member
  on public.shared_overhead_allocations for select
  to authenticated
  using (private.current_user_is_active_tenant_member (tenant_id));

grant select on public.shared_overhead_allocations to authenticated;
grant all on public.shared_overhead_allocations to service_role;
