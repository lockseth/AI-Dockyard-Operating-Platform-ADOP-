-- ADOP Phase 1 Gate 1A.1 — Atomic Master Data Audit
--
-- Closes the atomicity gap in Gate 1A: master-data audit events were
-- previously written by the application calling public.log_master_data_audit_
-- event() as a *second*, separate round trip after the row mutation — so a
-- crash, network failure, or buggy caller between the two calls could leave
-- a mutation with no audit trail, or let a caller fabricate an audit event
-- with no corresponding mutation at all.
--
-- This migration makes every INSERT/UPDATE/DELETE on the seven master-data
-- tables audit itself via an AFTER ROW trigger, in the same transaction and
-- the same statement as the mutation. If the audit write fails for any
-- reason, the trigger's exception aborts the statement — the master-data
-- mutation is rolled back too.
--
-- Does not edit 20260719070115_foundation_tenant_isolation.sql or
-- 20260719080000_master_data.sql — purely additive: a widened check
-- constraint, one new trigger function, seven new triggers, and a REVOKE on
-- the now-superseded manual RPC.

-- =============================================================================
-- 1. Allow the 'delete' action
-- =============================================================================
-- The original action check (create/update/activate/deactivate) predates
-- automatic delete auditing — no table grants DELETE to `authenticated`
-- (hard delete stays structurally impossible from the app), but
-- `service_role` has ALL on every master-data table and does bypass RLS, so
-- a service-role-initiated delete is a real, auditable path.

alter table public.master_data_audit_events
  drop constraint if exists master_data_audit_events_action_check;

alter table public.master_data_audit_events
  add constraint master_data_audit_events_action_check
  check (action in ('create', 'update', 'activate', 'deactivate', 'delete'));

-- =============================================================================
-- 2. Trigger function — private.log_master_data_mutation()
-- =============================================================================
-- Takes no parameters at all: tenant_id/entity_id come from OLD/NEW (the row
-- actually being mutated, already tenant-scoped by that table's own RLS
-- policy), actor_user_id comes from auth.uid() (session context), and action
-- is derived from TG_OP plus the status transition — never from caller
-- input. There is structurally no argument a caller could use to spoof any
-- of these fields.
--
-- SECURITY DEFINER is required: `authenticated` has no INSERT grant on
-- master_data_audit_events (see Gate 1A §5/§6), so without running as the
-- table owner every legitimate mutation would fail the audit insert and
-- roll back. Fixed search_path and fully-qualified `public.*` names prevent
-- search_path hijacking despite the elevated privilege.
--
-- entity_type is normalized to the same singular vocabulary the Gate 1A
-- application layer already writes (see MasterDataEntityType in
-- src/lib/master-data/shared/types.ts) so historical and future rows share
-- one naming convention.

create or replace function private.log_master_data_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entity_type text;
  v_tenant_id uuid;
  v_entity_id uuid;
  v_action text;
  v_before jsonb;
  v_after jsonb;
begin
  v_entity_type := case tg_table_name
    when 'clients' then 'client'
    when 'client_contacts' then 'client_contact'
    when 'vessels' then 'vessel'
    when 'vendors' then 'vendor'
    when 'service_types' then 'service_type'
    when 'facility_locations' then 'facility_location'
    when 'expense_categories' then 'expense_category'
    else tg_table_name
  end;

  if tg_op = 'INSERT' then
    v_tenant_id := new.tenant_id;
    v_entity_id := new.id;
    v_action := 'create';
    v_before := null;
    v_after := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_tenant_id := new.tenant_id;
    v_entity_id := new.id;
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    if old.status is distinct from new.status then
      v_action := case when new.status = 'active' then 'activate' else 'deactivate' end;
    else
      v_action := 'update';
    end if;
  else
    -- DELETE
    v_tenant_id := old.tenant_id;
    v_entity_id := old.id;
    v_action := 'delete';
    v_before := to_jsonb(old);
    v_after := null;
  end if;

  insert into public.master_data_audit_events (
    tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    v_tenant_id, auth.uid(), v_entity_type, v_entity_id, v_action, v_before, v_after
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- No EXECUTE grant to anyone: firing as a trigger does not require the
-- invoking role to hold EXECUTE on the trigger function (Postgres invokes
-- trigger functions through the trigger manager, not a normal function
-- call), and Postgres itself refuses `select private.log_master_data_
-- mutation()` for any role since a `returns trigger` function can only be
-- invoked by the trigger manager. The REVOKE below is defense in depth.
revoke execute on function private.log_master_data_mutation() from public;

-- =============================================================================
-- 3. Attach the trigger to all seven master-data tables
-- =============================================================================
-- AFTER ROW (not BEFORE): fires once the row is final — including any
-- BEFORE trigger effects such as set_updated_at — and, because it runs in
-- the same statement as the mutation, an exception here aborts that
-- statement's effects too (see §4 test proof). `drop trigger if exists`
-- before each `create trigger` keeps this migration idempotent and rules
-- out duplicate triggers if ever re-applied.

drop trigger if exists master_data_audit_log on public.clients;
create trigger master_data_audit_log
  after insert or update or delete on public.clients
  for each row execute function private.log_master_data_mutation();

drop trigger if exists master_data_audit_log on public.client_contacts;
create trigger master_data_audit_log
  after insert or update or delete on public.client_contacts
  for each row execute function private.log_master_data_mutation();

drop trigger if exists master_data_audit_log on public.vessels;
create trigger master_data_audit_log
  after insert or update or delete on public.vessels
  for each row execute function private.log_master_data_mutation();

drop trigger if exists master_data_audit_log on public.vendors;
create trigger master_data_audit_log
  after insert or update or delete on public.vendors
  for each row execute function private.log_master_data_mutation();

drop trigger if exists master_data_audit_log on public.service_types;
create trigger master_data_audit_log
  after insert or update or delete on public.service_types
  for each row execute function private.log_master_data_mutation();

drop trigger if exists master_data_audit_log on public.facility_locations;
create trigger master_data_audit_log
  after insert or update or delete on public.facility_locations
  for each row execute function private.log_master_data_mutation();

drop trigger if exists master_data_audit_log on public.expense_categories;
create trigger master_data_audit_log
  after insert or update or delete on public.expense_categories
  for each row execute function private.log_master_data_mutation();

-- =============================================================================
-- 4. Lock the superseded manual RPC
-- =============================================================================
-- public.log_master_data_audit_event() (Gate 1A §4) let an authenticated
-- owner/admin log an audit event with caller-supplied action/before/after —
-- now that every mutation audits itself automatically, leaving this
-- reachable would let a caller double up a real mutation's audit trail, or
-- insert a fabricated event with no mutation behind it, breaking "exactly
-- one audit event per mutation". It is not dropped (kept for history/
-- reversibility) — just locked: authenticated loses EXECUTE, same as
-- anon/public already had in Gate 1A.
revoke execute on function public.log_master_data_audit_event(uuid, text, uuid, text, jsonb, jsonb) from authenticated;
