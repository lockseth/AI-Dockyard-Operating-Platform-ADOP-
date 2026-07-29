-- ADOP — pgTAP proof for 20260729010000_owner_direct_user_provisioning.sql:
-- owner_resolve_provision_target, owner_finalize_member_provisioning, and
-- owner_authorize_member_password_reset (Gate 6G-H, Internal User Direct
-- Provisioning & Temporary Password Recovery).
--
-- Self-contained: creates its own fixtures (tenant prefix 'f') and rolls
-- back at the end. Mirrors user_management.test.sql's set_config/reset role
-- pattern for exercising RPCs as specific authenticated users.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('f1111111-1111-1111-1111-111111111111', 'pgtap-odup-tenant-f1', 'PgTAP ODUP Tenant F1', 'active'),
  ('f2222222-2222-2222-2222-222222222222', 'pgtap-odup-tenant-f2', 'PgTAP ODUP Tenant F2', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', 'f0000001-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-f1@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'f0000001-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'admin-f1@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'f0000002-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-f2@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'f0000009-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'brand-new-target@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'f0000009-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'suspended-in-f1@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'f0000009-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'cross-tenant-member@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'f0000009-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'active-in-f1@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'f0000009-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'suspended-for-reset-test@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('fa000001-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111111', 'f0000001-0000-0000-0000-000000000001', 'active'),
  ('fa000001-0000-0000-0000-000000000002', 'f1111111-1111-1111-1111-111111111111', 'f0000001-0000-0000-0000-000000000002', 'active'),
  ('fa000002-0000-0000-0000-000000000001', 'f2222222-2222-2222-2222-222222222222', 'f0000002-0000-0000-0000-000000000001', 'active'),
  -- suspended-in-f1 already has a (suspended) membership in tenant F1 — the reactivation case.
  ('fa000001-0000-0000-0000-000000000003', 'f1111111-1111-1111-1111-111111111111', 'f0000009-0000-0000-0000-000000000002', 'suspended'),
  -- cross-tenant-member is already active in tenant F2 — the cross-tenant conflict case.
  ('fa000002-0000-0000-0000-000000000002', 'f2222222-2222-2222-2222-222222222222', 'f0000009-0000-0000-0000-000000000003', 'active'),
  -- active-in-f1 is already an active member of tenant F1 — the duplicate case.
  ('fa000001-0000-0000-0000-000000000004', 'f1111111-1111-1111-1111-111111111111', 'f0000009-0000-0000-0000-000000000004', 'active'),
  -- Dedicated, untouched-by-finalize suspended membership for the password-
  -- reset section below — fa000001-...-0003 (suspended-in-f1) is NOT reused
  -- here since the finalize section above reactivates it to 'active'.
  ('fa000001-0000-0000-0000-000000000005', 'f1111111-1111-1111-1111-111111111111', 'f0000009-0000-0000-0000-000000000005', 'suspended');

insert into public.membership_roles (membership_id, role) values
  ('fa000001-0000-0000-0000-000000000001', 'owner'),
  ('fa000001-0000-0000-0000-000000000002', 'admin'),
  ('fa000002-0000-0000-0000-000000000001', 'owner'),
  ('fa000001-0000-0000-0000-000000000003', 'viewer'),
  ('fa000002-0000-0000-0000-000000000002', 'viewer'),
  ('fa000001-0000-0000-0000-000000000004', 'viewer'),
  ('fa000001-0000-0000-0000-000000000005', 'viewer');

-- A lingering pending invitation for the same (tenant, email) direct
-- provisioning is about to resolve for brand-new-target — proves it gets
-- swept up atomically.
insert into public.tenant_invitations (id, tenant_id, email, role, invited_by, status) values
  ('fb000000-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111111', 'brand-new-target@pgtap.local', 'viewer', 'f0000001-0000-0000-0000-000000000001', 'pending');

-- =============================================================================
-- owner_resolve_provision_target
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f0000001-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select * from public.owner_resolve_provision_target('f1111111-1111-1111-1111-111111111111', 'anyone@pgtap.local') $$,
  '42501',
  null,
  'admin (non-owner) cannot call owner_resolve_provision_target'
);

reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'f0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select results_eq(
  $$ select target_user_id, same_tenant_membership_id, same_tenant_status, cross_tenant_conflict, pending_invitation_id
       from public.owner_resolve_provision_target('f1111111-1111-1111-1111-111111111111', 'nobody-at-all@pgtap.local') $$,
  $$ values (null::uuid, null::uuid, null::public.membership_status, false, null::uuid) $$,
  'a brand-new email with no invitation resolves to all-null/false'
);

select results_eq(
  $$ select target_user_id, cross_tenant_conflict, pending_invitation_id
       from public.owner_resolve_provision_target('f1111111-1111-1111-1111-111111111111', 'Brand-New-Target@Pgtap.Local') $$,
  $$ values ('f0000009-0000-0000-0000-000000000001'::uuid, false, 'fb000000-0000-0000-0000-000000000001'::uuid) $$,
  'resolves an existing auth.users id case-insensitively and finds the lingering pending invitation for this exact (tenant, email)'
);

select results_eq(
  $$ select same_tenant_membership_id, same_tenant_status
       from public.owner_resolve_provision_target('f1111111-1111-1111-1111-111111111111', 'suspended-in-f1@pgtap.local') $$,
  $$ values ('fa000001-0000-0000-0000-000000000003'::uuid, 'suspended'::public.membership_status) $$,
  'reports the existing suspended same-tenant membership'
);

select results_eq(
  $$ select same_tenant_status
       from public.owner_resolve_provision_target('f1111111-1111-1111-1111-111111111111', 'active-in-f1@pgtap.local') $$,
  $$ values ('active'::public.membership_status) $$,
  'reports an existing active same-tenant membership (duplicate case)'
);

select results_eq(
  $$ select cross_tenant_conflict
       from public.owner_resolve_provision_target('f1111111-1111-1111-1111-111111111111', 'cross-tenant-member@pgtap.local') $$,
  $$ values (true) $$,
  'reports a cross-tenant conflict for a target already active in tenant F2'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- owner_finalize_member_provisioning
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f0000001-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select * from public.owner_finalize_member_provisioning('f1111111-1111-1111-1111-111111111111', 'f0000009-0000-0000-0000-000000000001', 'viewer', null, true) $$,
  '42501',
  null,
  'admin (non-owner) cannot call owner_finalize_member_provisioning'
);

reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'f0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select * from public.owner_finalize_member_provisioning('f1111111-1111-1111-1111-111111111111', 'f0000009-0000-0000-0000-000000000004', 'admin', null, false) $$,
  'This user is already an active member of this tenant',
  'STOP: finalize refuses a target already an active member of this tenant'
);

select throws_ok(
  $$ select * from public.owner_finalize_member_provisioning('f1111111-1111-1111-1111-111111111111', 'f0000009-0000-0000-0000-000000000003', 'viewer', null, false) $$,
  'Target has membership in another tenant',
  'STOP: finalize re-validates the cross-tenant conflict at write time, not just at resolve time'
);

-- New auth account case: brand-new-target, resolving and finalizing the
-- pending invitation for it atomically.
select lives_ok(
  $$ select * from public.owner_finalize_member_provisioning('f1111111-1111-1111-1111-111111111111', 'f0000009-0000-0000-0000-000000000001', 'viewer', 'fb000000-0000-0000-0000-000000000001', true) $$,
  'owner finalizes provisioning for a brand-new auth account'
);

select results_eq(
  $$ select status from public.tenant_memberships where tenant_id = 'f1111111-1111-1111-1111-111111111111' and user_id = 'f0000009-0000-0000-0000-000000000001' $$,
  $$ values ('active'::public.membership_status) $$,
  'the new membership is active'
);
select results_eq(
  $$ select role from public.membership_roles mr join public.tenant_memberships tm on tm.id = mr.membership_id
       where tm.tenant_id = 'f1111111-1111-1111-1111-111111111111' and tm.user_id = 'f0000009-0000-0000-0000-000000000001' $$,
  $$ values ('viewer'::public.tenant_role) $$,
  'the submitted role (viewer) was assigned'
);
select results_eq(
  $$ select status, accepted_by from public.tenant_invitations where id = 'fb000000-0000-0000-0000-000000000001' $$,
  $$ values ('accepted'::public.tenant_invitation_status, 'f0000001-0000-0000-0000-000000000001'::uuid) $$,
  'the lingering pending invitation for this exact (tenant, email) was resolved atomically, attributed to the owner'
);
select ok(
  exists (
    select 1 from public.access_audit_events
    where entity_type = 'tenant_membership' and action = 'member_direct_created'
      and after_data->>'target_user_id' = 'f0000009-0000-0000-0000-000000000001'
      and (after_data->>'new_auth_account')::boolean = true
      and after_data->>'pending_invitation_id' = 'fb000000-0000-0000-0000-000000000001'
  ),
  'a member_direct_created audit event records the new auth account and the resolved invitation'
);

-- Retrying after success is refused (not idempotent by design — a second
-- password issuance goes through Reset Password Sementara instead).
select throws_ok(
  $$ select * from public.owner_finalize_member_provisioning('f1111111-1111-1111-1111-111111111111', 'f0000009-0000-0000-0000-000000000001', 'viewer', null, false) $$,
  'This user is already an active member of this tenant',
  'retrying finalize on an already-provisioned target is refused, not silently repeated'
);

-- Reactivation case: suspended-in-f1's existing suspended membership.
select lives_ok(
  $$ select * from public.owner_finalize_member_provisioning('f1111111-1111-1111-1111-111111111111', 'f0000009-0000-0000-0000-000000000002', 'admin', null, false) $$,
  'owner finalizes provisioning reusing an existing account with a suspended same-tenant membership'
);
select results_eq(
  $$ select status from public.tenant_memberships where id = 'fa000001-0000-0000-0000-000000000003' $$,
  $$ values ('active'::public.membership_status) $$,
  'the previously suspended membership is now active'
);
select results_eq(
  $$ select role from public.membership_roles where membership_id = 'fa000001-0000-0000-0000-000000000003' $$,
  $$ values ('admin'::public.tenant_role) $$,
  'the role was replaced with the newly submitted role (admin), not left as the old viewer'
);
select ok(
  exists (
    select 1 from public.access_audit_events
    where entity_type = 'tenant_membership' and action = 'member_direct_reactivated'
      and entity_id = 'fa000001-0000-0000-0000-000000000003'
  ),
  'a member_direct_reactivated audit event (distinct from member_direct_created) was recorded'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- owner_authorize_member_password_reset
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f0000001-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select public.owner_authorize_member_password_reset('fa000001-0000-0000-0000-000000000004') $$,
  '42501',
  null,
  'admin (non-owner) cannot call owner_authorize_member_password_reset'
);

reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'f0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select public.owner_authorize_member_password_reset('fa000001-0000-0000-0000-000000000001') $$,
  'Cannot reset your own temporary password',
  'owner cannot reset their own temporary password'
);

select throws_ok(
  $$ select public.owner_authorize_member_password_reset('fa000001-0000-0000-0000-000000000005') $$,
  'Membership is not active',
  'STOP: password reset is refused for a non-active (suspended) membership'
);

select is(
  (select public.owner_authorize_member_password_reset('fa000001-0000-0000-0000-000000000004')),
  'f0000009-0000-0000-0000-000000000004'::uuid,
  'owner authorizes a password reset for an active member and gets back the target auth user id'
);

select ok(
  exists (
    select 1 from public.access_audit_events
    where entity_type = 'tenant_membership' and action = 'member_temporary_password_reset'
      and entity_id = 'fa000001-0000-0000-0000-000000000004'
      and actor_user_id = 'f0000001-0000-0000-0000-000000000001'
  ),
  'a member_temporary_password_reset audit event is recorded, attributed to the owner'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- AUDIT — no password/token ever stored
-- =============================================================================

select ok(
  not exists (
    select 1 from public.access_audit_events
    where before_data::text ilike '%password%' or after_data::text ilike '%password%'
       or before_data::text ilike '%token%' or after_data::text ilike '%token%'
  ),
  'no audit event from this migration stores a password or token value anywhere in before_data/after_data'
);

select * from finish();

rollback;
