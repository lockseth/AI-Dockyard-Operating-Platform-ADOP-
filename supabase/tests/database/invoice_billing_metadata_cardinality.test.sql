-- ADOP Phase 2A — pgTAP proof for Billing Metadata & Invoice Cardinality
-- (20260725000000_billing_metadata_cardinality.sql,
-- 20260725010000_billing_completeness_unbilled_alert.sql). Test IDs in
-- comments reference
-- ADOP_PHASE_2A_BILLING_METADATA_UNBILLED_CONTROL_TEST_MATRIX_v1.0.md.
--
-- Builds invoice state through the RPCs (already proven correct by
-- invoice_evidence_binding.test.sql / invoice_evidence_read_model.test.sql)
-- rather than raw inserts — this file only tests the NEW Phase 2A surface:
-- cardinality, manual number registration, void-number non-reuse, billing
-- completeness, and tenant/role isolation of the new RPCs.
--
-- Self-contained: distinct tenant/user ids from every other pgTAP file in
-- this directory; rolls back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'pgtap-billing-metadata-tenant-m', 'PgTAP Billing Metadata Tenant M', 'active'),
  ('d7d7d7d7-d7d7-4d7d-8d7d-d7d7d7d7d7d7', 'pgtap-billing-metadata-tenant-n', 'PgTAP Billing Metadata Tenant N', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-c6c6-4444-0000-000000000001', 'authenticated', 'authenticated', 'owner-m@pgtap-billing.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-c6c6-4444-0000-000000000002', 'authenticated', 'authenticated', 'admin-m@pgtap-billing.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-c6c6-4444-0000-000000000003', 'authenticated', 'authenticated', 'reviewer-m@pgtap-billing.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-c6c6-4444-0000-000000000004', 'authenticated', 'authenticated', 'viewer-m@pgtap-billing.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-d7d7-4444-0000-000000000001', 'authenticated', 'authenticated', 'owner-n@pgtap-billing.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('c0000000-4444-0000-0000-000000000001', 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', '00000000-c6c6-4444-0000-000000000001', 'active'),
  ('c0000000-4444-0000-0000-000000000002', 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', '00000000-c6c6-4444-0000-000000000002', 'active'),
  ('c0000000-4444-0000-0000-000000000003', 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', '00000000-c6c6-4444-0000-000000000003', 'active'),
  ('c0000000-4444-0000-0000-000000000004', 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', '00000000-c6c6-4444-0000-000000000004', 'active'),
  ('d0000000-4444-0000-0000-000000000001', 'd7d7d7d7-d7d7-4d7d-8d7d-d7d7d7d7d7d7', '00000000-d7d7-4444-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('c0000000-4444-0000-0000-000000000001', 'owner'),
  ('c0000000-4444-0000-0000-000000000002', 'admin'),
  ('c0000000-4444-0000-0000-000000000003', 'reviewer'),
  ('c0000000-4444-0000-0000-000000000004', 'viewer'),
  ('d0000000-4444-0000-0000-000000000001', 'owner');

insert into public.legal_entities (id, tenant_id, display_name, status) values
  ('c0000000-0000-0000-0000-0000000000a9', 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'Anchor Legal Entity M1', 'active'),
  ('c0000000-0000-0000-0000-0000000000a8', 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'Anchor Legal Entity M2', 'active'),
  ('d0000000-0000-0000-0000-0000000000a9', 'd7d7d7d7-d7d7-4d7d-8d7d-d7d7d7d7d7d7', 'Anchor Legal Entity N', 'active');

insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('c0000000-0000-0000-0000-0000000000c1', 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'CL-M-ANCHOR', 'Anchor Client M', '00000000-c6c6-4444-0000-000000000001'),
  ('c0000000-0000-0000-0000-0000000000c2', 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'CL-M-WRONG', 'Wrong Client M (never the real project owner)', '00000000-c6c6-4444-0000-000000000001'),
  ('d0000000-0000-0000-0000-0000000000c1', 'd7d7d7d7-d7d7-4d7d-8d7d-d7d7d7d7d7d7', 'CL-N-ANCHOR', 'Anchor Client N', '00000000-d7d7-4444-0000-000000000001');

insert into public.vessels (id, tenant_id, client_id, vessel_code, vessel_name, created_by) values
  ('c0000000-0000-0000-0000-0000000000a4', 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'c0000000-0000-0000-0000-0000000000c1', 'VS-M-ANCHOR', 'KM Anchor M', '00000000-c6c6-4444-0000-000000000001'),
  ('d0000000-0000-0000-0000-0000000000a5', 'd7d7d7d7-d7d7-4d7d-8d7d-d7d7d7d7d7d7', 'd0000000-0000-0000-0000-0000000000c1', 'VS-N-ANCHOR', 'KM Anchor N', '00000000-d7d7-4444-0000-000000000001');

insert into public.service_types (id, tenant_id, code, name) values
  ('c0000000-0000-0000-0000-0000000000b1', 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'anchor-service', 'Anchor Service M'),
  ('d0000000-0000-0000-0000-0000000000b1', 'd7d7d7d7-d7d7-4d7d-8d7d-d7d7d7d7d7d7', 'anchor-service', 'Anchor Service N');

insert into public.facility_locations (id, tenant_id, code, name) values
  ('c0000000-0000-0000-0000-0000000000f1', 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'FL-M-ANCHOR', 'Anchor Facility M'),
  ('d0000000-0000-0000-0000-0000000000f1', 'd7d7d7d7-d7d7-4d7d-8d7d-d7d7d7d7d7d7', 'FL-N-ANCHOR', 'Anchor Facility N');

insert into public.expense_categories (id, tenant_id, code, name) values
  ('c0000000-0000-0000-0000-0000000000e1', 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'anchor-category', 'Anchor Category M'),
  ('d0000000-0000-0000-0000-0000000000e1', 'd7d7d7d7-d7d7-4d7d-8d7d-d7d7d7d7d7d7', 'anchor-category', 'Anchor Category N');

-- Two closed projects in tenant M (for cardinality tests) and one closed
-- project in tenant N (for tenant-isolation tests).
insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, lifecycle_status, start_date, created_by) values
  ('c0000000-0000-0000-0000-0000000000a2', 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'c0000000-0000-0000-0000-0000000000a4', 'c0000000-0000-0000-0000-0000000000c1', 'c0000000-0000-0000-0000-0000000000b1', 'c0000000-0000-0000-0000-0000000000f1', 'BM-PROJECT-1', 'active', '2033-01-01', '00000000-c6c6-4444-0000-000000000001'),
  ('c0000000-0000-0000-0000-0000000000a3', 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'c0000000-0000-0000-0000-0000000000a4', 'c0000000-0000-0000-0000-0000000000c1', 'c0000000-0000-0000-0000-0000000000b1', 'c0000000-0000-0000-0000-0000000000f1', 'BM-PROJECT-2', 'active', '2033-01-01', '00000000-c6c6-4444-0000-000000000001');

insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, lifecycle_status, start_date, created_by) values
  ('d0000000-0000-0000-0000-0000000000a2', 'd7d7d7d7-d7d7-4d7d-8d7d-d7d7d7d7d7d7', 'd0000000-0000-0000-0000-0000000000a5', 'd0000000-0000-0000-0000-0000000000c1', 'd0000000-0000-0000-0000-0000000000b1', 'd0000000-0000-0000-0000-0000000000f1', 'BM-PROJECT-N', 'active', '2033-01-01', '00000000-d7d7-4444-0000-000000000001');

insert into public.cash_pools (id, tenant_id, business_date, created_by) values
  ('c0000000-0000-0000-0000-0000000000d1', 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', '2033-01-01', '00000000-c6c6-4444-0000-000000000001'),
  ('d0000000-0000-0000-0000-0000000000d1', 'd7d7d7d7-d7d7-4d7d-8d7d-d7d7d7d7d7d7', '2033-01-01', '00000000-d7d7-4444-0000-000000000001');

insert into public.project_cost_ledger_entries (id, tenant_id, pool_id, project_id, category_id, entry_kind, amount, description) values
  ('c1000000-0000-0000-0000-000000000001', 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'c0000000-0000-0000-0000-0000000000d1', 'c0000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-0000000000e1', 'expense', 500000.00, 'bm bindable expense p1-1'),
  ('c1000000-0000-0000-0000-000000000002', 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'c0000000-0000-0000-0000-0000000000d1', 'c0000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-0000000000e1', 'expense', 300000.00, 'bm bindable expense p1-2'),
  ('c1000000-0000-0000-0000-000000000003', 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'c0000000-0000-0000-0000-0000000000d1', 'c0000000-0000-0000-0000-0000000000a3', 'c0000000-0000-0000-0000-0000000000e1', 'expense', 200000.00, 'bm bindable expense p2-1');

insert into public.project_cost_ledger_entries (id, tenant_id, pool_id, project_id, category_id, entry_kind, amount, description) values
  ('d1000000-0000-0000-0000-000000000001', 'd7d7d7d7-d7d7-4d7d-8d7d-d7d7d7d7d7d7', 'd0000000-0000-0000-0000-0000000000d1', 'd0000000-0000-0000-0000-0000000000a2', 'd0000000-0000-0000-0000-0000000000e1', 'expense', 400000.00, 'bm bindable expense n-1');

select set_config('request.jwt.claims', json_build_object('sub', '00000000-c6c6-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.transition_vessel_project_lifecycle('c0000000-0000-0000-0000-0000000000a2', 'ready_to_close', null);
select public.transition_vessel_project_lifecycle('c0000000-0000-0000-0000-0000000000a2', 'closed', null);
select public.transition_vessel_project_lifecycle('c0000000-0000-0000-0000-0000000000a3', 'ready_to_close', null);
select public.transition_vessel_project_lifecycle('c0000000-0000-0000-0000-0000000000a3', 'closed', null);
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-d7d7-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.transition_vessel_project_lifecycle('d0000000-0000-0000-0000-0000000000a2', 'ready_to_close', null);
select public.transition_vessel_project_lifecycle('d0000000-0000-0000-0000-0000000000a2', 'closed', null);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- CARDINALITY — K-01, K-06
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-c6c6-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.create_draft_invoice('c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', null) $$,
  'project_id is required to create a billing record',
  'K-06: create_draft_invoice without an explicit project_id is rejected'
);
select throws_ok(
  $$ select public.create_draft_invoice('c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'd0000000-0000-0000-0000-0000000000a2') $$,
  'project belongs to a different tenant',
  'create_draft_invoice with a cross-tenant project_id is rejected'
);

select lives_ok(
  $$ select public.create_draft_invoice('c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'c0000000-0000-0000-0000-0000000000a2') $$,
  'K-01: owner M creates invoice 1 locked to project 1 (positive control)'
);

-- Captured immediately after creation (before invoice 2 exists) — every
-- row in this transaction shares the same now()/created_at, so ordering by
-- created_at cannot distinguish them; capture-then-exclude does.
create temporary table pgtap_bm_invoice_1 as
  select id from public.invoices where tenant_id = 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6' and project_id = 'c0000000-0000-0000-0000-0000000000a2';
grant select on pgtap_bm_invoice_1 to authenticated;

select lives_ok(
  $$ select public.create_draft_invoice('c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'c0000000-0000-0000-0000-0000000000a2') $$,
  'owner M creates invoice 2 (also locked to project 1 — used for DRAFT_INCOMPLETE below)'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_bm_invoice_2 as
  select id from public.invoices where tenant_id = 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6' and project_id = 'c0000000-0000-0000-0000-0000000000a2'
    and id <> (select id from pgtap_bm_invoice_1);
grant select on pgtap_bm_invoice_2 to authenticated;

select ok(
  (select id from pgtap_bm_invoice_1) <> (select id from pgtap_bm_invoice_2),
  'invoice 1 and invoice 2 are distinct rows'
);

-- project_id/client_id are immutable once set (Contract §5.1/§10.1) —
-- structural, role-independent.
reset role;
select throws_ok(
  format(
    $$ update public.invoices set project_id = 'c0000000-0000-0000-0000-0000000000a3' where id = %L $$,
    (select id from pgtap_bm_invoice_1)
  ),
  'invoice project_id is immutable once set',
  'a raw UPDATE changing project_id after creation is rejected regardless of caller'
);

-- Structural cardinality guards found missing during the Phase 2A closeout
-- audit (§5.1/§8.2) — a raw INSERT bypassing every RPC must not be able to
-- create an invoice whose client_id disagrees with its own project_id, nor
-- a coverage line whose project_id disagrees with its invoice's locked
-- project_id.
select throws_ok(
  format(
    $$ insert into public.invoices (tenant_id, status, project_id, client_id, created_by)
       values ('c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'draft', 'c0000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-0000000000c2', null) $$
  ),
  'invoice client_id must match its project''s client_id',
  'a raw INSERT setting client_id inconsistent with project_id''s real client is rejected regardless of caller'
);
select throws_ok(
  format(
    $$ insert into public.invoice_transaction_lines (tenant_id, invoice_id, transaction_entry_id, project_id, amount, description)
       values ('c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', %L, 'c1000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-0000000000a3', 100000, 'raw insert mismatched project line') $$,
    (select id from pgtap_bm_invoice_1)
  ),
  'invoice_transaction_lines.project_id must match its invoice''s locked project_id',
  'a raw INSERT binding a line whose project_id disagrees with its invoice''s locked project_id is rejected regardless of caller'
);

select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- ROLE MATRIX — R-01..R-05
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-c6c6-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  format($$ select public.update_invoice_billing_metadata(%L, 'c0000000-0000-0000-0000-0000000000a9', '2033-01-05', '2033-02-05') $$, (select id from pgtap_bm_invoice_1)),
  'not authorized to update invoice billing metadata',
  'R-01: reviewer M cannot update billing metadata'
);
select throws_ok(
  format($$ select public.register_invoice_number(%L, 'INV-M-0001') $$, (select id from pgtap_bm_invoice_1)),
  'not authorized to register invoice number',
  'R-01: reviewer M cannot register invoice number'
);
select throws_ok(
  $$ select public.list_unbilled_vessel_projects('c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6') $$,
  'not authorized to view unbilled vessel projects',
  'R-03: reviewer M cannot read the Unbilled Vessel Alert'
);
select throws_ok(
  $$ select public.register_legacy_invoice(
       'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'c0000000-0000-0000-0000-0000000000a9', 'c0000000-0000-0000-0000-0000000000a2',
       'INV-LEGACY-R', '2030-01-01', '2030-02-01', 'issued', 'full', null, null
     ) $$,
  'not authorized to register legacy invoice',
  'R-04: reviewer M cannot register a legacy invoice'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-c6c6-4444-0000-000000000004', 'role', 'authenticated')::text, true);
select throws_ok(
  format($$ select public.update_invoice_billing_metadata(%L, 'c0000000-0000-0000-0000-0000000000a9', '2033-01-05', '2033-02-05') $$, (select id from pgtap_bm_invoice_1)),
  'not authorized to update invoice billing metadata',
  'R-01: viewer M cannot update billing metadata'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-d7d7-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  format($$ select public.update_invoice_billing_metadata(%L, 'c0000000-0000-0000-0000-0000000000a9', '2033-01-05', '2033-02-05') $$, (select id from pgtap_bm_invoice_1)),
  'not authorized to update invoice billing metadata',
  'T-01: owner N cannot update tenant M''s invoice billing metadata (cross-tenant)'
);
select throws_ok(
  $$ select public.list_unbilled_vessel_projects('c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6') $$,
  'not authorized to view unbilled vessel projects',
  'T-04: owner N cannot read tenant M''s Unbilled Vessel Alert'
);
select throws_ok(
  $$ select public.register_legacy_invoice(
       'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'c0000000-0000-0000-0000-0000000000a9', 'c0000000-0000-0000-0000-0000000000a2',
       'INV-LEGACY-T01', '2030-01-01', '2030-02-01', 'issued', 'full', null, null
     ) $$,
  'not authorized to register legacy invoice',
  'T-01: owner N cannot register a legacy invoice for tenant M'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- MANUAL NUMBER REGISTRATION — REG-01..REG-03, N-01..N-05, VR-01
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-c6c6-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  format(
    $$ select public.update_invoice_billing_metadata(%L, 'c0000000-0000-0000-0000-0000000000a9', '2033-01-05', '2033-02-05') $$,
    (select id from pgtap_bm_invoice_1)
  ),
  'owner M sets billing metadata (legal entity, dates) on invoice 1'
);

select is(
  (select count(*)::int from public.access_audit_events where entity_id = (select id from pgtap_bm_invoice_1) and action = 'invoice.metadata_updated'),
  1,
  'G-01: invoice.metadata_updated audit event recorded exactly once'
);
select is(
  (select count(*)::int from public.access_audit_events where entity_id = (select id from pgtap_bm_invoice_1) and action = 'invoice.project_locked'),
  1,
  'G-05: invoice.project_locked audit event recorded at creation'
);

select lives_ok(
  format($$ select public.bind_invoice_transaction(%L, 'c1000000-0000-0000-0000-000000000001') $$, (select id from pgtap_bm_invoice_1)),
  'owner M binds a transaction to invoice 1'
);

-- invoice 1: draft, metadata set, coverage present, but no invoice_number
-- yet — DRAFT_INCOMPLETE.
select results_eq(
  format($$ select billing_completeness_status from public.get_invoice_summary(%L) $$, (select id from pgtap_bm_invoice_1)),
  $$ values ('DRAFT_INCOMPLETE'::public.invoice_billing_completeness_status) $$,
  'invoice 1 without a registered number is DRAFT_INCOMPLETE'
);

-- invoice 2: draft, no metadata, no coverage at all — also DRAFT_INCOMPLETE.
select results_eq(
  format($$ select billing_completeness_status from public.get_invoice_summary(%L) $$, (select id from pgtap_bm_invoice_2)),
  $$ values ('DRAFT_INCOMPLETE'::public.invoice_billing_completeness_status) $$,
  'invoice 2 (no metadata, no coverage) is DRAFT_INCOMPLETE'
);

select throws_ok(
  format($$ select public.finalize_invoice_evidence_version(%L, 'x/y/1.pdf', repeat('a', 64), 100, 'application/pdf') $$, (select id from pgtap_bm_invoice_1)),
  'evidence can only be uploaded for an issued invoice',
  'evidence cannot be uploaded before an invoice is issued (invoice_number or not)'
);
select throws_ok(
  format($$ select public.issue_invoice(%L) $$, (select id from pgtap_bm_invoice_1)),
  'invoice_number must be registered before issuance',
  'REG-01 (structural): an invoice cannot be issued without a registered number — evidence can therefore never be uploaded without one either'
);

select lives_ok(
  format($$ select public.register_invoice_number(%L, ' INV-M-0001 ') $$, (select id from pgtap_bm_invoice_1)),
  'owner M registers invoice number for invoice 1 (with surrounding whitespace)'
);
select results_eq(
  format($$ select invoice_number from public.invoices where id = %L $$, (select id from pgtap_bm_invoice_1)),
  $$ values ('INV-M-0001'::text) $$,
  'the registered number is normalized (trimmed)'
);
select is(
  (select count(*)::int from public.access_audit_events where entity_id = (select id from pgtap_bm_invoice_1) and action = 'invoice.number_registered'),
  1,
  'G-04: invoice.number_registered is a distinct audit action from invoice.metadata_updated'
);

-- invoice 1 now has metadata + number + coverage — DRAFT_READY_TO_ISSUE.
select results_eq(
  format($$ select billing_completeness_status from public.get_invoice_summary(%L) $$, (select id from pgtap_bm_invoice_1)),
  $$ values ('DRAFT_READY_TO_ISSUE'::public.invoice_billing_completeness_status) $$,
  'H-02: invoice 1 with complete metadata + coverage is DRAFT_READY_TO_ISSUE'
);

-- N-01: the same number cannot be registered twice within the same legal
-- entity, even on a different invoice.
select lives_ok(
  format(
    $$ select public.update_invoice_billing_metadata(%L, 'c0000000-0000-0000-0000-0000000000a9', '2033-01-07', '2033-02-07') $$,
    (select id from pgtap_bm_invoice_2)
  ),
  'owner M sets invoice 2''s legal entity to the SAME legal entity as invoice 1 (for the N-01 duplicate check)'
);
select throws_ok(
  format($$ select public.register_invoice_number(%L, 'INV-M-0001') $$, (select id from pgtap_bm_invoice_2)),
  '23505',
  null,
  'N-01: registering a duplicate invoice_number within the same legal entity is rejected'
);

select lives_ok(
  format($$ select public.issue_invoice(%L) $$, (select id from pgtap_bm_invoice_1)),
  'owner M issues invoice 1'
);

-- REG-03: the number is now frozen — even a metadata "edit" attempt via the
-- RPC is rejected outright because the invoice is no longer draft.
select throws_ok(
  format($$ select public.register_invoice_number(%L, 'INV-M-9999') $$, (select id from pgtap_bm_invoice_1)),
  'invoice number can only be registered while draft',
  'REG-03: invoice_number cannot be re-registered once issued'
);
select throws_ok(
  format($$ select public.update_invoice_billing_metadata(%L, 'c0000000-0000-0000-0000-0000000000a8', '2033-03-01', '2033-04-01') $$, (select id from pgtap_bm_invoice_1)),
  'invoice billing metadata is locked outside draft status',
  'billing metadata cannot be edited once issued'
);

-- issued, no evidence yet.
select results_eq(
  format($$ select billing_completeness_status from public.get_invoice_summary(%L) $$, (select id from pgtap_bm_invoice_1)),
  $$ values ('ISSUED_EVIDENCE_PENDING'::public.invoice_billing_completeness_status) $$,
  'H-03 setup: issued invoice with no evidence is ISSUED_EVIDENCE_PENDING'
);

-- Upload + verify evidence -> READY_TO_SEND.
select lives_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, metadata)
       values ('invoice-evidence', 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6/' || %L || '/1-bm.pdf',
               jsonb_build_object('size', 111, 'mimetype', 'application/pdf')) $$,
    (select id from pgtap_bm_invoice_1)
  ),
  'fixture: simulate an uploaded evidence object for invoice 1'
);
select lives_ok(
  format(
    $$ select public.finalize_invoice_evidence_version(%L, 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6/' || %L || '/1-bm.pdf', repeat('a', 64), 111, 'application/pdf') $$,
    (select id from pgtap_bm_invoice_1), (select id from pgtap_bm_invoice_1)
  ),
  'owner M finalizes evidence version 1 for invoice 1'
);
create temporary table pgtap_bm_version_1 as
  select v.id from public.invoice_evidence_versions v
  join public.invoice_evidence e on e.id = v.evidence_id
  where e.invoice_id = (select id from pgtap_bm_invoice_1) and v.version_number = 1;
grant select on pgtap_bm_version_1 to authenticated;
select lives_ok(
  $$ select public.verify_invoice_evidence_version((select id from pgtap_bm_version_1)) $$,
  'owner M verifies evidence version 1'
);
select results_eq(
  format($$ select billing_completeness_status from public.get_invoice_summary(%L) $$, (select id from pgtap_bm_invoice_1)),
  $$ values ('READY_TO_SEND'::public.invoice_billing_completeness_status) $$,
  'H-03: issued invoice with verified current evidence is READY_TO_SEND'
);

-- VR-01/N-02: void invoice 1, then prove its number can never be reused —
-- neither on invoice 2 nor on a brand-new draft.
select lives_ok(
  format($$ select public.void_invoice(%L, 'koreksi nominal') $$, (select id from pgtap_bm_invoice_1)),
  'owner M voids invoice 1'
);
select results_eq(
  format($$ select billing_completeness_status from public.get_invoice_summary(%L) $$, (select id from pgtap_bm_invoice_1)),
  $$ values ('VOID'::public.invoice_billing_completeness_status) $$,
  'O-01: a void invoice is always classified VOID, never READY_TO_SEND'
);
select throws_ok(
  format($$ select public.register_invoice_number(%L, 'INV-M-0001') $$, (select id from pgtap_bm_invoice_2)),
  '23505',
  null,
  'N-02/VR-01: a number used by a now-void invoice cannot be reused by another draft'
);

select lives_ok(
  $$ select public.create_draft_invoice('c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'c0000000-0000-0000-0000-0000000000a2') $$,
  'owner M creates invoice 4 (also project 1)'
);
create temporary table pgtap_bm_invoice_4 as
  select id from public.invoices where tenant_id = 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6' and project_id = 'c0000000-0000-0000-0000-0000000000a2'
    and id not in (select id from pgtap_bm_invoice_1 union select id from pgtap_bm_invoice_2);
grant select on pgtap_bm_invoice_4 to authenticated;
select lives_ok(
  format(
    $$ select public.update_invoice_billing_metadata(%L, 'c0000000-0000-0000-0000-0000000000a9', '2033-01-08', '2033-02-08') $$,
    (select id from pgtap_bm_invoice_4)
  ),
  'owner M sets invoice 4''s legal entity to the same legal entity that owns the void number'
);
select throws_ok(
  format($$ select public.register_invoice_number(%L, 'INV-M-0001') $$, (select id from pgtap_bm_invoice_4)),
  '23505',
  null,
  'VR-01: a void invoice''s number is never reusable by a brand-new draft either'
);

-- N-04: the SAME number is free to reuse under a DIFFERENT legal entity
-- within the same tenant.
select lives_ok(
  format(
    $$ select public.update_invoice_billing_metadata(%L, 'c0000000-0000-0000-0000-0000000000a8', '2033-01-06', '2033-02-06') $$,
    (select id from pgtap_bm_invoice_4)
  ),
  'owner M sets invoice 4''s legal entity to the second legal entity'
);
select lives_ok(
  format($$ select public.register_invoice_number(%L, 'INV-M-0001') $$, (select id from pgtap_bm_invoice_4)),
  'N-04: the same number succeeds under a different legal entity'
);

-- N-05: the same number is also free to reuse in a completely different
-- tenant.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-d7d7-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.create_draft_invoice('d7d7d7d7-d7d7-4d7d-8d7d-d7d7d7d7d7d7', 'd0000000-0000-0000-0000-0000000000a2') $$,
  'owner N creates a draft invoice for tenant N'
);
create temporary table pgtap_bm_invoice_n1 as
  select id from public.invoices where tenant_id = 'd7d7d7d7-d7d7-4d7d-8d7d-d7d7d7d7d7d7';
grant select on pgtap_bm_invoice_n1 to authenticated;
select lives_ok(
  format($$ select public.register_invoice_number(%L, 'INV-M-0001') $$, (select id from pgtap_bm_invoice_n1)),
  'N-05: the same number succeeds in a different tenant'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Fully cover project 1's cost ledger (entry 001 was freed by voiding
-- invoice 1; entry 002 was never bound at all) by binding both to the
-- still-draft invoice 4, so project 1 is not itself unbilled while the
-- Unbilled Vessel Alert section below exercises project 2 in isolation.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-c6c6-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  format($$ select public.bind_invoice_transaction(%L, 'c1000000-0000-0000-0000-000000000001') $$, (select id from pgtap_bm_invoice_4)),
  'owner M re-binds project 1''s first expense (freed by voiding invoice 1) to invoice 4'
);
select lives_ok(
  format($$ select public.bind_invoice_transaction(%L, 'c1000000-0000-0000-0000-000000000002') $$, (select id from pgtap_bm_invoice_4)),
  'owner M binds project 1''s second (never-bound) expense to invoice 4 as well — project 1 fully covered'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- UNBILLED VESSEL ALERT — H-04, H-05, O-03, O-04, W-01..W-04
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-c6c6-4444-0000-000000000001', 'role', 'authenticated')::text, true);

-- project 2 (c0000000-...a3) is closed with one billable expense
-- (c1...003), never bound to anything yet — it must appear as unbilled.
select results_eq(
  $$ select project_id from public.list_unbilled_vessel_projects('c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6') order by project_id $$,
  $$ values ('c0000000-0000-0000-0000-0000000000a3'::uuid) $$,
  'H-05/W-01: project 2 (closed, unbound expense) is the only unbilled project so far'
);

select lives_ok(
  $$ select public.create_draft_invoice('c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6', 'c0000000-0000-0000-0000-0000000000a3') $$,
  'owner M creates a draft invoice for project 2'
);
create temporary table pgtap_bm_invoice_p2 as
  select id from public.invoices where tenant_id = 'c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6' and project_id = 'c0000000-0000-0000-0000-0000000000a3';
grant select on pgtap_bm_invoice_p2 to authenticated;
select lives_ok(
  format($$ select public.bind_invoice_transaction(%L, 'c1000000-0000-0000-0000-000000000003') $$, (select id from pgtap_bm_invoice_p2)),
  'owner M binds project 2''s only expense to its draft invoice'
);

-- H-04/W-02: once fully bound to an active (even still-draft) invoice,
-- project 2 drops out of the alert immediately.
select is_empty(
  $$ select project_id from public.list_unbilled_vessel_projects('c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6') $$,
  'H-04/W-02: project 2 disappears from the alert once its expense is bound to a draft invoice'
);

-- Void that draft (never issued, draft -> void directly per Gate 4A §4)
-- without a reissue — W-03/O-03: the project must become unbilled again.
select lives_ok(
  format($$ select public.void_invoice(%L, 'batal, salah project') $$, (select id from pgtap_bm_invoice_p2)),
  'owner M voids the still-draft project-2 invoice'
);
select results_eq(
  $$ select project_id from public.list_unbilled_vessel_projects('c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6') order by project_id $$,
  $$ values ('c0000000-0000-0000-0000-0000000000a3'::uuid) $$,
  'O-03/W-04: project 2 reappears in the alert once its only invoice is void without a reissue'
);

-- O-04/W-02 (again, via reissue): once a reissue re-binds the freed
-- expense, the project drops out of the alert again.
select lives_ok(
  format($$ select public.reissue_invoice(%L) $$, (select id from pgtap_bm_invoice_p2)),
  'owner M reissues the void project-2 invoice (project_id carried over automatically)'
);
create temporary table pgtap_bm_invoice_p2_reissue as
  select id from public.invoices where predecessor_invoice_id = (select id from pgtap_bm_invoice_p2);
grant select on pgtap_bm_invoice_p2_reissue to authenticated;
select results_eq(
  format($$ select project_id from public.invoices where id = %L $$, (select id from pgtap_bm_invoice_p2_reissue)),
  $$ values ('c0000000-0000-0000-0000-0000000000a3'::uuid) $$,
  'VR-04 (cardinality only): the reissued invoice automatically carries the same project_id, not re-chosen'
);
select lives_ok(
  format($$ select public.bind_invoice_transaction(%L, 'c1000000-0000-0000-0000-000000000003') $$, (select id from pgtap_bm_invoice_p2_reissue)),
  'owner M re-binds project 2''s expense (freed by the void) to the reissued invoice'
);
select is_empty(
  $$ select project_id from public.list_unbilled_vessel_projects('c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6') $$,
  'O-04/W-02: project 2 disappears from the alert again once the reissue re-binds its expense'
);

reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();

rollback;
