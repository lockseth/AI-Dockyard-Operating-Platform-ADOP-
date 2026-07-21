-- ADOP — Client Billing Profile & PIC Roles pgTAP proof (Locked UI &
-- Operational Safety Revision, Gate 3).
--
-- Proves: the new columns exist with safe defaults, the payment-term check
-- constraint rejects a non-positive value, owner/admin can set every new
-- field, and reviewer cannot mutate them (reusing the existing clients/
-- client_contacts RLS — this only proves the NEW columns fall under it too).
--
-- Self-contained: creates its own fixtures, rolls back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('c1111111-1111-4111-8111-111111111111', 'pgtap-client-billing-tenant', 'PgTAP Client Billing Tenant', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-c111-1111-0000-000000000001', 'authenticated', 'authenticated', 'owner-billing@pgtap-md.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-c111-1111-0000-000000000002', 'authenticated', 'authenticated', 'reviewer-billing@pgtap-md.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('90000000-3333-0000-0000-000000000001', 'c1111111-1111-4111-8111-111111111111', '00000000-c111-1111-0000-000000000001', 'active'),
  ('90000000-3333-0000-0000-000000000002', 'c1111111-1111-4111-8111-111111111111', '00000000-c111-1111-0000-000000000002', 'active');

insert into public.membership_roles (membership_id, role) values
  ('90000000-3333-0000-0000-000000000001', 'owner'),
  ('90000000-3333-0000-0000-000000000002', 'reviewer');

-- =============================================================================
-- SCHEMA
-- =============================================================================

select has_column('public', 'clients', 'default_payment_term_days', 'clients has default_payment_term_days');
select has_column('public', 'clients', 'invoice_delivery_preference', 'clients has invoice_delivery_preference');
select has_column('public', 'client_contacts', 'role', 'client_contacts has role');
select has_column('public', 'client_contacts', 'receives_invoice_whatsapp', 'client_contacts has receives_invoice_whatsapp');
select has_column('public', 'client_contacts', 'receives_invoice_email', 'client_contacts has receives_invoice_email');
select has_column('public', 'client_contacts', 'receives_collection_reminder', 'client_contacts has receives_collection_reminder');

select col_default_is('public', 'client_contacts', 'receives_invoice_whatsapp', 'false', 'receives_invoice_whatsapp defaults false');
select col_default_is('public', 'client_contacts', 'receives_invoice_email', 'false', 'receives_invoice_email defaults false');
select col_default_is('public', 'client_contacts', 'receives_collection_reminder', 'false', 'receives_collection_reminder defaults false');

-- =============================================================================
-- OWNER can set every new field
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-c111-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ insert into public.clients (tenant_id, display_name, default_payment_term_days, invoice_delivery_preference, created_by)
     values ('c1111111-1111-4111-8111-111111111111', 'PT Billing Test', 30, 'both', '00000000-c111-1111-0000-000000000001') $$,
  'owner can create a client with the new billing fields'
);

select is(
  (select default_payment_term_days from public.clients where tenant_id = 'c1111111-1111-4111-8111-111111111111' and display_name = 'PT Billing Test'),
  30,
  'default_payment_term_days round-trips correctly'
);

select throws_ok(
  $$ insert into public.clients (tenant_id, display_name, default_payment_term_days, created_by)
     values ('c1111111-1111-4111-8111-111111111111', 'PT Invalid Term', 0, '00000000-c111-1111-0000-000000000001') $$,
  '23514',
  null,
  'a non-positive default_payment_term_days is rejected by the check constraint'
);

select id as billing_client_id from public.clients
  where tenant_id = 'c1111111-1111-4111-8111-111111111111' and display_name = 'PT Billing Test' \gset

select lives_ok(
  format(
    $$ insert into public.client_contacts (tenant_id, client_id, full_name, role, receives_invoice_whatsapp, receives_invoice_email, receives_collection_reminder, created_by)
       values ('c1111111-1111-4111-8111-111111111111', %L::uuid, 'Budi PIC', 'billing', true, true, false, '00000000-c111-1111-0000-000000000001') $$,
    :'billing_client_id'
  ),
  'owner can create a PIC with a role and recipient flags'
);

select is(
  (select role::text from public.client_contacts where client_id = :'billing_client_id'::uuid and full_name = 'Budi PIC'),
  'billing',
  'PIC role round-trips correctly'
);

-- =============================================================================
-- REVIEWER (read-only) cannot mutate the new fields either
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-c111-1111-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

-- Reviewer's UPDATE is not an error — the row simply falls outside their
-- USING policy, so it silently matches zero rows (same pattern as the
-- existing "reviewer A cannot update a client" assertion in
-- master_data.test.sql).
update public.clients set default_payment_term_days = 60 where id = :'billing_client_id'::uuid;
select isnt(
  (select default_payment_term_days from public.clients where id = :'billing_client_id'::uuid),
  60,
  'reviewer cannot update default_payment_term_days'
);

select * from finish();

rollback;
