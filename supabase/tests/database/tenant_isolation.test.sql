-- ADOP Foundation Gate 0A — pgTAP proof of schema correctness, tenant
-- isolation, role safety, audit append-only, and profile behavior.
--
-- Self-contained: creates its own fixtures and rolls back at the end, so it
-- never depends on (or pollutes) supabase/seed.sql or any other test file.
-- pgtap is enabled here (test-only) rather than in the foundation migration.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

-- Tenants
insert into public.tenants (id, slug, display_name, status) values
  ('11111111-1111-1111-1111-111111111111', 'pgtap-tenant-a', 'PgTAP Tenant A', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'pgtap-tenant-b', 'PgTAP Tenant B', 'active');

-- Legal entities (TBD naming — never hardcode a real legal entity name)
insert into public.legal_entities (id, tenant_id, legal_name, display_name, status) values
  ('11111111-2222-3333-4444-555555555555', '11111111-1111-1111-1111-111111111111', null, 'Legal Entity A — TBD', 'active'),
  ('22222222-3333-4444-5555-666666666666', '22222222-2222-2222-2222-222222222222', null, 'Legal Entity B — TBD', 'active');

-- Auth users (minimal fixture rows — this is a test-only pattern, never done
-- in application code, which must never insert into auth.users directly).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-aaaa-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-a@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-aaaa-0000-0000-000000000002', 'authenticated', 'authenticated', 'admin-a@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-aaaa-0000-0000-000000000003', 'authenticated', 'authenticated', 'viewer-a@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-aaaa-0000-0000-000000000004', 'authenticated', 'authenticated', 'suspended-a@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-bbbb-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-b@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false);

-- Memberships (status) + roles
insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '00000000-aaaa-0000-0000-000000000001', 'active'),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '00000000-aaaa-0000-0000-000000000002', 'active'),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '00000000-aaaa-0000-0000-000000000003', 'active'),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '00000000-aaaa-0000-0000-000000000004', 'suspended'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '00000000-bbbb-0000-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('a0000000-0000-0000-0000-000000000001', 'owner'),
  ('a0000000-0000-0000-0000-000000000002', 'admin'),
  ('a0000000-0000-0000-0000-000000000003', 'viewer'),
  ('a0000000-0000-0000-0000-000000000004', 'viewer'),
  ('b0000000-0000-0000-0000-000000000001', 'owner');

-- Two audit events, one per tenant, written as the trusted migration role.
insert into public.access_audit_events (tenant_id, actor_user_id, entity_type, entity_id, action) values
  ('11111111-1111-1111-1111-111111111111', '00000000-aaaa-0000-0000-000000000001', 'tenant', '11111111-1111-1111-1111-111111111111', 'seed'),
  ('22222222-2222-2222-2222-222222222222', '00000000-bbbb-0000-0000-000000000001', 'tenant', '22222222-2222-2222-2222-222222222222', 'seed');

-- =============================================================================
-- SCHEMA
-- =============================================================================

select has_table('public', 'profiles', 'public.profiles exists');
select has_table('public', 'tenants', 'public.tenants exists');
select has_table('public', 'legal_entities', 'public.legal_entities exists');
select has_table('public', 'tenant_memberships', 'public.tenant_memberships exists');
select has_table('public', 'membership_roles', 'public.membership_roles exists');
select has_table('public', 'access_audit_events', 'public.access_audit_events exists');

select has_type('public', 'tenant_status', 'tenant_status enum exists');
select has_type('public', 'membership_status', 'membership_status enum exists');
select has_type('public', 'tenant_role', 'tenant_role enum exists');
select has_type('public', 'legal_entity_status', 'legal_entity_status enum exists');

select ok(
  (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.tenant_role'::regtype)
    = array['owner', 'admin', 'reviewer', 'viewer'],
  'tenant_role has exactly owner/admin/reviewer/viewer — no platform_admin/founder/superadmin'
);

select col_is_pk('public', 'profiles', 'user_id', 'profiles PK is user_id');
select col_is_pk('public', 'tenants', 'id', 'tenants PK is id');
select col_is_pk('public', 'legal_entities', 'id', 'legal_entities PK is id');
select col_is_pk('public', 'tenant_memberships', 'id', 'tenant_memberships PK is id');
select col_is_pk('public', 'membership_roles', array['membership_id', 'role'], 'membership_roles composite PK');
select col_is_pk('public', 'access_audit_events', 'id', 'access_audit_events PK is id');

select col_is_unique('public', 'tenants', 'slug', 'tenants.slug is unique');
select col_is_unique('public', 'tenant_memberships', array['tenant_id', 'user_id'], 'tenant_memberships (tenant_id, user_id) is unique');

select has_index('public', 'legal_entities', 'legal_entities_tenant_id_idx', 'legal_entities has tenant_id index');
select has_index('public', 'tenant_memberships', 'tenant_memberships_user_id_idx', 'tenant_memberships has user_id index');
select has_index('public', 'access_audit_events', 'access_audit_events_tenant_id_idx', 'access_audit_events has tenant_id index');
select has_index('public', 'access_audit_events', 'access_audit_events_actor_user_id_idx', 'access_audit_events has actor_user_id index');
select has_index('public', 'access_audit_events', 'access_audit_events_created_at_idx', 'access_audit_events has created_at index');

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS enabled on profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.tenants'::regclass), 'RLS enabled on tenants');
select ok((select relrowsecurity from pg_class where oid = 'public.legal_entities'::regclass), 'RLS enabled on legal_entities');
select ok((select relrowsecurity from pg_class where oid = 'public.tenant_memberships'::regclass), 'RLS enabled on tenant_memberships');
select ok((select relrowsecurity from pg_class where oid = 'public.membership_roles'::regclass), 'RLS enabled on membership_roles');
select ok((select relrowsecurity from pg_class where oid = 'public.access_audit_events'::regclass), 'RLS enabled on access_audit_events');

-- Helper functions live in the non-exposed `private` schema.
select is(
  (select n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.oid = 'private.current_user_is_active_tenant_member(uuid)'::regprocedure),
  'private',
  'current_user_is_active_tenant_member lives in private (non-exposed) schema'
);
select is(
  (select n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.oid = 'private.current_user_has_tenant_role(uuid, public.tenant_role[])'::regprocedure),
  'private',
  'current_user_has_tenant_role lives in private (non-exposed) schema'
);
select is(
  (select n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.oid = 'private.handle_new_user()'::regprocedure),
  'private',
  'handle_new_user lives in private (non-exposed) schema'
);

-- SECURITY DEFINER functions carry a fixed search_path.
select ok(
  exists (
    select 1 from pg_proc, unnest(proconfig) as cfg
    where oid = 'private.current_user_is_active_tenant_member(uuid)'::regprocedure
      and cfg = 'search_path=public, pg_temp'
  ),
  'current_user_is_active_tenant_member has fixed search_path'
);
select ok(
  exists (
    select 1 from pg_proc, unnest(proconfig) as cfg
    where oid = 'private.current_user_has_tenant_role(uuid, public.tenant_role[])'::regprocedure
      and cfg = 'search_path=public, pg_temp'
  ),
  'current_user_has_tenant_role has fixed search_path'
);
select ok(
  exists (
    select 1 from pg_proc, unnest(proconfig) as cfg
    where oid = 'private.handle_new_user()'::regprocedure
      and cfg = 'search_path=public, pg_temp'
  ),
  'handle_new_user has fixed search_path'
);
select ok(
  (select prosecdef from pg_proc where oid = 'private.handle_new_user()'::regprocedure),
  'handle_new_user is SECURITY DEFINER'
);

-- PUBLIC/anon must not be able to execute the privileged helpers.
select ok(
  not has_function_privilege('anon', 'private.current_user_is_active_tenant_member(uuid)', 'EXECUTE'),
  'anon cannot execute current_user_is_active_tenant_member'
);
select ok(
  not has_function_privilege('anon', 'private.current_user_has_tenant_role(uuid, public.tenant_role[])', 'EXECUTE'),
  'anon cannot execute current_user_has_tenant_role'
);
select ok(
  not has_function_privilege('anon', 'private.handle_new_user()', 'EXECUTE'),
  'anon cannot execute handle_new_user'
);
select ok(
  not has_function_privilege('public', 'private.current_user_has_tenant_role(uuid, public.tenant_role[])', 'EXECUTE'),
  'PUBLIC pseudo-role has no execute on current_user_has_tenant_role'
);

-- Append-only guarantee: even the migration/owner role cannot mutate audit rows.
select throws_ok(
  $$ update public.access_audit_events set action = 'tampered' where tenant_id = '11111111-1111-1111-1111-111111111111' $$,
  'access_audit_events is append-only: UPDATE not allowed',
  'UPDATE on access_audit_events is blocked at the database level'
);
select throws_ok(
  $$ delete from public.access_audit_events where tenant_id = '11111111-1111-1111-1111-111111111111' $$,
  'access_audit_events is append-only: DELETE not allowed',
  'DELETE on access_audit_events is blocked at the database level'
);

-- =============================================================================
-- TENANT ISOLATION
-- =============================================================================

-- owner A
select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select results_eq(
  $$ select slug from public.tenants order by slug $$,
  $$ values ('pgtap-tenant-a') $$,
  'owner A sees only Tenant A'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- owner B
select set_config('request.jwt.claims', json_build_object('sub', '00000000-bbbb-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select results_eq(
  $$ select slug from public.tenants order by slug $$,
  $$ values ('pgtap-tenant-b') $$,
  'owner B sees only Tenant B'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- admin A
select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-0000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select results_eq(
  $$ select slug from public.tenants order by slug $$,
  $$ values ('pgtap-tenant-a') $$,
  'admin A does not see Tenant B'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- viewer A
select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-0000-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select results_eq(
  $$ select slug from public.tenants order by slug $$,
  $$ values ('pgtap-tenant-a') $$,
  'viewer A does not see Tenant B'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- suspended member (viewer, suspended status) sees nothing
select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-0000-0000-000000000004', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select is_empty(
  $$ select id from public.tenants $$,
  'suspended member sees no tenant data'
);
select is_empty(
  $$ select id from public.legal_entities $$,
  'suspended member sees no legal entity data'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- anon sees nothing at all — blocked at the GRANT level (stronger than RLS:
-- the query fails outright rather than returning zero rows).
set local role anon;

select throws_ok(
  $$ select id from public.tenants $$,
  '42501',
  null,
  'anon has no SELECT grant on tenants'
);
select throws_ok(
  $$ select id from public.legal_entities $$,
  '42501',
  null,
  'anon has no SELECT grant on legal_entities'
);
select throws_ok(
  $$ select id from public.tenant_memberships $$,
  '42501',
  null,
  'anon has no SELECT grant on tenant_memberships'
);
select throws_ok(
  $$ select id from public.access_audit_events $$,
  '42501',
  null,
  'anon has no SELECT grant on access_audit_events'
);

reset role;

-- =============================================================================
-- ROLE SAFETY
-- =============================================================================

-- Nobody but service_role has any grant on membership_roles/tenant_memberships
-- writes — self-promotion and admin role mutation are structurally impossible.
select ok(
  not has_table_privilege('authenticated', 'public.membership_roles', 'INSERT'),
  'authenticated has no INSERT on membership_roles (no self-promotion path)'
);
select ok(
  not has_table_privilege('authenticated', 'public.membership_roles', 'UPDATE'),
  'authenticated has no UPDATE on membership_roles'
);
select ok(
  not has_table_privilege('authenticated', 'public.membership_roles', 'DELETE'),
  'authenticated has no DELETE on membership_roles'
);
select ok(
  not has_table_privilege('authenticated', 'public.tenant_memberships', 'INSERT'),
  'authenticated has no INSERT on tenant_memberships'
);
select ok(
  not has_table_privilege('authenticated', 'public.tenant_memberships', 'UPDATE'),
  'authenticated has no UPDATE on tenant_memberships (admin cannot mutate membership)'
);
select ok(
  not has_table_privilege('authenticated', 'public.tenant_memberships', 'DELETE'),
  'authenticated has no DELETE on tenant_memberships'
);

-- reviewer/viewer cannot update tenant or legal entity — RLS blocks it even
-- though the UPDATE(display_name) grant exists at the table level.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-0000-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

update public.tenants set display_name = 'hacked' where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*)::int from public.tenants where id = '11111111-1111-1111-1111-111111111111' and display_name = 'hacked'),
  0,
  'viewer A cannot update Tenant A display_name'
);

update public.legal_entities set display_name = 'hacked' where id = '11111111-2222-3333-4444-555555555555';
select is(
  (select count(*)::int from public.legal_entities where id = '11111111-2222-3333-4444-555555555555' and display_name = 'hacked'),
  0,
  'viewer A cannot update Legal Entity A display_name'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- owner A cannot update Tenant B (cross-tenant)
select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

update public.tenants set display_name = 'hacked-by-owner-a' where id = '22222222-2222-2222-2222-222222222222';
select is(
  (select count(*)::int from public.tenants where id = '22222222-2222-2222-2222-222222222222' and display_name = 'hacked-by-owner-a'),
  0,
  'owner A cannot update Tenant B'
);

-- owner A CAN update its own tenant's display_name — proves the policy isn't
-- simply denying everything.
update public.tenants set display_name = 'Tenant A (renamed)' where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select display_name from public.tenants where id = '11111111-1111-1111-1111-111111111111'),
  'Tenant A (renamed)',
  'owner A can update its own Tenant A display_name'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- No function in this schema accepts a caller-supplied user_id — identity is
-- always auth.uid(). Structural proof: only tenant_id/roles parameters exist.
-- current_user_can_view_profile and current_user_email were added by
-- 20260722030000_user_management.sql (profiles cross-member visibility +
-- invitation-acceptance email matching) — additive, expected here.
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname like 'current_user_%'),
  array['current_user_can_view_profile', 'current_user_email', 'current_user_has_tenant_role', 'current_user_is_active_tenant_member'],
  'only the expected private RLS helpers exist'
);
select ok(
  (select pg_get_function_arguments('private.current_user_is_active_tenant_member(uuid)'::regprocedure)) = 'p_tenant_id uuid',
  'current_user_is_active_tenant_member takes only tenant_id — no caller-supplied user_id'
);
select ok(
  (select pg_get_function_arguments('private.current_user_has_tenant_role(uuid, public.tenant_role[])'::regprocedure)) = 'p_tenant_id uuid, p_roles tenant_role[]',
  'current_user_has_tenant_role takes only tenant_id/roles — no caller-supplied user_id'
);

-- =============================================================================
-- AUDIT
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

-- Scoped to entity_type = 'tenant' (this file's own manually-seeded audit
-- row) rather than every row for the tenant: 20260722030000_user_
-- management.sql's automatic membership_audit_log trigger also fires on
-- this file's own tenant_memberships/membership_roles fixture inserts
-- above, which is expected and covered by user_management.test.sql — not
-- what this assertion is proving (tenant-scoped RLS visibility).
select results_eq(
  $$ select tenant_id from public.access_audit_events where entity_type = 'tenant' $$,
  $$ values ('11111111-1111-1111-1111-111111111111'::uuid) $$,
  'owner A sees only Tenant A''s own seeded audit event'
);

select throws_ok(
  $$ insert into public.access_audit_events (tenant_id, entity_type, entity_id, action)
     values ('11111111-1111-1111-1111-111111111111', 'tenant', '11111111-1111-1111-1111-111111111111', 'tamper') $$,
  '42501',
  null,
  'authenticated cannot INSERT into access_audit_events directly'
);

reset role;
select set_config('request.jwt.claims', '', true);

select ok(
  not has_table_privilege('authenticated', 'public.access_audit_events', 'UPDATE'),
  'authenticated has no UPDATE on access_audit_events'
);
select ok(
  not has_table_privilege('authenticated', 'public.access_audit_events', 'DELETE'),
  'authenticated has no DELETE on access_audit_events'
);
select ok(
  not has_table_privilege('service_role', 'public.access_audit_events', 'UPDATE'),
  'service_role has no UPDATE on access_audit_events either (append-only end to end)'
);
select ok(
  not has_table_privilege('service_role', 'public.access_audit_events', 'DELETE'),
  'service_role has no DELETE on access_audit_events either'
);

-- =============================================================================
-- PROFILE
-- =============================================================================

select ok(
  exists (select 1 from public.profiles where user_id = '00000000-aaaa-0000-0000-000000000001'),
  'profile auto-created for owner A via on_auth_user_created trigger'
);
select ok(
  exists (select 1 from public.profiles where user_id = '00000000-bbbb-0000-0000-000000000001'),
  'profile auto-created for owner B via on_auth_user_created trigger'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

update public.profiles set display_name = 'Owner A' where user_id = '00000000-aaaa-0000-0000-000000000001';
select is(
  (select display_name from public.profiles where user_id = '00000000-aaaa-0000-0000-000000000001'),
  'Owner A',
  'owner A can update their own display_name'
);

reset role;
select set_config('request.jwt.claims', '', true);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'user_id', 'UPDATE'),
  'authenticated cannot UPDATE profiles.user_id (no column grant)'
);

select * from finish();

rollback;
