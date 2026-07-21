-- ADOP — Project Priority & Optional Facility Location pgTAP proof (Locked
-- UI & Operational Safety Revision, Gate 3).
--
-- Proves: priority defaults to 'standard' and is not null, facility_location_id
-- can be omitted, set_vessel_project_priority is owner/admin-only and the
-- only path to change priority after creation, and a data-fix migration
-- deactivated Emergency/Standard/PLTU service types (asserted separately in
-- master_data.test.sql against the real seed rows — this file only proves
-- the priority/facility-location schema behavior with its own fixtures).
--
-- Self-contained: creates its own fixtures, rolls back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('d1111111-1111-4111-8111-111111111111', 'pgtap-project-priority-tenant', 'PgTAP Project Priority Tenant', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-d111-1111-0000-000000000001', 'authenticated', 'authenticated', 'owner-priority@pgtap-md.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-d111-1111-0000-000000000002', 'authenticated', 'authenticated', 'reviewer-priority@pgtap-md.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('90000000-4444-0000-0000-000000000001', 'd1111111-1111-4111-8111-111111111111', '00000000-d111-1111-0000-000000000001', 'active'),
  ('90000000-4444-0000-0000-000000000002', 'd1111111-1111-4111-8111-111111111111', '00000000-d111-1111-0000-000000000002', 'active');

insert into public.membership_roles (membership_id, role) values
  ('90000000-4444-0000-0000-000000000001', 'owner'),
  ('90000000-4444-0000-0000-000000000002', 'reviewer');

-- Anchor rows inserted as the migration/table-owner role (bypasses RLS —
-- fixture setup only, never application code).
insert into public.clients (id, tenant_id, display_name, created_by) values
  ('d0000000-cccc-0000-0000-000000000001', 'd1111111-1111-4111-8111-111111111111', 'Client Priority Test', '00000000-d111-1111-0000-000000000001');
insert into public.vessels (id, tenant_id, vessel_name, client_id, created_by) values
  ('d0000000-dddd-0000-0000-000000000001', 'd1111111-1111-4111-8111-111111111111', 'KM Priority Test', 'd0000000-cccc-0000-0000-000000000001', '00000000-d111-1111-0000-000000000001');
insert into public.service_types (id, tenant_id, code, name) values
  ('d0000000-eeee-0000-0000-000000000001', 'd1111111-1111-4111-8111-111111111111', 'docking', 'Docking');

-- =============================================================================
-- SCHEMA
-- =============================================================================

select has_column('public', 'vessel_projects', 'priority', 'vessel_projects has priority');
select col_not_null('public', 'vessel_projects', 'priority', 'priority is not null');
select col_is_null('public', 'vessel_projects', 'facility_location_id', 'facility_location_id is nullable');

-- =============================================================================
-- OWNER: create without facility_location_id, priority defaults to standard
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-d111-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ insert into public.vessel_projects (tenant_id, vessel_id, client_id, service_type_id, start_date, created_by)
     values ('d1111111-1111-4111-8111-111111111111', 'd0000000-dddd-0000-0000-000000000001', 'd0000000-cccc-0000-0000-000000000001', 'd0000000-eeee-0000-0000-000000000001', '2026-01-01', '00000000-d111-1111-0000-000000000001') $$,
  'owner can create a vessel_project with no facility_location_id at all'
);

select is(
  (select priority::text from public.vessel_projects where tenant_id = 'd1111111-1111-4111-8111-111111111111' and vessel_id = 'd0000000-dddd-0000-0000-000000000001'),
  'standard',
  'priority defaults to standard when not explicitly provided'
);

select is(
  (select facility_location_id from public.vessel_projects where tenant_id = 'd1111111-1111-4111-8111-111111111111' and vessel_id = 'd0000000-dddd-0000-0000-000000000001'),
  null,
  'facility_location_id is null, as provided'
);

select id as project_id from public.vessel_projects
  where tenant_id = 'd1111111-1111-4111-8111-111111111111' and vessel_id = 'd0000000-dddd-0000-0000-000000000001' \gset

-- =============================================================================
-- set_vessel_project_priority — the only path to change priority after
-- creation (no general UPDATE grant exists on this table for `authenticated`)
-- =============================================================================

select lives_ok(
  format($$ select public.set_vessel_project_priority(%L::uuid, 'urgent') $$, :'project_id'),
  'owner can change priority via the RPC'
);

select is(
  (select priority::text from public.vessel_projects where id = :'project_id'::uuid),
  'urgent',
  'priority round-trips to urgent after the RPC call'
);

select throws_ok(
  format($$ update public.vessel_projects set priority = 'emergency' where id = %L::uuid $$, :'project_id'),
  '42501',
  null,
  'a direct UPDATE on vessel_projects is rejected — no UPDATE grant exists for authenticated at all'
);

-- =============================================================================
-- REVIEWER cannot change priority
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-d111-1111-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  format($$ select public.set_vessel_project_priority(%L::uuid, 'emergency') $$, :'project_id'),
  'P0001',
  'not authorized to change vessel project priority',
  'reviewer cannot change priority via the RPC'
);

select * from finish();

rollback;
