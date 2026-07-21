-- ADOP — Project Priority, Optional Facility Location, Service Type
-- Redefinition Data Fix (Locked UI & Operational Safety Revision, Gate 3)
--
-- Three additive/safe changes:
--
-- 1. Project Priority (Emergency/Standard/Urgent) — wholly new concept, no
--    prior column/enum/reference anywhere in the schema. Added NOT NULL
--    DEFAULT 'standard' so every existing row gets a safe, least-presumptive
--    value with zero backfill ambiguity. A narrow SECURITY DEFINER RPC
--    (set_vessel_project_priority) is the only path to change it after
--    creation, mirroring transition_vessel_project_lifecycle's own posture —
--    vessel_projects intentionally has NO general UPDATE grant for
--    `authenticated` (see 20260719100000's own comment), and this migration
--    does not change that; priority is settable at create time or via this
--    one narrow RPC, never via a blanket UPDATE.
--
-- 2. facility_location_id relaxed from NOT NULL to nullable — LOCK H.1
--    ("Facility Location: Tetap opsional") directly contradicts the Gate 1B
--    schema, which made it a hard-required FK. Relaxing a NOT NULL
--    constraint is non-destructive/reversible; the composite FK itself is
--    unchanged (still tenant-safe when a value IS provided).
--
-- 3. Service type data fix — Emergency/Standard/PLTU are being redefined as
--    something other than Service Type (Emergency/Standard become Project
--    Priority values instead; PLTU becomes a Facility Location concept).
--    This deactivates the matching service_types rows for every existing
--    tenant via the SAME status-toggle mechanism every other master-data
--    soft-delete already uses (record_status), never a hard delete —
--    historical references (existing vessel_projects rows) are untouched.
--    Docking is not in this list and stays active.

create type public.vessel_project_priority as enum ('emergency', 'standard', 'urgent');

alter table public.vessel_projects
  add column priority public.vessel_project_priority not null default 'standard',
  alter column facility_location_id drop not null;

comment on column public.vessel_projects.priority is
  'Emergency/Standard/Urgent. Defaults to standard on every pre-existing row — least-presumptive safe backfill, not a business inference.';
comment on column public.vessel_projects.facility_location_id is
  'Optional — not every Project Kapal has a facility/location. The composite tenant-safe FK still applies whenever a value is provided.';

-- 20260719100000_vessel_project_lifecycle.sql's INSERT grant is column-level
-- and cumulative — this only adds the new column to it, it does not reopen
-- any of the columns that migration deliberately left out of both INSERT
-- and UPDATE (lifecycle_status, ready_to_close_at, closed_at, closed_by
-- remain RPC-only; there is still no UPDATE grant for `authenticated` at
-- all on this table).
grant insert (priority) on public.vessel_projects to authenticated;

-- --- set_vessel_project_priority RPC ----------------------------------------
-- The one and only way to change priority after creation. tenant_id is
-- re-derived from the project row itself, never accepted as an argument.
create function public.set_vessel_project_priority(
  p_project_id uuid,
  p_priority public.vessel_project_priority
)
returns public.vessel_projects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_result public.vessel_projects;
begin
  select tenant_id into v_tenant_id
  from public.vessel_projects
  where id = p_project_id;

  if v_tenant_id is null then
    raise exception 'vessel project not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to change vessel project priority';
  end if;

  update public.vessel_projects
  set priority = p_priority
  where id = p_project_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.set_vessel_project_priority(uuid, public.vessel_project_priority) from public;
grant execute on function public.set_vessel_project_priority(uuid, public.vessel_project_priority) to authenticated;

-- --- Service type data fix ---------------------------------------------------
-- Data-only change (no schema change) — reuses the existing status column
-- exactly like any other master-data deactivation (StatusToggleForm already
-- covers this in the UI); applied here once, for every tenant, as a
-- migration data fix rather than requiring each tenant's owner/admin to
-- manually deactivate the same three rows by hand.
update public.service_types
set status = 'inactive'
where code in ('emergency', 'standard', 'pltu')
  and status = 'active';
