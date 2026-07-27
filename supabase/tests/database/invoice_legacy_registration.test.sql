-- ADOP Phase 2A — pgTAP proof for Legacy Manual Invoice Registration
-- (register_legacy_invoice, 20260725000000_billing_metadata_cardinality.sql
-- §15). Test IDs in comments reference
-- ADOP_PHASE_2A_BILLING_METADATA_UNBILLED_CONTROL_TEST_MATRIX_v1.0.md §11.
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
  ('e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'pgtap-legacy-invoice-tenant-p', 'PgTAP Legacy Invoice Tenant P', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-e8e8-4444-0000-000000000001', 'authenticated', 'authenticated', 'owner-p@pgtap-legacy.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-e8e8-4444-0000-000000000002', 'authenticated', 'authenticated', 'admin-p@pgtap-legacy.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('e0000000-4444-0000-0000-000000000001', 'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', '00000000-e8e8-4444-0000-000000000001', 'active'),
  ('e0000000-4444-0000-0000-000000000002', 'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', '00000000-e8e8-4444-0000-000000000002', 'active');

insert into public.membership_roles (membership_id, role) values
  ('e0000000-4444-0000-0000-000000000001', 'owner'),
  ('e0000000-4444-0000-0000-000000000002', 'admin');

insert into public.legal_entities (id, tenant_id, display_name, status) values
  ('e0000000-0000-0000-0000-0000000000a9', 'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'Anchor Legal Entity P', 'active');

insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('e0000000-0000-0000-0000-0000000000c1', 'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'CL-P-ANCHOR', 'Anchor Client P', '00000000-e8e8-4444-0000-000000000001');

insert into public.vessels (id, tenant_id, client_id, vessel_code, vessel_name, created_by) values
  ('e0000000-0000-0000-0000-0000000000a4', 'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'e0000000-0000-0000-0000-0000000000c1', 'VS-P-ANCHOR', 'KM Anchor P', '00000000-e8e8-4444-0000-000000000001');

insert into public.service_types (id, tenant_id, code, name) values
  ('e0000000-0000-0000-0000-0000000000b1', 'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'anchor-service', 'Anchor Service P');

insert into public.facility_locations (id, tenant_id, code, name) values
  ('e0000000-0000-0000-0000-0000000000f1', 'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'FL-P-ANCHOR', 'Anchor Facility P');

insert into public.expense_categories (id, tenant_id, code, name) values
  ('e0000000-0000-0000-0000-0000000000e1', 'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'anchor-category', 'Anchor Category P');

-- Two closed projects: one whose cost ledger is reconstructable (for a
-- 'full' legacy registration), one with no reconstructable coverage at all
-- (for the 'unknown' legacy coverage exception, §15.7).
insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, lifecycle_status, start_date, created_by) values
  ('e0000000-0000-0000-0000-0000000000a2', 'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'e0000000-0000-0000-0000-0000000000a4', 'e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000f1', 'LG-PROJECT-1', 'active', '2029-01-01', '00000000-e8e8-4444-0000-000000000001'),
  ('e0000000-0000-0000-0000-0000000000a3', 'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'e0000000-0000-0000-0000-0000000000a4', 'e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000f1', 'LG-PROJECT-2', 'active', '2029-01-01', '00000000-e8e8-4444-0000-000000000001');

insert into public.cash_pools (id, tenant_id, business_date, created_by) values
  ('e0000000-0000-0000-0000-0000000000d1', 'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', '2029-01-01', '00000000-e8e8-4444-0000-000000000001');

insert into public.project_cost_ledger_entries (id, tenant_id, pool_id, project_id, category_id, entry_kind, amount, description) values
  ('e1000000-0000-0000-0000-000000000001', 'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'e0000000-0000-0000-0000-0000000000d1', 'e0000000-0000-0000-0000-0000000000a2', 'e0000000-0000-0000-0000-0000000000e1', 'expense', 750000.00, 'lg reconstructable expense');

select set_config('request.jwt.claims', json_build_object('sub', '00000000-e8e8-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.transition_vessel_project_lifecycle('e0000000-0000-0000-0000-0000000000a2', 'ready_to_close', null);
select public.transition_vessel_project_lifecycle('e0000000-0000-0000-0000-0000000000a2', 'closed', null);
select public.transition_vessel_project_lifecycle('e0000000-0000-0000-0000-0000000000a3', 'ready_to_close', null);
select public.transition_vessel_project_lifecycle('e0000000-0000-0000-0000-0000000000a3', 'closed', null);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- LG-01/LG-02/LG-04/LG-05/LG-07 — happy-path legacy registration
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-e8e8-4444-0000-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.register_legacy_invoice(
       'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'e0000000-0000-0000-0000-0000000000a9', 'e0000000-0000-0000-0000-0000000000a3',
       'INV/2029/OLD-001', '2029-06-01', null, 'issued', 'unknown', null, null
     ) $$,
  'LG-01/LG-02/LG-04: owner P registers a legacy invoice with an unreconstructable coverage and unknown due_date'
);

create temporary table pgtap_lg_invoice_1 as
  select id from public.invoices where tenant_id = 'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8' and invoice_number = 'INV/2029/OLD-001';
grant select on pgtap_lg_invoice_1 to authenticated;

select results_eq(
  format($$ select invoice_number, due_date, origin, legacy_coverage_status, status from public.invoices where id = %L $$, (select id from pgtap_lg_invoice_1)),
  $$ values ('INV/2029/OLD-001'::text, null::date, 'legacy_import'::public.invoice_origin, 'unknown'::public.invoice_legacy_coverage_status, 'issued'::public.invoice_status) $$,
  'LG-01/LG-02: the original number is kept as-is, due_date stays NULL (unknown), origin/status are exactly as registered'
);
select is(
  (select count(*)::int from public.invoice_transaction_lines where invoice_id = (select id from pgtap_lg_invoice_1)),
  0,
  'LG-04: no fabricated invoice_transaction_lines were created for the unreconstructable legacy invoice'
);
select results_eq(
  format($$ select billing_completeness_status from public.get_invoice_summary(%L) $$, (select id from pgtap_lg_invoice_1)),
  $$ values ('LEGACY_RECORDED'::public.invoice_billing_completeness_status) $$,
  'LG-05: a legacy invoice is always LEGACY_RECORDED — never READY_TO_SEND/DRAFT_* regardless of how complete its fields are'
);
select is(
  (select count(*)::int from public.access_audit_events where entity_id = (select id from pgtap_lg_invoice_1) and action = 'invoice.legacy_registered'),
  1,
  'LG-07: invoice.legacy_registered audit event recorded exactly once'
);
select results_eq(
  format($$ select imported_by from public.invoices where id = %L $$, (select id from pgtap_lg_invoice_1)),
  $$ values ('00000000-e8e8-4444-0000-000000000001'::uuid) $$,
  'LG-07: imported_by records the actor who ran the registration'
);

-- =============================================================================
-- Legacy registration with reconstructable coverage — full mapping
-- =============================================================================

select lives_ok(
  $$ select public.register_legacy_invoice(
       'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'e0000000-0000-0000-0000-0000000000a9', 'e0000000-0000-0000-0000-0000000000a2',
       'INV/2029/OLD-002', '2029-05-01', '2029-06-01', 'issued', 'full', null,
       array['e1000000-0000-0000-0000-000000000001']::uuid[]
     ) $$,
  'owner P registers a legacy invoice with a reconstructable, fully-mapped coverage'
);
create temporary table pgtap_lg_invoice_2 as
  select id from public.invoices where tenant_id = 'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8' and invoice_number = 'INV/2029/OLD-002';
grant select on pgtap_lg_invoice_2 to authenticated;
select is(
  (select count(*)::int from public.invoice_transaction_lines where invoice_id = (select id from pgtap_lg_invoice_2)),
  1,
  'the explicitly mapped transaction is recorded as real coverage, not fabricated'
);

-- Double-billing prevention still applies to legacy mapping: the same
-- transaction cannot be mapped to a second active legacy (or native)
-- invoice.
select throws_ok(
  $$ select public.register_legacy_invoice(
       'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'e0000000-0000-0000-0000-0000000000a9', 'e0000000-0000-0000-0000-0000000000a2',
       'INV/2029/OLD-003', '2029-05-02', '2029-06-02', 'issued', 'full', null,
       array['e1000000-0000-0000-0000-000000000001']::uuid[]
     ) $$,
  'transaction entry is already bound to an active invoice',
  'a transaction already covered by an active legacy invoice cannot be mapped again'
);

-- =============================================================================
-- LG-03 — duplicate invoice_number rejected (same rule as native invoices)
-- =============================================================================

select throws_ok(
  $$ select public.register_legacy_invoice(
       'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'e0000000-0000-0000-0000-0000000000a9', 'e0000000-0000-0000-0000-0000000000a3',
       'INV/2029/OLD-001', '2029-07-01', null, 'issued', 'unknown', null, null
     ) $$,
  '23505',
  null,
  'LG-03: registering a legacy invoice with a number already used in the same legal entity is rejected'
);

-- =============================================================================
-- LG-06 — project not yet imported blocks legacy registration (FK)
-- =============================================================================

select throws_ok(
  $$ select public.register_legacy_invoice(
       'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'e0000000-0000-0000-0000-0000000000a9', 'e0000000-0000-0000-0000-00000000ffff',
       'INV/2029/OLD-004', '2029-07-01', null, 'issued', 'unknown', null, null
     ) $$,
  'project not found',
  'LG-06: registering a legacy invoice against a project_id that does not exist is rejected (structurally backed by the composite FK)'
);

-- Structural backstop: even a raw INSERT bypassing the RPC's friendlier
-- pre-check is rejected by the composite FK itself (§15.9). Kept as a
-- `draft` row with client_id left NULL so this isolates the project_id FK
-- from both invoices_issued_shape (which would otherwise reject a null
-- client_id on an 'issued' row for an unrelated reason) and the newer
-- invoices_enforce_client_matches_project guard (audit follow-up, proven
-- exhaustively in invoice_billing_metadata_cardinality.test.sql) — a null
-- client_id trivially satisfies "no project, no client" until the FK on
-- project_id itself is what actually fires here.
reset role;
select throws_ok(
  $$ insert into public.invoices (tenant_id, status, project_id, client_id, created_by)
     values ('e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'draft', 'e0000000-0000-0000-0000-00000000ffff', null, null) $$,
  '23503',
  null,
  'LG-06 (structural): a raw INSERT against a non-existent project_id is rejected by the composite FK regardless of caller'
);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-e8e8-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

-- =============================================================================
-- Legacy registered as void — never implies acknowledged/paid, and its
-- number is subject to the same non-reuse rule as any other void invoice.
-- =============================================================================

select lives_ok(
  $$ select public.register_legacy_invoice(
       'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'e0000000-0000-0000-0000-0000000000a9', 'e0000000-0000-0000-0000-0000000000a3',
       'INV/2029/OLD-VOID', '2029-04-01', '2029-05-01', 'void', 'unknown', 'invoice lama dibatalkan sebelum ADOP', null
     ) $$,
  'owner P registers a legacy invoice directly as void (it was cancelled before ADOP existed)'
);
create temporary table pgtap_lg_invoice_void as
  select id from public.invoices where tenant_id = 'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8' and invoice_number = 'INV/2029/OLD-VOID';
grant select on pgtap_lg_invoice_void to authenticated;
select results_eq(
  format($$ select status, void_reason from public.invoices where id = %L $$, (select id from pgtap_lg_invoice_void)),
  $$ values ('void'::public.invoice_status, 'invoice lama dibatalkan sebelum ADOP'::text) $$,
  'a legacy invoice registered as void keeps exactly that status/reason — never automatically issued, acknowledged, or paid (no such state exists on this row at all)'
);
select results_eq(
  format($$ select billing_completeness_status from public.get_invoice_summary(%L) $$, (select id from pgtap_lg_invoice_void)),
  $$ values ('VOID'::public.invoice_billing_completeness_status) $$,
  'a void legacy invoice is classified VOID, not LEGACY_RECORDED — void always wins'
);
select throws_ok(
  $$ select public.register_legacy_invoice(
       'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'e0000000-0000-0000-0000-0000000000a9', 'e0000000-0000-0000-0000-0000000000a3',
       'INV/2029/OLD-VOID', '2029-04-01', '2029-05-01', 'issued', 'unknown', null, null
     ) $$,
  '23505',
  null,
  'a void legacy invoice''s number is never reusable by another legacy (or native) registration either'
);
select throws_ok(
  $$ select public.register_legacy_invoice(
       'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'e0000000-0000-0000-0000-0000000000a9', 'e0000000-0000-0000-0000-0000000000a3',
       'INV/2029/OLD-BADSTATUS', '2029-04-01', '2029-05-01', 'draft', 'unknown', null, null
     ) $$,
  'legacy invoice must be registered as issued or void',
  'legacy registration rejects any status other than issued/void — it is never registered as draft'
);
select throws_ok(
  $$ select public.register_legacy_invoice(
       'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'e0000000-0000-0000-0000-0000000000a9', 'e0000000-0000-0000-0000-0000000000a3',
       'INV/2029/OLD-NOREASON', '2029-04-01', '2029-05-01', 'void', 'unknown', null, null
     ) $$,
  'void reason is required for a legacy invoice registered as void',
  'legacy registration as void requires a non-empty void reason, same as native void'
);

-- =============================================================================
-- ROLE MATRIX — R-04, R-05
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-e8e8-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.register_legacy_invoice(
       'e8e8e8e8-e8e8-4e8e-8e8e-e8e8e8e8e8e8', 'e0000000-0000-0000-0000-0000000000a9', 'e0000000-0000-0000-0000-0000000000a3',
       'INV/2029/OLD-ADMIN', '2029-03-01', null, 'issued', 'unknown', null, null
     ) $$,
  'R-05: admin P (positive control) can also register a legacy invoice'
);

reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();

rollback;
