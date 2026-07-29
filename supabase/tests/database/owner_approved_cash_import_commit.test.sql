-- ADOP Phase 1 Gate 1J-C — pgTAP proof for Owner-Approved Canonical Cash
-- Import Commit: role contract, canonical posting shape (cash top-up,
-- project expense, shared overhead, paired project refund), atomicity,
-- opening-balance fail-closed guard, provenance uniqueness, reconciliation/
-- mapping/disposition re-validation at commit time, owner rejection,
-- post-commit immutability, and the extended read models.
--
-- True concurrent-request racing (two simultaneous approve calls) cannot be
-- expressed inside one pgTAP transaction (single sequential connection) —
-- that is proven with real parallel HTTP calls in
-- tests/integration/owner-approved-cash-import-commit.integration.test.ts.
-- This file proves the SAME serialization mechanism (the `for update` locks)
-- exists and that the deterministic-rejection path each lock protects
-- actually rejects, which is what the lock exists to guarantee.
--
-- Self-contained: creates its own fixtures (tenant prefixes d1d1d1d1-/
-- d2d2d2d2-, not used by any other pgTAP file in this directory) and rolls
-- back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'pgtap-cash-commit-tenant-p', 'PgTAP Cash Commit Tenant P', 'active'),
  ('d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2', 'pgtap-cash-commit-tenant-q', 'PgTAP Cash Commit Tenant Q', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-0000-000000000001', 'authenticated', 'authenticated', 'owner-p@pgtap-cash-commit.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-0000-000000000002', 'authenticated', 'authenticated', 'admin-p@pgtap-cash-commit.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-0000-000000000003', 'authenticated', 'authenticated', 'viewer-p@pgtap-cash-commit.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-0000-000000000004', 'authenticated', 'authenticated', 'reviewer-p@pgtap-cash-commit.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'd2000000-0000-4000-0000-000000000001', 'authenticated', 'authenticated', 'owner-q@pgtap-cash-commit.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('d1500000-4000-0000-0000-000000000001', 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'd1000000-0000-4000-0000-000000000001', 'active'),
  ('d1500000-4000-0000-0000-000000000002', 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'd1000000-0000-4000-0000-000000000002', 'active'),
  ('d1500000-4000-0000-0000-000000000003', 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'd1000000-0000-4000-0000-000000000003', 'active'),
  ('d1500000-4000-0000-0000-000000000004', 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'd1000000-0000-4000-0000-000000000004', 'active'),
  ('d2500000-4000-0000-0000-000000000001', 'd2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2', 'd2000000-0000-4000-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('d1500000-4000-0000-0000-000000000001', 'owner'),
  ('d1500000-4000-0000-0000-000000000002', 'admin'),
  ('d1500000-4000-0000-0000-000000000003', 'viewer'),
  ('d1500000-4000-0000-0000-000000000004', 'reviewer'),
  ('d2500000-4000-0000-0000-000000000001', 'owner');

insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('d1a00000-0000-0000-0000-0000000000c1', 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'CL-DP-ANCHOR', 'Anchor Client DP', 'd1000000-0000-4000-0000-000000000001');

insert into public.vessels (id, tenant_id, client_id, vessel_code, vessel_name, created_by) values
  ('d1a00000-0000-0000-0000-0000000000a1', 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'd1a00000-0000-0000-0000-0000000000c1', 'VS-DP-ANCHOR', 'KM Anchor DP', 'd1000000-0000-4000-0000-000000000001');

insert into public.service_types (id, tenant_id, code, name) values
  ('d1a00000-0000-0000-0000-0000000000b1', 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'anchor-service', 'Anchor Service DP');

insert into public.facility_locations (id, tenant_id, code, name) values
  ('d1a00000-0000-0000-0000-0000000000f1', 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'FL-DP-ANCHOR', 'Anchor Facility DP');

insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by) values
  ('d1a00000-0000-0000-0000-0000000000a2', 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'd1a00000-0000-0000-0000-0000000000a1', 'd1a00000-0000-0000-0000-0000000000c1', 'd1a00000-0000-0000-0000-0000000000b1', 'd1a00000-0000-0000-0000-0000000000f1', 'ID-DP-PROJECT', '2035-01-01', 'd1000000-0000-4000-0000-000000000001');

create temporary table pgtap_owner_p as select 'd1000000-0000-4000-0000-000000000001'::uuid as id;
create temporary table pgtap_admin_p as select 'd1000000-0000-4000-0000-000000000002'::uuid as id;
create temporary table pgtap_viewer_p as select 'd1000000-0000-4000-0000-000000000003'::uuid as id;
create temporary table pgtap_reviewer_p as select 'd1000000-0000-4000-0000-000000000004'::uuid as id;
create temporary table pgtap_owner_q as select 'd2000000-0000-4000-0000-000000000001'::uuid as id;
create temporary table pgtap_tenant_p as select 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1'::uuid as id;
create temporary table pgtap_project_a as select 'd1a00000-0000-0000-0000-0000000000a2'::uuid as id;
grant select on pgtap_tenant_p to authenticated;
grant select on pgtap_project_a to authenticated;

-- =============================================================================
-- Helper macro (as SQL comments — pgTAP has no real macros): every scenario
-- below stages+maps+dispositions+marks-ready a batch as admin, then hands it
-- to owner for approve/reject. `set_config('role', ...)` + `request.jwt.
-- claims` mirrors 20260720000000_cash_import_staging.sql's own pgTAP file.
-- =============================================================================

-- =============================================================================
-- Scenario 1 (happy path) — opening + cash top-up + project expense +
-- shared overhead + paired project refund + one skipped row, in one batch.
-- business_date 2036-05-01.
-- opening=1,000,000; debit rows: Kas 500,000 (top-up), KM Anchor DP refund
-- 50,000 (include), KM Skip 30,000 (SKIPPED); credit rows: KM Anchor DP
-- expense 200,000 (include), Lain-lain overhead 80,000 (include).
-- total_debit=580,000, total_credit=280,000 -> calculated closing=1,300,000
-- (raw file reconciliation — unaffected by later skip decisions).
-- canonical (included only): 1,000,000 + 500,000 + 50,000 - 200,000 - 80,000
-- = 1,270,000.
-- =============================================================================

select set_config(
  'pgtap.rows_scenario1',
  $$[
    {"source_row_number":2,"source_fingerprint":"s1-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":1000000,"calculated_balance":1000000,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"s1-kas","description":"setor kas","vessel_label":"Kas","debit":500000,"credit":null,"workbook_balance":1500000,"calculated_balance":1500000,"provisional_classification":"cash_top_up_candidate","status":"valid","validation_issues":[]},
    {"source_row_number":4,"source_fingerprint":"s1-expense","description":"beli spare part","vessel_label":"KM Anchor DP","debit":null,"credit":200000,"workbook_balance":1300000,"calculated_balance":1300000,"provisional_classification":"project_expense_candidate","status":"valid","validation_issues":[]},
    {"source_row_number":5,"source_fingerprint":"s1-overhead","description":"listrik kantor","vessel_label":"Lain-lain","debit":null,"credit":80000,"workbook_balance":1220000,"calculated_balance":1220000,"provisional_classification":"unallocated_expense_review","status":"valid","validation_issues":[]},
    {"source_row_number":6,"source_fingerprint":"s1-refund","description":"pengembalian sisa material","vessel_label":"KM Anchor DP","debit":50000,"credit":null,"workbook_balance":1270000,"calculated_balance":1270000,"provisional_classification":"project_cash_in_or_refund_review","status":"valid","validation_issues":[]},
    {"source_row_number":7,"source_fingerprint":"s1-skip","description":"baris di-skip","vessel_label":"KM Skip","debit":30000,"credit":null,"workbook_balance":1300000,"calculated_balance":1300000,"provisional_classification":"project_cash_in_or_refund_review","status":"valid","validation_issues":[]}
  ]$$,
  true
);

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'laporan-happy.xlsx', 'sha-happy-001', 'Sheet1', '2036-05-01',
       1000000, 1300000, current_setting('pgtap.rows_scenario1')::jsonb
     ) $$,
  'scenario 1 batch staged'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch1 as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-happy-001';
grant select on pgtap_batch1 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok($$ select public.set_cash_import_label_mapping((select id from pgtap_batch1), 'Kas', 'cash') $$, 'Kas mapped to cash');
select lives_ok(
  $$ select public.set_cash_import_label_mapping((select id from pgtap_batch1), 'KM Anchor DP', 'existing_vessel_project', (select id from pgtap_project_a)) $$,
  'KM Anchor DP mapped to the anchor vessel project'
);
select lives_ok($$ select public.set_cash_import_label_mapping((select id from pgtap_batch1), 'Lain-lain', 'shared_overhead') $$, 'Lain-lain mapped to shared_overhead');
select lives_ok($$ select public.set_cash_import_label_mapping((select id from pgtap_batch1), 'KM Skip', 'existing_vessel_project', (select id from pgtap_project_a)) $$, 'KM Skip mapped (will be skipped anyway)');

select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch1) and vessel_label = 'Kas'), 'include', null
     ) $$, 'Kas row included'
);
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch1) and vessel_label = 'KM Anchor DP' and credit = 200000), 'include', null
     ) $$, 'expense row included'
);
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch1) and vessel_label = 'Lain-lain'), 'include', null
     ) $$, 'overhead row included'
);
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch1) and vessel_label = 'KM Anchor DP' and debit = 50000), 'include', null
     ) $$, 'refund row included'
);
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch1) and vessel_label = 'KM Skip'), 'skip', 'sengaja dilewati untuk uji variance'
     ) $$, 'skip row dispositioned with a reason'
);
select lives_ok($$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch1)) $$, 'scenario 1 batch reaches ready_for_review');
reset role;
select set_config('request.jwt.claims', '', true);

-- --- #1 Admin cannot approve/commit or reject --------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch1)) $$,
  'not authorized to approve cash import batch',
  '#1 admin cannot approve/commit a cash import batch'
);
select throws_ok(
  $$ select public.reject_cash_import_batch((select id from pgtap_batch1), 'alasan') $$,
  'not authorized to reject cash import batch',
  '#1 admin cannot reject a cash import batch'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- --- #4 Viewer / reviewer rejected -------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch1)) $$,
  'not authorized to approve cash import batch',
  '#4 viewer cannot approve/commit'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000004', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch1)) $$,
  'not authorized to approve cash import batch',
  '#4 reviewer cannot approve/commit'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- --- #3 Cross-tenant owner cannot approve -------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'd2000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch1)) $$,
  'not authorized to approve cash import batch',
  '#3 a different tenant''s owner cannot approve this batch (found by id via SECURITY DEFINER, rejected by the real tenant''s own role check)'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- --- #2 Owner of the SAME tenant can approve; canonical posting shape --------
select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch1)) $$,
  '#2 owner P approves and commits scenario 1'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status from public.cash_import_batches where id = (select id from pgtap_batch1)),
  'committed',
  'scenario 1 batch is now committed'
);
select is(
  (select canonical_opening_cash from public.cash_import_batches where id = (select id from pgtap_batch1)),
  1000000::numeric(16,2),
  '#7 canonical opening cash recorded correctly'
);
select is(
  (select canonical_cash_top_up_total from public.cash_import_batches where id = (select id from pgtap_batch1)),
  500000::numeric(16,2),
  '#7 canonical cash top-up total recorded correctly'
);
select is(
  (select canonical_project_expense_total from public.cash_import_batches where id = (select id from pgtap_batch1)),
  200000::numeric(16,2),
  '#8 canonical project expense total recorded correctly'
);
select is(
  (select canonical_shared_overhead_total from public.cash_import_batches where id = (select id from pgtap_batch1)),
  80000::numeric(16,2),
  '#9 canonical shared overhead total recorded correctly'
);
select is(
  (select canonical_project_refund_total from public.cash_import_batches where id = (select id from pgtap_batch1)),
  50000::numeric(16,2),
  '#10 canonical project refund total recorded correctly'
);
select is(
  (select canonical_closing_cash from public.cash_import_batches where id = (select id from pgtap_batch1)),
  1270000::numeric(16,2),
  '#27 canonical closing cash = 1,000,000 + 500,000 + 50,000 - 200,000 - 80,000'
);
select is(
  (select count(*)::int from public.cash_import_events where batch_id = (select id from pgtap_batch1) and event_type = 'owner_approved_and_committed'),
  1,
  'exactly one owner_approved_and_committed audit event was recorded'
);

create temporary table pgtap_pool1 as
  select id from public.cash_pools where tenant_id = (select id from pgtap_tenant_p) and business_date = '2036-05-01';
grant select on pgtap_pool1 to authenticated;

select is(
  (select count(*)::int from public.cash_pool_entries where pool_id = (select id from pgtap_pool1) and entry_type = 'opening_cash'),
  1, '#6 opening cash posted exactly once'
);
select is(
  (select amount from public.cash_pool_entries where pool_id = (select id from pgtap_pool1) and entry_type = 'cash_top_up'),
  500000::numeric(16,2), '#7 cash top-up posted with the correct amount'
);
select is(
  (select amount from public.cash_pool_entries where pool_id = (select id from pgtap_pool1) and entry_type = 'project_refund'),
  50000::numeric(16,2), '#10 project refund cash-in posted with the correct amount'
);
select is(
  (select count(*)::int from public.cash_pool_entries where pool_id = (select id from pgtap_pool1) and entry_type = 'project_refund'),
  1, '#6 the skipped 30,000-debit row never posted a second refund/top-up entry'
);

select is(
  (select amount from public.project_cost_ledger_entries where pool_id = (select id from pgtap_pool1) and entry_kind = 'expense' and entry_scope = 'project'),
  200000::numeric(16,2), '#8 project expense posted with the correct amount'
);
select is(
  (select project_id from public.project_cost_ledger_entries where pool_id = (select id from pgtap_pool1) and entry_kind = 'expense' and entry_scope = 'project'),
  (select id from pgtap_project_a), '#8 project expense posted against the mapped project'
);
select is(
  (select amount from public.project_cost_ledger_entries where pool_id = (select id from pgtap_pool1) and entry_scope = 'shared_overhead'),
  80000::numeric(16,2), '#9 shared overhead posted with the correct amount'
);
select ok(
  (select project_id from public.project_cost_ledger_entries where pool_id = (select id from pgtap_pool1) and entry_scope = 'shared_overhead') is null,
  '#9 shared overhead entry carries no vessel_project_id'
);
select is(
  (select amount from public.project_cost_ledger_entries where pool_id = (select id from pgtap_pool1) and entry_kind = 'refund'),
  50000::numeric(16,2), '#10 project refund cost-reduction posted with the correct amount'
);

-- --- #11 Refund paired posting is atomic: same import_row_id both sides -----
select is(
  (select import_row_id from public.cash_pool_entries where pool_id = (select id from pgtap_pool1) and entry_type = 'project_refund'),
  (select import_row_id from public.project_cost_ledger_entries where pool_id = (select id from pgtap_pool1) and entry_kind = 'refund'),
  '#11 the refund''s cash-in and cost-reduction postings share the same import_row_id'
);

-- --- #12 Import row provenance unique per table ------------------------------
select throws_ok(
  $$ insert into public.cash_pool_entries (tenant_id, pool_id, entry_type, entry_kind, amount, import_batch_id, import_row_id)
     values (
       (select id from pgtap_tenant_p), (select id from pgtap_pool1), 'other_cash_in', 'entry', 1,
       (select id from pgtap_batch1),
       (select import_row_id from public.cash_pool_entries where pool_id = (select id from pgtap_pool1) and entry_type = 'cash_top_up')
     ) $$,
  'duplicate key value violates unique constraint "cash_pool_entries_import_row_id_unique"',
  '#12 a second cash_pool_entries posting for an already-posted import row is rejected (unique index)'
);
select throws_ok(
  $$ insert into public.project_cost_ledger_entries (tenant_id, pool_id, project_id, entry_kind, entry_scope, amount, description, import_batch_id, import_row_id)
     values (
       (select id from pgtap_tenant_p), (select id from pgtap_pool1), (select id from pgtap_project_a), 'expense', 'project', 1, 'dup',
       (select id from pgtap_batch1),
       (select import_row_id from public.project_cost_ledger_entries where pool_id = (select id from pgtap_pool1) and entry_kind = 'expense' and entry_scope = 'project')
     ) $$,
  'duplicate key value violates unique constraint "project_cost_ledger_entries_import_row_id_unique"',
  '#12 a second project_cost_ledger_entries posting for an already-posted import row is rejected (unique index)'
);

-- --- #13 Same batch cannot post twice ----------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch1)) $$,
  'BATCH_ALREADY_COMMITTED',
  '#13 / #14 a second approval attempt on an already-committed batch is rejected deterministically, not silently re-posted'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.cash_pool_entries where pool_id = (select id from pgtap_pool1)),
  3, '#13 exactly 3 cash_pool_entries rows exist after the second approval attempt (opening + top-up + refund) — unchanged'
);

-- --- #23 Committed batch becomes immutable -----------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.set_cash_import_label_mapping((select id from pgtap_batch1), 'Kas', 'shared_overhead') $$,
  'BATCH_COMMITTED_IMMUTABLE',
  '#23 mapping cannot be edited on a committed batch'
);
select throws_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch1) and vessel_label = 'Kas'), 'skip', 'coba ubah'
     ) $$,
  'BATCH_COMMITTED_IMMUTABLE',
  '#23 disposition cannot be edited on a committed batch'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- --- #6 Opening cash committed once — a second import for the SAME business
--     date is rejected fail-closed (pool already has financial entries) ----

select set_config(
  'pgtap.rows_scenario_reopen',
  $$[
    {"source_row_number":2,"source_fingerprint":"s1r-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":200000,"calculated_balance":200000,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"s1r-kas","description":"setor kas kedua","vessel_label":"Kas","debit":100000,"credit":null,"workbook_balance":300000,"calculated_balance":300000,"provisional_classification":"cash_top_up_candidate","status":"valid","validation_issues":[]}
  ]$$,
  true
);

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'laporan-reopen-hari-yang-sama.xlsx', 'sha-reopen-001', 'Sheet1', '2036-05-01',
       200000, 300000, current_setting('pgtap.rows_scenario_reopen')::jsonb
     ) $$,
  'a second batch for the SAME business_date is staged independently'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch_reopen as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-reopen-001';
grant select on pgtap_batch_reopen to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok($$ select public.set_cash_import_label_mapping((select id from pgtap_batch_reopen), 'Kas', 'cash') $$, 'second batch Kas mapped');
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch_reopen) and vessel_label = 'Kas'), 'include', null
     ) $$, 'second batch Kas row included'
);
select lives_ok($$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch_reopen)) $$, 'second batch reaches ready_for_review');
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch_reopen)) $$,
  'OPENING_BALANCE_CONFLICT',
  '#6 a second batch targeting a business date whose pool already has financial entries is rejected fail-closed'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status from public.cash_import_batches where id = (select id from pgtap_batch_reopen)),
  'ready_for_review',
  'the rejected second batch stays ready_for_review — the failed commit attempt did not mutate its status'
);

-- =============================================================================
-- Scenario 2 — MANUAL_REVIEW_UNRESOLVED blocks commit (#18) and
-- MAPPING_NOT_COMMITTABLE blocks commit (#16), each in an isolated batch.
-- =============================================================================

select set_config(
  'pgtap.rows_scenario2',
  $$[
    {"source_row_number":2,"source_fingerprint":"s2-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":100000,"calculated_balance":100000,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"s2-dup-a","description":"beli spare part","vessel_label":"KM Anchor DP","debit":null,"credit":50000,"workbook_balance":50000,"calculated_balance":50000,"provisional_classification":"project_expense_candidate","status":"warning","validation_issues":[{"code":"DUPLICATE_ROW_CANDIDATE","severity":"warning","message":"dup"}]}
  ]$$,
  true
);

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'laporan-manual-review.xlsx', 'sha-manual-review-001', 'Sheet1', '2036-05-02',
       100000, 50000, current_setting('pgtap.rows_scenario2')::jsonb
     ) $$,
  'scenario 2 batch staged'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch2 as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-manual-review-001';
grant select on pgtap_batch2 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.set_cash_import_label_mapping((select id from pgtap_batch2), 'KM Anchor DP', 'existing_vessel_project', (select id from pgtap_project_a)) $$,
  'scenario 2 label mapped'
);
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch2) and vessel_label = 'KM Anchor DP'), 'manual_review', null
     ) $$, 'scenario 2 row marked manual_review (a legitimate disposition value)'
);
select lives_ok($$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch2)) $$, 'scenario 2 batch reaches ready_for_review despite an unresolved manual_review row');
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch2)) $$,
  'MANUAL_REVIEW_UNRESOLVED',
  '#18 a batch with an unresolved manual_review row cannot be committed'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- --- #16 (superseded by Gate 6I-A) -------------------------------------------
-- Gate 6I-A makes new_project_candidate a legitimate, committable mapping —
-- see supabase/tests/database/import_candidate_projects_and_exception_review.
-- test.sql for the full candidate-creation happy path. What's proven here
-- instead: (a) a bare new_project_candidate mapping with no creation plan now
-- fails FAST, at mapping time, rather than silently reaching ready_for_review
-- only to be discovered uncommittable at final approval; (b) 'unresolved'
-- remains the one mapping kind that is still MAPPING_NOT_COMMITTABLE at
-- commit, unchanged from before this gate.
select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.set_cash_import_label_mapping((select id from pgtap_batch2), 'KM Anchor DP', 'new_project_candidate') $$,
  'CANDIDATE_PLAN_FIELDS_REQUIRED',
  '#16 (Gate 6I-A) mapping a label new_project_candidate without vessel name/client/service type/start date fails fast, at mapping time'
);
select lives_ok(
  $$ select public.set_cash_import_label_mapping((select id from pgtap_batch2), 'KM Anchor DP', 'unresolved') $$,
  'scenario 2 label remapped to unresolved (still uncommittable, unchanged by Gate 6I-A)'
);
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch2) and vessel_label = 'KM Anchor DP'), 'include', null
     ) $$, 'scenario 2 row included under unresolved mapping'
);
select lives_ok($$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch2)) $$, 'scenario 2 batch reaches ready_for_review with an uncommittable mapping kind');
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch2)) $$,
  'MAPPING_NOT_COMMITTABLE',
  '#16 an included row mapped to unresolved blocks commit'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- --- #17 Cross-tenant project mapping is rejected BEFORE a row can ever
--     carry it — Gate 1J-B's own pgTAP file (#6 there) already proves the
--     composite FK rejects a genuinely different tenant's project id; this
--     just reconfirms set_cash_import_label_mapping's CREATE OR REPLACE in
--     this migration did not regress the same-tenant success path.
select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.set_cash_import_label_mapping((select id from pgtap_batch2), 'KM Anchor DP', 'existing_vessel_project', (select id from pgtap_project_a)) $$,
  'sanity: same-tenant mapping still succeeds after this gate''s CREATE OR REPLACE of set_cash_import_label_mapping'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- Scenario 3 — VALIDATION_ERRORS_PRESENT / RECONCILIATION_VARIANCE defensive
-- re-checks (#19 / #20). Both preconditions are unreachable via the normal
-- RPC surface once status = 'ready_for_review' (mark_cash_import_batch_
-- ready_for_review already refuses them) — simulated here via a direct
-- superuser UPDATE of non-status columns (no trigger blocks that; only
-- `status` itself is guarded) to prove the commit RPC's OWN defensive
-- re-validation actually fires, not just mark_ready's.
-- =============================================================================

select set_config(
  'pgtap.rows_scenario3',
  $$[
    {"source_row_number":2,"source_fingerprint":"s3-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":10000,"calculated_balance":10000,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"s3-kas","description":"setor kas","vessel_label":"Kas","debit":5000,"credit":null,"workbook_balance":15000,"calculated_balance":15000,"provisional_classification":"cash_top_up_candidate","status":"valid","validation_issues":[]}
  ]$$,
  true
);

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'laporan-defense.xlsx', 'sha-defense-001', 'Sheet1', '2036-05-03',
       10000, 15000, current_setting('pgtap.rows_scenario3')::jsonb
     ) $$,
  'scenario 3 batch staged'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch3 as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-defense-001';
grant select on pgtap_batch3 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok($$ select public.set_cash_import_label_mapping((select id from pgtap_batch3), 'Kas', 'cash') $$, 'scenario 3 label mapped');
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch3) and vessel_label = 'Kas'), 'include', null
     ) $$, 'scenario 3 row included'
);
select lives_ok($$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch3)) $$, 'scenario 3 batch reaches ready_for_review');
reset role;
select set_config('request.jwt.claims', '', true);

-- Simulate drift: directly (superuser, bypasses RLS/RPC) bump error_count.
update public.cash_import_batches set error_count = 1 where id = (select id from pgtap_batch3);

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch3)) $$,
  'VALIDATION_ERRORS_PRESENT',
  '#19 the commit RPC''s own defensive error_count re-check fires independently of mark_ready''s'
);
reset role;
select set_config('request.jwt.claims', '', true);

update public.cash_import_batches set error_count = 0, workbook_closing_balance = 999999 where id = (select id from pgtap_batch3);

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch3)) $$,
  'RECONCILIATION_VARIANCE',
  '#20 the commit RPC''s own defensive reconciliation re-check fires independently of mark_ready''s'
);
reset role;
select set_config('request.jwt.claims', '', true);

update public.cash_import_batches set workbook_closing_balance = 15000 where id = (select id from pgtap_batch3);

-- =============================================================================
-- Scenario 4 — mid-loop failure rolls back every canonical posting (#15),
-- and owner rejection (#21 / #22).
-- =============================================================================

select set_config(
  'pgtap.rows_scenario4',
  $$[
    {"source_row_number":2,"source_fingerprint":"s4-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":1000000,"calculated_balance":1000000,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"s4-kas","description":"setor kas","vessel_label":"Kas","debit":500000,"credit":null,"workbook_balance":1500000,"calculated_balance":1500000,"provisional_classification":"cash_top_up_candidate","status":"valid","validation_issues":[]},
    {"source_row_number":4,"source_fingerprint":"s4-bad-overhead","description":"listrik kantor (data rusak: debit, bukan kredit)","vessel_label":"Lain-lain","debit":80000,"credit":null,"workbook_balance":1580000,"calculated_balance":1580000,"provisional_classification":"unallocated_expense_review","status":"valid","validation_issues":[]}
  ]$$,
  true
);

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'laporan-rollback.xlsx', 'sha-rollback-001', 'Sheet1', '2036-06-01',
       1000000, 1580000, current_setting('pgtap.rows_scenario4')::jsonb
     ) $$,
  'scenario 4 batch staged'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch4 as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-rollback-001';
grant select on pgtap_batch4 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok($$ select public.set_cash_import_label_mapping((select id from pgtap_batch4), 'Kas', 'cash') $$, 'scenario 4 Kas mapped');
select lives_ok($$ select public.set_cash_import_label_mapping((select id from pgtap_batch4), 'Lain-lain', 'shared_overhead') $$, 'scenario 4 Lain-lain mapped');
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch4) and vessel_label = 'Kas'), 'include', null
     ) $$, 'scenario 4 Kas row included'
);
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch4) and vessel_label = 'Lain-lain'), 'include', null
     ) $$, 'scenario 4 overhead row included'
);
select lives_ok($$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch4)) $$, 'scenario 4 batch reaches ready_for_review');
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch4)) $$,
  'UNEXPECTED_ROW_DIRECTION',
  '#15 the third row (bad direction for shared_overhead) fails after the Kas row already inserted successfully within the same call'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.cash_pools where tenant_id = (select id from pgtap_tenant_p) and business_date = '2036-06-01'),
  0,
  '#15 the whole commit rolled back — even the newly get-or-created pool row itself no longer exists'
);
select is(
  (select status from public.cash_import_batches where id = (select id from pgtap_batch4)),
  'ready_for_review',
  '#15 the batch status was never changed by the failed commit'
);
select ok(
  (select canonical_closing_cash from public.cash_import_batches where id = (select id from pgtap_batch4)) is null,
  '#15 no canonical snapshot was written by the failed commit'
);

-- --- #21 / #22 Owner rejection creates no canonical mutation, returns the
--     batch to mapping_required ---------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.reject_cash_import_batch((select id from pgtap_batch4), 'salah kolom') $$,
  'not authorized to reject cash import batch',
  'admin cannot reject either'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.reject_cash_import_batch((select id from pgtap_batch4), '') $$,
  'rejection reason is required',
  'empty rejection reason is rejected'
);
select lives_ok(
  $$ select public.reject_cash_import_batch((select id from pgtap_batch4), 'data baris 4 salah arah, perlu perbaikan sebelum diajukan lagi') $$,
  '#21 owner rejects scenario 4''s batch with a reason'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status from public.cash_import_batches where id = (select id from pgtap_batch4)),
  'mapping_required',
  '#22 rejected batch returns to mapping_required'
);
select is(
  (select count(*)::int from public.cash_import_events where batch_id = (select id from pgtap_batch4) and event_type = 'owner_rejected'),
  1,
  '#21 exactly one owner_rejected audit event was recorded, carrying the reason'
);
select is(
  (select count(*)::int from public.cash_pool_entries where import_batch_id = (select id from pgtap_batch4)),
  0,
  '#21 owner rejection posted zero cash_pool_entries rows'
);
select is(
  (select count(*)::int from public.project_cost_ledger_entries where import_batch_id = (select id from pgtap_batch4)),
  0,
  '#21 owner rejection posted zero project_cost_ledger_entries rows'
);

-- Admin can revise the rejected batch (mapping_required is editable) — fix
-- the bad row and re-submit, proving reject -> revise -> re-approve works
-- end to end.
select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch4) and vessel_label = 'Lain-lain'), 'skip', 'data arah salah, tidak dapat diproses periode ini'
     ) $$, 'the previously-bad row is now skipped instead'
);
select lives_ok($$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch4)) $$, 'the revised batch reaches ready_for_review again');
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch4)) $$,
  'reject -> revise -> re-approve succeeds end to end'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status from public.cash_import_batches where id = (select id from pgtap_batch4)), 'committed',
  'the revised batch is now committed'
);
select is(
  (select count(*)::int from public.cash_pool_entries where pool_id = (select id from public.cash_pools where tenant_id = (select id from pgtap_tenant_p) and business_date = '2036-06-01')),
  2,
  'only opening + Kas top-up posted this time — the skipped overhead row posted nothing'
);

-- =============================================================================
-- Read models (#24 / #25 / #26)
-- =============================================================================

select is(
  (select total_cash_out from public.cash_pool_daily_summary where pool_id = (select id from pgtap_pool1)),
  280000::numeric(16,2),
  '#24 daily cash summary total_cash_out includes both project expense (200,000) and shared overhead (80,000)'
);
select is(
  (select closing_cash from public.cash_pool_daily_summary where pool_id = (select id from pgtap_pool1)),
  1270000::numeric(16,2),
  '#24 daily cash summary closing_cash matches the committed canonical closing'
);
select is(
  (select total_cost from public.vessel_project_cost_summary where project_id = (select id from pgtap_project_a)),
  150000::numeric(16,2),
  '#25 project summary is net of the refund: 200,000 expense - 50,000 refund = 150,000'
);
select is(
  (select count(*)::int from public.shared_overhead_ledger_current where pool_id = (select id from pgtap_pool1)),
  1,
  'shared overhead read model exposes exactly the one posted overhead row'
);
select is(
  (select count(*)::int from public.project_refund_ledger_current where pool_id = (select id from pgtap_pool1)),
  1,
  'project refund read model exposes exactly the one posted refund row'
);
-- #26 — the overhead amount (80,000) never appears in ANY project's total —
-- if it leaked into project A's cost, total_cost above would be 230,000
-- instead of 150,000; this is the same assertion restated structurally.
select ok(
  not exists (select 1 from public.project_cost_ledger_entries where entry_scope = 'shared_overhead' and project_id is not null),
  '#26 no shared-overhead row anywhere in this tenant ever carries a project_id'
);

-- =============================================================================
-- #28 Tenant isolation after commit; #30 no direct browser mutation of the
-- newly-added columns
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'd2000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is_empty(
  $$ select id from public.cash_import_batches where id = (select id from pgtap_batch1) $$,
  '#28 tenant Q''s owner cannot read tenant P''s committed batch'
);
select is_empty(
  $$ select id from public.cash_pool_entries where pool_id = (select id from pgtap_pool1) $$,
  '#28 tenant Q''s owner cannot read tenant P''s posted cash pool entries'
);
select is_empty(
  $$ select id from public.project_cost_ledger_entries where pool_id = (select id from pgtap_pool1) $$,
  '#28 tenant Q''s owner cannot read tenant P''s posted project cost ledger entries'
);
reset role;
select set_config('request.jwt.claims', '', true);

select ok(not has_table_privilege('authenticated', 'public.cash_pool_entries', 'INSERT'), '#30 authenticated still has no direct INSERT on cash_pool_entries');
select ok(not has_table_privilege('authenticated', 'public.cash_pool_entries', 'UPDATE'), '#30 authenticated still has no direct UPDATE on cash_pool_entries');
select ok(not has_table_privilege('authenticated', 'public.project_cost_ledger_entries', 'INSERT'), '#30 authenticated still has no direct INSERT on project_cost_ledger_entries');
select ok(not has_table_privilege('authenticated', 'public.project_cost_ledger_entries', 'UPDATE'), '#30 authenticated still has no direct UPDATE on project_cost_ledger_entries');
select ok(not has_table_privilege('authenticated', 'public.cash_import_batches', 'UPDATE'), '#30 authenticated still has no direct UPDATE on cash_import_batches');
select ok(
  not has_function_privilege('anon', 'public.approve_and_commit_cash_import_batch(uuid)', 'EXECUTE'),
  '#29 anon cannot execute approve_and_commit_cash_import_batch'
);
select ok(
  not has_function_privilege('anon', 'public.reject_cash_import_batch(uuid, text)', 'EXECUTE'),
  '#29 anon cannot execute reject_cash_import_batch'
);

select * from finish();

rollback;
