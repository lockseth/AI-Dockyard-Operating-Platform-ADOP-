-- ADOP Phase 1 Gate 1B — pgTAP proof for the Vessel Project Lifecycle
-- Foundation: schema, tenant-safe composite relationships, the
-- active -> ready_to_close -> closed state machine (no skip/reverse/reopen),
-- owner/admin-only transitions, exactly-one-event-per-transition, append-only
-- lifecycle events, and hard-delete rejection.
--
-- Self-contained: creates its own fixtures (distinct tenant/user ids from
-- every other pgTAP file in this directory) and rolls back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('77777777-7777-7777-7777-777777777777', 'pgtap-project-tenant-e', 'PgTAP Project Tenant E', 'active'),
  ('88888888-8888-8888-8888-888888888888', 'pgtap-project-tenant-f', 'PgTAP Project Tenant F', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-eeee-1111-0000-000000000001', 'authenticated', 'authenticated', 'owner-e@pgtap-proj.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-eeee-1111-0000-000000000002', 'authenticated', 'authenticated', 'admin-e@pgtap-proj.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-eeee-1111-0000-000000000003', 'authenticated', 'authenticated', 'reviewer-e@pgtap-proj.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-eeee-1111-0000-000000000004', 'authenticated', 'authenticated', 'viewer-e@pgtap-proj.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-ffff-1111-0000-000000000001', 'authenticated', 'authenticated', 'owner-f@pgtap-proj.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('e0000000-1111-0000-0000-000000000001', '77777777-7777-7777-7777-777777777777', '00000000-eeee-1111-0000-000000000001', 'active'),
  ('e0000000-1111-0000-0000-000000000002', '77777777-7777-7777-7777-777777777777', '00000000-eeee-1111-0000-000000000002', 'active'),
  ('e0000000-1111-0000-0000-000000000003', '77777777-7777-7777-7777-777777777777', '00000000-eeee-1111-0000-000000000003', 'active'),
  ('e0000000-1111-0000-0000-000000000004', '77777777-7777-7777-7777-777777777777', '00000000-eeee-1111-0000-000000000004', 'active'),
  ('f0000000-1111-0000-0000-000000000001', '88888888-8888-8888-8888-888888888888', '00000000-ffff-1111-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('e0000000-1111-0000-0000-000000000001', 'owner'),
  ('e0000000-1111-0000-0000-000000000002', 'admin'),
  ('e0000000-1111-0000-0000-000000000003', 'reviewer'),
  ('e0000000-1111-0000-0000-000000000004', 'viewer'),
  ('f0000000-1111-0000-0000-000000000001', 'owner');

-- Anchor master-data rows, inserted as the migration/table-owner role
-- (bypasses RLS and column grants — only fixture setup ever does this).
insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('e0000000-0000-0000-0000-0000000000c1', '77777777-7777-7777-7777-777777777777', 'CL-E-ANCHOR', 'Anchor Client E', '00000000-eeee-1111-0000-000000000001'),
  ('f0000000-0000-0000-0000-0000000000c1', '88888888-8888-8888-8888-888888888888', 'CL-F-ANCHOR', 'Anchor Client F', '00000000-ffff-1111-0000-000000000001');

insert into public.vessels (id, tenant_id, client_id, vessel_code, vessel_name, created_by) values
  ('e0000000-0000-0000-0000-0000000000a1', '77777777-7777-7777-7777-777777777777', 'e0000000-0000-0000-0000-0000000000c1', 'VS-E-ANCHOR', 'KM Anchor E', '00000000-eeee-1111-0000-000000000001'),
  ('f0000000-0000-0000-0000-0000000000a1', '88888888-8888-8888-8888-888888888888', 'f0000000-0000-0000-0000-0000000000c1', 'VS-F-ANCHOR', 'KM Anchor F', '00000000-ffff-1111-0000-000000000001');

insert into public.service_types (id, tenant_id, code, name) values
  ('e0000000-0000-0000-0000-0000000000b1', '77777777-7777-7777-7777-777777777777', 'anchor-service', 'Anchor Service E'),
  ('f0000000-0000-0000-0000-0000000000b1', '88888888-8888-8888-8888-888888888888', 'anchor-service', 'Anchor Service F');

insert into public.facility_locations (id, tenant_id, code, name) values
  ('e0000000-0000-0000-0000-0000000000f1', '77777777-7777-7777-7777-777777777777', 'FL-E-ANCHOR', 'Anchor Facility E'),
  ('f0000000-0000-0000-0000-0000000000f1', '88888888-8888-8888-8888-888888888888', 'FL-F-ANCHOR', 'Anchor Facility F');

-- =============================================================================
-- SCHEMA
-- =============================================================================

select has_table('public', 'vessel_projects', 'public.vessel_projects exists');
select has_table('public', 'vessel_project_lifecycle_events', 'public.vessel_project_lifecycle_events exists');

select has_type('public', 'vessel_project_lifecycle_status', 'vessel_project_lifecycle_status enum exists');
select ok(
  (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.vessel_project_lifecycle_status'::regtype)
    = array['draft', 'active', 'ready_to_close', 'closed'],
  -- Gate 6I-A adds 'draft' (import-candidate-only, before 'active') — see
  -- supabase/tests/database/import_candidate_projects_and_exception_review.
  -- test.sql for the draft->active promotion and invalid-transition proofs.
  'vessel_project_lifecycle_status is exactly draft/active/ready_to_close/closed, in state-machine order'
);

select col_is_pk('public', 'vessel_projects', 'id', 'vessel_projects PK is id');
select col_is_pk('public', 'vessel_project_lifecycle_events', 'id', 'vessel_project_lifecycle_events PK is id');

select col_is_unique('public', 'vessel_projects', array['id', 'tenant_id'], 'vessel_projects (id, tenant_id) is unique — composite FK target');
select col_is_unique('public', 'vessels', array['id', 'tenant_id'], 'vessels (id, tenant_id) is now unique — added for the composite FK from vessel_projects');
select col_is_unique('public', 'service_types', array['id', 'tenant_id'], 'service_types (id, tenant_id) is now unique — added for the composite FK from vessel_projects');
select col_is_unique('public', 'facility_locations', array['id', 'tenant_id'], 'facility_locations (id, tenant_id) is now unique — added for the composite FK from vessel_projects');

select has_fk('public', 'vessel_projects', 'vessel_projects has a foreign key');
select has_fk('public', 'vessel_project_lifecycle_events', 'vessel_project_lifecycle_events has a foreign key');

select ok((select relrowsecurity from pg_class where oid = 'public.vessel_projects'::regclass), 'RLS enabled on vessel_projects');
select ok((select relrowsecurity from pg_class where oid = 'public.vessel_project_lifecycle_events'::regclass), 'RLS enabled on vessel_project_lifecycle_events');

select has_trigger('public', 'vessel_projects', 'set_updated_at', 'vessel_projects has an updated_at trigger');
select has_trigger('public', 'vessel_projects', 'vessel_projects_enforce_lifecycle_transition', 'vessel_projects has the lifecycle transition guard trigger');
select has_trigger('public', 'vessel_projects', 'vessel_project_lifecycle_creation_log', 'vessel_projects has the automatic creation-event trigger');
select has_trigger('public', 'vessel_project_lifecycle_events', 'vessel_project_lifecycle_events_append_only', 'vessel_project_lifecycle_events has the append-only guard trigger');

select is(
  (select n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.oid = 'public.transition_vessel_project_lifecycle(uuid, public.vessel_project_lifecycle_status, text, uuid)'::regprocedure),
  'public',
  'transition_vessel_project_lifecycle lives in public — required for it to be RPC-callable'
);
select ok(
  exists (
    select 1 from pg_proc, unnest(proconfig) as cfg
    where oid = 'public.transition_vessel_project_lifecycle(uuid, public.vessel_project_lifecycle_status, text, uuid)'::regprocedure
      and cfg = 'search_path=public, pg_temp'
  ),
  'transition_vessel_project_lifecycle has a fixed search_path'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.transition_vessel_project_lifecycle(uuid, public.vessel_project_lifecycle_status, text, uuid)'::regprocedure),
  'transition_vessel_project_lifecycle is SECURITY DEFINER'
);
select ok(
  not has_function_privilege('anon', 'public.transition_vessel_project_lifecycle(uuid, public.vessel_project_lifecycle_status, text, uuid)', 'EXECUTE'),
  'anon cannot execute transition_vessel_project_lifecycle'
);
select ok(
  has_function_privilege('authenticated', 'public.transition_vessel_project_lifecycle(uuid, public.vessel_project_lifecycle_status, text, uuid)', 'EXECUTE'),
  'authenticated can execute transition_vessel_project_lifecycle (internal role check gates it, not the grant)'
);

select ok(
  not has_table_privilege('authenticated', 'public.vessel_projects', 'UPDATE'),
  'authenticated has no UPDATE grant on vessel_projects at all — the RPC is the only mutation path'
);
select ok(
  not has_table_privilege('authenticated', 'public.vessel_projects', 'DELETE'),
  'authenticated has no DELETE grant on vessel_projects — hard delete is structurally impossible'
);
select ok(
  not has_table_privilege('authenticated', 'public.vessel_project_lifecycle_events', 'INSERT'),
  'authenticated has no INSERT grant on vessel_project_lifecycle_events — the trigger/RPC is the only write path'
);

-- =============================================================================
-- TENANT-SAFE COMPOSITE RELATIONSHIPS
-- =============================================================================
-- Enforced by the DB constraint itself — role-independent, proven here while
-- still connected as the unrestricted fixture-setup role.

select throws_ok(
  $$ insert into public.vessel_projects (tenant_id, vessel_id, client_id, service_type_id, facility_location_id, start_date, created_by)
     values ('77777777-7777-7777-7777-777777777777', 'f0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000f1', '2026-01-01', '00000000-eeee-1111-0000-000000000001') $$,
  '23503',
  null,
  'vessel_projects cannot point at a vessel from a different tenant'
);
select throws_ok(
  $$ insert into public.vessel_projects (tenant_id, vessel_id, client_id, service_type_id, facility_location_id, start_date, created_by)
     values ('77777777-7777-7777-7777-777777777777', 'e0000000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000f1', '2026-01-01', '00000000-eeee-1111-0000-000000000001') $$,
  '23503',
  null,
  'vessel_projects cannot point at a client from a different tenant'
);
select throws_ok(
  $$ insert into public.vessel_projects (tenant_id, vessel_id, client_id, service_type_id, facility_location_id, start_date, created_by)
     values ('77777777-7777-7777-7777-777777777777', 'e0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000c1', 'f0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000f1', '2026-01-01', '00000000-eeee-1111-0000-000000000001') $$,
  '23503',
  null,
  'vessel_projects cannot point at a service_type from a different tenant'
);
select throws_ok(
  $$ insert into public.vessel_projects (tenant_id, vessel_id, client_id, service_type_id, facility_location_id, start_date, created_by)
     values ('77777777-7777-7777-7777-777777777777', 'e0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'f0000000-0000-0000-0000-0000000000f1', '2026-01-01', '00000000-eeee-1111-0000-000000000001') $$,
  '23503',
  null,
  'vessel_projects cannot point at a facility_location from a different tenant'
);

-- =============================================================================
-- CREATE — owner/admin only, tenant_id/created_by/lifecycle columns not forgeable
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ insert into public.vessel_projects (tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by)
     values ('77777777-7777-7777-7777-777777777777', 'e0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000f1', 'PRJ-E-01', '2026-01-15', '00000000-eeee-1111-0000-000000000001') $$,
  'owner E can create a vessel project'
);

select results_eq(
  $$ select lifecycle_status::text, ready_to_close_at, closed_at, closed_by from public.vessel_projects where project_code = 'PRJ-E-01' $$,
  $$ values ('active'::text, null::timestamptz, null::timestamptz, null::uuid) $$,
  'a newly created project starts active with no lifecycle timestamps set'
);

select is(
  (select count(*)::int from public.vessel_project_lifecycle_events
     where project_id = (select id from public.vessel_projects where project_code = 'PRJ-E-01')),
  1,
  'creation produced exactly one lifecycle event'
);
select results_eq(
  $$ select from_status, to_status::text, actor_user_id, reason
       from public.vessel_project_lifecycle_events
       where project_id = (select id from public.vessel_projects where project_code = 'PRJ-E-01') $$,
  $$ values (null::public.vessel_project_lifecycle_status, 'active'::text, '00000000-eeee-1111-0000-000000000001'::uuid, null::text) $$,
  'the creation event is null -> active, attributed to the creating owner, with no reason'
);

select lives_ok(
  $$ insert into public.vessel_projects (tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by)
     values ('77777777-7777-7777-7777-777777777777', 'e0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000f1', 'PRJ-E-03', '2026-01-15', '00000000-eeee-1111-0000-000000000001') $$,
  'setup: a second project for the transition-guard scenarios below'
);
select lives_ok(
  $$ insert into public.vessel_projects (tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by)
     values ('77777777-7777-7777-7777-777777777777', 'e0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000f1', 'PRJ-E-04', '2026-01-15', '00000000-eeee-1111-0000-000000000001') $$,
  'setup: a third project for the unauthorized-transition scenarios below'
);

-- Forged tenant_id: owner E has no owner/admin role in tenant F.
select throws_ok(
  $$ insert into public.vessel_projects (tenant_id, vessel_id, client_id, service_type_id, facility_location_id, start_date, created_by)
     values ('88888888-8888-8888-8888-888888888888', 'e0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000f1', '2026-01-01', '00000000-eeee-1111-0000-000000000001') $$,
  '42501',
  null,
  'owner E cannot forge tenant_id to a tenant they do not own/admin'
);
-- Forged created_by: owner E attributes the row to admin E instead.
select throws_ok(
  $$ insert into public.vessel_projects (tenant_id, vessel_id, client_id, service_type_id, facility_location_id, start_date, created_by)
     values ('77777777-7777-7777-7777-777777777777', 'e0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000f1', '2026-01-01', '00000000-eeee-1111-0000-000000000002') $$,
  '42501',
  null,
  'owner E cannot forge created_by to a different user'
);
-- lifecycle_status/ready_to_close_at/closed_at/closed_by are not in the
-- INSERT grant column list at all — structurally impossible to set at
-- creation time, not merely rejected by application-level validation.
select throws_ok(
  $$ insert into public.vessel_projects (tenant_id, vessel_id, client_id, service_type_id, facility_location_id, start_date, created_by, lifecycle_status)
     values ('77777777-7777-7777-7777-777777777777', 'e0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000f1', '2026-01-01', '00000000-eeee-1111-0000-000000000001', 'closed') $$,
  '42501',
  null,
  'owner E cannot set lifecycle_status at creation — column not in the INSERT grant'
);
select throws_ok(
  $$ insert into public.vessel_projects (tenant_id, vessel_id, client_id, service_type_id, facility_location_id, start_date, created_by, closed_by)
     values ('77777777-7777-7777-7777-777777777777', 'e0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000f1', '2026-01-01', '00000000-eeee-1111-0000-000000000001', '00000000-eeee-1111-0000-000000000001') $$,
  '42501',
  null,
  'owner E cannot forge closed_by at creation — column not in the INSERT grant'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- admin E has the same create rights as owner E.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-1111-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ insert into public.vessel_projects (tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by)
     values ('77777777-7777-7777-7777-777777777777', 'e0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000f1', 'PRJ-E-02', '2026-01-15', '00000000-eeee-1111-0000-000000000002') $$,
  'admin E can create a vessel project, same rights as owner'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- reviewer/viewer cannot create.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-1111-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ insert into public.vessel_projects (tenant_id, vessel_id, client_id, service_type_id, facility_location_id, start_date, created_by)
     values ('77777777-7777-7777-7777-777777777777', 'e0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000f1', '2026-01-01', '00000000-eeee-1111-0000-000000000003') $$,
  '42501',
  null,
  'reviewer E cannot create a vessel project'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-1111-0000-000000000004', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ insert into public.vessel_projects (tenant_id, vessel_id, client_id, service_type_id, facility_location_id, start_date, created_by)
     values ('77777777-7777-7777-7777-777777777777', 'e0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000f1', '2026-01-01', '00000000-eeee-1111-0000-000000000004') $$,
  '42501',
  null,
  'viewer E cannot create a vessel project'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- VALID TRANSITIONS — active -> ready_to_close -> closed, one event each
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ select public.transition_vessel_project_lifecycle(
       (select id from public.vessel_projects where project_code = 'PRJ-E-01'), 'ready_to_close', 'siap tutup proyek'
     ) $$,
  'owner E can transition PRJ-E-01 from active to ready_to_close'
);
select results_eq(
  $$ select lifecycle_status::text, ready_to_close_at is not null, closed_at is null
       from public.vessel_projects where project_code = 'PRJ-E-01' $$,
  $$ values ('ready_to_close'::text, true, true) $$,
  'PRJ-E-01 is now ready_to_close with ready_to_close_at set server-side'
);
select is(
  (select count(*)::int from public.vessel_project_lifecycle_events
     where project_id = (select id from public.vessel_projects where project_code = 'PRJ-E-01')),
  2,
  'exactly one new event after the ready_to_close transition (creation + this one)'
);
select results_eq(
  $$ select from_status::text, to_status::text, actor_user_id, reason
       from public.vessel_project_lifecycle_events
       where project_id = (select id from public.vessel_projects where project_code = 'PRJ-E-01') and to_status = 'ready_to_close' $$,
  $$ values ('active'::text, 'ready_to_close'::text, '00000000-eeee-1111-0000-000000000001'::uuid, 'siap tutup proyek'::text) $$,
  'the ready_to_close event carries from/to/actor/reason correctly'
);

select lives_ok(
  $$ select public.transition_vessel_project_lifecycle(
       (select id from public.vessel_projects where project_code = 'PRJ-E-01'), 'closed', null
     ) $$,
  'owner E can transition PRJ-E-01 from ready_to_close to closed'
);
select results_eq(
  $$ select lifecycle_status::text, closed_at is not null, closed_by
       from public.vessel_projects where project_code = 'PRJ-E-01' $$,
  $$ values ('closed'::text, true, '00000000-eeee-1111-0000-000000000001'::uuid) $$,
  'PRJ-E-01 is now closed with closed_at/closed_by set server-side from the caller session, not client input'
);
select is(
  (select count(*)::int from public.vessel_project_lifecycle_events
     where project_id = (select id from public.vessel_projects where project_code = 'PRJ-E-01')),
  3,
  'exactly three events total: create, ready_to_close, closed — one per transition'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- INVALID TRANSITIONS — skip / same-status / reverse / reopen all rejected
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

-- skip: active -> closed directly
select throws_ok(
  $$ select public.transition_vessel_project_lifecycle(
       (select id from public.vessel_projects where project_code = 'PRJ-E-03'), 'closed', null
     ) $$,
  'invalid vessel project lifecycle transition from active to closed',
  'skipping ready_to_close (active -> closed) is rejected'
);
-- same-status no-op
select throws_ok(
  $$ select public.transition_vessel_project_lifecycle(
       (select id from public.vessel_projects where project_code = 'PRJ-E-03'), 'active', null
     ) $$,
  'vessel project lifecycle status unchanged: already active',
  'transitioning to the same status is rejected, not silently accepted'
);

select lives_ok(
  $$ select public.transition_vessel_project_lifecycle(
       (select id from public.vessel_projects where project_code = 'PRJ-E-03'), 'ready_to_close', null
     ) $$,
  'PRJ-E-03 can still make the one valid forward transition after the rejections above'
);

-- reverse: ready_to_close -> active
select throws_ok(
  $$ select public.transition_vessel_project_lifecycle(
       (select id from public.vessel_projects where project_code = 'PRJ-E-03'), 'active', null
     ) $$,
  'invalid vessel project lifecycle transition from ready_to_close to active',
  'reversing ready_to_close -> active is rejected'
);

select lives_ok(
  $$ select public.transition_vessel_project_lifecycle(
       (select id from public.vessel_projects where project_code = 'PRJ-E-03'), 'closed', null
     ) $$,
  'PRJ-E-03 completes its lifecycle: ready_to_close -> closed'
);

-- reopen: closed -> ready_to_close / closed -> active
select throws_ok(
  $$ select public.transition_vessel_project_lifecycle(
       (select id from public.vessel_projects where project_code = 'PRJ-E-03'), 'ready_to_close', null
     ) $$,
  'invalid vessel project lifecycle transition from closed to ready_to_close',
  'reopening closed -> ready_to_close is rejected — no reopen at Gate 1B'
);
select throws_ok(
  $$ select public.transition_vessel_project_lifecycle(
       (select id from public.vessel_projects where project_code = 'PRJ-E-03'), 'active', null
     ) $$,
  'invalid vessel project lifecycle transition from closed to active',
  'reopening closed -> active is rejected — no reopen at Gate 1B'
);

select is(
  (select count(*)::int from public.vessel_project_lifecycle_events
     where project_id = (select id from public.vessel_projects where project_code = 'PRJ-E-03')),
  3,
  'PRJ-E-03 has exactly three events (create + two valid transitions) — every rejected attempt left zero trace'
);

-- not found
select throws_ok(
  $$ select public.transition_vessel_project_lifecycle('00000000-0000-0000-0000-000000000000', 'ready_to_close', null) $$,
  'vessel project not found',
  'transitioning a non-existent project id is rejected'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- Captured while still unrestricted (RLS-bypassing) so the cross-tenant
-- check below can address PRJ-E-04 by id — owner F's own session cannot see
-- this row via SELECT (RLS), so a live subquery under their role would
-- return null and mask "not authorized" behind a false "not found".
create temporary table pgtap_prj_e04 as
  select id from public.vessel_projects where project_code = 'PRJ-E-04';
grant select on pgtap_prj_e04 to authenticated;

-- =============================================================================
-- UNAUTHORIZED TRANSITIONS — role and cross-tenant
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-1111-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.transition_vessel_project_lifecycle(
       (select id from public.vessel_projects where project_code = 'PRJ-E-04'), 'ready_to_close', null
     ) $$,
  'not authorized to transition vessel project lifecycle',
  'reviewer E cannot transition a lifecycle — read-only role'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-1111-0000-000000000004', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.transition_vessel_project_lifecycle(
       (select id from public.vessel_projects where project_code = 'PRJ-E-04'), 'ready_to_close', null
     ) $$,
  'not authorized to transition vessel project lifecycle',
  'viewer E cannot transition a lifecycle — read-only role'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Cross-tenant: owner F is owner of tenant F, not a member of tenant E at
-- all, so the same "not authorized" path rejects them for tenant E's project
-- (the SECURITY DEFINER lookup finds the row internally, but the tenant/role
-- check still fails for a non-member). Uses the id captured in
-- pgtap_prj_e04 above — under owner F's own session, RLS would already hide
-- the row from a live subquery before the RPC is even called.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.transition_vessel_project_lifecycle(
       (select id from pgtap_prj_e04), 'ready_to_close', null
     ) $$,
  'not authorized to transition vessel project lifecycle',
  'owner F (a different tenant) cannot transition tenant E''s project'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select lifecycle_status::text from public.vessel_projects where project_code = 'PRJ-E-04'),
  'active',
  'PRJ-E-04 is still active — every unauthorized attempt left it untouched'
);
select is(
  (select count(*)::int from public.vessel_project_lifecycle_events
     where project_id = (select id from public.vessel_projects where project_code = 'PRJ-E-04')),
  1,
  'PRJ-E-04 still has only its creation event — no phantom events from rejected attempts'
);

-- =============================================================================
-- CROSS-TENANT READ ISOLATION
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is_empty(
  $$ select id from public.vessel_projects where tenant_id = '77777777-7777-7777-7777-777777777777' $$,
  'owner F cannot list tenant E''s vessel projects'
);
select is_empty(
  $$ select id from public.vessel_project_lifecycle_events where tenant_id = '77777777-7777-7777-7777-777777777777' $$,
  'owner F cannot read tenant E''s lifecycle events'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select ok(
  (select count(*)::int from public.vessel_projects where tenant_id = '77777777-7777-7777-7777-777777777777') >= 4,
  'owner E can list tenant E''s own vessel projects'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Lifecycle events are owner/admin/reviewer only — viewer sees none, even
-- for their own tenant (mirrors master_data_audit_events visibility).
select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-1111-0000-000000000004', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is_empty(
  $$ select id from public.vessel_project_lifecycle_events where tenant_id = '77777777-7777-7777-7777-777777777777' $$,
  'viewer E cannot read vessel_project_lifecycle_events even for their own tenant'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-1111-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select ok(
  (select count(*)::int from public.vessel_project_lifecycle_events where tenant_id = '77777777-7777-7777-7777-777777777777') > 0,
  'reviewer E CAN read vessel_project_lifecycle_events for their own tenant'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- HARD DELETE — structurally impossible from the app
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ delete from public.vessel_projects where tenant_id = '77777777-7777-7777-7777-777777777777' $$,
  '42501',
  null,
  'owner E cannot hard-delete a vessel project'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- APPEND-ONLY — lifecycle events cannot be mutated, role-independent
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ update public.vessel_project_lifecycle_events set reason = 'tampered' where tenant_id = '77777777-7777-7777-7777-777777777777' $$,
  '42501',
  null,
  'authenticated has no UPDATE grant on vessel_project_lifecycle_events at all'
);
select throws_ok(
  $$ delete from public.vessel_project_lifecycle_events where tenant_id = '77777777-7777-7777-7777-777777777777' $$,
  '42501',
  null,
  'authenticated has no DELETE grant on vessel_project_lifecycle_events at all'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Role-independent: even the unrestricted fixture-setup role cannot mutate,
-- proving the append-only guarantee is a real trigger, not just a grant.
reset role;
select throws_ok(
  $$ update public.vessel_project_lifecycle_events set reason = 'tampered'
       where project_id = (select id from public.vessel_projects where project_code = 'PRJ-E-01') $$,
  'access_audit_events is append-only: UPDATE not allowed',
  'UPDATE on vessel_project_lifecycle_events is blocked at the database level, regardless of role'
);
select throws_ok(
  $$ delete from public.vessel_project_lifecycle_events
       where project_id = (select id from public.vessel_projects where project_code = 'PRJ-E-01') $$,
  'access_audit_events is append-only: DELETE not allowed',
  'DELETE on vessel_project_lifecycle_events is blocked at the database level, regardless of role'
);

select * from finish();

rollback;
