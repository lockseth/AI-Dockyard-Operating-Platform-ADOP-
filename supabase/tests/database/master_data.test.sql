-- ADOP Phase 1 Gate 1A — pgTAP proof for trusted master data: schema,
-- tenant-safe composite relationships, RLS/role matrix, immutability guards,
-- unique-code rules, hard-delete rejection, and master-data audit.
--
-- Self-contained: creates its own fixtures (distinct tenant/user ids from
-- both supabase/seed.sql and tenant_isolation.test.sql) and rolls back at
-- the end. The service-type-seed-isolation section below is the one place
-- this file reads supabase/seed.sql's real tenant A/B rows directly.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('33333333-3333-3333-3333-333333333333', 'pgtap-master-tenant-a', 'PgTAP Master Tenant A', 'active'),
  ('44444444-4444-4444-4444-444444444444', 'pgtap-master-tenant-b', 'PgTAP Master Tenant B', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-aaaa-1111-0000-000000000001', 'authenticated', 'authenticated', 'owner-a@pgtap-md.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-aaaa-1111-0000-000000000002', 'authenticated', 'authenticated', 'admin-a@pgtap-md.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-aaaa-1111-0000-000000000003', 'authenticated', 'authenticated', 'reviewer-a@pgtap-md.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-aaaa-1111-0000-000000000004', 'authenticated', 'authenticated', 'viewer-a@pgtap-md.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-bbbb-1111-0000-000000000001', 'authenticated', 'authenticated', 'owner-b@pgtap-md.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('a0000000-1111-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', '00000000-aaaa-1111-0000-000000000001', 'active'),
  ('a0000000-1111-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', '00000000-aaaa-1111-0000-000000000002', 'active'),
  ('a0000000-1111-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', '00000000-aaaa-1111-0000-000000000003', 'active'),
  ('a0000000-1111-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', '00000000-aaaa-1111-0000-000000000004', 'active'),
  ('b0000000-1111-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', '00000000-bbbb-1111-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('a0000000-1111-0000-0000-000000000001', 'owner'),
  ('a0000000-1111-0000-0000-000000000002', 'admin'),
  ('a0000000-1111-0000-0000-000000000003', 'reviewer'),
  ('a0000000-1111-0000-0000-000000000004', 'viewer'),
  ('b0000000-1111-0000-0000-000000000001', 'owner');

-- Anchor rows, inserted as the migration/table-owner role (bypasses RLS and
-- column grants — only fixture setup ever does this, never application code).
insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('30000000-0000-0000-0000-0000000000c1', '33333333-3333-3333-3333-333333333333', 'CL-A-ANCHOR', 'Anchor Client A', '00000000-aaaa-1111-0000-000000000001'),
  ('40000000-0000-0000-0000-0000000000c1', '44444444-4444-4444-4444-444444444444', 'CL-B-ANCHOR', 'Anchor Client B', '00000000-bbbb-1111-0000-000000000001');

insert into public.expense_categories (id, tenant_id, code, name) values
  ('30000000-0000-0000-0000-0000000000c7', '33333333-3333-3333-3333-333333333333', 'MATERIAL', 'Material'),
  ('40000000-0000-0000-0000-0000000000c7', '44444444-4444-4444-4444-444444444444', 'MATERIAL', 'Material');

-- =============================================================================
-- SCHEMA
-- =============================================================================

select has_table('public', 'clients', 'public.clients exists');
select has_table('public', 'client_contacts', 'public.client_contacts exists');
select has_table('public', 'vessels', 'public.vessels exists');
select has_table('public', 'vendors', 'public.vendors exists');
select has_table('public', 'service_types', 'public.service_types exists');
select has_table('public', 'facility_locations', 'public.facility_locations exists');
select has_table('public', 'expense_categories', 'public.expense_categories exists');
select has_table('public', 'master_data_audit_events', 'public.master_data_audit_events exists');

select has_type('public', 'record_status', 'record_status enum exists');
select ok(
  (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.record_status'::regtype)
    = array['active', 'inactive'],
  'record_status has exactly active/inactive'
);

select col_is_pk('public', 'clients', 'id', 'clients PK is id');
select col_is_pk('public', 'client_contacts', 'id', 'client_contacts PK is id');
select col_is_pk('public', 'vessels', 'id', 'vessels PK is id');
select col_is_pk('public', 'vendors', 'id', 'vendors PK is id');
select col_is_pk('public', 'service_types', 'id', 'service_types PK is id');
select col_is_pk('public', 'facility_locations', 'id', 'facility_locations PK is id');
select col_is_pk('public', 'expense_categories', 'id', 'expense_categories PK is id');
select col_is_pk('public', 'master_data_audit_events', 'id', 'master_data_audit_events PK is id');

select col_is_unique('public', 'clients', array['id', 'tenant_id'], 'clients (id, tenant_id) is unique — composite FK target');
select col_is_unique('public', 'expense_categories', array['id', 'tenant_id'], 'expense_categories (id, tenant_id) is unique — composite self-FK target');
select col_is_unique('public', 'service_types', array['tenant_id', 'code'], 'service_types (tenant_id, code) is unique');
select col_is_unique('public', 'expense_categories', array['tenant_id', 'code'], 'expense_categories (tenant_id, code) is unique');

select has_fk('public', 'client_contacts', 'client_contacts has a foreign key');
select has_fk('public', 'vessels', 'vessels has a foreign key');
select has_fk('public', 'expense_categories', 'expense_categories has a foreign key');

select has_index('public', 'clients', 'clients_tenant_id_idx', 'clients has tenant_id index');
select has_index('public', 'clients', 'clients_tenant_id_client_code_uidx', 'clients has partial unique client_code index');
select has_index('public', 'client_contacts', 'client_contacts_client_id_idx', 'client_contacts has (tenant_id, client_id) index');
select has_index('public', 'vessels', 'vessels_client_id_idx', 'vessels has (tenant_id, client_id) index');
select has_index('public', 'vessels', 'vessels_tenant_id_vessel_code_uidx', 'vessels has partial unique vessel_code index');
select has_index('public', 'vendors', 'vendors_tenant_id_vendor_code_uidx', 'vendors has partial unique vendor_code index');
select has_index('public', 'facility_locations', 'facility_locations_tenant_id_code_uidx', 'facility_locations has partial unique code index');
select has_index('public', 'expense_categories', 'expense_categories_parent_id_idx', 'expense_categories has (tenant_id, parent_id) index');
select has_index('public', 'master_data_audit_events', 'master_data_audit_events_tenant_id_idx', 'master_data_audit_events has tenant_id index');
select has_index('public', 'master_data_audit_events', 'master_data_audit_events_entity_idx', 'master_data_audit_events has entity index');

select ok((select relrowsecurity from pg_class where oid = 'public.clients'::regclass), 'RLS enabled on clients');
select ok((select relrowsecurity from pg_class where oid = 'public.client_contacts'::regclass), 'RLS enabled on client_contacts');
select ok((select relrowsecurity from pg_class where oid = 'public.vessels'::regclass), 'RLS enabled on vessels');
select ok((select relrowsecurity from pg_class where oid = 'public.vendors'::regclass), 'RLS enabled on vendors');
select ok((select relrowsecurity from pg_class where oid = 'public.service_types'::regclass), 'RLS enabled on service_types');
select ok((select relrowsecurity from pg_class where oid = 'public.facility_locations'::regclass), 'RLS enabled on facility_locations');
select ok((select relrowsecurity from pg_class where oid = 'public.expense_categories'::regclass), 'RLS enabled on expense_categories');
select ok((select relrowsecurity from pg_class where oid = 'public.master_data_audit_events'::regclass), 'RLS enabled on master_data_audit_events');

-- Lives in `public` (not `private`) so PostgREST can expose it as an RPC —
-- api.schemas only lists public/graphql_public. It is still locked down:
-- SECURITY DEFINER re-checks owner/admin membership internally, and EXECUTE
-- is revoked from public/anon below, same posture as the private.* helpers.
select is(
  (select n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.oid = 'public.log_master_data_audit_event(uuid, text, uuid, text, jsonb, jsonb)'::regprocedure),
  'public',
  'log_master_data_audit_event lives in public — required for it to be RPC-callable'
);
select ok(
  exists (
    select 1 from pg_proc, unnest(proconfig) as cfg
    where oid = 'public.log_master_data_audit_event(uuid, text, uuid, text, jsonb, jsonb)'::regprocedure
      and cfg = 'search_path=public, pg_temp'
  ),
  'log_master_data_audit_event has fixed search_path'
);
select ok(
  not has_function_privilege('anon', 'public.log_master_data_audit_event(uuid, text, uuid, text, jsonb, jsonb)', 'EXECUTE'),
  'anon cannot execute log_master_data_audit_event'
);

-- =============================================================================
-- TENANT-SAFE COMPOSITE RELATIONSHIPS
-- =============================================================================
-- Enforced by the DB constraint itself — role-independent, so proven here
-- while still connected as the unrestricted fixture-setup role.

select throws_ok(
  $$ insert into public.client_contacts (tenant_id, client_id, full_name)
     values ('44444444-4444-4444-4444-444444444444', '30000000-0000-0000-0000-0000000000c1', 'Cross Tenant PIC') $$,
  '23503',
  null,
  'client_contacts cannot point at a client from a different tenant'
);

select throws_ok(
  $$ insert into public.vessels (tenant_id, client_id, vessel_name)
     values ('44444444-4444-4444-4444-444444444444', '30000000-0000-0000-0000-0000000000c1', 'Cross Tenant Vessel') $$,
  '23503',
  null,
  'vessels cannot point at a client from a different tenant'
);

select throws_ok(
  $$ insert into public.expense_categories (tenant_id, parent_id, code, name)
     values ('44444444-4444-4444-4444-444444444444', '30000000-0000-0000-0000-0000000000c7', 'CROSS', 'Cross Tenant Category') $$,
  '23503',
  null,
  'expense_categories cannot point at a parent from a different tenant'
);

-- Same-tenant composite references succeed (proves the constraint isn't
-- simply rejecting everything).
select lives_ok(
  $$ insert into public.client_contacts (tenant_id, client_id, full_name)
     values ('33333333-3333-3333-3333-333333333333', '30000000-0000-0000-0000-0000000000c1', 'Same Tenant PIC Fixture') $$,
  'client_contacts CAN point at a client in the same tenant'
);
select lives_ok(
  $$ insert into public.vessels (tenant_id, client_id, vessel_name)
     values ('33333333-3333-3333-3333-333333333333', '30000000-0000-0000-0000-0000000000c1', 'Same Tenant Vessel Fixture') $$,
  'vessels CAN point at a client in the same tenant'
);
select lives_ok(
  $$ insert into public.expense_categories (tenant_id, parent_id, code, name)
     values ('33333333-3333-3333-3333-333333333333', '30000000-0000-0000-0000-0000000000c7', 'MATERIAL-STEEL', 'Steel') $$,
  'expense_categories CAN point at a parent in the same tenant'
);

-- =============================================================================
-- UNIQUE CODE CONSTRAINTS
-- =============================================================================

select throws_ok(
  $$ insert into public.clients (tenant_id, client_code, display_name) values ('33333333-3333-3333-3333-333333333333', 'CL-A-ANCHOR', 'Duplicate Code Client') $$,
  '23505',
  null,
  'duplicate client_code within the same tenant is rejected'
);
select lives_ok(
  $$ insert into public.clients (tenant_id, client_code, display_name) values ('44444444-4444-4444-4444-444444444444', 'CL-A-ANCHOR', 'Same Code Different Tenant') $$,
  'the same client_code in a different tenant is allowed'
);

select throws_ok(
  $$ insert into public.expense_categories (tenant_id, code, name) values ('33333333-3333-3333-3333-333333333333', 'MATERIAL', 'Duplicate Category') $$,
  '23505',
  null,
  'duplicate expense_categories code within the same tenant is rejected'
);
select lives_ok(
  $$ insert into public.expense_categories (tenant_id, code, name) values ('44444444-4444-4444-4444-444444444444', 'MATERIAL-DUP-OK', 'Different Code') $$,
  'a distinct expense_categories code in the same tenant is allowed'
);

select lives_ok(
  $$ insert into public.vendors (tenant_id, vendor_code, display_name) values ('33333333-3333-3333-3333-333333333333', 'VN-01', 'Vendor One') $$,
  'first vendor_code insert succeeds'
);
select throws_ok(
  $$ insert into public.vendors (tenant_id, vendor_code, display_name) values ('33333333-3333-3333-3333-333333333333', 'VN-01', 'Vendor Duplicate') $$,
  '23505',
  null,
  'duplicate vendor_code within the same tenant is rejected'
);
select lives_ok(
  $$ insert into public.vendors (tenant_id, vendor_code, display_name) values ('44444444-4444-4444-4444-444444444444', 'VN-01', 'Vendor One Tenant B') $$,
  'the same vendor_code in a different tenant is allowed'
);

select lives_ok(
  $$ insert into public.service_types (tenant_id, code, name) values ('33333333-3333-3333-3333-333333333333', 'special', 'Special') $$,
  'first service_types code insert succeeds'
);
select throws_ok(
  $$ insert into public.service_types (tenant_id, code, name) values ('33333333-3333-3333-3333-333333333333', 'special', 'Special Duplicate') $$,
  '23505',
  null,
  'duplicate service_types code within the same tenant is rejected'
);

select lives_ok(
  $$ insert into public.facility_locations (tenant_id, code, name) values ('33333333-3333-3333-3333-333333333333', 'FL-01', 'Gate 1') $$,
  'first facility_locations code insert succeeds'
);
select throws_ok(
  $$ insert into public.facility_locations (tenant_id, code, name) values ('33333333-3333-3333-3333-333333333333', 'FL-01', 'Gate 1 Duplicate') $$,
  '23505',
  null,
  'duplicate facility_locations code within the same tenant is rejected'
);

-- =============================================================================
-- OWNER/ADMIN CRUD — clients (representative table with created_by)
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ insert into public.clients (tenant_id, client_code, display_name, created_by)
     values ('33333333-3333-3333-3333-333333333333', 'CL-A-NEW', 'New Client By Owner', '00000000-aaaa-1111-0000-000000000001') $$,
  'owner A can create a client in their own tenant'
);

select results_eq(
  $$ select display_name from public.clients where tenant_id = '33333333-3333-3333-3333-333333333333' and client_code = 'CL-A-NEW' $$,
  $$ values ('New Client By Owner'::text) $$,
  'owner A can read the client they just created'
);

update public.clients set display_name = 'Renamed By Owner' where tenant_id = '33333333-3333-3333-3333-333333333333' and client_code = 'CL-A-NEW';
select results_eq(
  $$ select display_name from public.clients where tenant_id = '33333333-3333-3333-3333-333333333333' and client_code = 'CL-A-NEW' $$,
  $$ values ('Renamed By Owner'::text) $$,
  'owner A can update a client in their own tenant'
);

update public.clients set status = 'inactive' where tenant_id = '33333333-3333-3333-3333-333333333333' and client_code = 'CL-A-NEW';
select results_eq(
  $$ select status::text from public.clients where tenant_id = '33333333-3333-3333-3333-333333333333' and client_code = 'CL-A-NEW' $$,
  $$ values ('inactive'::text) $$,
  'owner A can deactivate a client in their own tenant'
);
select is(
  (select count(*)::int from public.clients where tenant_id = '33333333-3333-3333-3333-333333333333' and client_code = 'CL-A-NEW'),
  1,
  'deactivating a client preserves the record — no delete occurred'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- admin A has the same CRUD rights as owner A.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ insert into public.clients (tenant_id, client_code, display_name, created_by)
     values ('33333333-3333-3333-3333-333333333333', 'CL-A-ADMIN', 'New Client By Admin', '00000000-aaaa-1111-0000-000000000002') $$,
  'admin A can create a client in their own tenant'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- REVIEWER/VIEWER READ-ONLY — clients
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select isnt_empty(
  $$ select id from public.clients where tenant_id = '33333333-3333-3333-3333-333333333333' $$,
  'reviewer A can read clients in their own tenant'
);
select throws_ok(
  $$ insert into public.clients (tenant_id, display_name, created_by)
     values ('33333333-3333-3333-3333-333333333333', 'Reviewer Attempt', '00000000-aaaa-1111-0000-000000000003') $$,
  '42501',
  null,
  'reviewer A cannot create a client'
);

update public.clients set display_name = 'hacked-by-reviewer' where tenant_id = '33333333-3333-3333-3333-333333333333' and client_code = 'CL-A-ANCHOR';
select isnt(
  (select display_name from public.clients where client_code = 'CL-A-ANCHOR' and tenant_id = '33333333-3333-3333-3333-333333333333'),
  'hacked-by-reviewer',
  'reviewer A cannot update a client'
);

reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000004', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select isnt_empty(
  $$ select id from public.clients where tenant_id = '33333333-3333-3333-3333-333333333333' $$,
  'viewer A can read clients in their own tenant'
);
select throws_ok(
  $$ insert into public.clients (tenant_id, display_name, created_by)
     values ('33333333-3333-3333-3333-333333333333', 'Viewer Attempt', '00000000-aaaa-1111-0000-000000000004') $$,
  '42501',
  null,
  'viewer A cannot create a client'
);
select throws_ok(
  $$ delete from public.clients where tenant_id = '33333333-3333-3333-3333-333333333333' and client_code = 'CL-A-ANCHOR' $$,
  '42501',
  null,
  'viewer A cannot delete a client'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- OWNER CRUD + REVIEWER READ-ONLY — vessels (composite FK child table)
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ insert into public.vessels (tenant_id, client_id, vessel_code, vessel_name, created_by)
     values ('33333333-3333-3333-3333-333333333333', '30000000-0000-0000-0000-0000000000c1', 'VS-01', 'KM Owner Created', '00000000-aaaa-1111-0000-000000000001') $$,
  'owner A can create a vessel under their own tenant client'
);

update public.vessels set vessel_name = 'KM Renamed' where tenant_id = '33333333-3333-3333-3333-333333333333' and vessel_code = 'VS-01';
select results_eq(
  $$ select vessel_name from public.vessels where tenant_id = '33333333-3333-3333-3333-333333333333' and vessel_code = 'VS-01' $$,
  $$ values ('KM Renamed'::text) $$,
  'owner A can update a vessel in their own tenant'
);

-- Structural guard: client_id is not in the UPDATE grant, so re-parenting a
-- vessel is impossible even for the owner.
select throws_ok(
  format(
    $$ update public.vessels set client_id = %L where tenant_id = '33333333-3333-3333-3333-333333333333' and vessel_code = 'VS-01' $$,
    '40000000-0000-0000-0000-0000000000c1'
  ),
  '42501',
  null,
  'owner A cannot repoint vessel.client_id — column not in the UPDATE grant'
);

reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select isnt_empty(
  $$ select id from public.vessels where tenant_id = '33333333-3333-3333-3333-333333333333' $$,
  'reviewer A can read vessels in their own tenant'
);
select throws_ok(
  $$ insert into public.vessels (tenant_id, client_id, vessel_name, created_by)
     values ('33333333-3333-3333-3333-333333333333', '30000000-0000-0000-0000-0000000000c1', 'Reviewer Vessel', '00000000-aaaa-1111-0000-000000000003') $$,
  '42501',
  null,
  'reviewer A cannot create a vessel'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- OWNER CRUD + REVIEWER READ-ONLY — expense_categories (no created_by column)
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ insert into public.expense_categories (tenant_id, code, name) values ('33333333-3333-3333-3333-333333333333', 'LABOR', 'Labor') $$,
  'owner A can create an expense category in their own tenant'
);
update public.expense_categories set name = 'Labor & Overtime' where tenant_id = '33333333-3333-3333-3333-333333333333' and code = 'LABOR';
select results_eq(
  $$ select name from public.expense_categories where tenant_id = '33333333-3333-3333-3333-333333333333' and code = 'LABOR' $$,
  $$ values ('Labor & Overtime'::text) $$,
  'owner A can update an expense category in their own tenant'
);

reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select isnt_empty(
  $$ select id from public.expense_categories where tenant_id = '33333333-3333-3333-3333-333333333333' $$,
  'reviewer A can read expense categories in their own tenant'
);
select throws_ok(
  $$ insert into public.expense_categories (tenant_id, code, name) values ('33333333-3333-3333-3333-333333333333', 'REVIEWER-CAT', 'Reviewer Category') $$,
  '42501',
  null,
  'reviewer A cannot create an expense category'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- SMOKE COVERAGE — client_contacts, vendors, service_types, facility_locations
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ insert into public.client_contacts (tenant_id, client_id, full_name, created_by)
     values ('33333333-3333-3333-3333-333333333333', '30000000-0000-0000-0000-0000000000c1', 'Budi PIC', '00000000-aaaa-1111-0000-000000000001') $$,
  'owner A can create a client contact (PIC) in their own tenant'
);
select lives_ok(
  $$ insert into public.vendors (tenant_id, display_name, created_by)
     values ('33333333-3333-3333-3333-333333333333', 'Owner Created Vendor', '00000000-aaaa-1111-0000-000000000001') $$,
  'owner A can create a vendor in their own tenant'
);
select lives_ok(
  $$ insert into public.service_types (tenant_id, code, name) values ('33333333-3333-3333-3333-333333333333', 'owner-created', 'Owner Created') $$,
  'owner A can create a service type in their own tenant'
);
select lives_ok(
  $$ insert into public.facility_locations (tenant_id, code, name) values ('33333333-3333-3333-3333-333333333333', 'FL-OWNER', 'Owner Created Facility') $$,
  'owner A can create a facility location in their own tenant'
);

reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000004', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select isnt_empty($$ select id from public.client_contacts where tenant_id = '33333333-3333-3333-3333-333333333333' $$, 'viewer A can read client_contacts');
select isnt_empty($$ select id from public.vendors where tenant_id = '33333333-3333-3333-3333-333333333333' $$, 'viewer A can read vendors');
select isnt_empty($$ select id from public.service_types where tenant_id = '33333333-3333-3333-3333-333333333333' $$, 'viewer A can read service_types');
select isnt_empty($$ select id from public.facility_locations where tenant_id = '33333333-3333-3333-3333-333333333333' $$, 'viewer A can read facility_locations');

select throws_ok(
  $$ insert into public.vendors (tenant_id, display_name, created_by)
     values ('33333333-3333-3333-3333-333333333333', 'Viewer Vendor', '00000000-aaaa-1111-0000-000000000004') $$,
  '42501',
  null,
  'viewer A cannot create a vendor'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- HARD DELETE REJECTED (all tables — no DELETE grant for authenticated)
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok($$ delete from public.clients where tenant_id = '33333333-3333-3333-3333-333333333333' $$, '42501', null, 'owner A cannot hard-delete a client');
select throws_ok($$ delete from public.client_contacts where tenant_id = '33333333-3333-3333-3333-333333333333' $$, '42501', null, 'owner A cannot hard-delete a client_contact');
select throws_ok($$ delete from public.vessels where tenant_id = '33333333-3333-3333-3333-333333333333' $$, '42501', null, 'owner A cannot hard-delete a vessel');
select throws_ok($$ delete from public.vendors where tenant_id = '33333333-3333-3333-3333-333333333333' $$, '42501', null, 'owner A cannot hard-delete a vendor');
select throws_ok($$ delete from public.service_types where tenant_id = '33333333-3333-3333-3333-333333333333' $$, '42501', null, 'owner A cannot hard-delete a service_type');
select throws_ok($$ delete from public.facility_locations where tenant_id = '33333333-3333-3333-3333-333333333333' $$, '42501', null, 'owner A cannot hard-delete a facility_location');
select throws_ok($$ delete from public.expense_categories where tenant_id = '33333333-3333-3333-3333-333333333333' $$, '42501', null, 'owner A cannot hard-delete an expense_category');

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- FORGERY — tenant_id / created_by / immutable columns
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

-- tenant_id forgery: owner A has no owner/admin role in tenant B, so the
-- INSERT WITH CHECK on tenant_id rejects it even though the grant exists.
select throws_ok(
  $$ insert into public.clients (tenant_id, display_name, created_by)
     values ('44444444-4444-4444-4444-444444444444', 'Forged Tenant Client', '00000000-aaaa-1111-0000-000000000001') $$,
  '42501',
  null,
  'owner A cannot forge tenant_id to a tenant they do not own/admin'
);

-- created_by forgery: owner A tries to attribute the row to admin A instead.
select throws_ok(
  $$ insert into public.clients (tenant_id, display_name, created_by)
     values ('33333333-3333-3333-3333-333333333333', 'Forged Actor Client', '00000000-aaaa-1111-0000-000000000002') $$,
  '42501',
  null,
  'owner A cannot forge created_by to a different user'
);

-- Structural guard: tenant_id/created_by/created_at/id are not in the
-- UPDATE grant column list at all.
select throws_ok(
  $$ update public.clients set tenant_id = '44444444-4444-4444-4444-444444444444' where tenant_id = '33333333-3333-3333-3333-333333333333' and client_code = 'CL-A-ANCHOR' $$,
  '42501',
  null,
  'owner A cannot update clients.tenant_id — column not in the UPDATE grant'
);
select throws_ok(
  $$ update public.clients set created_by = '00000000-aaaa-1111-0000-000000000002' where tenant_id = '33333333-3333-3333-3333-333333333333' and client_code = 'CL-A-ANCHOR' $$,
  '42501',
  null,
  'owner A cannot update clients.created_by — column not in the UPDATE grant'
);
select throws_ok(
  $$ update public.clients set created_at = now() - interval '10 years' where tenant_id = '33333333-3333-3333-3333-333333333333' and client_code = 'CL-A-ANCHOR' $$,
  '42501',
  null,
  'owner A cannot update clients.created_at — column not in the UPDATE grant'
);
select throws_ok(
  format(
    $$ update public.clients set id = %L where tenant_id = '33333333-3333-3333-3333-333333333333' and client_code = 'CL-A-ANCHOR' $$,
    gen_random_uuid()
  ),
  '42501',
  null,
  'owner A cannot update clients.id — column not in the UPDATE grant'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- ANON — ZERO ACCESS
-- =============================================================================

set local role anon;

select throws_ok($$ select id from public.clients $$, '42501', null, 'anon has no SELECT grant on clients');
select throws_ok($$ select id from public.client_contacts $$, '42501', null, 'anon has no SELECT grant on client_contacts');
select throws_ok($$ select id from public.vessels $$, '42501', null, 'anon has no SELECT grant on vessels');
select throws_ok($$ select id from public.vendors $$, '42501', null, 'anon has no SELECT grant on vendors');
select throws_ok($$ select id from public.service_types $$, '42501', null, 'anon has no SELECT grant on service_types');
select throws_ok($$ select id from public.facility_locations $$, '42501', null, 'anon has no SELECT grant on facility_locations');
select throws_ok($$ select id from public.expense_categories $$, '42501', null, 'anon has no SELECT grant on expense_categories');
select throws_ok($$ select id from public.master_data_audit_events $$, '42501', null, 'anon has no SELECT grant on master_data_audit_events');

reset role;

-- =============================================================================
-- CROSS-TENANT ISOLATION — Tenant A owner vs Tenant B data
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select is_empty(
  $$ select id from public.clients where tenant_id = '44444444-4444-4444-4444-444444444444' $$,
  'owner A cannot see Tenant B clients'
);

update public.clients set display_name = 'hacked-by-owner-a' where tenant_id = '44444444-4444-4444-4444-444444444444' and client_code = 'CL-A-ANCHOR';
select isnt(
  (select display_name from public.clients where tenant_id = '44444444-4444-4444-4444-444444444444' and client_code = 'CL-A-ANCHOR'),
  'hacked-by-owner-a',
  'owner A cannot update Tenant B clients'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- SERVICE TYPE SEED ISOLATION (supabase/seed.sql real tenant A/B)
-- =============================================================================

select is(
  (select count(*)::int from public.service_types where tenant_id = 'a1111111-1111-1111-1111-111111111111'),
  4,
  'seeded tenant A has exactly 4 initial service types'
);
select is(
  (select count(*)::int from public.service_types where tenant_id = 'b2222222-2222-2222-2222-222222222222'),
  4,
  'seeded tenant B has exactly 4 initial service types'
);
select is(
  (select array_agg(code order by code) from public.service_types where tenant_id = 'a1111111-1111-1111-1111-111111111111'),
  array['docking', 'emergency', 'pltu', 'standard'],
  'seeded tenant A service types match the initial configuration'
);
select is(
  (select array_agg(code order by code) from public.service_types where tenant_id = 'b2222222-2222-2222-2222-222222222222'),
  array['docking', 'emergency', 'pltu', 'standard'],
  'seeded tenant B service types match the initial configuration — independent per tenant'
);

-- =============================================================================
-- MASTER DATA AUDIT
-- =============================================================================
-- Gate 1A.1 (supabase/migrations/20260719090000_master_data_audit_atomicity.sql)
-- replaced the manual two-step "mutate, then call the RPC" audit path with
-- an automatic AFTER ROW trigger — see
-- supabase/tests/database/master_data_audit_atomicity.test.sql for the full
-- trigger-coverage, rollback, and anti-spoofing proof. This section only
-- proves the manual RPC is now locked and the append-only/RLS posture on
-- the audit table itself is unchanged.

select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select public.log_master_data_audit_event(
       '33333333-3333-3333-3333-333333333333', 'client', '30000000-0000-0000-0000-0000000000c1',
       'create', null, '{"display_name": "Anchor Client A"}'::jsonb
     ) $$,
  '42501',
  null,
  'owner A can no longer call the manual audit RPC directly — locked in Gate 1A.1'
);

select throws_ok(
  $$ insert into public.master_data_audit_events (tenant_id, entity_type, entity_id, action)
     values ('33333333-3333-3333-3333-333333333333', 'client', '30000000-0000-0000-0000-0000000000c1', 'create') $$,
  '42501',
  null,
  'authenticated cannot INSERT into master_data_audit_events directly — trigger only'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- reviewer/viewer are equally locked out of the (now dead) manual RPC.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000004', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select public.log_master_data_audit_event(
       '33333333-3333-3333-3333-333333333333', 'client', '30000000-0000-0000-0000-0000000000c1',
       'update', null, null
     ) $$,
  '42501',
  null,
  'viewer A cannot call the manual audit RPC directly either'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- Append-only, role-independent — even service_role/postgres cannot mutate.
select throws_ok(
  $$ update public.master_data_audit_events set action = 'tampered' where tenant_id = '33333333-3333-3333-3333-333333333333' $$,
  'access_audit_events is append-only: UPDATE not allowed',
  'UPDATE on master_data_audit_events is blocked at the database level'
);
select throws_ok(
  $$ delete from public.master_data_audit_events where tenant_id = '33333333-3333-3333-3333-333333333333' $$,
  'access_audit_events is append-only: DELETE not allowed',
  'DELETE on master_data_audit_events is blocked at the database level'
);

-- Tenant-scoped read: owner A sees only Tenant A audit rows.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select is(
  (select count(*)::int from public.master_data_audit_events where tenant_id <> '33333333-3333-3333-3333-333333333333'),
  0,
  'owner A sees zero audit events from other tenants'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- Viewer cannot read master-data audit detail at all.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000004', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select is_empty(
  $$ select id from public.master_data_audit_events where tenant_id = '33333333-3333-3333-3333-333333333333' $$,
  'viewer A cannot read master_data_audit_events even for their own tenant'
);

reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();

rollback;
