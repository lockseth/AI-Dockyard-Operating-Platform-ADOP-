-- Gate 6J-E2-C0 — regression guard for the tenant-disambiguation invariant
-- used by the design-partner tenant provisioning migration
-- (20260808000000_design_partner_tenant_provisioning.sql): two distinctly
-- slugged tenants can coexist where exactly one carries a given
-- display_name, a freshly provisioned target tenant starts with zero
-- memberships/roles, and an existing tenant's membership/role data survives
-- a display_name-only rename.
--
-- This does not invoke that migration's DO block directly (anonymous DO
-- blocks are not callable, and the migration is intentionally gated to one
-- hosted-specific tenant id) — it proves the same underlying model
-- invariant with self-contained fixtures (prefix f6a0-), and rolls back at
-- the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

insert into public.tenants (id, slug, display_name, status) values
  ('f6a00000-0000-4000-8000-000000000001', 'gate-6j-e2-c0-internal-demo', 'GATE 6J-E2-C0 CO LTD', 'active'),
  ('f6a00000-0000-4000-8000-000000000002', 'gate-6j-e2-c0-design-partner', 'GATE 6J-E2-C0 CO LTD', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', 'f6a01111-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-f6a0@gate-6j-e2-c0.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status)
values ('f6a02222-0000-4000-8000-000000000001', 'f6a00000-0000-4000-8000-000000000001', 'f6a01111-0000-4000-8000-000000000001', 'active');

insert into public.membership_roles (membership_id, role)
values ('f6a02222-0000-4000-8000-000000000001', 'owner');

-- Before disambiguation both fixture tenants share a display_name (mirrors
-- the real internal-demo/design-partner collision this gate exists to fix).
select is(
  (select count(*)::int from public.tenants
    where id in ('f6a00000-0000-4000-8000-000000000001', 'f6a00000-0000-4000-8000-000000000002')
      and display_name = 'GATE 6J-E2-C0 CO LTD'),
  2,
  'fixture starts with the same ambiguity the gate is fixing'
);

-- A display_name-only rename of the internal tenant makes the pair unambiguous.
update public.tenants set display_name = 'INTERNAL DEMO — GATE 6J-E2-C0 CO LTD'
  where id = 'f6a00000-0000-4000-8000-000000000001';

select is(
  (select count(*)::int from public.tenants
    where id in ('f6a00000-0000-4000-8000-000000000001', 'f6a00000-0000-4000-8000-000000000002')
      and display_name = 'GATE 6J-E2-C0 CO LTD'),
  1,
  'exactly one tenant carries the unambiguous design-partner display_name after rename'
);

-- The design-partner tenant is the empty target: zero memberships, zero owners.
select is(
  (select count(*)::int from public.tenant_memberships where tenant_id = 'f6a00000-0000-4000-8000-000000000002'),
  0,
  'new design-partner tenant has zero memberships'
);

select is(
  (select count(*)::int from public.tenant_memberships tm
    join public.membership_roles mr on mr.membership_id = tm.id
    where tm.tenant_id = 'f6a00000-0000-4000-8000-000000000002' and mr.role = 'owner'),
  0,
  'new design-partner tenant has zero owner roles'
);

-- The internal tenant's membership/role data survives the rename untouched.
select is(
  (select mr.role from public.tenant_memberships tm
    join public.membership_roles mr on mr.membership_id = tm.id
    where tm.tenant_id = 'f6a00000-0000-4000-8000-000000000001'),
  'owner',
  'internal tenant owner role survives a display_name-only rename'
);

select * from finish();

rollback;
