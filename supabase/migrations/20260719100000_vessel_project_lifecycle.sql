-- ADOP Phase 1 Gate 1B — Vessel Project Lifecycle Foundation
--
-- Establishes Project Kapal as its own domain, separate from the Vessel/
-- Kapal asset created in Gate 1A: `vessel_projects` (the work/engagement
-- that has a lifecycle) plus an append-only `vessel_project_lifecycle_events`
-- trail. No cost ledger, shared cash, import, billing, or UI is created
-- here — this migration only builds the lifecycle state machine those
-- later gates will point at and gate cost entry on.
--
-- Does not edit 20260719070115_foundation_tenant_isolation.sql,
-- 20260719080000_master_data.sql, or 20260719090000_master_data_audit_
-- atomicity.sql — reuses their private RLS helpers, private.set_updated_at()
-- trigger function, and private.block_audit_mutation() append-only guard.
-- Purely additive to those tables: three composite UNIQUE(id, tenant_id)
-- constraints (needed so vessel_projects can hold tenant-safe composite FKs
-- into vessels/service_types/facility_locations, the same mechanism clients
-- and expense_categories already use) plus the two new tables below.

-- =============================================================================
-- 1. Composite tenant-safe FK targets on existing master-data tables
-- =============================================================================
-- clients already has unique(id, tenant_id) from Gate 1A. vessels,
-- service_types, and facility_locations do not — add it here so a
-- vessel_project's vessel_id/service_type_id/facility_location_id can use a
-- composite FK that makes a cross-tenant reference structurally impossible,
-- the same guarantee Gate 1A gives client_contacts/vessels -> clients.

alter table public.vessels
  add constraint vessels_id_tenant_id_key unique (id, tenant_id);

alter table public.service_types
  add constraint service_types_id_tenant_id_key unique (id, tenant_id);

alter table public.facility_locations
  add constraint facility_locations_id_tenant_id_key unique (id, tenant_id);

-- =============================================================================
-- 2. Enum
-- =============================================================================

create type public.vessel_project_lifecycle_status as enum ('active', 'ready_to_close', 'closed');

-- =============================================================================
-- 3. Tables
-- =============================================================================

-- --- vessel_projects -----------------------------------------------------------
-- Project Kapal: the work/engagement for a vessel, distinct from the vessel
-- asset itself. No "one active project per vessel" constraint — not a LOCK
-- decision yet. project_code is optional and carries no uniqueness rule at
-- this gate (not requested as LOCK, unlike vessel_code/client_code).

create table public.vessel_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  vessel_id uuid not null,
  client_id uuid not null,
  service_type_id uuid not null,
  facility_location_id uuid not null,
  project_code text,
  lifecycle_status public.vessel_project_lifecycle_status not null default 'active',
  start_date date not null,
  ready_to_close_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite target for the lifecycle-events FK below.
  unique (id, tenant_id),
  -- Tenant-safe composite FKs: each reference must belong to the SAME
  -- tenant_id as this project row — a cross-tenant reference cannot be
  -- inserted even by a service-role bug.
  foreign key (vessel_id, tenant_id) references public.vessels (id, tenant_id) on delete cascade,
  foreign key (client_id, tenant_id) references public.clients (id, tenant_id) on delete cascade,
  foreign key (service_type_id, tenant_id) references public.service_types (id, tenant_id) on delete cascade,
  foreign key (facility_location_id, tenant_id) references public.facility_locations (id, tenant_id) on delete cascade
);

create index vessel_projects_tenant_id_idx on public.vessel_projects (tenant_id);
create index vessel_projects_vessel_id_idx on public.vessel_projects (tenant_id, vessel_id);
create index vessel_projects_client_id_idx on public.vessel_projects (tenant_id, client_id);
create index vessel_projects_lifecycle_status_idx on public.vessel_projects (tenant_id, lifecycle_status);

-- --- vessel_project_lifecycle_events --------------------------------------------
-- Append-only. from_status is nullable to represent the initial creation
-- event (null -> active) logged automatically on insert (see §5).

create table public.vessel_project_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  project_id uuid not null,
  from_status public.vessel_project_lifecycle_status,
  to_status public.vessel_project_lifecycle_status not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (project_id, tenant_id) references public.vessel_projects (id, tenant_id) on delete cascade
);

create index vessel_project_lifecycle_events_tenant_id_idx on public.vessel_project_lifecycle_events (tenant_id);
create index vessel_project_lifecycle_events_project_id_idx
  on public.vessel_project_lifecycle_events (tenant_id, project_id);

-- =============================================================================
-- 4. updated_at trigger (reuses private.set_updated_at() from Gate 0A)
-- =============================================================================

create trigger set_updated_at before update on public.vessel_projects
  for each row execute function private.set_updated_at();

-- Append-only guarantee for the lifecycle event trail — reuses the same
-- role-independent guard function Gate 1A attached to
-- master_data_audit_events.
create trigger vessel_project_lifecycle_events_append_only
  before update or delete on public.vessel_project_lifecycle_events
  for each row execute function private.block_audit_mutation();

-- =============================================================================
-- 5. Lifecycle state machine + canonical audit trail
-- =============================================================================

-- --- 5a. Role-independent transition guard --------------------------------------
-- BEFORE UPDATE, fires regardless of caller (authenticated via the RPC in
-- §5c, or a service-role/background write) — this is the real database
-- constraint for "active -> ready_to_close -> closed only", not just UI or
-- RPC-level validation. Skip (active -> closed), reverse (ready_to_close ->
-- active), reopen (closed -> active/ready_to_close), and no-op
-- "transitions" to the same status are all rejected.

create function private.enforce_vessel_project_lifecycle_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.lifecycle_status = old.lifecycle_status then
    raise exception 'vessel project lifecycle status unchanged: already %', old.lifecycle_status;
  end if;

  if not (
    (old.lifecycle_status = 'active' and new.lifecycle_status = 'ready_to_close')
    or (old.lifecycle_status = 'ready_to_close' and new.lifecycle_status = 'closed')
  ) then
    raise exception 'invalid vessel project lifecycle transition from % to %', old.lifecycle_status, new.lifecycle_status;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_vessel_project_lifecycle_transition() from public;

create trigger vessel_projects_enforce_lifecycle_transition
  before update of lifecycle_status on public.vessel_projects
  for each row execute function private.enforce_vessel_project_lifecycle_transition();

-- --- 5b. Automatic creation event ------------------------------------------------
-- Mirrors Gate 1A.1's automatic-trigger pattern (not a manual RPC call from
-- application code): every insert logs its own null -> active event in the
-- same statement, so a project can never exist without a matching initial
-- lifecycle event.

create function private.log_vessel_project_creation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.vessel_project_lifecycle_events (
    tenant_id, project_id, from_status, to_status, actor_user_id, reason
  ) values (
    new.tenant_id, new.id, null, new.lifecycle_status, auth.uid(), null
  );
  return new;
end;
$$;

revoke execute on function private.log_vessel_project_creation() from public;

create trigger vessel_project_lifecycle_creation_log
  after insert on public.vessel_projects
  for each row execute function private.log_vessel_project_creation();

-- --- 5c. Transition RPC -----------------------------------------------------------
-- The only path that can change lifecycle_status: `authenticated` has no
-- UPDATE grant at all on vessel_projects (see §6), so a direct PostgREST
-- UPDATE is structurally impossible. This function re-derives tenant_id from
-- the project row itself (never caller input), independently re-checks
-- owner/admin membership before writing (defense in depth on top of the
-- app-layer requireTenantRole check), and writes the status change and its
-- lifecycle event in the same transaction — a failure of either half rolls
-- back both, so "exactly one event per transition" holds even under error.
-- `for update` locks the row so two concurrent transition calls cannot both
-- read the same old status and race past the state-machine guard.

create function public.transition_vessel_project_lifecycle(
  p_project_id uuid,
  p_to_status public.vessel_project_lifecycle_status,
  p_reason text default null
)
returns public.vessel_projects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_from_status public.vessel_project_lifecycle_status;
  v_tenant_id uuid;
  v_result public.vessel_projects;
begin
  select lifecycle_status, tenant_id
    into v_from_status, v_tenant_id
    from public.vessel_projects
    where id = p_project_id
    for update;

  if not found then
    raise exception 'vessel project not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to transition vessel project lifecycle';
  end if;

  -- The BEFORE UPDATE trigger in §5a is the authoritative state-machine
  -- check (fires on this UPDATE and raises if the transition is invalid);
  -- no duplicate validation here.
  update public.vessel_projects
  set
    lifecycle_status = p_to_status,
    ready_to_close_at = case when p_to_status = 'ready_to_close' then now() else ready_to_close_at end,
    closed_at = case when p_to_status = 'closed' then now() else closed_at end,
    closed_by = case when p_to_status = 'closed' then auth.uid() else closed_by end
  where id = p_project_id
  returning * into v_result;

  insert into public.vessel_project_lifecycle_events (
    tenant_id, project_id, from_status, to_status, actor_user_id, reason
  ) values (
    v_tenant_id, p_project_id, v_from_status, p_to_status, auth.uid(), p_reason
  );

  return v_result;
end;
$$;

revoke execute on function public.transition_vessel_project_lifecycle(uuid, public.vessel_project_lifecycle_status, text) from public;
grant execute on function public.transition_vessel_project_lifecycle(uuid, public.vessel_project_lifecycle_status, text) to authenticated;

-- =============================================================================
-- 6. RLS & Grants
-- =============================================================================
-- Same posture as Gate 1A: auto_expose_new_tables is off, so these tables
-- start with zero privileges for anon/authenticated/service_role. No UPDATE
-- grant exists anywhere for `authenticated` on vessel_projects — the RPC in
-- §5c (SECURITY DEFINER, running as the table owner) is the only mutation
-- path for lifecycle_status/ready_to_close_at/closed_at/closed_by, so a
-- caller cannot forge any of those fields via a direct table write. No
-- DELETE grant exists either — hard delete from the app is structurally
-- impossible, matching every Gate 1A master-data table.

alter table public.vessel_projects enable row level security;
alter table public.vessel_project_lifecycle_events enable row level security;

revoke all on public.vessel_projects from public;
revoke all on public.vessel_project_lifecycle_events from public;

-- --- vessel_projects ---------------------------------------------------------

create policy vessel_projects_select_member
  on public.vessel_projects for select
  to authenticated
  using (private.current_user_is_active_tenant_member (tenant_id));

create policy vessel_projects_insert_owner_admin
  on public.vessel_projects for insert
  to authenticated
  with check (
    private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[])
    and created_by = auth.uid()
  );

grant select on public.vessel_projects to authenticated;
grant insert (
  tenant_id, vessel_id, client_id, service_type_id, facility_location_id,
  project_code, start_date, created_by
) on public.vessel_projects to authenticated;
grant all on public.vessel_projects to service_role;

-- --- vessel_project_lifecycle_events ----------------------------------------------
-- Same visibility rule as master_data_audit_events: owner/admin/reviewer can
-- read the lifecycle trail, viewer cannot (viewer still sees the current
-- lifecycle_status via vessel_projects itself). No INSERT/UPDATE/DELETE
-- grant for `authenticated` at all — every write path is the SECURITY
-- DEFINER trigger/RPC in §5b/§5c, never a manual insert from application
-- code.

create policy vessel_project_lifecycle_events_select_owner_admin_reviewer
  on public.vessel_project_lifecycle_events for select
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin', 'reviewer']::public.tenant_role[]));

grant select on public.vessel_project_lifecycle_events to authenticated;
grant select, insert on public.vessel_project_lifecycle_events to service_role;
