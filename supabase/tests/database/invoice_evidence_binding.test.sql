-- ADOP Gate 4B — pgTAP proof for the Evidence & Signed Document Schema/
-- Storage Foundation: invoice binding/lifecycle, evidence version upload/
-- verification, private storage RLS, tenant isolation, role enforcement,
-- immutability, and audit-exact-once. Test IDs in comments (B-xx/L-xx/E-xx/
-- V-xx/A-xx/AU-xx) reference ADOP_GATE_4A_TEST_MATRIX_v1.0.md.
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
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'pgtap-invoice-evidence-tenant-i', 'PgTAP Invoice Evidence Tenant I', 'active'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'pgtap-invoice-evidence-tenant-j', 'PgTAP Invoice Evidence Tenant J', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-eeee-4444-0000-000000000001', 'authenticated', 'authenticated', 'owner-i@pgtap-invev.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-eeee-4444-0000-000000000002', 'authenticated', 'authenticated', 'admin-i@pgtap-invev.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-eeee-4444-0000-000000000003', 'authenticated', 'authenticated', 'reviewer-i@pgtap-invev.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-eeee-4444-0000-000000000004', 'authenticated', 'authenticated', 'viewer-i@pgtap-invev.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-ffff-4444-0000-000000000001', 'authenticated', 'authenticated', 'owner-j@pgtap-invev.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('e0000000-4444-0000-0000-000000000001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '00000000-eeee-4444-0000-000000000001', 'active'),
  ('e0000000-4444-0000-0000-000000000002', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '00000000-eeee-4444-0000-000000000002', 'active'),
  ('e0000000-4444-0000-0000-000000000003', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '00000000-eeee-4444-0000-000000000003', 'active'),
  ('e0000000-4444-0000-0000-000000000004', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '00000000-eeee-4444-0000-000000000004', 'active'),
  ('f0000000-4444-0000-0000-000000000001', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '00000000-ffff-4444-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('e0000000-4444-0000-0000-000000000001', 'owner'),
  ('e0000000-4444-0000-0000-000000000002', 'admin'),
  ('e0000000-4444-0000-0000-000000000003', 'reviewer'),
  ('e0000000-4444-0000-0000-000000000004', 'viewer'),
  ('f0000000-4444-0000-0000-000000000001', 'owner');

-- Anchor master-data rows, inserted as the unrestricted fixture-setup role.
insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('e0000000-0000-0000-0000-0000000000c1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'CL-I-ANCHOR', 'Anchor Client I', '00000000-eeee-4444-0000-000000000001'),
  ('f0000000-0000-0000-0000-0000000000c1', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'CL-J-ANCHOR', 'Anchor Client J', '00000000-ffff-4444-0000-000000000001');

insert into public.vessels (id, tenant_id, client_id, vessel_code, vessel_name, created_by) values
  ('e0000000-0000-0000-0000-0000000000a1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'e0000000-0000-0000-0000-0000000000c1', 'VS-I-ANCHOR', 'KM Anchor I', '00000000-eeee-4444-0000-000000000001'),
  ('f0000000-0000-0000-0000-0000000000a1', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'f0000000-0000-0000-0000-0000000000c1', 'VS-J-ANCHOR', 'KM Anchor J', '00000000-ffff-4444-0000-000000000001');

insert into public.service_types (id, tenant_id, code, name) values
  ('e0000000-0000-0000-0000-0000000000b1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'anchor-service', 'Anchor Service I'),
  ('f0000000-0000-0000-0000-0000000000b1', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'anchor-service', 'Anchor Service J');

insert into public.facility_locations (id, tenant_id, code, name) values
  ('e0000000-0000-0000-0000-0000000000f1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'FL-I-ANCHOR', 'Anchor Facility I'),
  ('f0000000-0000-0000-0000-0000000000f1', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'FL-J-ANCHOR', 'Anchor Facility J');

insert into public.expense_categories (id, tenant_id, code, name) values
  ('e0000000-0000-0000-0000-0000000000e1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'anchor-category', 'Anchor Category I'),
  ('f0000000-0000-0000-0000-0000000000e1', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'anchor-category', 'Anchor Category J');

-- vessel_projects: one project that will be closed below (billable), one
-- left active (not billable), and a tenant-J project that will also be
-- closed. All created `active` first — project_cost_ledger_entries' own
-- closed-project guard trigger (enforce_project_cost_ledger_project_
-- status) fires on ANY insert of an 'expense' row regardless of caller, so
-- the fixture expense rows below must be inserted before the project
-- transitions to closed (mirrors project_cost_ledger.test.sql's ordering).
insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, lifecycle_status, start_date, created_by) values
  ('e0000000-0000-0000-0000-0000000000a2', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'e0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000f1', 'IE-CL-PROJECT-TO-CLOSE', 'active', '2033-01-01', '00000000-eeee-4444-0000-000000000001'),
  ('e0000000-0000-0000-0000-0000000000a3', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'e0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000f1', 'IE-CL-PROJECT-ACTIVE', 'active', '2033-01-01', '00000000-eeee-4444-0000-000000000001');

insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, lifecycle_status, start_date, created_by) values
  ('f0000000-0000-0000-0000-0000000000a2', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'f0000000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-0000000000c1', 'f0000000-0000-0000-0000-0000000000b1', 'f0000000-0000-0000-0000-0000000000f1', 'IE-CL-PROJECT-J-TO-CLOSE', 'active', '2033-01-01', '00000000-ffff-4444-0000-000000000001');

insert into public.cash_pools (id, tenant_id, business_date, created_by) values
  ('e0000000-0000-0000-0000-0000000000d1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '2033-01-01', '00000000-eeee-4444-0000-000000000001'),
  ('f0000000-0000-0000-0000-0000000000d1', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '2033-01-01', '00000000-ffff-4444-0000-000000000001');

-- project_cost_ledger_entries fixtures: three bindable closed-project
-- expenses (I), one active-project expense (not billable), one reversed
-- closed-project expense, and one closed-project expense for tenant J.
insert into public.project_cost_ledger_entries (id, tenant_id, pool_id, project_id, category_id, entry_kind, amount, description) values
  ('e1000000-0000-0000-0000-000000000001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'e0000000-0000-0000-0000-0000000000d1', 'e0000000-0000-0000-0000-0000000000a2', 'e0000000-0000-0000-0000-0000000000e1', 'expense', 500000.00, 'bindable expense 1'),
  ('e1000000-0000-0000-0000-000000000002', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'e0000000-0000-0000-0000-0000000000d1', 'e0000000-0000-0000-0000-0000000000a2', 'e0000000-0000-0000-0000-0000000000e1', 'expense', 300000.00, 'bindable expense 2'),
  ('e1000000-0000-0000-0000-000000000003', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'e0000000-0000-0000-0000-0000000000d1', 'e0000000-0000-0000-0000-0000000000a2', 'e0000000-0000-0000-0000-0000000000e1', 'expense', 150000.00, 'bindable expense 3'),
  ('e1000000-0000-0000-0000-000000000004', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'e0000000-0000-0000-0000-0000000000d1', 'e0000000-0000-0000-0000-0000000000a3', 'e0000000-0000-0000-0000-0000000000e1', 'expense', 100000.00, 'not-closed-project expense'),
  ('e1000000-0000-0000-0000-000000000005', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'e0000000-0000-0000-0000-0000000000d1', 'e0000000-0000-0000-0000-0000000000a2', 'e0000000-0000-0000-0000-0000000000e1', 'expense', 200000.00, 'to-be-reversed expense');

insert into public.project_cost_ledger_entries (id, tenant_id, pool_id, project_id, category_id, entry_kind, amount, description, reverses_entry_id) values
  ('e1000000-0000-0000-0000-000000000006', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'e0000000-0000-0000-0000-0000000000d1', 'e0000000-0000-0000-0000-0000000000a2', 'e0000000-0000-0000-0000-0000000000e1', 'reversal', 200000.00, 'reversal of e1...005', 'e1000000-0000-0000-0000-000000000005');

insert into public.project_cost_ledger_entries (id, tenant_id, pool_id, project_id, category_id, entry_kind, amount, description) values
  ('f1000000-0000-0000-0000-000000000001', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'f0000000-0000-0000-0000-0000000000d1', 'f0000000-0000-0000-0000-0000000000a2', 'f0000000-0000-0000-0000-0000000000e1', 'expense', 400000.00, 'tenant J bindable expense');

-- All fixture expense rows are recorded — now close the two projects that
-- must be `closed` for the bind tests below (project e...a3 stays active).
select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.transition_vessel_project_lifecycle('e0000000-0000-0000-0000-0000000000a2', 'ready_to_close', null);
select public.transition_vessel_project_lifecycle('e0000000-0000-0000-0000-0000000000a2', 'closed', null);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.transition_vessel_project_lifecycle('f0000000-0000-0000-0000-0000000000a2', 'ready_to_close', null);
select public.transition_vessel_project_lifecycle('f0000000-0000-0000-0000-0000000000a2', 'closed', null);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- SCHEMA
-- =============================================================================

select has_table('public', 'invoices', 'public.invoices exists');
select has_table('public', 'invoice_transaction_lines', 'public.invoice_transaction_lines exists');
select has_table('public', 'invoice_evidence', 'public.invoice_evidence exists');
select has_table('public', 'invoice_evidence_versions', 'public.invoice_evidence_versions exists');

select has_type('public', 'invoice_status', 'invoice_status enum exists');
select ok(
  (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.invoice_status'::regtype)
    = array['draft', 'issued', 'void'],
  'invoice_status is exactly draft/issued/void'
);
select has_type('public', 'invoice_evidence_version_status', 'invoice_evidence_version_status enum exists');

select col_is_pk('public', 'invoices', 'id', 'invoices PK is id');
select col_is_pk('public', 'invoice_evidence_versions', 'id', 'invoice_evidence_versions PK is id');

select ok((select relrowsecurity from pg_class where oid = 'public.invoices'::regclass), 'RLS enabled on invoices');
select ok((select relrowsecurity from pg_class where oid = 'public.invoice_transaction_lines'::regclass), 'RLS enabled on invoice_transaction_lines');
select ok((select relrowsecurity from pg_class where oid = 'public.invoice_evidence'::regclass), 'RLS enabled on invoice_evidence');
select ok((select relrowsecurity from pg_class where oid = 'public.invoice_evidence_versions'::regclass), 'RLS enabled on invoice_evidence_versions');

select ok(not has_table_privilege('authenticated', 'public.invoices', 'INSERT'), 'authenticated has no INSERT grant on invoices');
select ok(not has_table_privilege('authenticated', 'public.invoices', 'UPDATE'), 'authenticated has no UPDATE grant on invoices');
select ok(not has_table_privilege('authenticated', 'public.invoices', 'DELETE'), 'authenticated has no DELETE grant on invoices');
select ok(not has_table_privilege('authenticated', 'public.invoice_transaction_lines', 'INSERT'), 'authenticated has no INSERT grant on invoice_transaction_lines');
select ok(not has_table_privilege('authenticated', 'public.invoice_evidence', 'INSERT'), 'authenticated has no INSERT grant on invoice_evidence');
select ok(not has_table_privilege('authenticated', 'public.invoice_evidence_versions', 'UPDATE'), 'authenticated has no UPDATE grant on invoice_evidence_versions');

select ok(not has_function_privilege('anon', 'public.create_draft_invoice(uuid)', 'EXECUTE'), 'anon cannot execute create_draft_invoice');
select ok(not has_function_privilege('anon', 'public.finalize_invoice_evidence_version(uuid, text, text, bigint, text)', 'EXECUTE'), 'anon cannot execute finalize_invoice_evidence_version');
select ok(has_function_privilege('authenticated', 'public.create_draft_invoice(uuid)', 'EXECUTE'), 'authenticated can execute create_draft_invoice');
select ok(has_function_privilege('authenticated', 'public.bind_invoice_transaction(uuid, uuid)', 'EXECUTE'), 'authenticated can execute bind_invoice_transaction');

-- =============================================================================
-- INVOICE CREATE — owner/admin only, tenant re-derived from p_tenant_id
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.create_draft_invoice('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') $$,
  'not authorized to create invoice',
  'reviewer I cannot create a draft invoice'
);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000004', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.create_draft_invoice('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') $$,
  'not authorized to create invoice',
  'viewer I cannot create a draft invoice'
);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.create_draft_invoice('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') $$,
  'not authorized to create invoice',
  'owner J cannot create a draft invoice for tenant I'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.create_draft_invoice('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') $$,
  'owner I can create a draft invoice (invoice 1)'
);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.create_draft_invoice('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') $$,
  'admin I can create a second draft invoice (invoice 2)'
);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.create_draft_invoice('ffffffff-ffff-ffff-ffff-ffffffffffff') $$,
  'owner J can create their own draft invoice (invoice J1)'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_invev_invoice_1 as
  select id from public.invoices where tenant_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and created_by = '00000000-eeee-4444-0000-000000000001';
create temporary table pgtap_invev_invoice_2 as
  select id from public.invoices where tenant_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and created_by = '00000000-eeee-4444-0000-000000000002';
create temporary table pgtap_invev_invoice_j1 as
  select id from public.invoices where tenant_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
grant select on pgtap_invev_invoice_1, pgtap_invev_invoice_2, pgtap_invev_invoice_j1 to authenticated;

-- =============================================================================
-- BIND — Test Matrix B-01..B-08
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000002', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.bind_invoice_transaction((select id from pgtap_invev_invoice_1), 'e1000000-0000-0000-0000-000000000001') $$,
  'B-01: admin I binds a closed-project expense to draft invoice 1'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.bind_invoice_transaction((select id from pgtap_invev_invoice_1), 'e1000000-0000-0000-0000-000000000002') $$,
  'not authorized to bind invoice transaction',
  'B-06: reviewer I cannot bind an invoice transaction'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.bind_invoice_transaction((select id from pgtap_invev_invoice_1), 'f1000000-0000-0000-0000-000000000001') $$,
  'not authorized to bind invoice transaction',
  'B-03: owner J cannot bind against tenant I''s invoice (cross-tenant)'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.bind_invoice_transaction((select id from pgtap_invev_invoice_1), 'e1000000-0000-0000-0000-000000000004') $$,
  'vessel project must be closed before billing its transactions',
  'B-02: binding a not-closed-project transaction is rejected'
);
select throws_ok(
  $$ select public.bind_invoice_transaction((select id from pgtap_invev_invoice_1), 'e1000000-0000-0000-0000-000000000005') $$,
  'transaction entry has been reversed and cannot be billed',
  'a reversed transaction entry cannot be billed'
);

select lives_ok(
  $$ select public.bind_invoice_transaction((select id from pgtap_invev_invoice_1), 'e1000000-0000-0000-0000-000000000002') $$,
  'admin I binds a second transaction to invoice 1'
);

select throws_ok(
  $$ select public.bind_invoice_transaction((select id from pgtap_invev_invoice_2), 'e1000000-0000-0000-0000-000000000001') $$,
  'transaction entry is already bound to an active invoice',
  'B-04: the same transaction cannot be bound to a second active invoice'
);

-- Structural, role-independent duplicate-active-invoice guard: a raw
-- INSERT bypassing the RPC entirely is rejected identically.
reset role;
select throws_ok(
  format(
    $$ insert into public.invoice_transaction_lines (tenant_id, invoice_id, transaction_entry_id, project_id, amount, description)
       values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', %L, 'e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-0000000000a2', 500000.00, 'raw insert duplicate') $$,
    (select id from pgtap_invev_invoice_2)
  ),
  'transaction entry is already bound to an active invoice',
  'B-04: a raw INSERT duplicate-active-invoice bind is rejected regardless of caller'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  format($$ select public.unbind_invoice_transaction(
    (select l.id from public.invoice_transaction_lines l where l.invoice_id = %L and l.transaction_entry_id = 'e1000000-0000-0000-0000-000000000002')
  ) $$, (select id from pgtap_invev_invoice_1)),
  'not authorized to unbind invoice transaction',
  'reviewer I cannot unbind an invoice transaction'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- ISSUE — Test Matrix L-01..L-09
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.issue_invoice((select id from pgtap_invev_invoice_2)) $$,
  'invoice must have at least one bound transaction before issuance',
  'an empty draft invoice cannot be issued'
);

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.bind_invoice_transaction((select id from pgtap_invev_invoice_2), 'e1000000-0000-0000-0000-000000000003') $$,
  'admin I binds a transaction to invoice 2 (used later for reissue)'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.issue_invoice((select id from pgtap_invev_invoice_1)) $$,
  'not authorized to issue invoice',
  'reviewer I cannot issue an invoice'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.issue_invoice((select id from pgtap_invev_invoice_1)) $$,
  'L-01: owner I issues invoice 1'
);
select results_eq(
  format($$ select status from public.invoices where id = %L $$, (select id from pgtap_invev_invoice_1)),
  $$ values ('issued'::public.invoice_status) $$,
  'invoice 1 status is now issued'
);
select throws_ok(
  $$ select public.issue_invoice((select id from pgtap_invev_invoice_1)) $$,
  'only a draft invoice can be issued',
  'L-09: re-issuing an already-issued invoice is rejected (replay-safe)'
);

select throws_ok(
  $$ select public.bind_invoice_transaction((select id from pgtap_invev_invoice_1), 'e1000000-0000-0000-0000-000000000003') $$,
  'invoice is not draft; binding is locked',
  'L-03: binding is locked once the invoice is issued'
);
select throws_ok(
  format($$ select public.unbind_invoice_transaction(
    (select l.id from public.invoice_transaction_lines l where l.invoice_id = %L limit 1)
  ) $$, (select id from pgtap_invev_invoice_1)),
  'invoice is not draft; binding is locked',
  'unbinding is locked once the invoice is issued'
);

reset role;
-- Structural bypass: raw insert/delete/update against a locked (issued)
-- invoice's lines are rejected regardless of caller.
select throws_ok(
  format(
    $$ insert into public.invoice_transaction_lines (tenant_id, invoice_id, transaction_entry_id, project_id, amount, description)
       values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', %L, 'e1000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-0000000000a2', 150000.00, 'raw insert on issued invoice') $$,
    (select id from pgtap_invev_invoice_1)
  ),
  'invoice binding is locked outside draft status',
  'L-03: a raw INSERT against an issued invoice''s lines is rejected'
);
select throws_ok(
  format(
    $$ delete from public.invoice_transaction_lines where invoice_id = %L $$,
    (select id from pgtap_invev_invoice_1)
  ),
  'invoice binding is locked outside draft status',
  'L-04: a raw DELETE against an issued invoice''s lines is rejected'
);
select throws_ok(
  format(
    $$ update public.invoice_transaction_lines set amount = 1 where invoice_id = %L $$,
    (select id from pgtap_invev_invoice_1)
  ),
  'access_audit_events is append-only: UPDATE not allowed',
  'invoice_transaction_lines rows are never updated in place, regardless of caller'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- VOID + REISSUE — Test Matrix L-02/L-05/L-06/L-07, B-05
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.void_invoice((select id from pgtap_invev_invoice_2), 'reviewer coba void') $$,
  'not authorized to void invoice',
  'reviewer I cannot void an invoice'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.void_invoice((select id from pgtap_invev_invoice_2), '') $$,
  'void reason is required',
  'an empty void reason is rejected'
);
select lives_ok(
  $$ select public.void_invoice((select id from pgtap_invev_invoice_1), 'salah nominal, perlu koreksi') $$,
  'L-02: owner I voids the issued invoice 1'
);
select results_eq(
  format($$ select status from public.invoices where id = %L $$, (select id from pgtap_invev_invoice_1)),
  $$ values ('void'::public.invoice_status) $$,
  'invoice 1 status is now void'
);
select throws_ok(
  $$ select public.void_invoice((select id from pgtap_invev_invoice_1), 'coba void dua kali') $$,
  'invoice is already void',
  'voiding an already-void invoice is rejected (replay-safe)'
);

reset role;
select throws_ok(
  format($$ update public.invoices set status = 'draft' where id = %L $$, (select id from pgtap_invev_invoice_1)),
  format('invalid invoice status transition from void to draft'),
  'L-05: a raw UPDATE reopening a void invoice is rejected regardless of caller'
);
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.reissue_invoice((select id from pgtap_invev_invoice_1)) $$,
  'not authorized to reissue invoice',
  'L-07: owner J cannot reissue tenant I''s invoice'
);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.reissue_invoice((select id from pgtap_invev_invoice_1)) $$,
  'not authorized to reissue invoice',
  'reviewer I cannot reissue an invoice'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.reissue_invoice((select id from pgtap_invev_invoice_2)) $$,
  'predecessor invoice must be void before reissue',
  'reissuing a non-void (still draft) invoice is rejected'
);
select lives_ok(
  $$ select public.reissue_invoice((select id from pgtap_invev_invoice_1)) $$,
  'B-05: admin I reissues the void invoice 1'
);
select throws_ok(
  $$ select public.reissue_invoice((select id from pgtap_invev_invoice_1)) $$,
  'predecessor invoice has already been reissued',
  'the same void invoice cannot be reissued twice'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_invev_invoice_3 as
  select id from public.invoices where predecessor_invoice_id = (select id from pgtap_invev_invoice_1);
grant select on pgtap_invev_invoice_3 to authenticated;

select results_eq(
  $$ select count(*)::int from pgtap_invev_invoice_3 $$,
  $$ values (1) $$,
  'exactly one reissued invoice (invoice 3) references the void predecessor'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.bind_invoice_transaction((select id from pgtap_invev_invoice_3), 'e1000000-0000-0000-0000-000000000001') $$,
  'B-05: the transaction freed by voiding invoice 1 can be bound to reissued invoice 3'
);
select lives_ok(
  $$ select public.issue_invoice((select id from pgtap_invev_invoice_3)) $$,
  'admin I issues the reissued invoice 3'
);

-- Structural predecessor-integrity guard: a raw insert with a predecessor
-- that is not void, or belongs to a different tenant, is rejected
-- regardless of caller.
reset role;
select throws_ok(
  format(
    $$ insert into public.invoices (tenant_id, status, predecessor_invoice_id, created_by)
       values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'draft', %L, '00000000-eeee-4444-0000-000000000001') $$,
    (select id from pgtap_invev_invoice_2)
  ),
  'predecessor invoice must be void before reissue',
  'a raw insert with a non-void predecessor is rejected'
);
select throws_ok(
  format(
    $$ insert into public.invoices (tenant_id, status, predecessor_invoice_id, created_by)
       values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'draft', %L, '00000000-ffff-4444-0000-000000000001') $$,
    (select id from pgtap_invev_invoice_1)
  ),
  'predecessor invoice must belong to the same tenant',
  'a raw insert with a cross-tenant predecessor is rejected'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- EVIDENCE — Test Matrix E-01..E-10
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  format(
    $$ select public.finalize_invoice_evidence_version(%L, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/x/1-a.pdf', repeat('a', 64), 100, 'application/pdf') $$,
    (select id from pgtap_invev_invoice_3)
  ),
  'not authorized to upload invoice evidence',
  'reviewer I cannot upload invoice evidence'
);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  format(
    $$ select public.finalize_invoice_evidence_version(%L, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/x/1-a.pdf', repeat('a', 64), 100, 'application/pdf') $$,
    (select id from pgtap_invev_invoice_3)
  ),
  'not authorized to upload invoice evidence',
  'E-06: owner J cannot upload evidence for tenant I''s invoice'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  format(
    $$ select public.finalize_invoice_evidence_version(%L, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/x/1-a.pdf', repeat('a', 64), 100, 'application/pdf') $$,
    (select id from pgtap_invev_invoice_2)
  ),
  'evidence can only be uploaded for an issued invoice',
  'evidence cannot be uploaded for a draft invoice'
);
select throws_ok(
  format(
    $$ select public.finalize_invoice_evidence_version(%L, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/x/1-a.pdf', 'not-a-hash', 100, 'application/pdf') $$,
    (select id from pgtap_invev_invoice_3)
  ),
  'sha256 must be a 64-character lowercase hex digest',
  'an invalid sha256 is rejected'
);
select throws_ok(
  format(
    $$ select public.finalize_invoice_evidence_version(%L, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/x/1-a.pdf', repeat('a', 64), 0, 'application/pdf') $$,
    (select id from pgtap_invev_invoice_3)
  ),
  'size_bytes must be between 1 and 52428800',
  'a zero size_bytes is rejected'
);
select throws_ok(
  format(
    $$ select public.finalize_invoice_evidence_version(%L, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/x/1-a.pdf', repeat('a', 64), 60000000, 'application/pdf') $$,
    (select id from pgtap_invev_invoice_3)
  ),
  'size_bytes must be between 1 and 52428800',
  'a size_bytes over the 50MiB limit is rejected'
);
select throws_ok(
  format(
    $$ select public.finalize_invoice_evidence_version(%L, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/x/1-a.pdf', repeat('a', 64), 100, 'text/plain') $$,
    (select id from pgtap_invev_invoice_3)
  ),
  'unsupported mime type: text/plain',
  'an unsupported mime type is rejected'
);
select throws_ok(
  format(
    $$ select public.finalize_invoice_evidence_version(%L, 'wrong/prefix/1-a.pdf', repeat('a', 64), 100, 'application/pdf') $$,
    (select id from pgtap_invev_invoice_3)
  ),
  'storage_path does not match the expected tenant/invoice prefix',
  'a storage_path outside the tenant/invoice prefix is rejected'
);
select throws_ok(
  format(
    $$ select public.finalize_invoice_evidence_version(%L, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || %L || '/1-a.pdf', repeat('a', 64), 100, 'application/pdf') $$,
    (select id from pgtap_invev_invoice_3), (select id from pgtap_invev_invoice_3)
  ),
  'storage object not found for the given path — upload before finalizing',
  'finalizing before the object exists in storage is rejected'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Simulate the client having already uploaded to Storage (bypassing the
-- HTTP API here, as pgTAP only exercises the database layer) — fixture
-- insert into storage.objects as the unrestricted role.
select lives_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, metadata)
       values ('invoice-evidence', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || %L || '/1-aaaaaaaa.pdf',
               jsonb_build_object('size', 12345, 'mimetype', 'application/pdf')) $$,
    (select id from pgtap_invev_invoice_3)
  ),
  'fixture: simulate an uploaded object for invoice 3, version 1'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  format(
    $$ select public.finalize_invoice_evidence_version(%L, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || %L || '/1-aaaaaaaa.pdf', repeat('a', 64), 99999, 'application/pdf') $$,
    (select id from pgtap_invev_invoice_3), (select id from pgtap_invev_invoice_3)
  ),
  'declared size_bytes does not match the stored object metadata',
  'a size_bytes mismatch against the real stored object is rejected'
);
select throws_ok(
  format(
    $$ select public.finalize_invoice_evidence_version(%L, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || %L || '/1-aaaaaaaa.pdf', repeat('a', 64), 12345, 'image/png') $$,
    (select id from pgtap_invev_invoice_3), (select id from pgtap_invev_invoice_3)
  ),
  'declared mime_type does not match the stored object metadata',
  'a mime_type mismatch against the real stored object is rejected'
);

select lives_ok(
  format(
    $$ select public.finalize_invoice_evidence_version(%L, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || %L || '/1-aaaaaaaa.pdf', repeat('a', 64), 12345, 'application/pdf') $$,
    (select id from pgtap_invev_invoice_3), (select id from pgtap_invev_invoice_3)
  ),
  'E-01: owner I finalizes evidence version 1 for the issued invoice 3'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_invev_evidence as
  select e.id, e.current_version_id from public.invoice_evidence e
    where e.invoice_id = (select id from pgtap_invev_invoice_3);
grant select on pgtap_invev_evidence to authenticated;

create temporary table pgtap_invev_version_1 as
  select v.id from public.invoice_evidence_versions v
    where v.evidence_id = (select id from pgtap_invev_evidence) and v.version_number = 1;
grant select on pgtap_invev_version_1 to authenticated;

select results_eq(
  $$ select version_number, status from public.invoice_evidence_versions where id = (select id from pgtap_invev_version_1) $$,
  $$ values (1, 'pending'::public.invoice_evidence_version_status) $$,
  'version 1 is version_number 1 and starts pending'
);
select results_eq(
  $$ select current_version_id from pgtap_invev_evidence $$,
  $$ select id from pgtap_invev_version_1 $$,
  'the evidence parent''s current_version_id points at version 1'
);
select is(
  (select count(*)::int from public.access_audit_events where entity_id = (select id from pgtap_invev_version_1) and action = 'evidence.uploaded'),
  1,
  'AU-04: evidence.uploaded is recorded exactly once for version 1'
);
select is(
  (select count(*)::int from public.access_audit_events where entity_id = (select id from pgtap_invev_evidence) and action = 'evidence.version_superseded'),
  0,
  'no version_superseded event yet — there was no prior current version'
);

-- E-02/E-09: a second upload supersedes the current version, incrementing
-- version_number, without touching version 1's own row.
select lives_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, metadata)
       values ('invoice-evidence', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || %L || '/2-bbbbbbbb.pdf',
               jsonb_build_object('size', 5555, 'mimetype', 'application/pdf')) $$,
    (select id from pgtap_invev_invoice_3)
  ),
  'fixture: simulate an uploaded object for invoice 3, version 2'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select lives_ok(
  format(
    $$ select public.finalize_invoice_evidence_version(%L, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || %L || '/2-bbbbbbbb.pdf', repeat('b', 64), 5555, 'application/pdf') $$,
    (select id from pgtap_invev_invoice_3), (select id from pgtap_invev_invoice_3)
  ),
  'E-02: admin I uploads version 2, superseding version 1 as current'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_invev_version_2 as
  select v.id from public.invoice_evidence_versions v
    where v.evidence_id = (select id from pgtap_invev_evidence) and v.version_number = 2;
grant select on pgtap_invev_version_2 to authenticated;

select results_eq(
  $$ select current_version_id from public.invoice_evidence where id = (select id from pgtap_invev_evidence) $$,
  $$ select id from pgtap_invev_version_2 $$,
  'the evidence parent''s current_version_id now points at version 2'
);
select is(
  (select count(*)::int from public.invoice_evidence_versions where evidence_id = (select id from pgtap_invev_evidence)),
  2,
  'E-07: version 1 still exists alongside version 2 — nothing was deleted'
);
select results_eq(
  $$ select storage_path from public.invoice_evidence_versions where id = (select id from pgtap_invev_version_1) $$,
  $$ select 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || (select id::text from pgtap_invev_invoice_3) || '/1-aaaaaaaa.pdf' $$,
  'version 1''s own storage_path is untouched after being superseded'
);
select is(
  (select count(*)::int from public.access_audit_events where entity_id = (select id from pgtap_invev_evidence) and action = 'evidence.version_superseded'),
  1,
  'AU-05: evidence.version_superseded is recorded exactly once'
);

-- =============================================================================
-- VERIFY / REJECT — Test Matrix V-01..V-06
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.verify_invoice_evidence_version((select id from pgtap_invev_version_2)) $$,
  'not authorized to verify invoice evidence',
  'V-04: reviewer I cannot verify evidence'
);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.verify_invoice_evidence_version((select id from pgtap_invev_version_2)) $$,
  'not authorized to verify invoice evidence',
  'V-05: owner J cannot verify tenant I''s evidence'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.verify_invoice_evidence_version((select id from pgtap_invev_version_2)) $$,
  'V-01: owner I verifies version 2'
);
select throws_ok(
  $$ select public.verify_invoice_evidence_version((select id from pgtap_invev_version_2)) $$,
  'only a pending evidence version can be verified',
  're-verifying an already-decided version is rejected (replay-safe)'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.reject_invoice_evidence_version((select id from pgtap_invev_version_1), '') $$,
  'rejection reason is required',
  'an empty rejection reason is rejected'
);
select lives_ok(
  $$ select public.reject_invoice_evidence_version((select id from pgtap_invev_version_1), 'kualitas scan buruk, cap tidak terbaca') $$,
  'V-02: admin I rejects version 1 — it remains visible, not hidden'
);
select throws_ok(
  $$ select public.reject_invoice_evidence_version((select id from pgtap_invev_version_1), 'coba reject dua kali') $$,
  'only a pending evidence version can be rejected',
  're-rejecting an already-decided version is rejected'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- IMMUTABILITY — direct bypass, role-independent (F5/F6/F13)
-- =============================================================================

select lives_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, metadata)
       values ('invoice-evidence', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || %L || '/3-cccccccc.pdf',
               jsonb_build_object('size', 999, 'mimetype', 'application/pdf')) $$,
    (select id from pgtap_invev_invoice_3)
  ),
  'fixture: simulate an uploaded object for invoice 3, version 3'
);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  format(
    $$ select public.finalize_invoice_evidence_version(%L, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || %L || '/3-cccccccc.pdf', repeat('c', 64), 999, 'application/pdf') $$,
    (select id from pgtap_invev_invoice_3), (select id from pgtap_invev_invoice_3)
  ),
  'owner I uploads version 3 (still pending) for the immutability tests below'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_invev_version_3 as
  select v.id from public.invoice_evidence_versions v
    where v.evidence_id = (select id from pgtap_invev_evidence) and v.version_number = 3;

select throws_ok(
  format(
    $$ update public.invoice_evidence_versions
         set status = 'verified', verified_by = '00000000-eeee-4444-0000-000000000001', verified_at = now(),
             storage_path = 'tampered/path/x.pdf'
       where id = %L $$,
    (select id from pgtap_invev_version_3)
  ),
  'invoice evidence version core fields are immutable',
  'F5/F6: sneaking a storage_path change alongside a status decision is rejected'
);
select throws_ok(
  format($$ delete from public.invoice_evidence_versions where id = %L $$, (select id from pgtap_invev_version_1)),
  'invoice_evidence_versions is append-only: DELETE not allowed',
  'F13: an evidence version can never be hard-deleted'
);
select throws_ok(
  format($$ delete from public.invoice_evidence where id = %L $$, (select id from pgtap_invev_evidence)),
  'invoice_evidence is append-only: DELETE not allowed',
  'the evidence parent can never be hard-deleted'
);
select throws_ok(
  format(
    $$ update public.invoice_evidence set invoice_id = %L where id = %L $$,
    (select id from pgtap_invev_invoice_2), (select id from pgtap_invev_evidence)
  ),
  'invoice_evidence core fields are immutable; only current_version_id may change',
  'invoice_evidence.invoice_id cannot be changed after creation'
);
select lives_ok(
  format(
    $$ update public.invoice_evidence set current_version_id = %L where id = %L $$,
    (select id from pgtap_invev_version_1), (select id from pgtap_invev_evidence)
  ),
  'current_version_id remains the one mutable field on invoice_evidence'
);
-- Restore current_version_id to version 2 (the real current per the RPC
-- flow above) so later assertions are not confused by this direct probe.
update public.invoice_evidence set current_version_id = (select id from pgtap_invev_version_2) where id = (select id from pgtap_invev_evidence);

-- =============================================================================
-- CROSS-TENANT READ ISOLATION
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is_empty(
  $$ select id from public.invoices where tenant_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' $$,
  'owner J cannot read tenant I''s invoices'
);
select is_empty(
  $$ select id from public.invoice_transaction_lines where tenant_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' $$,
  'owner J cannot read tenant I''s invoice transaction lines'
);
select is_empty(
  $$ select id from public.invoice_evidence where tenant_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' $$,
  'owner J cannot read tenant I''s invoice evidence'
);
select is_empty(
  $$ select id from public.invoice_evidence_versions where tenant_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' $$,
  'owner J cannot read tenant I''s invoice evidence versions'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- reviewer/viewer are excluded from invoice/evidence reads entirely
-- (Gate 4A Contract §7 — narrower than the reviewer/viewer master-data
-- read pattern).
select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is_empty(
  $$ select id from public.invoices where tenant_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' $$,
  'reviewer I cannot read tenant I''s own invoices (owner/admin-only read)'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- STRUCTURAL NO-GRANT CHECKS — direct table mutation is impossible
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ insert into public.invoices (tenant_id, status, created_by) values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'draft', auth.uid()) $$,
  '42501',
  null,
  'owner I cannot INSERT directly on invoices — the RPC is the only write path'
);
select throws_ok(
  $$ update public.invoices set void_reason = 'x' where tenant_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' $$,
  '42501',
  null,
  'owner I cannot UPDATE invoices directly'
);
select throws_ok(
  $$ delete from public.invoices where tenant_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' $$,
  '42501',
  null,
  'owner I cannot DELETE invoices directly'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- STORAGE RLS — bucket privacy, path-scoped INSERT, registered-row SELECT
-- =============================================================================

select ok(
  (select public from storage.buckets where id = 'invoice-evidence') = false,
  'the invoice-evidence bucket is private'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, metadata)
       values ('invoice-evidence', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || %L || '/99-dddddddd.pdf', '{}'::jsonb) $$,
    (select id from pgtap_invev_invoice_3)
  ),
  'owner I can INSERT a storage object under their own tenant/issued-invoice path'
);
reset role;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, metadata)
       values ('invoice-evidence', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || %L || '/1-eeeeeeee.pdf', '{}'::jsonb) $$,
    (select id from pgtap_invev_invoice_2)
  ),
  '42501',
  null,
  'a storage object cannot be inserted under a draft (not-issued) invoice path'
);
reset role;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, metadata)
       values ('invoice-evidence', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || %L || '/1-ffffffff.pdf', '{}'::jsonb) $$,
    (select id from pgtap_invev_invoice_3)
  ),
  '42501',
  null,
  'reviewer I cannot INSERT a storage object even under a valid issued-invoice path'
);
reset role;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, metadata)
       values ('invoice-evidence', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || %L || '/1-11111111.pdf', '{}'::jsonb) $$,
    (select id from pgtap_invev_invoice_3)
  ),
  '42501',
  null,
  'F9: owner J cannot forge a path under tenant I''s id — cross-tenant path forgery is rejected'
);
reset role;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
-- No UPDATE (or ALL) policy exists on storage.objects for this bucket, so
-- with RLS enabled the UPDATE matches zero rows (silently, not an
-- exception) — the object's metadata is proven unchanged below.
select lives_ok(
  format(
    $$ update storage.objects set metadata = jsonb_build_object('tampered', true)
       where bucket_id = 'invoice-evidence' and name = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || %L || '/99-dddddddd.pdf' $$,
    (select id from pgtap_invev_invoice_3)
  ),
  'F5: an UPDATE with no matching RLS policy runs without error but touches zero rows'
);
reset role;
select results_eq(
  format(
    $$ select metadata from storage.objects
       where bucket_id = 'invoice-evidence' and name = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || %L || '/99-dddddddd.pdf' $$,
    (select id from pgtap_invev_invoice_3)
  ),
  $$ values ('{}'::jsonb) $$,
  'F5: no UPDATE policy exists — the object''s metadata is unchanged, proving the update touched zero rows'
);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  format(
    $$ delete from storage.objects
       where bucket_id = 'invoice-evidence' and name = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || %L || '/99-dddddddd.pdf' $$,
    (select id from pgtap_invev_invoice_3)
  ),
  null,
  'F5/F14: no DELETE policy exists — an uploaded object can never be removed by an authenticated user'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- SELECT visibility is gated through invoice_evidence_versions, not the
-- raw path — only a registered, owner/admin-visible row is readable.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(
  (select count(*)::int from storage.objects
     where bucket_id = 'invoice-evidence'
       and name = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || (select id::text from pgtap_invev_invoice_3) || '/2-bbbbbbbb.pdf'),
  1,
  'A-01: owner I can read the registered evidence object'
);
reset role;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(
  (select count(*)::int from storage.objects
     where bucket_id = 'invoice-evidence'
       and name = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || (select id::text from pgtap_invev_invoice_3) || '/2-bbbbbbbb.pdf'),
  0,
  'A-02: reviewer I cannot read the registered evidence object'
);
reset role;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(
  (select count(*)::int from storage.objects
     where bucket_id = 'invoice-evidence'
       and name = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || (select id::text from pgtap_invev_invoice_3) || '/2-bbbbbbbb.pdf'),
  0,
  'A-03: owner J cannot read tenant I''s registered evidence object'
);
select is(
  (select count(*)::int from storage.objects
     where bucket_id = 'invoice-evidence'
       and name = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/' || (select id::text from pgtap_invev_invoice_3) || '/99-dddddddd.pdf'),
  0,
  'an uploaded-but-never-finalized object is not readable by anyone via this policy'
);
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();

rollback;
