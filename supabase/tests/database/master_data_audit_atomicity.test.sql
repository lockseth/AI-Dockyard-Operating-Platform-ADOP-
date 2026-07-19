-- ADOP Phase 1 Gate 1A.1 — pgTAP proof for atomic master-data audit.
--
-- Proves supabase/migrations/20260719090000_master_data_audit_atomicity.sql:
-- an AFTER ROW trigger audits every INSERT/UPDATE/DELETE on all seven
-- master-data tables in the same transaction as the mutation, the manual
-- RPC it replaces is locked, and a forced audit-write failure rolls the
-- mutation back too.
--
-- Self-contained: its own fixtures, distinct tenant/user ids from
-- master_data.test.sql and tenant_isolation.test.sql. Rolls back at the end.
--
-- Note: `authenticated`'s INSERT grant on every master-data table excludes
-- the `id` column (Gate 1A §5 — ids are server-generated only), so rows
-- created "as" owner/viewer C below are looked up afterward by a unique
-- business key (vessel_code, vendor_code, code, full_name) rather than a
-- caller-chosen id.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('55555555-5555-5555-5555-555555555555', 'pgtap-audit-tenant-c', 'PgTAP Audit Tenant C', 'active'),
  ('66666666-6666-6666-6666-666666666666', 'pgtap-audit-tenant-d', 'PgTAP Audit Tenant D', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-cccc-1111-0000-000000000001', 'authenticated', 'authenticated', 'owner-c@pgtap-audit.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-cccc-1111-0000-000000000002', 'authenticated', 'authenticated', 'viewer-c@pgtap-audit.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-dddd-1111-0000-000000000001', 'authenticated', 'authenticated', 'owner-d@pgtap-audit.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('c0000000-1111-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '00000000-cccc-1111-0000-000000000001', 'active'),
  ('c0000000-1111-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', '00000000-cccc-1111-0000-000000000002', 'active'),
  ('d0000000-1111-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666', '00000000-dddd-1111-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('c0000000-1111-0000-0000-000000000001', 'owner'),
  ('c0000000-1111-0000-0000-000000000002', 'viewer'),
  ('d0000000-1111-0000-0000-000000000001', 'owner');

-- Anchor rows, inserted as the migration/table-owner role (bypasses RLS and
-- column grants — only fixture setup ever does this, never application code).
insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('c0000000-0000-0000-0000-0000000000c1', '55555555-5555-5555-5555-555555555555', 'CL-C-ANCHOR', 'Anchor Client C', '00000000-cccc-1111-0000-000000000001'),
  ('d0000000-0000-0000-0000-0000000000c1', '66666666-6666-6666-6666-666666666666', 'CL-D-ANCHOR', 'Anchor Client D', '00000000-dddd-1111-0000-000000000001');

-- The anchor inserts above already fired the new trigger and produced their
-- own 'create' audit rows — append-only means that noise can't be cleared
-- (not even service_role can delete an audit row), so every assertion below
-- filters by entity_id rather than relying on a clean tenant-wide count.

-- =============================================================================
-- STRUCTURAL — trigger coverage, no caller-controllable input surface
-- =============================================================================

select has_trigger('public', 'clients', 'master_data_audit_log', 'clients has an active audit trigger');
select has_trigger('public', 'client_contacts', 'master_data_audit_log', 'client_contacts has an active audit trigger');
select has_trigger('public', 'vessels', 'master_data_audit_log', 'vessels has an active audit trigger');
select has_trigger('public', 'vendors', 'master_data_audit_log', 'vendors has an active audit trigger');
select has_trigger('public', 'service_types', 'master_data_audit_log', 'service_types has an active audit trigger');
select has_trigger('public', 'facility_locations', 'master_data_audit_log', 'facility_locations has an active audit trigger');
select has_trigger('public', 'expense_categories', 'master_data_audit_log', 'expense_categories has an active audit trigger');

select is(
  (select count(*)::int from pg_trigger where tgrelid = 'public.clients'::regclass and tgname = 'master_data_audit_log' and not tgisinternal),
  1,
  'clients has exactly one audit trigger — no duplicate from a re-applied migration'
);

select is(
  (select pronargs::int from pg_proc where oid = 'private.log_master_data_mutation()'::regprocedure),
  0,
  'the trigger function takes zero parameters — tenant/actor/action cannot be caller-supplied'
);

select ok(
  not has_function_privilege('anon', 'private.log_master_data_mutation()', 'EXECUTE'),
  'anon has no EXECUTE grant on the trigger function'
);
select ok(
  not has_function_privilege('authenticated', 'private.log_master_data_mutation()', 'EXECUTE'),
  'authenticated has no EXECUTE grant on the trigger function'
);
select throws_ok(
  $$ select private.log_master_data_mutation() $$,
  'trigger functions can only be called as triggers',
  'the trigger function cannot be invoked directly, even without EXECUTE denied'
);

-- =============================================================================
-- MANUAL RPC — locked, superseded by the trigger
-- =============================================================================

select ok(
  not has_function_privilege('anon', 'public.log_master_data_audit_event(uuid, text, uuid, text, jsonb, jsonb)', 'EXECUTE'),
  'anon still has no EXECUTE grant on the manual RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.log_master_data_audit_event(uuid, text, uuid, text, jsonb, jsonb)', 'EXECUTE'),
  'authenticated no longer has EXECUTE on the manual RPC — Gate 1A.1 locked it'
);

-- =============================================================================
-- INSERT — automatic 'create' audit
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-cccc-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ insert into public.vessels (tenant_id, client_id, vessel_code, vessel_name, created_by)
     values ('55555555-5555-5555-5555-555555555555', 'c0000000-0000-0000-0000-0000000000c1', 'VS-AUDIT-01', 'KM Audit Proof', '00000000-cccc-1111-0000-000000000001') $$,
  'owner C can create a vessel — no manual audit call needed'
);

select is(
  (select count(*)::int from public.master_data_audit_events
     where tenant_id = '55555555-5555-5555-5555-555555555555'
       and entity_id = (select id from public.vessels where tenant_id = '55555555-5555-5555-5555-555555555555' and vessel_code = 'VS-AUDIT-01')),
  1,
  'the INSERT produced exactly one audit event automatically'
);

select results_eq(
  $$ select entity_type, action, actor_user_id, before_data
       from public.master_data_audit_events
       where entity_id = (select id from public.vessels where vessel_code = 'VS-AUDIT-01') $$,
  $$ values ('vessel'::text, 'create'::text, '00000000-cccc-1111-0000-000000000001'::uuid, null::jsonb) $$,
  'the create event has entity_type/action/actor from DB context, and no before_data'
);

select results_eq(
  $$ select (after_data ->> 'vessel_name')::text
       from public.master_data_audit_events
       where entity_id = (select id from public.vessels where vessel_code = 'VS-AUDIT-01') $$,
  $$ values ('KM Audit Proof'::text) $$,
  'the create event captures the inserted row in after_data'
);

-- =============================================================================
-- UPDATE — automatic 'update' vs 'activate'/'deactivate' audit with OLD/NEW
-- =============================================================================

update public.vessels set vessel_name = 'KM Audit Proof Renamed'
  where tenant_id = '55555555-5555-5555-5555-555555555555' and vessel_code = 'VS-AUDIT-01';

select is(
  (select count(*)::int from public.master_data_audit_events
     where entity_id = (select id from public.vessels where vessel_code = 'VS-AUDIT-01') and action = 'update'),
  1,
  'the UPDATE produced exactly one additional audit event, action=update'
);

select results_eq(
  $$ select (before_data ->> 'vessel_name')::text, (after_data ->> 'vessel_name')::text
       from public.master_data_audit_events
       where entity_id = (select id from public.vessels where vessel_code = 'VS-AUDIT-01') and action = 'update' $$,
  $$ values ('KM Audit Proof'::text, 'KM Audit Proof Renamed'::text) $$,
  'the update event carries the correct OLD and NEW vessel_name'
);

update public.vessels set status = 'inactive'
  where tenant_id = '55555555-5555-5555-5555-555555555555' and vessel_code = 'VS-AUDIT-01';

select results_eq(
  $$ select action from public.master_data_audit_events
       where entity_id = (select id from public.vessels where vessel_code = 'VS-AUDIT-01') and after_data ->> 'status' = 'inactive' $$,
  $$ values ('deactivate'::text) $$,
  'a status transition to inactive is classified as deactivate, not a plain update'
);

update public.vessels set status = 'active'
  where tenant_id = '55555555-5555-5555-5555-555555555555' and vessel_code = 'VS-AUDIT-01';

select results_eq(
  $$ select action from public.master_data_audit_events
       where entity_id = (select id from public.vessels where vessel_code = 'VS-AUDIT-01')
         and after_data ->> 'status' = 'active' and before_data ->> 'status' = 'inactive' $$,
  $$ values ('activate'::text) $$,
  'a status transition back to active is classified as activate'
);

select is(
  (select count(*)::int from public.master_data_audit_events where entity_id = (select id from public.vessels where vessel_code = 'VS-AUDIT-01')),
  4,
  'create + rename + deactivate + activate = exactly four audit events, one per mutation'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- SMOKE COVERAGE — remaining tables each audit their own create
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-cccc-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

insert into public.client_contacts (tenant_id, client_id, full_name, created_by)
  values ('55555555-5555-5555-5555-555555555555', 'c0000000-0000-0000-0000-0000000000c1', 'Audit PIC', '00000000-cccc-1111-0000-000000000001');
insert into public.vendors (tenant_id, vendor_code, display_name, created_by)
  values ('55555555-5555-5555-5555-555555555555', 'VN-AUDIT-01', 'Audit Vendor', '00000000-cccc-1111-0000-000000000001');
insert into public.service_types (tenant_id, code, name)
  values ('55555555-5555-5555-5555-555555555555', 'audit-proof', 'Audit Proof');
insert into public.facility_locations (tenant_id, code, name)
  values ('55555555-5555-5555-5555-555555555555', 'FL-AUDIT', 'Audit Facility');
insert into public.expense_categories (tenant_id, code, name)
  values ('55555555-5555-5555-5555-555555555555', 'AUDIT-CAT', 'Audit Category');

select results_eq(
  $$ select entity_type, action from public.master_data_audit_events
       where entity_id = (select id from public.client_contacts where full_name = 'Audit PIC') $$,
  $$ values ('client_contact'::text, 'create'::text) $$,
  'client_contacts insert audits itself as client_contact/create'
);
select results_eq(
  $$ select entity_type, action from public.master_data_audit_events
       where entity_id = (select id from public.vendors where vendor_code = 'VN-AUDIT-01') $$,
  $$ values ('vendor'::text, 'create'::text) $$,
  'vendors insert audits itself as vendor/create'
);
select results_eq(
  $$ select entity_type, action from public.master_data_audit_events
       where entity_id = (select id from public.service_types where tenant_id = '55555555-5555-5555-5555-555555555555' and code = 'audit-proof') $$,
  $$ values ('service_type'::text, 'create'::text) $$,
  'service_types insert audits itself as service_type/create'
);
select results_eq(
  $$ select entity_type, action from public.master_data_audit_events
       where entity_id = (select id from public.facility_locations where code = 'FL-AUDIT') $$,
  $$ values ('facility_location'::text, 'create'::text) $$,
  'facility_locations insert audits itself as facility_location/create'
);
select results_eq(
  $$ select entity_type, action from public.master_data_audit_events
       where entity_id = (select id from public.expense_categories where code = 'AUDIT-CAT') $$,
  $$ values ('expense_category'::text, 'create'::text) $$,
  'expense_categories insert audits itself as expense_category/create'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- DELETE — audited when actually permitted (service_role only)
-- =============================================================================
-- No table grants DELETE to `authenticated` (Gate 1A §6) — the only role
-- that can hard-delete at all is service_role, which bypasses RLS. There is
-- no session JWT in that path, so actor_user_id is legitimately null; the
-- mutation and its audit event are still one atomic unit.

set local role service_role;

select lives_ok(
  $$ delete from public.service_types where tenant_id = '55555555-5555-5555-5555-555555555555' and code = 'audit-proof' $$,
  'service_role can hard-delete a service_type'
);

select results_eq(
  $$ select entity_type, action, actor_user_id, after_data
       from public.master_data_audit_events
       where entity_type = 'service_type' and action = 'delete' and before_data ->> 'code' = 'audit-proof' $$,
  $$ values ('service_type'::text, 'delete'::text, null::uuid, null::jsonb) $$,
  'the DELETE produced exactly one audit event, action=delete, no actor, no after_data'
);

select is(
  (select count(*)::int from public.master_data_audit_events where entity_type = 'service_type' and action = 'delete' and before_data ->> 'code' = 'audit-proof'),
  1,
  'the DELETE produced exactly one audit event'
);

reset role;

-- =============================================================================
-- ANTI-SPOOF — direct writes to the audit table stay rejected
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-cccc-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ insert into public.master_data_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action)
     values (
       '55555555-5555-5555-5555-555555555555', '00000000-dddd-1111-0000-000000000001', 'vessel',
       (select id from public.vessels where vessel_code = 'VS-AUDIT-01'), 'create'
     ) $$,
  '42501',
  null,
  'owner C cannot directly insert a forged audit event attributing it to a different actor'
);

reset role;
select set_config('request.jwt.claims', '', true);

select throws_ok(
  $$ update public.master_data_audit_events set action = 'tampered'
       where entity_id = (select id from public.vessels where vessel_code = 'VS-AUDIT-01') $$,
  'access_audit_events is append-only: UPDATE not allowed',
  'audit rows stay append-only regardless of the automatic trigger'
);

-- =============================================================================
-- CROSS-TENANT ISOLATION — audit reads
-- =============================================================================

insert into public.vendors (id, tenant_id, display_name, created_by)
  values ('d0000000-0000-0000-0000-00000000ff01', '66666666-6666-6666-6666-666666666666', 'Tenant D Vendor', '00000000-dddd-1111-0000-000000000001');

select set_config('request.jwt.claims', json_build_object('sub', '00000000-cccc-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select is_empty(
  $$ select id from public.master_data_audit_events where entity_id = 'd0000000-0000-0000-0000-00000000ff01' $$,
  'owner C cannot read tenant D''s audit event for the vendor tenant D just created'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- Viewer role: read-only member, cannot read master-data audit detail.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-cccc-1111-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select is_empty(
  $$ select id from public.master_data_audit_events where tenant_id = '55555555-5555-5555-5555-555555555555' $$,
  'viewer C cannot read master_data_audit_events even for their own tenant'
);
select throws_ok(
  $$ insert into public.vendors (tenant_id, display_name, created_by)
     values ('55555555-5555-5555-5555-555555555555', 'Viewer Attempt Vendor', '00000000-cccc-1111-0000-000000000002') $$,
  '42501',
  null,
  'viewer C cannot mutate master data at all — nothing for the trigger to fire on'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- anon: zero access, confirmed once more here since it is directly relevant
-- to "who can trigger an audit write at all".
set local role anon;
select throws_ok(
  $$ insert into public.vendors (tenant_id, display_name) values ('55555555-5555-5555-5555-555555555555', 'Anon Vendor') $$,
  '42501',
  null,
  'anon cannot mutate master data — nothing for the trigger to fire on'
);
reset role;

-- =============================================================================
-- ATOMIC ROLLBACK PROOF — a forced audit-write failure rolls back the mutation
-- =============================================================================
-- Test-only mechanism: a sentinel CHECK constraint that only ever rejects a
-- row whose audited after_data carries one specific magic display_name,
-- added and dropped within this same transaction — no object or residue
-- survives past this section (and the whole file rolls back at EOF anyway).

alter table public.master_data_audit_events
  add constraint pgtap_sentinel_audit_failure
  check (after_data ->> 'display_name' is distinct from 'ROLLBACK-PROOF-SENTINEL');

select set_config('request.jwt.claims', json_build_object('sub', '00000000-cccc-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ insert into public.vendors (tenant_id, display_name, created_by)
     values ('55555555-5555-5555-5555-555555555555', 'ROLLBACK-PROOF-SENTINEL', '00000000-cccc-1111-0000-000000000001') $$,
  '23514',
  null,
  'a forced audit-insert failure raises inside the same statement as the mutation'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is_empty(
  $$ select id from public.vendors where display_name = 'ROLLBACK-PROOF-SENTINEL' $$,
  'the vendor row from the failed statement was rolled back too — mutation and audit are one atomic unit'
);
select is_empty(
  $$ select id from public.master_data_audit_events where after_data ->> 'display_name' = 'ROLLBACK-PROOF-SENTINEL' $$,
  'no partial audit event survives from the failed statement either'
);

alter table public.master_data_audit_events drop constraint pgtap_sentinel_audit_failure;

select * from finish();

rollback;
