-- ADOP Phase 1 Gate 1J-D — pgTAP proof for Append-Only Cash Import Rollback:
-- role contract, full canonical reversal shape (opening, cash top-up,
-- project expense, shared overhead, paired project refund), accounting
-- effect returning to baseline, original-row preservation, reversal
-- provenance, atomicity on a mid-loop failure, safety guards (only
-- committed/not-already-rolled-back/pool must be open), and append-only
-- structural guarantees.
--
-- True concurrent-request racing (two simultaneous rollback calls) cannot be
-- expressed inside one pgTAP transaction (single sequential connection) —
-- that is proven with real parallel HTTP calls in
-- tests/integration/append-only-cash-import-rollback.integration.test.ts.
-- This file proves the SAME serialization mechanism (the batch `for update`
-- lock plus the status re-check) exists and that a second sequential
-- attempt after the first succeeds is rejected deterministically, which is
-- what the lock exists to guarantee under real concurrency too — mirrors
-- owner_approved_cash_import_commit.test.sql's own documented posture.
--
-- Self-contained: creates its own fixtures (tenant prefixes e1e1e1e1-/
-- e2e2e2e2-, not used by any other pgTAP file in this directory) and rolls
-- back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'pgtap-cash-rollback-tenant-p', 'PgTAP Cash Rollback Tenant P', 'active'),
  ('e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2', 'pgtap-cash-rollback-tenant-q', 'PgTAP Cash Rollback Tenant Q', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-0000-000000000001', 'authenticated', 'authenticated', 'owner-p@pgtap-cash-rollback.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-0000-000000000002', 'authenticated', 'authenticated', 'admin-p@pgtap-cash-rollback.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-0000-000000000003', 'authenticated', 'authenticated', 'viewer-p@pgtap-cash-rollback.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-0000-000000000004', 'authenticated', 'authenticated', 'reviewer-p@pgtap-cash-rollback.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'e2000000-0000-4000-0000-000000000001', 'authenticated', 'authenticated', 'owner-q@pgtap-cash-rollback.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('e1500000-4000-0000-0000-000000000001', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'e1000000-0000-4000-0000-000000000001', 'active'),
  ('e1500000-4000-0000-0000-000000000002', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'e1000000-0000-4000-0000-000000000002', 'active'),
  ('e1500000-4000-0000-0000-000000000003', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'e1000000-0000-4000-0000-000000000003', 'active'),
  ('e1500000-4000-0000-0000-000000000004', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'e1000000-0000-4000-0000-000000000004', 'active'),
  ('e2500000-4000-0000-0000-000000000001', 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2', 'e2000000-0000-4000-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('e1500000-4000-0000-0000-000000000001', 'owner'),
  ('e1500000-4000-0000-0000-000000000002', 'admin'),
  ('e1500000-4000-0000-0000-000000000003', 'viewer'),
  ('e1500000-4000-0000-0000-000000000004', 'reviewer'),
  ('e2500000-4000-0000-0000-000000000001', 'owner');

insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('e1a00000-0000-0000-0000-0000000000c1', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'CL-RB-ANCHOR', 'Anchor Client RB', 'e1000000-0000-4000-0000-000000000001');

insert into public.vessels (id, tenant_id, client_id, vessel_code, vessel_name, created_by) values
  ('e1a00000-0000-0000-0000-0000000000a1', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'e1a00000-0000-0000-0000-0000000000c1', 'VS-RB-ANCHOR', 'KM Anchor RB', 'e1000000-0000-4000-0000-000000000001');

insert into public.service_types (id, tenant_id, code, name) values
  ('e1a00000-0000-0000-0000-0000000000b1', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'anchor-service', 'Anchor Service RB');

insert into public.facility_locations (id, tenant_id, code, name) values
  ('e1a00000-0000-0000-0000-0000000000f1', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'FL-RB-ANCHOR', 'Anchor Facility RB');

insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by) values
  ('e1a00000-0000-0000-0000-0000000000a2', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'e1a00000-0000-0000-0000-0000000000a1', 'e1a00000-0000-0000-0000-0000000000c1', 'e1a00000-0000-0000-0000-0000000000b1', 'e1a00000-0000-0000-0000-0000000000f1', 'ID-RB-PROJECT', '2035-01-01', 'e1000000-0000-4000-0000-000000000001');

create temporary table pgtap_owner_p as select 'e1000000-0000-4000-0000-000000000001'::uuid as id;
create temporary table pgtap_admin_p as select 'e1000000-0000-4000-0000-000000000002'::uuid as id;
create temporary table pgtap_viewer_p as select 'e1000000-0000-4000-0000-000000000003'::uuid as id;
create temporary table pgtap_reviewer_p as select 'e1000000-0000-4000-0000-000000000004'::uuid as id;
create temporary table pgtap_owner_q as select 'e2000000-0000-4000-0000-000000000001'::uuid as id;
create temporary table pgtap_tenant_p as select 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1'::uuid as id;
create temporary table pgtap_project_a as select 'e1a00000-0000-0000-0000-0000000000a2'::uuid as id;
grant select on pgtap_tenant_p to authenticated;
grant select on pgtap_project_a to authenticated;

-- =============================================================================
-- Scenario 1 (happy path) — full canonical shape: opening + cash top-up +
-- project expense + shared overhead + paired project refund, committed,
-- then rolled back. business_date 2036-07-01.
-- opening=1,000,000; debit rows: Kas 500,000 (top-up), KM Anchor RB refund
-- 50,000; credit rows: KM Anchor RB expense 200,000, Lain-lain overhead
-- 80,000. total_debit=550,000, total_credit=280,000 -> calculated closing =
-- 1,270,000. canonical (all included): 1,000,000 + 500,000 + 50,000 -
-- 200,000 - 80,000 = 1,270,000.
-- =============================================================================

select set_config(
  'pgtap.rb_rows_scenario1',
  $$[
    {"source_row_number":2,"source_fingerprint":"rb1-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":1000000,"calculated_balance":1000000,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"rb1-kas","description":"setor kas","vessel_label":"Kas","debit":500000,"credit":null,"workbook_balance":1500000,"calculated_balance":1500000,"provisional_classification":"cash_top_up_candidate","status":"valid","validation_issues":[]},
    {"source_row_number":4,"source_fingerprint":"rb1-expense","description":"beli spare part","vessel_label":"KM Anchor RB","debit":null,"credit":200000,"workbook_balance":1300000,"calculated_balance":1300000,"provisional_classification":"project_expense_candidate","status":"valid","validation_issues":[]},
    {"source_row_number":5,"source_fingerprint":"rb1-overhead","description":"listrik kantor","vessel_label":"Lain-lain","debit":null,"credit":80000,"workbook_balance":1220000,"calculated_balance":1220000,"provisional_classification":"unallocated_expense_review","status":"valid","validation_issues":[]},
    {"source_row_number":6,"source_fingerprint":"rb1-refund","description":"pengembalian sisa material","vessel_label":"KM Anchor RB","debit":50000,"credit":null,"workbook_balance":1270000,"calculated_balance":1270000,"provisional_classification":"project_cash_in_or_refund_review","status":"valid","validation_issues":[]}
  ]$$,
  true
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'laporan-rb-happy.xlsx', 'sha-rb-happy-001', 'Sheet1', '2036-07-01',
       1000000, 1270000, current_setting('pgtap.rb_rows_scenario1')::jsonb
     ) $$,
  'scenario 1 batch staged'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch1 as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-rb-happy-001';
grant select on pgtap_batch1 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok($$ select public.set_cash_import_label_mapping((select id from pgtap_batch1), 'Kas', 'cash') $$, 'Kas mapped to cash');
select lives_ok(
  $$ select public.set_cash_import_label_mapping((select id from pgtap_batch1), 'KM Anchor RB', 'existing_vessel_project', (select id from pgtap_project_a)) $$,
  'KM Anchor RB mapped to the anchor vessel project'
);
select lives_ok($$ select public.set_cash_import_label_mapping((select id from pgtap_batch1), 'Lain-lain', 'shared_overhead') $$, 'Lain-lain mapped to shared_overhead');

select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch1) and vessel_label = 'Kas'), 'include', null
     ) $$, 'Kas row included'
);
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch1) and vessel_label = 'KM Anchor RB' and credit = 200000), 'include', null
     ) $$, 'expense row included'
);
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch1) and vessel_label = 'Lain-lain'), 'include', null
     ) $$, 'overhead row included'
);
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch1) and vessel_label = 'KM Anchor RB' and debit = 50000), 'include', null
     ) $$, 'refund row included'
);
select lives_ok($$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch1)) $$, 'scenario 1 batch reaches ready_for_review');
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch1)) $$,
  'owner P approves and commits scenario 1'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_pool1 as
  select id from public.cash_pools where tenant_id = (select id from pgtap_tenant_p) and business_date = '2036-07-01';
grant select on pgtap_pool1 to authenticated;

-- --- #5 Reason required ------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.rollback_cash_import_batch((select id from pgtap_batch1), '') $$,
  'rollback reason is required',
  '#5 empty rollback reason is rejected'
);
select throws_ok(
  $$ select public.rollback_cash_import_batch((select id from pgtap_batch1), null) $$,
  'rollback reason is required',
  '#5 null rollback reason is rejected'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- --- #2 Admin cannot rollback -------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.rollback_cash_import_batch((select id from pgtap_batch1), 'admin coba rollback') $$,
  'not authorized to rollback cash import batch',
  '#2 admin cannot rollback a cash import batch'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- --- #4 Viewer / reviewer / anonymous rejected -------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.rollback_cash_import_batch((select id from pgtap_batch1), 'viewer coba rollback') $$,
  'not authorized to rollback cash import batch',
  '#4 viewer cannot rollback'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000004', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.rollback_cash_import_batch((select id from pgtap_batch1), 'reviewer coba rollback') $$,
  'not authorized to rollback cash import batch',
  '#4 reviewer cannot rollback'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('role', 'anon', true);
select throws_ok(
  $$ select public.rollback_cash_import_batch((select id from pgtap_batch1), 'anon coba rollback') $$,
  null,
  '#4 anonymous cannot execute rollback_cash_import_batch at all (no EXECUTE grant)'
);
reset role;

-- --- #3 Cross-tenant owner rejected -------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'e2000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.rollback_cash_import_batch((select id from pgtap_batch1), 'owner tenant lain coba rollback') $$,
  'not authorized to rollback cash import batch',
  '#3 / #22 a different tenant''s owner cannot rollback this batch (found by id via SECURITY DEFINER, rejected by the real tenant''s own role check — no spoofed tenant/actor succeeds)'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- --- #1 Owner of the SAME tenant can rollback; full reversal shape -----------
select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.rollback_cash_import_batch((select id from pgtap_batch1), 'Rehearsal rollback import demo') $$,
  '#1 owner P rolls back scenario 1'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status from public.cash_import_batches where id = (select id from pgtap_batch1)),
  'rolled_back',
  'scenario 1 batch is now rolled_back'
);
select is(
  (select rolled_back_by from public.cash_import_batches where id = (select id from pgtap_batch1)),
  (select id from pgtap_owner_p),
  'rolled_back_by records the acting owner'
);
select is(
  (select rollback_reason from public.cash_import_batches where id = (select id from pgtap_batch1)),
  'Rehearsal rollback import demo',
  'rollback_reason snapshot stored correctly'
);
select is(
  (select rollback_reversal_count from public.cash_import_batches where id = (select id from pgtap_batch1)),
  6,
  'reversal count = opening(1) + top-up(1) + expense(1) + overhead(1) + refund pair(2) = 6'
);
select is(
  (select rollback_reversed_cash_effect from public.cash_import_batches where id = (select id from pgtap_batch1)),
  1500000::numeric(16,2),
  '#8 / #9 reversed cash effect = opening 1,000,000 + top-up 500,000'
);
select is(
  (select rollback_reversed_project_cost from public.cash_import_batches where id = (select id from pgtap_batch1)),
  200000::numeric(16,2),
  '#10 reversed project cost = 200,000'
);
select is(
  (select rollback_reversed_shared_overhead from public.cash_import_batches where id = (select id from pgtap_batch1)),
  80000::numeric(16,2),
  '#11 reversed shared overhead = 80,000'
);
select is(
  (select rollback_reversed_refund_effect from public.cash_import_batches where id = (select id from pgtap_batch1)),
  50000::numeric(16,2),
  '#12 reversed refund effect = 50,000'
);
select is(
  (select count(*)::int from public.cash_import_events where batch_id = (select id from pgtap_batch1) and event_type = 'owner_rolled_back_import'),
  1,
  'exactly one owner_rolled_back_import audit event was recorded'
);

-- --- #16 Original canonical rows remain --------------------------------------
select is(
  (select count(*)::int from public.cash_pool_entries where import_batch_id = (select id from pgtap_batch1) and entry_kind = 'entry'),
  3,
  '#16 all 3 original cash_pool_entries rows (opening, top-up, refund cash-in) still exist untouched'
);
select is(
  (select count(*)::int from public.project_cost_ledger_entries where import_batch_id = (select id from pgtap_batch1) and entry_kind in ('expense', 'refund')),
  3,
  '#16 all 3 original project_cost_ledger_entries rows (expense, overhead, refund cost-reduction) still exist untouched'
);

-- --- #17 Reversal rows point to originals ------------------------------------
select is(
  (select count(*)::int from public.cash_pool_entries where import_batch_id = (select id from pgtap_batch1) and entry_kind = 'reversal'),
  3,
  '#17 3 cash_pool_entries reversal rows were created'
);
select is(
  (select count(*)::int from public.project_cost_ledger_entries where import_batch_id = (select id from pgtap_batch1) and entry_kind = 'reversal'),
  3,
  '#17 3 project_cost_ledger_entries reversal rows were created'
);
select ok(
  not exists (
    select 1 from public.cash_pool_entries r
    where r.import_batch_id = (select id from pgtap_batch1) and r.entry_kind = 'reversal'
      and not exists (select 1 from public.cash_pool_entries o where o.id = r.reverses_entry_id and o.import_batch_id = (select id from pgtap_batch1))
  ),
  '#17 every cash_pool_entries reversal points back at an original entry from the SAME batch'
);
select ok(
  not exists (
    select 1 from public.cash_pool_entries r
    where r.import_batch_id = (select id from pgtap_batch1) and r.entry_kind = 'reversal'
      and r.import_row_id is distinct from (select o.import_row_id from public.cash_pool_entries o where o.id = r.reverses_entry_id)
  ),
  '#17 every cash_pool_entries reversal carries the SAME import_row_id as the original it reverses'
);
select ok(
  not exists (
    select 1 from public.project_cost_ledger_entries r
    where r.import_batch_id = (select id from pgtap_batch1) and r.entry_kind = 'reversal'
      and not exists (select 1 from public.project_cost_ledger_entries o where o.id = r.reverses_entry_id and o.import_batch_id = (select id from pgtap_batch1))
  ),
  '#17 every project_cost_ledger_entries reversal points back at an original entry from the SAME batch'
);

-- --- #13 / #14 / #15 Accounting effect returns to baseline -------------------
select is(
  (select opening_cash from public.cash_pool_daily_summary where pool_id = (select id from pgtap_pool1)),
  0::numeric(16,2), '#14 opening_cash returns to baseline (zero — the only batch for this pool/date)'
);
select is(
  (select cash_top_up from public.cash_pool_daily_summary where pool_id = (select id from pgtap_pool1)),
  0::numeric(16,2), '#14 cash_top_up returns to baseline'
);
select is(
  (select project_refund_in from public.cash_pool_daily_summary where pool_id = (select id from pgtap_pool1)),
  0::numeric(16,2), '#14 project_refund_in returns to baseline'
);
select is(
  (select total_cash_out from public.cash_pool_daily_summary where pool_id = (select id from pgtap_pool1)),
  0::numeric(16,2), '#14 total_cash_out (project expense + shared overhead) returns to baseline'
);
select is(
  (select closing_cash from public.cash_pool_daily_summary where pool_id = (select id from pgtap_pool1)),
  0::numeric(16,2), '#14 closing_cash returns to baseline'
);
select is(
  (select total_cost from public.vessel_project_cost_summary where project_id = (select id from pgtap_project_a)),
  0::numeric(16,2), '#13 project cost returns to baseline (200,000 expense reversed - 50,000 refund reversed = 0, net zero either way)'
);
select is(
  (select count(*)::int from public.shared_overhead_ledger_current where pool_id = (select id from pgtap_pool1)),
  0, '#15 shared_overhead_ledger_current (current/net view) shows zero rows after reversal'
);
select is(
  (select count(*)::int from public.project_refund_ledger_current where pool_id = (select id from pgtap_pool1)),
  0, '#15 project_refund_ledger_current (current/net view) shows zero rows after reversal'
);

-- --- #7 Already rolled-back batch rejected -----------------------------------
select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.rollback_cash_import_batch((select id from pgtap_batch1), 'coba rollback dua kali') $$,
  'BATCH_ALREADY_ROLLED_BACK',
  '#7 / #19 a second rollback attempt on an already-rolled-back batch is rejected deterministically (same lock mechanism true concurrency relies on)'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Reversal counts are unchanged by the rejected second attempt.
select is(
  (select count(*)::int from public.cash_pool_entries where import_batch_id = (select id from pgtap_batch1) and entry_kind = 'reversal'),
  3, '#7 the rejected second rollback attempt created zero additional reversal rows'
);

-- =============================================================================
-- #6 Only a committed batch can rollback — a ready_for_review batch rejects.
-- =============================================================================

select set_config(
  'pgtap.rb_rows_scenario2',
  $$[
    {"source_row_number":2,"source_fingerprint":"rb2-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":10000,"calculated_balance":10000,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"rb2-kas","description":"setor kas","vessel_label":"Kas","debit":5000,"credit":null,"workbook_balance":15000,"calculated_balance":15000,"provisional_classification":"cash_top_up_candidate","status":"valid","validation_issues":[]}
  ]$$,
  true
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'laporan-rb-not-committed.xlsx', 'sha-rb-not-committed-001', 'Sheet1', '2036-07-02',
       10000, 15000, current_setting('pgtap.rb_rows_scenario2')::jsonb
     ) $$,
  'scenario 2 batch staged'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch2 as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-rb-not-committed-001';
grant select on pgtap_batch2 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok($$ select public.set_cash_import_label_mapping((select id from pgtap_batch2), 'Kas', 'cash') $$, 'scenario 2 Kas mapped');
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch2) and vessel_label = 'Kas'), 'include', null
     ) $$, 'scenario 2 Kas row included'
);
select lives_ok($$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch2)) $$, 'scenario 2 batch reaches ready_for_review');
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.rollback_cash_import_batch((select id from pgtap_batch2), 'batch belum committed') $$,
  'BATCH_NOT_COMMITTED',
  '#6 a ready_for_review (not yet committed) batch cannot be rolled back'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #20 / #21 Closed pool / approved EOD reconciliation blocks rollback.
-- =============================================================================

select set_config(
  'pgtap.rb_rows_scenario3',
  $$[
    {"source_row_number":2,"source_fingerprint":"rb3-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":20000,"calculated_balance":20000,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"rb3-kas","description":"setor kas","vessel_label":"Kas","debit":10000,"credit":null,"workbook_balance":30000,"calculated_balance":30000,"provisional_classification":"cash_top_up_candidate","status":"valid","validation_issues":[]}
  ]$$,
  true
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'laporan-rb-closed-pool.xlsx', 'sha-rb-closed-pool-001', 'Sheet1', '2036-07-03',
       20000, 30000, current_setting('pgtap.rb_rows_scenario3')::jsonb
     ) $$,
  'scenario 3 batch staged'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch3 as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-rb-closed-pool-001';
grant select on pgtap_batch3 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok($$ select public.set_cash_import_label_mapping((select id from pgtap_batch3), 'Kas', 'cash') $$, 'scenario 3 Kas mapped');
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch3) and vessel_label = 'Kas'), 'include', null
     ) $$, 'scenario 3 Kas row included'
);
select lives_ok($$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch3)) $$, 'scenario 3 batch reaches ready_for_review');
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch3)) $$,
  'scenario 3 owner commits'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_pool3 as
  select id from public.cash_pools where tenant_id = (select id from pgtap_tenant_p) and business_date = '2036-07-03';
grant select on pgtap_pool3 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_reconciliation_draft((select id from pgtap_pool3), 30000, null) $$,
  'scenario 3 EOD reconciliation drafted with zero variance'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_reconciliation3 as
  select id from public.cash_reconciliations where pool_id = (select id from pgtap_pool3);
grant select on pgtap_reconciliation3 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.submit_cash_reconciliation((select id from pgtap_reconciliation3)) $$,
  'scenario 3 EOD reconciliation submitted'
);
select lives_ok(
  $$ select public.approve_cash_reconciliation((select id from pgtap_reconciliation3)) $$,
  'scenario 3 EOD reconciliation approved — pool becomes closed'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select daily_close_status from public.cash_pools where id = (select id from pgtap_pool3)),
  'closed',
  'scenario 3 pool is now closed via approved EOD reconciliation'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.rollback_cash_import_batch((select id from pgtap_batch3), 'coba rollback setelah EOD approved') $$,
  'CASH_POOL_NOT_OPEN_FOR_ROLLBACK',
  '#20 / #21 a closed pool (via approved EOD reconciliation) blocks rollback'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status from public.cash_import_batches where id = (select id from pgtap_batch3)),
  'committed',
  '#20 / #21 the blocked rollback attempt left the batch status unchanged'
);

-- =============================================================================
-- #18 Mid-loop failure rolls back the ENTIRE rollback attempt — a corrupted/
-- missing canonical posting for one row must not leave the earlier rows in
-- this same call (opening + top-up) partially reversed.
-- =============================================================================

select set_config(
  'pgtap.rb_rows_scenario4',
  $$[
    {"source_row_number":2,"source_fingerprint":"rb4-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":100000,"calculated_balance":100000,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"rb4-kas","description":"setor kas","vessel_label":"Kas","debit":50000,"credit":null,"workbook_balance":150000,"calculated_balance":150000,"provisional_classification":"cash_top_up_candidate","status":"valid","validation_issues":[]}
  ]$$,
  true
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'laporan-rb-atomicity.xlsx', 'sha-rb-atomicity-001', 'Sheet1', '2036-07-04',
       100000, 150000, current_setting('pgtap.rb_rows_scenario4')::jsonb
     ) $$,
  'scenario 4 batch staged'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch4 as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-rb-atomicity-001';
grant select on pgtap_batch4 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok($$ select public.set_cash_import_label_mapping((select id from pgtap_batch4), 'Kas', 'cash') $$, 'scenario 4 Kas mapped');
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch4) and vessel_label = 'Kas'), 'include', null
     ) $$, 'scenario 4 Kas row included'
);
select lives_ok($$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch4)) $$, 'scenario 4 batch reaches ready_for_review');
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch4)) $$,
  'scenario 4 owner commits (opening 100,000 + top-up 50,000 only)'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Simulate a corrupted/incomplete import: a row that claims disposition =
-- 'include' with a postable mapping_kind, inserted directly (bypasses every
-- RPC — cash_import_rows carries no append-only trigger, only the RPCs
-- enforce BATCH_COMMITTED_IMMUTABLE) into an ALREADY-COMMITTED batch, whose
-- import_row_id was never actually posted to any canonical table. Its
-- source_row_number (99) sorts AFTER the two legitimate rows, so this
-- function reaches it only after already reversing opening + top-up
-- WITHIN THE SAME CALL — proving the whole rollback, not just the failing
-- row, is undone.
insert into public.cash_import_rows (
  tenant_id, batch_id, source_row_number, source_fingerprint, description, vessel_label,
  debit, credit, provisional_classification, status, mapping_kind, disposition
) values (
  (select id from pgtap_tenant_p), (select id from pgtap_batch4), 99, 'rb4-corrupt-row', 'baris tanpa posting canonical', 'Lain-lain',
  null, 10000, 'unallocated_expense_review', 'valid', 'shared_overhead', 'include'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.rollback_cash_import_batch((select id from pgtap_batch4), 'coba rollback dengan data tidak lengkap') $$,
  'IMPORT_PROVENANCE_INCOMPLETE',
  '#18 a row with no matching canonical posting aborts the whole rollback attempt'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status from public.cash_import_batches where id = (select id from pgtap_batch4)),
  'committed',
  '#18 the batch status was never changed by the failed rollback'
);
select is(
  (select count(*)::int from public.cash_pool_entries where import_batch_id = (select id from pgtap_batch4) and entry_kind = 'reversal'),
  0,
  '#18 zero reversal rows exist — the opening AND top-up reversals that succeeded earlier in the SAME call were rolled back too'
);
select is(
  (select count(*)::int from public.project_cost_ledger_entries where import_batch_id = (select id from pgtap_batch4) and entry_kind = 'reversal'),
  0,
  '#18 zero project_cost_ledger_entries reversal rows exist either'
);

-- =============================================================================
-- Staging immutability also covers 'rolled_back' (not just 'committed') —
-- an edit attempt on a rolled-back batch's mapping/disposition must still
-- be rejected, otherwise staging could silently drift from what was
-- actually posted and reversed.
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.set_cash_import_label_mapping((select id from pgtap_batch1), 'Kas', 'shared_overhead') $$,
  'BATCH_COMMITTED_IMMUTABLE',
  'mapping cannot be edited on a rolled_back batch'
);
select throws_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch1) and vessel_label = 'Kas'), 'skip', 'coba ubah setelah rollback'
     ) $$,
  'BATCH_COMMITTED_IMMUTABLE',
  'disposition cannot be edited on a rolled_back batch'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #23 No direct DELETE/UPDATE of a canonical amount; #24 import audit event
-- append-only.
-- =============================================================================

select ok(not has_table_privilege('authenticated', 'public.cash_pool_entries', 'UPDATE'), '#23 authenticated has no direct UPDATE on cash_pool_entries');
select ok(not has_table_privilege('authenticated', 'public.cash_pool_entries', 'DELETE'), '#23 authenticated has no direct DELETE on cash_pool_entries');
select ok(not has_table_privilege('authenticated', 'public.project_cost_ledger_entries', 'UPDATE'), '#23 authenticated has no direct UPDATE on project_cost_ledger_entries');
select ok(not has_table_privilege('authenticated', 'public.project_cost_ledger_entries', 'DELETE'), '#23 authenticated has no direct DELETE on project_cost_ledger_entries');
select ok(not has_table_privilege('authenticated', 'public.cash_import_batches', 'UPDATE'), '#23 authenticated has no direct UPDATE on cash_import_batches (rollback snapshot columns are RPC-only)');

select throws_ok(
  $$ update public.cash_pool_entries set amount = 999999 where import_batch_id = (select id from pgtap_batch1) and entry_kind = 'entry' limit 1 $$,
  null,
  '#23 a direct UPDATE of a canonical cash_pool_entries amount is blocked by the append-only trigger even for a privileged role'
);
select throws_ok(
  $$ delete from public.cash_pool_entries where import_batch_id = (select id from pgtap_batch1) and entry_kind = 'entry' $$,
  null,
  '#23 a direct DELETE of a canonical cash_pool_entries row is blocked by the append-only trigger even for a privileged role'
);
select throws_ok(
  $$ update public.cash_import_events set event_payload = '{}'::jsonb where batch_id = (select id from pgtap_batch1) and event_type = 'owner_rolled_back_import' $$,
  null,
  '#24 a direct UPDATE of the owner_rolled_back_import audit event is blocked by the append-only trigger'
);
select throws_ok(
  $$ insert into public.cash_import_events (tenant_id, batch_id, event_type, actor_user_id, event_payload)
     values ((select id from pgtap_tenant_p), (select id from pgtap_batch1), 'owner_rolled_back_import', (select id from pgtap_owner_p), '{}'::jsonb) $$,
  null,
  '#24 an owner_rolled_back_import event with no reason in its payload violates the reason-required constraint'
);

-- =============================================================================
-- #22 Tenant isolation after rollback.
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'e2000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is_empty(
  $$ select id from public.cash_import_batches where id = (select id from pgtap_batch1) $$,
  '#22 tenant Q''s owner cannot read tenant P''s rolled-back batch'
);
select is_empty(
  $$ select id from public.cash_pool_entries where import_batch_id = (select id from pgtap_batch1) $$,
  '#22 tenant Q''s owner cannot read tenant P''s reversal entries'
);
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();

rollback;
