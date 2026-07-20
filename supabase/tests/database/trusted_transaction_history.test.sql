-- ADOP Phase 1 Gate 1K — pgTAP proof for Trusted Transaction History &
-- Drill-Down: unified read model over cash_pool_entries +
-- project_cost_ledger_entries, Owner/Admin-only, tenant isolation,
-- paired-refund single-logical-transaction presentation (never double
-- counted), reversal linkage (original <-> reversal, both always visible),
-- import provenance, staging isolation (never shown), filters, keyset
-- pagination (no duplicate/skip on ties), and filtered-summary correctness
-- over the WHOLE filtered set (not just the current page).
--
-- Self-contained: creates its own fixtures (tenant prefixes f1f1f1f1-/
-- f2f2f2f2-, not used by any other pgTAP file in this directory) and rolls
-- back at the end. The whole file runs inside one outer transaction, so
-- now() is frozen for its entire duration — every row created here shares
-- one created_at, which makes logical_transaction_id (not created_at) the
-- real tie-breaker under test in the pagination scenario below.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'pgtap-txn-history-tenant-p', 'PgTAP Txn History Tenant P', 'active'),
  ('f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2', 'pgtap-txn-history-tenant-q', 'PgTAP Txn History Tenant Q', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', 'f1000000-0000-4000-0000-000000000001', 'authenticated', 'authenticated', 'owner-p@pgtap-txn-history.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'f1000000-0000-4000-0000-000000000002', 'authenticated', 'authenticated', 'admin-p@pgtap-txn-history.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'f1000000-0000-4000-0000-000000000003', 'authenticated', 'authenticated', 'viewer-p@pgtap-txn-history.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'f1000000-0000-4000-0000-000000000004', 'authenticated', 'authenticated', 'reviewer-p@pgtap-txn-history.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'f2000000-0000-4000-0000-000000000001', 'authenticated', 'authenticated', 'owner-q@pgtap-txn-history.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('f1500000-4000-0000-0000-000000000001', 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'f1000000-0000-4000-0000-000000000001', 'active'),
  ('f1500000-4000-0000-0000-000000000002', 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'f1000000-0000-4000-0000-000000000002', 'active'),
  ('f1500000-4000-0000-0000-000000000003', 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'f1000000-0000-4000-0000-000000000003', 'active'),
  ('f1500000-4000-0000-0000-000000000004', 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'f1000000-0000-4000-0000-000000000004', 'active'),
  ('f2500000-4000-0000-0000-000000000001', 'f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2', 'f2000000-0000-4000-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('f1500000-4000-0000-0000-000000000001', 'owner'),
  ('f1500000-4000-0000-0000-000000000002', 'admin'),
  ('f1500000-4000-0000-0000-000000000003', 'viewer'),
  ('f1500000-4000-0000-0000-000000000004', 'reviewer'),
  ('f2500000-4000-0000-0000-000000000001', 'owner');

insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('f1a00000-0000-0000-0000-0000000000c1', 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'CL-TH', 'Client TH', 'f1000000-0000-4000-0000-000000000001');

insert into public.vessels (id, tenant_id, client_id, vessel_code, vessel_name, created_by) values
  ('f1a00000-0000-0000-0000-0000000000a1', 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'f1a00000-0000-0000-0000-0000000000c1', 'VS-TH-1', 'KM Uji Satu', 'f1000000-0000-4000-0000-000000000001'),
  ('f1a00000-0000-0000-0000-0000000000a2', 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'f1a00000-0000-0000-0000-0000000000c1', 'VS-TH-2', 'KM Uji Dua', 'f1000000-0000-4000-0000-000000000001');

insert into public.service_types (id, tenant_id, code, name) values
  ('f1a00000-0000-0000-0000-0000000000b1', 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'th-service', 'TH Service');

insert into public.facility_locations (id, tenant_id, code, name) values
  ('f1a00000-0000-0000-0000-0000000000f1', 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'FL-TH', 'TH Facility');

insert into public.expense_categories (id, tenant_id, code, name) values
  ('f1a00000-0000-0000-0000-0000000000e1', 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'TH-CAT', 'TH Category');

insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by) values
  ('f1a00000-0000-0000-0000-0000000000d1', 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'f1a00000-0000-0000-0000-0000000000a1', 'f1a00000-0000-0000-0000-0000000000c1', 'f1a00000-0000-0000-0000-0000000000b1', 'f1a00000-0000-0000-0000-0000000000f1', 'TH-PROJECT-1', '2037-01-01', 'f1000000-0000-4000-0000-000000000001'),
  ('f1a00000-0000-0000-0000-0000000000d2', 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'f1a00000-0000-0000-0000-0000000000a2', 'f1a00000-0000-0000-0000-0000000000c1', 'f1a00000-0000-0000-0000-0000000000b1', 'f1a00000-0000-0000-0000-0000000000f1', 'TH-PROJECT-2', '2037-01-01', 'f1000000-0000-4000-0000-000000000001');

create temporary table pgtap_owner_p as select 'f1000000-0000-4000-0000-000000000001'::uuid as id;
create temporary table pgtap_admin_p as select 'f1000000-0000-4000-0000-000000000002'::uuid as id;
create temporary table pgtap_viewer_p as select 'f1000000-0000-4000-0000-000000000003'::uuid as id;
create temporary table pgtap_reviewer_p as select 'f1000000-0000-4000-0000-000000000004'::uuid as id;
create temporary table pgtap_owner_q as select 'f2000000-0000-4000-0000-000000000001'::uuid as id;
create temporary table pgtap_tenant_p as select 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1'::uuid as id;
create temporary table pgtap_tenant_q as select 'f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2'::uuid as id;
create temporary table pgtap_project_1 as select 'f1a00000-0000-0000-0000-0000000000d1'::uuid as id;
create temporary table pgtap_project_2 as select 'f1a00000-0000-0000-0000-0000000000d2'::uuid as id;
grant select on pgtap_tenant_p, pgtap_tenant_q, pgtap_project_1, pgtap_project_2 to authenticated;

-- =============================================================================
-- Scenario D1 (2037-03-01) — direct/manual postings only
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.get_or_create_daily_cash_pool((select id from pgtap_tenant_p), '2037-03-01');
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_pool_d1 as
  select id from public.cash_pools where tenant_id = (select id from pgtap_tenant_p) and business_date = '2037-03-01';
grant select on pgtap_pool_d1 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.record_cash_pool_entry((select id from pgtap_pool_d1), 'opening_cash', 1000000.00, 'D1 opening');
select public.record_cash_pool_entry((select id from pgtap_pool_d1), 'cash_top_up', 300000.00, 'D1 direct top up');
select public.create_expense_draft(
  (select id from pgtap_tenant_p), (select id from pgtap_pool_d1), (select id from pgtap_project_1), 'f1a00000-0000-0000-0000-0000000000e1',
  150000.00, 'D1 direct project expense', null, null
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_d1_cash_top_up as
  select id from public.cash_pool_entries where pool_id = (select id from pgtap_pool_d1) and description = 'D1 direct top up';
grant select on pgtap_d1_cash_top_up to authenticated;

create temporary table pgtap_d1_expense_submission as
  select es.id from public.expense_submissions es
    join public.expense_submission_revisions r on r.id = es.current_revision_id
    where es.tenant_id = (select id from pgtap_tenant_p) and r.description = 'D1 direct project expense';
grant select on pgtap_d1_expense_submission to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.submit_expense((select id from pgtap_d1_expense_submission));
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.approve_expense_submission((select id from pgtap_d1_expense_submission));
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_d1_expense_entry as
  select ledger_entry_id as id from public.expense_submissions where id = (select id from pgtap_d1_expense_submission);
grant select on pgtap_d1_expense_entry to authenticated;

-- Reverse both the direct cash top-up and the direct project expense —
-- exercises single-entry (non-paired) original+reversal linkage.
select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.reverse_cash_pool_entry((select id from pgtap_d1_cash_top_up), 'D1 reverse top up test');
select public.reverse_project_expense((select id from pgtap_d1_expense_entry), 'D1 reverse expense test');
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- Scenario D2 (2037-03-02) — committed import batch, NOT rolled back:
-- cash top-up, project expense, shared overhead, paired project refund.
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.create_cash_import_batch(
  (select id from pgtap_tenant_p), 'th-d2.xlsx', 'sha-th-d2-001', 'Sheet1', '2037-03-02',
  500000, 350000,
  $$[
    {"source_row_number":1,"source_fingerprint":"d2-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":500000,"calculated_balance":500000,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":2,"source_fingerprint":"d2-kas","description":"D2 import top up","vessel_label":"Kas","debit":120000,"credit":null,"workbook_balance":620000,"calculated_balance":620000,"provisional_classification":"cash_top_up_candidate","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"d2-expense","description":"D2 import project expense","vessel_label":"KM Uji Satu","debit":null,"credit":250000,"workbook_balance":370000,"calculated_balance":370000,"provisional_classification":"project_expense_candidate","status":"valid","validation_issues":[]},
    {"source_row_number":4,"source_fingerprint":"d2-overhead","description":"D2 import shared overhead","vessel_label":"Lain-lain","debit":null,"credit":60000,"workbook_balance":310000,"calculated_balance":310000,"provisional_classification":"unallocated_expense_review","status":"valid","validation_issues":[]},
    {"source_row_number":5,"source_fingerprint":"d2-refund","description":"D2 import project refund","vessel_label":"KM Uji Dua","debit":40000,"credit":null,"workbook_balance":350000,"calculated_balance":350000,"provisional_classification":"project_cash_in_or_refund_review","status":"valid","validation_issues":[]}
  ]$$::jsonb
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch_d2 as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-th-d2-001';
grant select on pgtap_batch_d2 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.set_cash_import_label_mapping((select id from pgtap_batch_d2), 'Kas', 'cash');
select public.set_cash_import_label_mapping((select id from pgtap_batch_d2), 'KM Uji Satu', 'existing_vessel_project', (select id from pgtap_project_1));
select public.set_cash_import_label_mapping((select id from pgtap_batch_d2), 'KM Uji Dua', 'existing_vessel_project', (select id from pgtap_project_2));
select public.set_cash_import_label_mapping((select id from pgtap_batch_d2), 'Lain-lain', 'shared_overhead');
select public.set_cash_import_row_disposition((select id from public.cash_import_rows where batch_id = (select id from pgtap_batch_d2) and source_row_number = 2), 'include', null);
select public.set_cash_import_row_disposition((select id from public.cash_import_rows where batch_id = (select id from pgtap_batch_d2) and source_row_number = 3), 'include', null);
select public.set_cash_import_row_disposition((select id from public.cash_import_rows where batch_id = (select id from pgtap_batch_d2) and source_row_number = 4), 'include', null);
select public.set_cash_import_row_disposition((select id from public.cash_import_rows where batch_id = (select id from pgtap_batch_d2) and source_row_number = 5), 'include', null);
select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch_d2));
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.approve_and_commit_cash_import_batch((select id from pgtap_batch_d2));
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- Scenario D3 (2037-03-03) — committed import batch that IS rolled back.
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.create_cash_import_batch(
  (select id from pgtap_tenant_p), 'th-d3.xlsx', 'sha-th-d3-001', 'Sheet1', '2037-03-03',
  500000, 650000,
  $$[
    {"source_row_number":1,"source_fingerprint":"d3-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":500000,"calculated_balance":500000,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":2,"source_fingerprint":"d3-refund","description":"D3 import project refund","vessel_label":"KM Uji Satu","debit":150000,"credit":null,"workbook_balance":650000,"calculated_balance":650000,"provisional_classification":"project_cash_in_or_refund_review","status":"valid","validation_issues":[]}
  ]$$::jsonb
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch_d3 as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-th-d3-001';
grant select on pgtap_batch_d3 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.set_cash_import_label_mapping((select id from pgtap_batch_d3), 'KM Uji Satu', 'existing_vessel_project', (select id from pgtap_project_1));
select public.set_cash_import_row_disposition((select id from public.cash_import_rows where batch_id = (select id from pgtap_batch_d3) and source_row_number = 2), 'include', null);
select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch_d3));
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.approve_and_commit_cash_import_batch((select id from pgtap_batch_d3));
select public.rollback_cash_import_batch((select id from pgtap_batch_d3), 'D3 rollback test');
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- Scenario D4 (2037-03-04) — staged only, NEVER committed (must never
-- appear in trusted_transaction_history).
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.create_cash_import_batch(
  (select id from pgtap_tenant_p), 'th-d4.xlsx', 'sha-th-d4-001', 'Sheet1', '2037-03-04',
  100000, 100000,
  $$[
    {"source_row_number":1,"source_fingerprint":"d4-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":100000,"calculated_balance":100000,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]}
  ]$$::jsonb
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch_d4 as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-th-d4-001';
grant select on pgtap_batch_d4 to authenticated;

-- =============================================================================
-- Scenario Q1 — tenant Q's own transaction, for cross-tenant isolation.
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.get_or_create_daily_cash_pool((select id from pgtap_tenant_q), '2037-03-01');
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_pool_q1 as
  select id from public.cash_pools where tenant_id = (select id from pgtap_tenant_q) and business_date = '2037-03-01';
grant select on pgtap_pool_q1 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.record_cash_pool_entry((select id from pgtap_pool_q1), 'opening_cash', 999000.00, 'Q1 opening');
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #1/#2 — Owner and Admin (tenant P) can see tenant P's own history
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select ok(
  (select count(*) from public.list_trusted_transactions((select id from pgtap_tenant_p), null, null, null, null, null, null, null, null, null, null, null, null, 200)) > 0,
  'owner P sees a non-empty trusted transaction history for tenant P'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select ok(
  (select count(*) from public.list_trusted_transactions((select id from pgtap_tenant_p), null, null, null, null, null, null, null, null, null, null, null, null, 200)) > 0,
  'admin P sees a non-empty trusted transaction history for tenant P'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #3 — Tenant Q cannot see tenant P's transactions
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select * from public.list_trusted_transactions('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', null, null, null, null, null, null, null, null, null, null, null, null, 200) $$,
  'not authorized to view trusted transaction history',
  'owner Q cannot list tenant P transactions (fails closed, does not leak an empty-vs-forbidden distinction)'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #4 — Cross-tenant detail returns NOT_FOUND (a null row), never a leak
-- =============================================================================

create temporary table pgtap_d2_refund_id as
  select logical_transaction_id from public.trusted_transaction_history
    where tenant_id = (select id from pgtap_tenant_p) and transaction_type = 'project_refund'
      and import_batch_id = (select id from pgtap_batch_d2);
grant select on pgtap_d2_refund_id to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(
  (select (public.get_trusted_transaction_detail((select id from pgtap_tenant_q), (select logical_transaction_id from pgtap_d2_refund_id))).logical_transaction_id),
  null,
  'owner Q looking up tenant P''s refund transaction id gets a null/NOT_FOUND row, not the data'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #5 — Anonymous is denied
-- =============================================================================

select set_config('request.jwt.claims', '', true);
select set_config('role', 'anon', true);
select throws_ok(
  $$ select * from public.list_trusted_transactions('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', null, null, null, null, null, null, null, null, null, null, null, null, 200) $$,
  'permission denied for function list_trusted_transactions',
  'anonymous is denied trusted transaction history (no EXECUTE grant at all — rejected before the function body even runs)'
);
reset role;

-- =============================================================================
-- #6 — Viewer/reviewer (tenant P) are denied — Owner/Admin only
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select * from public.list_trusted_transactions('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', null, null, null, null, null, null, null, null, null, null, null, null, 200) $$,
  'not authorized to view trusted transaction history',
  'viewer P is denied — Gate 1K is Owner/Admin only, narrower than the underlying ledgers'' own read policy'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000004', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select * from public.list_trusted_transactions('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', null, null, null, null, null, null, null, null, null, null, null, null, 200) $$,
  'not authorized to view trusted transaction history',
  'reviewer P is denied'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #7 — Client cannot forge tenant_id (owner P asking for tenant Q's data)
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select * from public.list_trusted_transactions('f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2', null, null, null, null, null, null, null, null, null, null, null, null, 200) $$,
  'not authorized to view trusted transaction history',
  'owner P cannot forge p_tenant_id to read tenant Q''s history'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #8 — Direct/manual cash transaction displays correctly
-- =============================================================================

select results_eq(
  $$ select source, transaction_type, signed_cash_effect, signed_project_cost_effect
       from public.trusted_transaction_history
       where tenant_id = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1' and logical_transaction_id = 'cash_pool:' || (select id from pgtap_d1_cash_top_up)::text $$,
  $$ values ('direct_manual'::text, 'cash_top_up'::text, 300000.00::numeric, 0.00::numeric) $$,
  'the direct/manual cash top-up shows source=direct_manual with the correct cash effect and zero project-cost effect'
);

-- =============================================================================
-- #9 — Project expense shows correct cash AND project-cost effect
-- =============================================================================

select results_eq(
  $$ select source, signed_cash_effect, signed_project_cost_effect
       from public.trusted_transaction_history
       where tenant_id = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1' and logical_transaction_id = 'project_cost_ledger:' || (select id from pgtap_d1_expense_entry)::text $$,
  $$ values ('direct_manual'::text, -150000.00::numeric, 150000.00::numeric) $$,
  'the direct project expense shows cash decreasing and project cost increasing by the same amount'
);

-- =============================================================================
-- #10 — shared_overhead: project null, cash-out correct, overhead effect correct
-- =============================================================================

select results_eq(
  $$ select project_id, signed_cash_effect, signed_project_cost_effect, signed_shared_overhead_effect
       from public.trusted_transaction_history
       where tenant_id = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1' and transaction_type = 'shared_overhead_expense'
         and import_batch_id = (select id from pgtap_batch_d2) $$,
  $$ values (null::uuid, -60000.00::numeric, 0.00::numeric, 60000.00::numeric) $$,
  'shared overhead has no project_id, decreases cash, does not touch project cost, and increases shared overhead'
);

-- =============================================================================
-- #11/#12 — Paired project refund is ONE logical transaction; not
-- double-counted anywhere (raw view row count AND summary)
-- =============================================================================

select is(
  (select count(*)::int from public.trusted_transaction_history
     where tenant_id = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1' and import_batch_id = (select id from pgtap_batch_d2) and transaction_type = 'project_refund'),
  1,
  'the D2 paired project refund appears as exactly one logical transaction row'
);
select results_eq(
  $$ select display_amount, signed_cash_effect, signed_project_cost_effect
       from public.trusted_transaction_history
       where tenant_id = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1' and import_batch_id = (select id from pgtap_batch_d2) and transaction_type = 'project_refund' $$,
  $$ values (40000.00::numeric, 40000.00::numeric, -40000.00::numeric) $$,
  'the paired refund''s display_amount is 40,000 once — never 80,000 (the two physical rows'' amounts summed)'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select results_eq(
  $$ select total_cash_in, total_project_cost_reduction
       from public.summarize_trusted_transactions('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', '2037-03-02', '2037-03-02', null, 'project_refund', null, null, null, null, null) $$,
  $$ values (40000.00::numeric, 40000.00::numeric) $$,
  'summarize_trusted_transactions counts the D2 paired refund once (40,000), not twice'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #13/#14/#15 — Original stays visible + marked reversed; reversal has the
-- opposite signed effect and its own 'reversal' status
-- =============================================================================

select results_eq(
  $$ select status, signed_cash_effect from public.trusted_transaction_history
       where tenant_id = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1' and logical_transaction_id = 'cash_pool:' || (select id from pgtap_d1_cash_top_up)::text $$,
  $$ values ('reversed'::text, 300000.00::numeric) $$,
  'the original direct cash top-up is still visible, unmutated (still +300,000), and marked reversed'
);
select is(
  (select status from public.trusted_transaction_history t
     join public.cash_pool_entries e on e.reverses_entry_id = (select id from pgtap_d1_cash_top_up)
     where t.tenant_id = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1' and t.logical_transaction_id = 'cash_pool:' || e.id::text),
  'reversal',
  'the reversal of the direct cash top-up carries status=reversal'
);
select is(
  (select signed_cash_effect from public.trusted_transaction_history t
     join public.cash_pool_entries e on e.reverses_entry_id = (select id from pgtap_d1_cash_top_up)
     where t.tenant_id = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1' and t.logical_transaction_id = 'cash_pool:' || e.id::text),
  -300000.00,
  'the reversal''s signed cash effect is the exact opposite of the original (-300,000)'
);

select results_eq(
  $$ select status, signed_cash_effect, signed_project_cost_effect from public.trusted_transaction_history
       where tenant_id = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1' and logical_transaction_id = 'project_cost_ledger:' || (select id from pgtap_d1_expense_entry)::text $$,
  $$ values ('reversed'::text, -150000.00::numeric, 150000.00::numeric) $$,
  'the original direct project expense is still visible, unmutated, and marked reversed'
);
select is(
  (select status from public.trusted_transaction_history t
     join public.project_cost_ledger_entries e on e.reverses_entry_id = (select id from pgtap_d1_expense_entry)
     where t.tenant_id = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1' and t.logical_transaction_id = 'project_cost_ledger:' || e.id::text),
  'reversal',
  'the project expense reversal carries status=reversal'
);
select is(
  (select signed_project_cost_effect from public.trusted_transaction_history t
     join public.project_cost_ledger_entries e on e.reverses_entry_id = (select id from pgtap_d1_expense_entry)
     where t.tenant_id = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1' and t.logical_transaction_id = 'project_cost_ledger:' || e.id::text),
  -150000.00,
  'the project expense reversal''s cost effect is the exact opposite of the original'
);

-- =============================================================================
-- #16 — Imported (committed, not rolled back) transaction shows provenance
-- =============================================================================

select is(
  (select count(*)::int from public.trusted_transaction_history
     where tenant_id = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1'
       and import_batch_id = (select id from pgtap_batch_d2) and import_row_id is not null),
  5,
  'every D2 committed logical transaction (opening, top-up, expense, shared overhead, paired refund) carries import provenance'
);

-- =============================================================================
-- #17 — Staged/never-committed batch never appears in the history
-- =============================================================================

select is(
  (select count(*)::int from public.trusted_transaction_history
     where tenant_id = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1' and import_batch_id = (select id from pgtap_batch_d4)),
  0,
  'the never-committed D4 staging batch contributes zero rows to trusted transaction history'
);

-- =============================================================================
-- #18 — Rolled-back import shows original AND reversal, traceable to the batch
-- =============================================================================

select is(
  (select count(*)::int from public.trusted_transaction_history
     where tenant_id = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1' and import_batch_id = (select id from pgtap_batch_d3)),
  4,
  'D3 (opening + paired refund, each original AND reversal) yields 4 traceable logical transactions after rollback'
);
select is(
  (select count(*)::int from public.trusted_transaction_history
     where tenant_id = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1' and import_batch_id = (select id from pgtap_batch_d3) and status = 'reversed'),
  2,
  'both D3 originals (opening, paired refund) are marked reversed'
);
select is(
  (select count(*)::int from public.trusted_transaction_history
     where tenant_id = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1' and import_batch_id = (select id from pgtap_batch_d3) and status = 'reversal'),
  2,
  'both D3 reversals (opening, paired refund) are present with status=reversal'
);

-- =============================================================================
-- #19 — Filter by date range
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(
  (select count(*)::int from public.list_trusted_transactions((select id from pgtap_tenant_p), '2037-03-02', '2037-03-02', null, null, null, null, null, null, null, null, null, null, 200)),
  5,
  'filtering by dateFrom=dateTo=2037-03-02 returns only D2''s 5 logical transactions'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #20 — Filter by project
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(
  (select count(*)::int from public.list_trusted_transactions((select id from pgtap_tenant_p), null, null, (select id from pgtap_project_2), null, null, null, null, null, null, null, null, null, 200)),
  1,
  'filtering by project 2 returns only the D2 paired refund tied to that project'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #21 — Filter by type / source / status
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(
  (select count(*)::int from public.list_trusted_transactions((select id from pgtap_tenant_p), null, null, null, 'project_refund', null, null, null, null, null, null, null, null, 200)),
  2,
  'filtering by transaction_type=project_refund returns D2''s and D3''s original refund rows'
);
select is(
  (select count(*)::int from public.list_trusted_transactions((select id from pgtap_tenant_p), null, null, null, null, null, 'direct_manual', null, null, null, null, null, null, 200)),
  3,
  'filtering by source=direct_manual returns D1''s 3 direct postings (top-up, expense, and one more from opening) only'
);
select is(
  (select count(*)::int from public.list_trusted_transactions((select id from pgtap_tenant_p), null, null, null, null, null, null, 'reversal', null, null, null, null, null, 200)),
  4,
  'filtering by status=reversal returns 4 reversal logicals: D1''s cash top-up + expense (x2), D3''s opening + paired refund (x2)'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #22 — Keyset pagination: no duplicate, no skip, even on (business_date,
-- created_at) ties (this whole file shares one now())
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

create temporary table pgtap_page1 as
  select * from public.list_trusted_transactions((select id from pgtap_tenant_p), '2037-03-02', '2037-03-02', null, null, null, null, null, null, null, null, null, null, 2);

create temporary table pgtap_page2 as
  select * from public.list_trusted_transactions(
    (select id from pgtap_tenant_p), '2037-03-02', '2037-03-02', null, null, null, null, null, null, null,
    (select business_date from pgtap_page1 order by business_date asc, created_at asc, logical_transaction_id asc limit 1),
    (select created_at from pgtap_page1 order by business_date asc, created_at asc, logical_transaction_id asc limit 1),
    (select logical_transaction_id from pgtap_page1 order by business_date asc, created_at asc, logical_transaction_id asc limit 1),
    2
  );

create temporary table pgtap_page3 as
  select * from public.list_trusted_transactions(
    (select id from pgtap_tenant_p), '2037-03-02', '2037-03-02', null, null, null, null, null, null, null,
    (select business_date from pgtap_page2 order by business_date asc, created_at asc, logical_transaction_id asc limit 1),
    (select created_at from pgtap_page2 order by business_date asc, created_at asc, logical_transaction_id asc limit 1),
    (select logical_transaction_id from pgtap_page2 order by business_date asc, created_at asc, logical_transaction_id asc limit 1),
    2
  );

select is((select count(*)::int from pgtap_page1), 2, 'page 1 returns exactly p_limit=2 rows');
select is((select count(*)::int from pgtap_page2), 2, 'page 2 returns exactly p_limit=2 rows');
select is((select count(*)::int from pgtap_page3), 1, 'page 3 returns the final remaining row (5 total, 2+2+1)');
select is(
  (select count(*)::int from (
    select logical_transaction_id from pgtap_page1
    union select logical_transaction_id from pgtap_page2
    union select logical_transaction_id from pgtap_page3
  ) u),
  5,
  'pages 1+2+3 together contain 5 distinct logical transactions — no duplicate across any page boundary'
);
select is(
  (select array_agg(logical_transaction_id order by business_date desc, created_at desc, logical_transaction_id desc)
     from (select * from pgtap_page1 union all select * from pgtap_page2 union all select * from pgtap_page3) combined),
  (select array_agg(logical_transaction_id order by business_date desc, created_at desc, logical_transaction_id desc)
     from public.list_trusted_transactions((select id from pgtap_tenant_p), '2037-03-02', '2037-03-02', null, null, null, null, null, null, null, null, null, null, 200)),
  'paging through with p_limit=2 yields the exact same ordered set as one unpaginated call — no skip'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #23 — Summary reflects the WHOLE filtered set, not just one page
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(
  (select transaction_count::int from public.summarize_trusted_transactions((select id from pgtap_tenant_p), '2037-03-02', '2037-03-02', null, null, null, null, null, null, null)),
  5,
  'summarize_trusted_transactions reports all 5 D2 transactions even though list pagination above used p_limit=2'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Oracle check: summary must match a direct, unpaginated aggregate over the
-- same filtered view (run as the pgTAP superuser session, which bypasses
-- the view's own missing authenticated grant — a legitimate verification
-- vantage point distinct from the app's own access path).
select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
create temporary table pgtap_summary_d2 as
  select * from public.summarize_trusted_transactions((select id from pgtap_tenant_p), '2037-03-02', '2037-03-02', null, null, null, null, null, null, null);
reset role;
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$ select total_cash_in, total_cash_out, net_cash_effect from pgtap_summary_d2 $$,
  $$ select
      coalesce(sum(signed_cash_effect) filter (where signed_cash_effect > 0), 0)::numeric(16,2),
      coalesce(-sum(signed_cash_effect) filter (where signed_cash_effect < 0), 0)::numeric(16,2),
      coalesce(sum(signed_cash_effect), 0)::numeric(16,2)
    from public.trusted_transaction_history
    where tenant_id = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1' and business_date between '2037-03-02' and '2037-03-02' $$,
  'summarize_trusted_transactions matches a direct oracle aggregate over the unpaginated filtered view'
);

-- =============================================================================
-- #24 — Detail returns the underlying ledger effects (both sides of a pair)
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select ok(
  (select (public.get_trusted_transaction_detail((select id from pgtap_tenant_p), (select logical_transaction_id from pgtap_d2_refund_id))).cash_entry_id is not null),
  'the paired refund''s detail exposes its cash_pool_entries leg'
);
select ok(
  (select (public.get_trusted_transaction_detail((select id from pgtap_tenant_p), (select logical_transaction_id from pgtap_d2_refund_id))).cost_entry_id is not null),
  'the paired refund''s detail exposes its project_cost_ledger_entries leg'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #25 — Existing append-only UPDATE/DELETE protections still hold after
-- this migration (full regression already re-run separately; spot-checked
-- again here directly against this file's own fixture rows)
-- =============================================================================

select throws_ok(
  $$ update public.cash_pool_entries set amount = 1.00 where id = (select id from pgtap_d1_cash_top_up) $$,
  'access_audit_events is append-only: UPDATE not allowed',
  'cash_pool_entries stays append-only after Gate 1K'
);
select throws_ok(
  $$ delete from public.project_cost_ledger_entries where id = (select id from pgtap_d1_expense_entry) $$,
  'access_audit_events is append-only: DELETE not allowed',
  'project_cost_ledger_entries stays append-only after Gate 1K'
);

select * from finish();
rollback;
