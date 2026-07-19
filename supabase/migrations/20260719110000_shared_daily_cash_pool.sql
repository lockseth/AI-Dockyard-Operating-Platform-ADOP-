-- ADOP Phase 1 Gate 1C — Shared Daily Cash Pool Foundation
--
-- Establishes the single shared daily cash pool per tenant/business_date
-- (PRD §7.4 "Daily Cash Control", roadmap Phase 1 LOCK "Shared daily cash
-- pool"). This is a pool HEADER plus an append-only ledger of cash-in
-- entries (opening_cash, cash_top_up, other_cash_in) — it deliberately does
-- NOT hold a vessel_id/vessel_project_id: one pool funds many Project Kapal,
-- it is never a wallet per kapal.
--
-- total_cash_out is an explicit, documented integration boundary (see §5)
-- pointing at the trusted immutable cost/expense ledger that does not exist
-- yet — no expense/cost-entry table, generic cash-out flow, or fabricated
-- transaction value is created here. A later gate must replace that
-- boundary's body with a real join once the cost ledger exists.
--
-- Does not edit 20260719070115_foundation_tenant_isolation.sql,
-- 20260719080000_master_data.sql, 20260719090000_master_data_audit_
-- atomicity.sql, or 20260719100000_vessel_project_lifecycle.sql — reuses
-- their private RLS helpers (private.current_user_is_active_tenant_member,
-- private.current_user_has_tenant_role) and the append-only guard
-- (private.block_audit_mutation). Purely additive.

-- =============================================================================
-- 1. Enums
-- =============================================================================

create type public.cash_pool_entry_type as enum ('opening_cash', 'cash_top_up', 'other_cash_in');
create type public.cash_pool_entry_kind as enum ('entry', 'reversal');

-- =============================================================================
-- 2. Tables
-- =============================================================================

-- --- cash_pools ------------------------------------------------------------
-- The pool header. One row per (tenant_id, business_date) — the unique
-- constraint below is the database-level guarantee of "one shared pool per
-- tenant per day", and doubles as the conflict target the get-or-create RPC
-- (§5b) uses for race-safe, idempotent creation. No vessel_id or
-- vessel_project_id column exists here by design (see file header). No
-- mutable field exists on this row after creation, so — unlike
-- vessel_projects — there is no updated_at/set_updated_at trigger; the
-- append-only guard in §4 blocks every UPDATE and DELETE unconditionally.

create table public.cash_pools (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  business_date date not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, business_date),
  -- Composite target for cash_pool_entries' tenant-safe composite FK below.
  unique (id, tenant_id)
);

create index cash_pools_tenant_id_idx on public.cash_pools (tenant_id);

-- --- cash_pool_entries -------------------------------------------------------
-- Append-only ledger of opening_cash/cash_top_up/other_cash_in records.
-- entry_kind distinguishes an original 'entry' from a 'reversal' row that
-- corrects one: a reversal points back at the original via
-- reverses_entry_id, carries the same entry_type/amount for audit symmetry,
-- and excludes the original from the active summary (see the view in §3) —
-- it never overwrites or deletes the original row. The partial unique index
-- on reverses_entry_id is the database-level "cannot be reversed twice"
-- guarantee; private.enforce_cash_pool_entry_reversal_integrity() (§4) is
-- the database-level guarantee that a reversal can only target a real,
-- same-tenant, non-reversal original entry — both hold regardless of caller,
-- not just at the RPC layer (§5).

create table public.cash_pool_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  pool_id uuid not null,
  entry_type public.cash_pool_entry_type not null,
  entry_kind public.cash_pool_entry_kind not null default 'entry',
  amount numeric(16, 2) not null check (amount > 0),
  description text,
  reverses_entry_id uuid references public.cash_pool_entries (id),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Tenant-safe composite FK: a cash_pool_entries row cannot reference a
  -- cash_pools row from a different tenant, even via a service-role bug.
  foreign key (pool_id, tenant_id) references public.cash_pools (id, tenant_id) on delete cascade,
  constraint cash_pool_entries_reversal_shape check (
    (entry_kind = 'entry' and reverses_entry_id is null)
    or (entry_kind = 'reversal' and reverses_entry_id is not null)
  )
);

create index cash_pool_entries_tenant_id_idx on public.cash_pool_entries (tenant_id);
create index cash_pool_entries_pool_id_idx on public.cash_pool_entries (tenant_id, pool_id);

-- One reversal per original entry, at the database level (not just an RPC
-- pre-check) — a second reversal attempt fails this unique index regardless
-- of how the insert was issued.
create unique index cash_pool_entries_reverses_entry_id_unique
  on public.cash_pool_entries (reverses_entry_id)
  where reverses_entry_id is not null;

-- =============================================================================
-- 3. Read model — canonical summary (server-computed, never client-supplied)
-- =============================================================================
-- security_invoker = true: the view carries no elevated privilege of its
-- own — it evaluates under the querying role's own grants and RLS, so
-- cross-tenant rows are excluded by cash_pools_select_member/
-- cash_pool_entries_select_member (§6) exactly as a direct table query would
-- be. total_cash_out is hardcoded to 0 with the reasoning in the file
-- header — it is the honest value given no trusted cost/expense ledger
-- exists yet, not a fabricated one; do not backfill it speculatively.

create view public.cash_pool_daily_summary
with (security_invoker = true) as
select
  p.id as pool_id,
  p.tenant_id,
  p.business_date,
  p.created_at,
  coalesce(sum(e.amount) filter (where e.entry_type = 'opening_cash'), 0)::numeric(16, 2) as opening_cash,
  coalesce(sum(e.amount) filter (where e.entry_type = 'cash_top_up'), 0)::numeric(16, 2) as cash_top_up,
  coalesce(sum(e.amount) filter (where e.entry_type = 'other_cash_in'), 0)::numeric(16, 2) as other_cash_in,
  0::numeric(16, 2) as total_cash_out,
  (
    coalesce(sum(e.amount) filter (where e.entry_type = 'opening_cash'), 0)
    + coalesce(sum(e.amount) filter (where e.entry_type = 'cash_top_up'), 0)
    + coalesce(sum(e.amount) filter (where e.entry_type = 'other_cash_in'), 0)
    - 0
  )::numeric(16, 2) as closing_cash
from public.cash_pools p
left join public.cash_pool_entries e
  on e.pool_id = p.id
  and e.entry_kind = 'entry'
  and not exists (
    select 1 from public.cash_pool_entries r where r.reverses_entry_id = e.id
  )
group by p.id, p.tenant_id, p.business_date, p.created_at;

-- =============================================================================
-- 4. Append-only guards + reversal integrity trigger
-- =============================================================================

create trigger cash_pools_append_only
  before update or delete on public.cash_pools
  for each row execute function private.block_audit_mutation();

create trigger cash_pool_entries_append_only
  before update or delete on public.cash_pool_entries
  for each row execute function private.block_audit_mutation();

-- BEFORE INSERT structural guard for reversal rows — fires regardless of
-- caller (the RPC in §5d, or a service-role/background write), same
-- role-independent posture as vessel_projects_enforce_lifecycle_transition.
create function private.enforce_cash_pool_entry_reversal_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_target public.cash_pool_entries;
begin
  if new.entry_kind = 'reversal' then
    select * into v_target from public.cash_pool_entries where id = new.reverses_entry_id;

    if v_target.id is null then
      raise exception 'reversal target entry not found';
    end if;
    if v_target.entry_kind <> 'entry' then
      raise exception 'cannot reverse a reversal';
    end if;
    if v_target.tenant_id <> new.tenant_id then
      raise exception 'reversal must reference an entry in the same tenant';
    end if;
    if v_target.entry_type <> new.entry_type then
      raise exception 'reversal entry_type must match the original entry';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_cash_pool_entry_reversal_integrity() from public;

create trigger cash_pool_entries_enforce_reversal_integrity
  before insert on public.cash_pool_entries
  for each row execute function private.enforce_cash_pool_entry_reversal_integrity();

-- =============================================================================
-- 5. RPCs — the only mutation path (no INSERT/UPDATE/DELETE grant exists for
--    `authenticated` on either table; see §6)
-- =============================================================================

-- --- 5a helper note -----------------------------------------------------------
-- All three RPCs re-derive tenant_id from server-held state wherever a
-- target row already exists (the pool row for record_cash_pool_entry, the
-- original entry row for reverse_cash_pool_entry) — never from a caller
-- argument. get_or_create_daily_cash_pool is the one exception: it is the
-- first write for a given tenant/day, so tenant_id necessarily arrives as an
-- argument (same trust model Gate 1B's vessel_projects insert RLS policy
-- already uses) — private.current_user_has_tenant_role immediately below
-- rejects any tenant_id the caller is not an active owner/admin member of,
-- so a forged tenant_id is refused, not merely ignored. actor
-- (auth.uid()) and created_at (default now()) are never caller-suppliable
-- on any of the three.

-- --- 5b. get_or_create_daily_cash_pool ----------------------------------------
-- Race-safe, idempotent get-or-create: INSERT ... ON CONFLICT (tenant_id,
-- business_date) DO NOTHING is a single atomic statement — concurrent calls
-- for the same tenant/day cannot both insert (the unique index in §2
-- serializes them), and the losing call falls through to the SELECT below
-- and returns the same row the winner created. Retried calls after success
-- are equally idempotent: they hit the conflict branch and return the
-- existing row unchanged.
create function public.get_or_create_daily_cash_pool(
  p_tenant_id uuid,
  p_business_date date
)
returns public.cash_pools
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result public.cash_pools;
begin
  if not private.current_user_has_tenant_role(p_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to create or access daily cash pool';
  end if;

  insert into public.cash_pools (tenant_id, business_date, created_by)
  values (p_tenant_id, p_business_date, auth.uid())
  on conflict (tenant_id, business_date) do nothing
  returning * into v_result;

  if v_result.id is null then
    select * into v_result
    from public.cash_pools
    where tenant_id = p_tenant_id and business_date = p_business_date;
  end if;

  return v_result;
end;
$$;

revoke execute on function public.get_or_create_daily_cash_pool(uuid, date) from public;
grant execute on function public.get_or_create_daily_cash_pool(uuid, date) to authenticated;

-- --- 5c. record_cash_pool_entry ------------------------------------------------
-- tenant_id is looked up from the pool row itself, never accepted as an
-- argument — a caller cannot record an entry against a forged tenant even if
-- they somehow guessed another tenant's pool_id, because the role check
-- below evaluates against the pool's REAL tenant_id.
create function public.record_cash_pool_entry(
  p_pool_id uuid,
  p_entry_type public.cash_pool_entry_type,
  p_amount numeric,
  p_description text default null
)
returns public.cash_pool_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_result public.cash_pool_entries;
begin
  select tenant_id into v_tenant_id
  from public.cash_pools
  where id = p_pool_id;

  if v_tenant_id is null then
    raise exception 'daily cash pool not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to record daily cash pool entry';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  insert into public.cash_pool_entries (
    tenant_id, pool_id, entry_type, entry_kind, amount, description, created_by
  ) values (
    v_tenant_id, p_pool_id, p_entry_type, 'entry', p_amount, p_description, auth.uid()
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.record_cash_pool_entry(uuid, public.cash_pool_entry_type, numeric, text) from public;
grant execute on function public.record_cash_pool_entry(uuid, public.cash_pool_entry_type, numeric, text) to authenticated;

-- --- 5d. reverse_cash_pool_entry ------------------------------------------------
-- amount/entry_type/pool_id/tenant_id are all copied from the original entry
-- server-side, never accepted from the caller — the only caller-supplied
-- values are which entry to reverse and why. `for update` locks the
-- original row so two concurrent reversal attempts on the same entry cannot
-- both pass the "already reversed" check before either inserts; the partial
-- unique index in §2 is the backstop guarantee even under weaker isolation.
create function public.reverse_cash_pool_entry(
  p_entry_id uuid,
  p_reason text
)
returns public.cash_pool_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_original public.cash_pool_entries;
  v_result public.cash_pool_entries;
begin
  select * into v_original
  from public.cash_pool_entries
  where id = p_entry_id
  for update;

  if v_original.id is null then
    raise exception 'cash pool entry not found';
  end if;

  if v_original.entry_kind <> 'entry' then
    raise exception 'only an original entry can be reversed';
  end if;

  if not private.current_user_has_tenant_role(v_original.tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to reverse daily cash pool entry';
  end if;

  if exists (select 1 from public.cash_pool_entries where reverses_entry_id = p_entry_id) then
    raise exception 'cash pool entry already reversed';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reversal reason is required';
  end if;

  insert into public.cash_pool_entries (
    tenant_id, pool_id, entry_type, entry_kind, amount, description, reverses_entry_id, created_by
  ) values (
    v_original.tenant_id, v_original.pool_id, v_original.entry_type, 'reversal', v_original.amount, p_reason, p_entry_id, auth.uid()
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.reverse_cash_pool_entry(uuid, text) from public;
grant execute on function public.reverse_cash_pool_entry(uuid, text) to authenticated;

-- =============================================================================
-- 6. RLS & Grants
-- =============================================================================
-- auto_expose_new_tables is off, so both tables start with zero privileges
-- for anon/authenticated/service_role; the REVOKE below is defensive
-- belt-and-suspenders on top of that. No INSERT/UPDATE/DELETE grant exists
-- for `authenticated` on either table — the three SECURITY DEFINER RPCs in
-- §5 (running as the table owner, which bypasses RLS) are the only mutation
-- path, matching invariant "Mutasi hanya melalui RPC/service terkontrol."

alter table public.cash_pools enable row level security;
alter table public.cash_pool_entries enable row level security;

revoke all on public.cash_pools from public;
revoke all on public.cash_pool_entries from public;

create policy cash_pools_select_member
  on public.cash_pools for select
  to authenticated
  using (private.current_user_is_active_tenant_member (tenant_id));

grant select on public.cash_pools to authenticated;
grant all on public.cash_pools to service_role;

create policy cash_pool_entries_select_member
  on public.cash_pool_entries for select
  to authenticated
  using (private.current_user_is_active_tenant_member (tenant_id));

grant select on public.cash_pool_entries to authenticated;
grant all on public.cash_pool_entries to service_role;

grant select on public.cash_pool_daily_summary to authenticated;
grant select on public.cash_pool_daily_summary to service_role;
