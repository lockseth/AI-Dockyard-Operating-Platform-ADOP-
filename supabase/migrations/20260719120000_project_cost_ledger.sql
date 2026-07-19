-- ADOP Phase 1 Gate 1D — Immutable Project Cost/Expense Ledger Foundation
--
-- Establishes `project_cost_ledger_entries` as the trusted, append-only
-- source of truth for money going out of the shared daily cash pool on
-- behalf of a Project Kapal. Every expense links tenant, cash pool, vessel
-- project, expense category, actor, and (via the pool) business date;
-- vendor is optional. Corrections use a 'reversal' row pointing back at the
-- original 'expense' row — never an UPDATE/DELETE of financial history,
-- same append-only + reversal shape Gate 1C established for
-- cash_pool_entries.
--
-- Replaces the Gate 1C integration boundary
-- (cash_pool_daily_summary.total_cash_out hardcoded to 0) with a real,
-- server-computed value derived from this ledger. Also adds a tenant-safe
-- read model for total cost per Project Kapal.
--
-- Does not edit 20260719070115_foundation_tenant_isolation.sql,
-- 20260719080000_master_data.sql, 20260719090000_master_data_audit_
-- atomicity.sql, 20260719100000_vessel_project_lifecycle.sql, or
-- 20260719110000_shared_daily_cash_pool.sql — reuses their private RLS
-- helpers (private.current_user_is_active_tenant_member,
-- private.current_user_has_tenant_role), the append-only guard
-- (private.block_audit_mutation), and the get-or-create-pool/lifecycle
-- machinery already in place. Purely additive: one composite
-- UNIQUE(id, tenant_id) constraint on vendors (mirroring the same pattern
-- Gate 1B added for vessels/service_types/facility_locations) plus the new
-- table, triggers, RPCs, and views below.

-- =============================================================================
-- 1. Composite tenant-safe FK target on vendors
-- =============================================================================
-- vendors did not previously need a composite (id, tenant_id) target — no
-- other table referenced it. project_cost_ledger_entries.vendor_id is
-- nullable but, when present, must use this composite FK so a cross-tenant
-- vendor reference is structurally impossible, matching every other
-- tenant-safe FK in this schema.

alter table public.vendors
  add constraint vendors_id_tenant_id_key unique (id, tenant_id);

-- =============================================================================
-- 2. Enum
-- =============================================================================

create type public.project_cost_ledger_entry_kind as enum ('expense', 'reversal');

-- =============================================================================
-- 3. Table
-- =============================================================================
-- Append-only. No business_date column: business_date is derived through
-- pool_id -> cash_pools.business_date, the same "one shared pool per day"
-- source of truth Gate 1C already established — duplicating it here would
-- create two places that could disagree. entry_kind mirrors
-- cash_pool_entries' entry/reversal split; a reversal points back at the
-- original 'expense' row via reverses_entry_id, copies its pool/project/
-- category/vendor/amount for audit symmetry (enforced by the trigger in
-- §5b), and never overwrites or deletes it. The partial unique index on
-- reverses_entry_id is the database-level "cannot be reversed twice"
-- guarantee, matching cash_pool_entries_reverses_entry_id_unique.

create table public.project_cost_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  pool_id uuid not null,
  project_id uuid not null,
  category_id uuid not null,
  vendor_id uuid,
  entry_kind public.project_cost_ledger_entry_kind not null default 'expense',
  amount numeric(16, 2) not null check (amount > 0),
  description text not null check (btrim(description) <> ''),
  reference_number text,
  reverses_entry_id uuid references public.project_cost_ledger_entries (id),
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Tenant-safe composite FKs: a ledger entry cannot reference a pool,
  -- project, category, or vendor from a different tenant, even via a
  -- service-role bug. vendor_id is nullable — a null value trivially
  -- satisfies a composite FK (Postgres MATCH SIMPLE skips the check when
  -- any referencing column is null).
  foreign key (pool_id, tenant_id) references public.cash_pools (id, tenant_id) on delete cascade,
  foreign key (project_id, tenant_id) references public.vessel_projects (id, tenant_id) on delete cascade,
  foreign key (category_id, tenant_id) references public.expense_categories (id, tenant_id) on delete cascade,
  foreign key (vendor_id, tenant_id) references public.vendors (id, tenant_id) on delete cascade,
  constraint project_cost_ledger_entries_reversal_shape check (
    (entry_kind = 'expense' and reverses_entry_id is null)
    or (entry_kind = 'reversal' and reverses_entry_id is not null)
  )
);

create index project_cost_ledger_entries_tenant_id_idx on public.project_cost_ledger_entries (tenant_id);
create index project_cost_ledger_entries_pool_id_idx on public.project_cost_ledger_entries (tenant_id, pool_id);
create index project_cost_ledger_entries_project_id_idx on public.project_cost_ledger_entries (tenant_id, project_id);
create index project_cost_ledger_entries_category_id_idx on public.project_cost_ledger_entries (tenant_id, category_id);

-- One reversal per original entry, at the database level (not just an RPC
-- pre-check).
create unique index project_cost_ledger_entries_reverses_entry_id_unique
  on public.project_cost_ledger_entries (reverses_entry_id)
  where reverses_entry_id is not null;

-- =============================================================================
-- 4. Append-only guard
-- =============================================================================

create trigger project_cost_ledger_entries_append_only
  before update or delete on public.project_cost_ledger_entries
  for each row execute function private.block_audit_mutation();

-- =============================================================================
-- 5. Role-independent structural guards (fire regardless of caller — the
--    RPCs in §6, or a service-role/background write)
-- =============================================================================

-- --- 5a. Closed-project guard ---------------------------------------------
-- Only blocks NEW expense rows ('expense'); a reversal (correction of a
-- historical expense that was legitimately recorded while the project was
-- still active) is not blocked by project status — matching
-- "koreksi memakai adjustment/reversal" being a distinct concern from
-- "closed project menolak expense baru".

create function private.enforce_project_cost_ledger_project_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status public.vessel_project_lifecycle_status;
begin
  if new.entry_kind = 'expense' then
    select lifecycle_status into v_status
    from public.vessel_projects
    where id = new.project_id;

    if v_status = 'closed' then
      raise exception 'vessel project is closed to new expenses';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_project_cost_ledger_project_status() from public;

create trigger project_cost_ledger_entries_enforce_project_status
  before insert on public.project_cost_ledger_entries
  for each row execute function private.enforce_project_cost_ledger_project_status();

-- --- 5b. Reversal integrity ------------------------------------------------
-- Same posture as private.enforce_cash_pool_entry_reversal_integrity: a
-- reversal must target a real, same-tenant, same-pool, same-project,
-- original (non-reversal) entry.

create function private.enforce_project_cost_ledger_reversal_integrity()
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
    if v_target.entry_kind <> 'expense' then
      raise exception 'cannot reverse a reversal';
    end if;
    if v_target.tenant_id <> new.tenant_id then
      raise exception 'reversal must reference an entry in the same tenant';
    end if;
    if v_target.pool_id <> new.pool_id then
      raise exception 'reversal must reference an entry in the same cash pool';
    end if;
    if v_target.project_id <> new.project_id then
      raise exception 'reversal must reference an entry in the same vessel project';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_project_cost_ledger_reversal_integrity() from public;

create trigger project_cost_ledger_entries_enforce_reversal_integrity
  before insert on public.project_cost_ledger_entries
  for each row execute function private.enforce_project_cost_ledger_reversal_integrity();

-- =============================================================================
-- 6. RPCs — the only mutation path (no INSERT/UPDATE/DELETE grant exists for
--    `authenticated`; see §8)
-- =============================================================================

-- --- 6a. record_project_expense --------------------------------------------
-- tenant_id is looked up from the pool row itself, never accepted as an
-- argument — a caller cannot record an expense against a forged tenant even
-- if they somehow guessed another tenant's pool_id, because the role check
-- below evaluates against the pool's REAL tenant_id. project_id/category_id/
-- vendor_id cross-tenant references are rejected by the composite FKs in
-- §3 (23503), not re-validated here, matching how vessel_projects' insert
-- policy in Gate 1B relies on its own composite FKs rather than duplicating
-- existence checks. actor (auth.uid()) and created_at (default now()) are
-- never caller-suppliable.

create function public.record_project_expense(
  p_pool_id uuid,
  p_project_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_description text,
  p_vendor_id uuid default null,
  p_reference_number text default null
)
returns public.project_cost_ledger_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_result public.project_cost_ledger_entries;
begin
  select tenant_id into v_tenant_id
  from public.cash_pools
  where id = p_pool_id;

  if v_tenant_id is null then
    raise exception 'daily cash pool not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to record project expense';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  if p_description is null or btrim(p_description) = '' then
    raise exception 'expense description is required';
  end if;

  insert into public.project_cost_ledger_entries (
    tenant_id, pool_id, project_id, category_id, vendor_id, entry_kind,
    amount, description, reference_number, actor_user_id
  ) values (
    v_tenant_id, p_pool_id, p_project_id, p_category_id, p_vendor_id, 'expense',
    p_amount, p_description, p_reference_number, auth.uid()
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.record_project_expense(uuid, uuid, uuid, numeric, text, uuid, text) from public;
grant execute on function public.record_project_expense(uuid, uuid, uuid, numeric, text, uuid, text) to authenticated;

-- --- 6b. reverse_project_expense --------------------------------------------
-- amount/pool_id/project_id/category_id/vendor_id are all copied from the
-- original entry server-side, never accepted from the caller — the only
-- caller-supplied values are which entry to reverse and why. `for update`
-- locks the original row so two concurrent reversal attempts on the same
-- entry cannot both pass the "already reversed" check before either
-- inserts; the partial unique index in §3 is the backstop guarantee even
-- under weaker isolation.

create function public.reverse_project_expense(
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

  if not private.current_user_has_tenant_role(v_original.tenant_id, array['owner', 'admin']::public.tenant_role[]) then
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

-- =============================================================================
-- 7. Read models — server-computed, never client-supplied
-- =============================================================================
-- security_invoker = true on both: neither view carries elevated privilege
-- of its own — each evaluates under the querying role's own grants and RLS,
-- so cross-tenant rows are excluded by the underlying tables' own SELECT
-- policies exactly as a direct table query would be.

-- --- 7a. vessel_project_cost_summary ---------------------------------------
-- Tenant-safe total cost per Project Kapal: net of reversals (only
-- non-reversed 'expense' rows are summed), matching the same
-- exclude-if-reversed join shape cash_pool_daily_summary already uses for
-- cash_pool_entries.

create view public.vessel_project_cost_summary
with (security_invoker = true) as
select
  vp.id as project_id,
  vp.tenant_id,
  coalesce(sum(c.amount), 0)::numeric(16, 2) as total_cost
from public.vessel_projects vp
left join public.project_cost_ledger_entries c
  on c.project_id = vp.id
  and c.entry_kind = 'expense'
  and not exists (
    select 1 from public.project_cost_ledger_entries r where r.reverses_entry_id = c.id
  )
group by vp.id, vp.tenant_id;

grant select on public.vessel_project_cost_summary to authenticated;
grant select on public.vessel_project_cost_summary to service_role;

-- --- 7b. cash_pool_daily_summary — replace the Gate 1C integration
--     boundary (total_cash_out hardcoded to 0) with the real value derived
--     from this ledger. Every other column/computation is unchanged from
--     20260719110000_shared_daily_cash_pool.sql — only the total_cash_out
--     and closing_cash expressions and the added lateral join differ.

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
    - coalesce(pce.total_cash_out, 0)
  )::numeric(16, 2) as closing_cash
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

-- =============================================================================
-- 8. RLS & Grants
-- =============================================================================
-- auto_expose_new_tables is off, so the table starts with zero privileges
-- for anon/authenticated/service_role; the REVOKE below is defensive
-- belt-and-suspenders on top of that. No INSERT/UPDATE/DELETE grant exists
-- for `authenticated` at all — the two SECURITY DEFINER RPCs in §6
-- (running as the table owner, which bypasses RLS) are the only mutation
-- path, matching "Mutasi hanya melalui RPC" and cash_pool_entries' posture
-- from Gate 1C.

alter table public.project_cost_ledger_entries enable row level security;

revoke all on public.project_cost_ledger_entries from public;

create policy project_cost_ledger_entries_select_member
  on public.project_cost_ledger_entries for select
  to authenticated
  using (private.current_user_is_active_tenant_member (tenant_id));

grant select on public.project_cost_ledger_entries to authenticated;
grant all on public.project_cost_ledger_entries to service_role;
