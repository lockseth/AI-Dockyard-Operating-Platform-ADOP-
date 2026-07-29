-- ADOP — pgTAP proof for 20260722030000_user_management.sql: tenant
-- invitations, atomic acceptance, controlled role/status RPCs, concurrency-
-- safe last-owner guards, and the automatic audit trail.
--
-- Self-contained: creates its own fixtures and rolls back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('c1111111-1111-1111-1111-111111111111', 'pgtap-um-tenant-c1', 'PgTAP UM Tenant C1', 'active'),
  ('c2222222-2222-2222-2222-222222222222', 'pgtap-um-tenant-c2', 'PgTAP UM Tenant C2', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-c1@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'owner-c1b@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'c0000001-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'admin-c1@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'c0000002-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-c2@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'c0000009-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'prospect@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'c0000009-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'stranger@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('d0000001-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111', 'c0000001-0000-0000-0000-000000000001', 'active'),
  ('d0000001-0000-0000-0000-000000000002', 'c1111111-1111-1111-1111-111111111111', 'c0000001-0000-0000-0000-000000000002', 'active'),
  ('d0000001-0000-0000-0000-000000000003', 'c1111111-1111-1111-1111-111111111111', 'c0000001-0000-0000-0000-000000000003', 'active'),
  ('d0000002-0000-0000-0000-000000000001', 'c2222222-2222-2222-2222-222222222222', 'c0000002-0000-0000-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('d0000001-0000-0000-0000-000000000001', 'owner'),
  ('d0000001-0000-0000-0000-000000000002', 'owner'),
  ('d0000001-0000-0000-0000-000000000003', 'admin'),
  ('d0000002-0000-0000-0000-000000000001', 'owner');

-- =============================================================================
-- SCHEMA
-- =============================================================================

select has_table('public', 'tenant_invitations', 'public.tenant_invitations exists');
select has_type('public', 'tenant_invitation_status', 'tenant_invitation_status enum exists');
select col_is_pk('public', 'tenant_invitations', 'id', 'tenant_invitations PK is id');
select has_column('public', 'profiles', 'email', 'profiles.email exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.tenant_invitations'::regclass),
  'RLS enabled on tenant_invitations'
);

-- Profile backfill/trigger: new signups populate email immediately.
select is(
  (select email from public.profiles where user_id = 'c0000001-0000-0000-0000-000000000001'),
  'owner-c1@pgtap.local',
  'profiles.email populated for a fixture user via private.handle_new_user()'
);

-- No raw write grants for authenticated on the membership tables — every
-- mutation must go through the RPCs below.
select ok(not has_table_privilege('authenticated', 'public.tenant_memberships', 'INSERT'), 'authenticated has no INSERT on tenant_memberships');
select ok(not has_table_privilege('authenticated', 'public.tenant_memberships', 'UPDATE'), 'authenticated has no UPDATE on tenant_memberships');
select ok(not has_table_privilege('authenticated', 'public.tenant_memberships', 'DELETE'), 'authenticated has no DELETE on tenant_memberships');
select ok(not has_table_privilege('authenticated', 'public.membership_roles', 'INSERT'), 'authenticated has no INSERT on membership_roles');
select ok(not has_table_privilege('authenticated', 'public.membership_roles', 'UPDATE'), 'authenticated has no UPDATE on membership_roles');
select ok(not has_table_privilege('authenticated', 'public.membership_roles', 'DELETE'), 'authenticated has no DELETE on membership_roles');
select ok(not has_table_privilege('authenticated', 'public.tenant_invitations', 'INSERT'), 'authenticated has no direct INSERT on tenant_invitations (must go through create_tenant_invitation)');
select ok(not has_table_privilege('authenticated', 'public.tenant_invitations', 'UPDATE'), 'authenticated has no direct UPDATE on tenant_invitations (must go through accept_tenant_invitation)');

-- =============================================================================
-- PROFILE CROSS-MEMBER VISIBILITY
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'c0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select ok(
  exists (select 1 from public.profiles where user_id = 'c0000001-0000-0000-0000-000000000003'),
  'owner C1 can see teammate admin-C1''s profile'
);
select is_empty(
  $$ select 1 from public.profiles where user_id = 'c0000002-0000-0000-0000-000000000001' $$,
  'owner C1 cannot see owner-C2''s profile (different tenant)'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- create_tenant_invitation
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'c0000001-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select * from public.create_tenant_invitation('c1111111-1111-1111-1111-111111111111', 'newperson@pgtap.local', 'viewer') $$,
  '42501',
  null,
  'admin (non-owner) cannot create a tenant invitation'
);

reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'c0000002-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select * from public.create_tenant_invitation('c1111111-1111-1111-1111-111111111111', 'newperson@pgtap.local', 'viewer') $$,
  '42501',
  null,
  'owner of a different tenant cannot create an invitation for tenant C1'
);

reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'c0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select * from public.create_tenant_invitation('c1111111-1111-1111-1111-111111111111', 'not-an-email', 'viewer') $$,
  'Invalid email',
  'create_tenant_invitation rejects a malformed email'
);

select throws_ok(
  $$ select * from public.create_tenant_invitation('c1111111-1111-1111-1111-111111111111', 'admin-c1@pgtap.local', 'viewer') $$,
  'This user is already an active member of this tenant',
  'create_tenant_invitation rejects inviting an already-active member'
);

select is(
  (select count(*)::int from public.tenant_invitations where tenant_id = 'c1111111-1111-1111-1111-111111111111'),
  0,
  'no invitation row created by any rejected attempt above'
);

select results_eq(
  $$ select target_user_exists from public.create_tenant_invitation('c1111111-1111-1111-1111-111111111111', 'newperson@pgtap.local', 'viewer') $$,
  $$ values (false) $$,
  'inviting a brand-new email reports target_user_exists = false'
);

select is(
  (select count(*)::int from public.tenant_invitations where tenant_id = 'c1111111-1111-1111-1111-111111111111' and email = 'newperson@pgtap.local' and status = 'pending'),
  1,
  'exactly one pending invitation row created for the new email'
);

-- Idempotent retry: same tenant + email (any case) reuses the existing
-- pending row instead of creating a duplicate or erroring.
select is(
  (select invitation_id from public.create_tenant_invitation('c1111111-1111-1111-1111-111111111111', 'NewPerson@Pgtap.Local', 'admin')),
  (select id from public.tenant_invitations where tenant_id = 'c1111111-1111-1111-1111-111111111111' and email = 'newperson@pgtap.local'),
  'retrying create_tenant_invitation for the same (tenant, email) reuses the existing pending invitation id'
);
select is(
  (select count(*)::int from public.tenant_invitations where tenant_id = 'c1111111-1111-1111-1111-111111111111' and email = 'newperson@pgtap.local'),
  1,
  'retry does not create a duplicate invitation row'
);
select is(
  (select role from public.tenant_invitations where tenant_id = 'c1111111-1111-1111-1111-111111111111' and email = 'newperson@pgtap.local'),
  'admin'::public.tenant_role,
  'retry with a different role updates the still-pending invitation''s intended role'
);

select results_eq(
  $$ select target_user_exists from public.create_tenant_invitation('c1111111-1111-1111-1111-111111111111', 'prospect@pgtap.local', 'viewer') $$,
  $$ values (true) $$,
  'inviting an email with an existing auth.users account reports target_user_exists = true'
);

reset role;
select set_config('request.jwt.claims', '', true);

select throws_ok(
  $$ insert into public.tenant_invitations (tenant_id, email, role) values ('c1111111-1111-1111-1111-111111111111', 'newperson@pgtap.local', 'viewer') $$,
  '23505',
  null,
  'the partial unique index blocks a second pending invitation for the same (tenant, email) even at the raw table level'
);

-- =============================================================================
-- accept_tenant_invitation
-- =============================================================================

-- Set up a clean invitation for the prospect into tenant C2 — inserted
-- directly (fixed id) rather than via create_tenant_invitation, since that
-- RPC is already covered above and this section only exercises acceptance.
insert into public.tenant_invitations (id, tenant_id, email, role, invited_by, status) values
  ('e0000000-0000-0000-0000-000000000002', 'c2222222-2222-2222-2222-222222222222', 'prospect@pgtap.local', 'viewer', 'c0000002-0000-0000-0000-000000000001', 'pending');

-- A different, unrelated user cannot accept someone else's invitation.
select set_config('request.jwt.claims', json_build_object('sub', 'c0000009-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select public.accept_tenant_invitation('e0000000-0000-0000-0000-000000000002') $$,
  'This invitation does not belong to the current user',
  'a different user cannot accept someone else''s invitation'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- The invited prospect accepts — membership + role created atomically.
select set_config('request.jwt.claims', json_build_object('sub', 'c0000009-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ select public.accept_tenant_invitation('e0000000-0000-0000-0000-000000000002') $$,
  'prospect can accept their own invitation'
);

select is(
  (select status from public.tenant_memberships where tenant_id = 'c2222222-2222-2222-2222-222222222222' and user_id = 'c0000009-0000-0000-0000-000000000001'),
  'active'::public.membership_status,
  'accepting the invitation creates an active membership for the prospect'
);
select is(
  (select role from public.membership_roles mr join public.tenant_memberships tm on tm.id = mr.membership_id
     where tm.tenant_id = 'c2222222-2222-2222-2222-222222222222' and tm.user_id = 'c0000009-0000-0000-0000-000000000001'),
  'viewer'::public.tenant_role,
  'the invited role (viewer) was assigned atomically with the membership'
);
select is(
  (select status from public.tenant_invitations where id = 'e0000000-0000-0000-0000-000000000002'),
  'accepted'::public.tenant_invitation_status,
  'the invitation itself is marked accepted'
);

-- Cannot accept the same invitation twice.
select throws_ok(
  $$ select public.accept_tenant_invitation('e0000000-0000-0000-0000-000000000002') $$,
  'Invitation already accepted',
  'accepting an already-accepted invitation is rejected'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- An expired invitation is rejected and gets marked expired as a side effect.
insert into public.tenant_invitations (id, tenant_id, email, role, invited_by, status, expires_at) values
  ('e0000000-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111', 'stranger@pgtap.local', 'viewer', 'c0000001-0000-0000-0000-000000000001', 'pending', now() - interval '1 day');

select set_config('request.jwt.claims', json_build_object('sub', 'c0000009-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

-- Returns NULL rather than raising: raising after the status='expired'
-- update below would roll that update back too (see the migration comment
-- on accept_tenant_invitation) — this is the deliberate, correct contract,
-- not a missed error case.
select is(
  (select public.accept_tenant_invitation('e0000000-0000-0000-0000-000000000001')),
  null::uuid,
  'accepting an expired invitation returns null rather than raising'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status from public.tenant_invitations where id = 'e0000000-0000-0000-0000-000000000001'),
  'expired'::public.tenant_invitation_status,
  'the failed accept attempt durably marks the stale pending invitation as expired'
);

-- =============================================================================
-- set_membership_role
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'c0000001-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select public.set_membership_role('d0000001-0000-0000-0000-000000000002', 'viewer') $$,
  '42501',
  null,
  'admin (non-owner) cannot call set_membership_role'
);

reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'c0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select public.set_membership_role('d0000001-0000-0000-0000-000000000001', 'admin') $$,
  'Cannot change your own role',
  'owner cannot change their own role via set_membership_role'
);

-- Safe demotion: two owners exist (d...0001, d...0002) — demoting the other
-- one leaves exactly one owner remaining, so this must succeed.
select lives_ok(
  $$ select public.set_membership_role('d0000001-0000-0000-0000-000000000002', 'admin') $$,
  'owner can demote a co-owner when at least one owner remains afterward'
);
select is(
  (select array_agg(role order by role) from public.membership_roles where membership_id = 'd0000001-0000-0000-0000-000000000002'),
  array['admin']::public.tenant_role[],
  'set_membership_role replaced the entire role set with exactly the new role'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- set_membership_status
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'c0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select public.set_membership_status('d0000001-0000-0000-0000-000000000001', 'suspended') $$,
  'Cannot change your own membership status',
  'owner cannot change their own membership status'
);

select lives_ok(
  $$ select public.set_membership_status('d0000001-0000-0000-0000-000000000002', 'suspended') $$,
  'owner can suspend a different member (now holding admin, not owner)'
);
select is(
  (select status from public.tenant_memberships where id = 'd0000001-0000-0000-0000-000000000002'),
  'suspended'::public.membership_status,
  'membership status updated to suspended'
);

select lives_ok(
  $$ select public.set_membership_status('d0000001-0000-0000-0000-000000000002', 'active') $$,
  'owner can reactivate a suspended member'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- Last-owner guards — proven directly at the trigger level (role-independent:
-- fires regardless of caller, exactly like the append-only audit trigger).
-- Not reachable through set_membership_role/set_membership_status alone in
-- this fixture: both RPCs require the caller to be an owner and forbid
-- targeting themselves, so a single distinguished caller can never legally
-- drive the owner count to zero — the real risk is two DIFFERENT owners
-- concurrently demoting each other, which pg_advisory_xact_lock serializes.
-- Testing that race requires two concurrent connections (out of scope for a
-- single-transaction pgTAP file); this proves the invariant the lock
-- protects is still enforced no matter which role reaches the trigger.
-- =============================================================================

select throws_ok(
  $$ update public.tenant_memberships set status = 'suspended' where id = 'd0000001-0000-0000-0000-000000000001' $$,
  'Cannot deactivate the last active owner of a tenant',
  'the last active owner of tenant C1 cannot be deactivated, even as the unrestricted table-owner role'
);

select throws_ok(
  $$ delete from public.membership_roles where membership_id = 'd0000001-0000-0000-0000-000000000001' and role = 'owner' $$,
  'Cannot remove the last owner role of a tenant',
  'the last owner role in tenant C1 cannot be deleted, even as the unrestricted table-owner role'
);

select throws_ok(
  $$ update public.tenant_memberships set status = 'suspended' where id = 'd0000002-0000-0000-0000-000000000001' $$,
  'Cannot deactivate the last active owner of a tenant',
  'the sole owner of tenant C2 cannot be deactivated'
);

-- =============================================================================
-- auth.users deletion cascading through tenant_memberships ->
-- membership_roles must not be blocked by the audit trigger. admin-c1
-- (d0000001-...0003, role 'admin', not an owner) is safe to remove entirely
-- since tenant C1 still has an active owner (d0000001-...0001) afterward.
-- =============================================================================

select lives_ok(
  $$ delete from auth.users where id = 'c0000001-0000-0000-0000-000000000003' $$,
  'deleting a non-owner user cascades through tenant_memberships/membership_roles without the audit trigger raising a NOT NULL violation'
);

select is_empty(
  $$ select 1 from public.tenant_memberships where user_id = 'c0000001-0000-0000-0000-000000000003' $$,
  'the deleted user''s membership row is gone (cascade)'
);
select is_empty(
  $$ select 1 from public.membership_roles mr where mr.membership_id = 'd0000001-0000-0000-0000-000000000003' $$,
  'the deleted user''s role row is gone (cascade)'
);

-- =============================================================================
-- owner_provision_invited_member (Gate 6G-H)
-- =============================================================================
-- Fresh fixture users/invitations — prospect@pgtap.local and
-- stranger@pgtap.local were already consumed by the accept_tenant_invitation
-- section above, and admin-c1 (c0000001-...0003) was deleted by the cascade
-- test above, so owner-c1b (c0000001-...0002, demoted to 'admin' earlier in
-- this file) stands in as the non-owner caller here.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', 'c0000009-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'stuck-invitee@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'c0000009-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'cross-member@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'c0000009-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'dual-pending@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false);

-- cross-member already has an ACTIVE membership in tenant C2.
insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('d0000002-0000-0000-0000-000000000002', 'c2222222-2222-2222-2222-222222222222', 'c0000009-0000-0000-0000-000000000004', 'active');
insert into public.membership_roles (membership_id, role) values
  ('d0000002-0000-0000-0000-000000000002', 'viewer');

insert into public.tenant_invitations (id, tenant_id, email, role, invited_by, status) values
  ('e0000000-0000-0000-0000-000000000010', 'c1111111-1111-1111-1111-111111111111', 'stuck-invitee@pgtap.local', 'viewer', 'c0000001-0000-0000-0000-000000000001', 'pending'),
  ('e0000000-0000-0000-0000-000000000011', 'c1111111-1111-1111-1111-111111111111', 'cross-member@pgtap.local', 'admin', 'c0000001-0000-0000-0000-000000000001', 'pending'),
  ('e0000000-0000-0000-0000-000000000012', 'c1111111-1111-1111-1111-111111111111', 'dual-pending@pgtap.local', 'viewer', 'c0000001-0000-0000-0000-000000000001', 'pending'),
  ('e0000000-0000-0000-0000-000000000013', 'c2222222-2222-2222-2222-222222222222', 'dual-pending@pgtap.local', 'admin', 'c0000002-0000-0000-0000-000000000001', 'pending');

select set_config('request.jwt.claims', json_build_object('sub', 'c0000001-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select * from public.owner_provision_invited_member('e0000000-0000-0000-0000-000000000010', 'viewer') $$,
  '42501',
  null,
  'admin (non-owner) cannot call owner_provision_invited_member'
);

reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'c0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select * from public.owner_provision_invited_member('e0000000-0000-0000-0000-000000000010', 'admin') $$,
  'Role mismatch with pending invitation',
  'a submitted expectedRole that no longer matches the invitation''s actual role is rejected'
);

select throws_ok(
  $$ select * from public.owner_provision_invited_member('e0000000-0000-0000-0000-000000000011', 'admin') $$,
  'Target has membership in another tenant',
  'a target with an active membership in a different tenant is rejected'
);

select throws_ok(
  $$ select * from public.owner_provision_invited_member('e0000000-0000-0000-0000-000000000012', 'viewer') $$,
  'cross_tenant_pending_invitation_conflict',
  'a target with a still-pending invitation in a different tenant is rejected'
);

-- Neither rejected attempt above touched anything outside its own tenant/invitation.
-- These rows belong to tenant C2, invisible to owner-c1 under RLS, so check
-- them as superuser like every other raw-state assertion in this file.
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status from public.tenant_invitations where id = 'e0000000-0000-0000-0000-000000000013'),
  'pending'::public.tenant_invitation_status,
  'the conflicting other-tenant invitation is untouched by the rejected attempt'
);
select is(
  (select status from public.tenant_memberships where tenant_id = 'c2222222-2222-2222-2222-222222222222' and user_id = 'c0000009-0000-0000-0000-000000000004'),
  'active'::public.membership_status,
  'the cross-tenant member''s existing membership is untouched'
);

select set_config('request.jwt.claims', json_build_object('sub', 'c0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ select * from public.owner_provision_invited_member('e0000000-0000-0000-0000-000000000010', 'viewer') $$,
  'owner can directly provision a stuck pending invitation for an existing auth.users account'
);

select is(
  (select status from public.tenant_memberships where tenant_id = 'c1111111-1111-1111-1111-111111111111' and user_id = 'c0000009-0000-0000-0000-000000000003'),
  'active'::public.membership_status,
  'direct provisioning creates an active membership for the target'
);
select is(
  (select role from public.membership_roles mr join public.tenant_memberships tm on tm.id = mr.membership_id
     where tm.tenant_id = 'c1111111-1111-1111-1111-111111111111' and tm.user_id = 'c0000009-0000-0000-0000-000000000003'),
  'viewer'::public.tenant_role,
  'the invitation''s role (viewer) was assigned'
);
select is(
  (select status from public.tenant_invitations where id = 'e0000000-0000-0000-0000-000000000010'),
  'accepted'::public.tenant_invitation_status,
  'the invitation is marked accepted'
);
select is(
  (select accepted_by from public.tenant_invitations where id = 'e0000000-0000-0000-0000-000000000010'),
  'c0000001-0000-0000-0000-000000000001'::uuid,
  'accepted_by records the OWNER who performed the direct provisioning, not the target'
);

-- Idempotent retry: calling again with the same (now-accepted) invitation
-- and the same expected role returns the same membership, not an error.
select is(
  (select membership_id from public.owner_provision_invited_member('e0000000-0000-0000-0000-000000000010', 'viewer')),
  (select id from public.tenant_memberships where tenant_id = 'c1111111-1111-1111-1111-111111111111' and user_id = 'c0000009-0000-0000-0000-000000000003'),
  'retrying an already-provisioned invitation is idempotent and returns the same membership_id'
);

select is(
  (select count(*)::int from public.access_audit_events
     where entity_type = 'tenant_membership' and action = 'member_direct_provisioned'
       and entity_id = (select id from public.tenant_memberships where tenant_id = 'c1111111-1111-1111-1111-111111111111' and user_id = 'c0000009-0000-0000-0000-000000000003')),
  1,
  'exactly one member_direct_provisioned audit event exists even after the idempotent retry'
);

select ok(
  exists (
    select 1 from public.access_audit_events
    where entity_type = 'tenant_membership'
      and action = 'member_direct_provisioned'
      and actor_user_id = 'c0000001-0000-0000-0000-000000000001'
      and after_data->>'target_user_id' = 'c0000009-0000-0000-0000-000000000003'
  ),
  'member_direct_provisioned audit event is attributed to the owner and references the correct target'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- AUDIT TRAIL
-- =============================================================================

select ok(
  exists (
    select 1 from public.access_audit_events
    where tenant_id = 'c2222222-2222-2222-2222-222222222222'
      and entity_type = 'tenant_membership'
      and action = 'member_joined'
      and actor_user_id = 'c0000009-0000-0000-0000-000000000001'
  ),
  'accepting an invitation records a member_joined audit event attributed to the accepting user'
);

select ok(
  exists (
    select 1 from public.access_audit_events
    where entity_type = 'tenant_invitation'
      and action = 'invitation_accepted'
      and entity_id = 'e0000000-0000-0000-0000-000000000002'
  ),
  'accepting an invitation records an invitation_accepted audit event'
);

select ok(
  exists (
    select 1 from public.access_audit_events
    where entity_type = 'tenant_invitation' and action = 'invitation_expired'
  ),
  'a rejected accept attempt on a stale invitation records an invitation_expired audit event'
);

select ok(
  exists (
    select 1 from public.access_audit_events
    where entity_type = 'tenant_membership' and action = 'role_assigned'
  ) and exists (
    select 1 from public.access_audit_events
    where entity_type = 'tenant_membership' and action = 'role_removed'
  ),
  'set_membership_role''s delete+insert produced both a role_removed and a role_assigned audit event'
);

select ok(
  not exists (
    select 1 from public.access_audit_events
    where before_data::text ilike '%password%' or after_data::text ilike '%password%'
       or before_data::text ilike '%token%' or after_data::text ilike '%token%'
  ),
  'no audit event stores a password or token value anywhere in before_data/after_data'
);

select * from finish();

rollback;
