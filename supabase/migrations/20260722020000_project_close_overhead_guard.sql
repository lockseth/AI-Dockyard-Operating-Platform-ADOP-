-- ADOP Phase 1 Gate 1O — Project-Close Shared Overhead Guard
--
-- A vessel project's final cost summary is only trustworthy once every
-- shared-overhead cost that applies to its lifetime has been explicitly
-- allocated. This migration adds that guard to the 'closed' transition of
-- public.transition_vessel_project_lifecycle: the applicable cost period is
-- [project.start_date, today in Asia/Jakarta] (the requested close date),
-- narrowed by facility_location_id when BOTH the project and the overhead
-- entry carry one (an entry or a project missing that optional field is
-- never allowed to slip past the guard unblocked — it is treated as "could
-- apply", not "does not apply"). Overhead entries outside that period, or
-- dated in the future, never block. Once an entry reaches shared_overhead_
-- allocation_status.allocation_status = 'fully_allocated' it stops blocking
-- every project, even one it was never allocated to — the decision is
-- explicit and already in the append-only allocation trail (Gate 1N), so
-- there is nothing left to revisit.
--
-- "Today" is computed as (now() at time zone 'Asia/Jakarta')::date, never
-- bare current_date/now()::date — this database runs with TimeZone=UTC (the
-- Docker/Supabase default; confirmed via `show timezone`), and every other
-- business-date computation in this codebase (getJakartaBusinessDate() in
-- src/lib/operations-daily/format.ts) is explicit about Asia/Jakarta for
-- exactly this reason. Jakarta is UTC+7, so for the ~7-hour window each day
-- from UTC 17:00-23:59 (Jakarta 00:00-06:59), bare current_date would still
-- report YESTERDAY's date while Jakarta has already rolled over to today —
-- silently excluding a same-Jakarta-day unallocated overhead entry from the
-- guard's range and letting a close through that should have been blocked.
--
-- Does not edit 20260719100000_vessel_project_lifecycle.sql —
-- transition_vessel_project_lifecycle is extended here via CREATE OR
-- REPLACE FUNCTION (same signature as Gate 1B) — every existing behavior
-- (owner/admin-only, active->ready_to_close->closed state machine enforced
-- by the BEFORE UPDATE trigger, lifecycle event logging) is unchanged; only
-- the new guard block, which runs before the UPDATE and only when
-- p_to_status = 'closed', is added.

create or replace function public.transition_vessel_project_lifecycle(
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
  v_start_date date;
  v_facility_location_id uuid;
  v_blocking_count integer;
  v_jakarta_today date;
  v_result public.vessel_projects;
begin
  select lifecycle_status, tenant_id, start_date, facility_location_id
    into v_from_status, v_tenant_id, v_start_date, v_facility_location_id
    from public.vessel_projects
    where id = p_project_id
    for update;

  if not found then
    raise exception 'vessel project not found';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to transition vessel project lifecycle';
  end if;

  -- Gate 1O: shared overhead applicable to this project's cost period must
  -- be fully allocated before it can close. Server-side only — no UI-layer
  -- check can substitute for this, and it fires regardless of caller.
  if p_to_status = 'closed' then
    v_jakarta_today := (now() at time zone 'Asia/Jakarta')::date;

    select count(*) into v_blocking_count
    from public.shared_overhead_allocation_status s
    where s.tenant_id = v_tenant_id
      and s.business_date between v_start_date and v_jakarta_today
      and (
        v_facility_location_id is null
        or s.facility_location_id is null
        or s.facility_location_id = v_facility_location_id
      )
      and s.allocation_status in ('unallocated', 'partially_allocated');

    if v_blocking_count > 0 then
      raise exception 'SHARED_OVERHEAD_ALLOCATION_INCOMPLETE';
    end if;
  end if;

  -- The BEFORE UPDATE trigger in Gate 1B §5a is the authoritative
  -- state-machine check (fires on this UPDATE and raises if the transition
  -- is invalid); no duplicate validation here.
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

-- grants unchanged (owner/admin, since Gate 1B) — CREATE OR REPLACE keeps them.
