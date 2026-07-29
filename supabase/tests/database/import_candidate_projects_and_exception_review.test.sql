-- ADOP Gate 6I-A — pgTAP proof for Scalable Import Automation &
-- Exception-Only Review: candidate creation plan capture, exception-only
-- auto-disposition, atomic candidate vessel/project creation at approval
-- (never earlier), exactly-once creation, atomic rollback of the whole
-- candidate+ledger transaction, the new draft lifecycle state + its
-- draft->active promotion, tenant isolation on the new table, and
-- backward compatibility with the pre-Gate-6I-A existing_vessel_project /
-- cash / shared_overhead flow.
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
  ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'pgtap-import-candidate-tenant-p', 'PgTAP Import Candidate Tenant P', 'active'),
  ('e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2', 'pgtap-import-candidate-tenant-q', 'PgTAP Import Candidate Tenant Q', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-0000-000000000001', 'authenticated', 'authenticated', 'owner-p@pgtap-import-candidate.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-0000-000000000002', 'authenticated', 'authenticated', 'admin-p@pgtap-import-candidate.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-0000-000000000003', 'authenticated', 'authenticated', 'viewer-p@pgtap-import-candidate.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'e2000000-0000-4000-0000-000000000001', 'authenticated', 'authenticated', 'owner-q@pgtap-import-candidate.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('e1500000-4000-0000-0000-000000000001', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'e1000000-0000-4000-0000-000000000001', 'active'),
  ('e1500000-4000-0000-0000-000000000002', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'e1000000-0000-4000-0000-000000000002', 'active'),
  ('e1500000-4000-0000-0000-000000000003', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'e1000000-0000-4000-0000-000000000003', 'active'),
  ('e2500000-4000-0000-0000-000000000001', 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2', 'e2000000-0000-4000-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('e1500000-4000-0000-0000-000000000001', 'owner'),
  ('e1500000-4000-0000-0000-000000000002', 'admin'),
  ('e1500000-4000-0000-0000-000000000003', 'viewer'),
  ('e2500000-4000-0000-0000-000000000001', 'owner');

insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('e1a00000-0000-0000-0000-0000000000c1', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'CL-IC-ANCHOR', 'Anchor Client IC', 'e1000000-0000-4000-0000-000000000001');

insert into public.service_types (id, tenant_id, code, name) values
  ('e1a00000-0000-0000-0000-0000000000b1', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'ic-service', 'IC Service');

insert into public.facility_locations (id, tenant_id, code, name) values
  ('e1a00000-0000-0000-0000-0000000000f1', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'FL-IC-ANCHOR', 'IC Facility');

-- An already-existing vessel/project, for the existing_vessel_project /
-- backward-compatibility scenario (Scenario 6).
insert into public.vessels (id, tenant_id, client_id, vessel_code, vessel_name, created_by) values
  ('e1a00000-0000-0000-0000-0000000000a1', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'e1a00000-0000-0000-0000-0000000000c1', 'VS-IC-ANCHOR', 'KM Anchor IC', 'e1000000-0000-4000-0000-000000000001');
insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by) values
  ('e1a00000-0000-0000-0000-0000000000a2', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'e1a00000-0000-0000-0000-0000000000a1', 'e1a00000-0000-0000-0000-0000000000c1', 'e1a00000-0000-0000-0000-0000000000b1', 'e1a00000-0000-0000-0000-0000000000f1', 'ID-IC-PROJECT', '2035-01-01', 'e1000000-0000-4000-0000-000000000001');

create temporary table pgtap_owner_p as select 'e1000000-0000-4000-0000-000000000001'::uuid as id;
create temporary table pgtap_admin_p as select 'e1000000-0000-4000-0000-000000000002'::uuid as id;
create temporary table pgtap_viewer_p as select 'e1000000-0000-4000-0000-000000000003'::uuid as id;
create temporary table pgtap_owner_q as select 'e2000000-0000-4000-0000-000000000001'::uuid as id;
create temporary table pgtap_tenant_p as select 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1'::uuid as id;
create temporary table pgtap_client_a as select 'e1a00000-0000-0000-0000-0000000000c1'::uuid as id;
create temporary table pgtap_service_type_a as select 'e1a00000-0000-0000-0000-0000000000b1'::uuid as id;
create temporary table pgtap_facility_a as select 'e1a00000-0000-0000-0000-0000000000f1'::uuid as id;
create temporary table pgtap_project_anchor as select 'e1a00000-0000-0000-0000-0000000000a2'::uuid as id;
grant select on pgtap_tenant_p to authenticated;
grant select on pgtap_client_a to authenticated;
grant select on pgtap_service_type_a to authenticated;
grant select on pgtap_facility_a to authenticated;
grant select on pgtap_project_anchor to authenticated;

-- =============================================================================
-- Scenario 1 — candidate plan capture: required fields, upsert, cleanup
-- =============================================================================

select set_config(
  'pgtap.rows_scenario1',
  $$[
    {"source_row_number":2,"source_fingerprint":"s1-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":0,"calculated_balance":0,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"s1-cand","description":"beli spare part kapal baru","vessel_label":"KM Nusantara","debit":null,"credit":100000,"workbook_balance":-100000,"calculated_balance":-100000,"provisional_classification":"project_expense_candidate","status":"valid","validation_issues":[]}
  ]$$,
  true
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'laporan-plan-capture.xlsx', 'sha-plan-capture-001', 'Sheet1', '2036-07-01',
       0, -100000, current_setting('pgtap.rows_scenario1')::jsonb
     ) $$,
  'scenario 1 batch staged'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch1 as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-plan-capture-001';
grant select on pgtap_batch1 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select public.set_cash_import_label_mapping((select id from pgtap_batch1), 'KM Nusantara', 'new_project_candidate') $$,
  'CANDIDATE_PLAN_FIELDS_REQUIRED',
  '#1 mapping new_project_candidate without vessel name/client/service type/start date fails fast'
);

select lives_ok(
  $$ select public.set_cash_import_label_mapping(
       (select id from pgtap_batch1), 'KM Nusantara', 'new_project_candidate', null,
       'KM Nusantara', (select id from pgtap_client_a), (select id from pgtap_service_type_a),
       (select id from pgtap_facility_a), '2036-07-01', 'standard'
     ) $$,
  '#2 mapping new_project_candidate with a complete plan succeeds'
);
select is(
  (select count(*)::int from public.cash_import_candidate_plans where batch_id = (select id from pgtap_batch1) and vessel_label = 'KM Nusantara'),
  1, '#2 exactly one candidate plan row exists for the label'
);
select is(
  (select vessel_name from public.cash_import_candidate_plans where batch_id = (select id from pgtap_batch1) and vessel_label = 'KM Nusantara'),
  'KM Nusantara', 'plan carries the supplied vessel name'
);
select ok(
  (select resolved_project_id from public.cash_import_candidate_plans where batch_id = (select id from pgtap_batch1) and vessel_label = 'KM Nusantara') is null,
  '#3 the plan resolves to no project yet — creation has not happened at mapping time'
);
select is(
  (select count(*)::int from public.vessels where tenant_id = (select id from pgtap_tenant_p) and vessel_name = 'KM Nusantara'),
  0, '#3 no vessel row was created merely by saving the mapping'
);

-- Re-mapping away from new_project_candidate deletes the stale plan.
select lives_ok(
  $$ select public.set_cash_import_label_mapping((select id from pgtap_batch1), 'KM Nusantara', 'unresolved') $$,
  'label remapped to unresolved'
);
select is(
  (select count(*)::int from public.cash_import_candidate_plans where batch_id = (select id from pgtap_batch1) and vessel_label = 'KM Nusantara'),
  0, 'stale candidate plan was deleted on remap away from new_project_candidate'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- Scenario 2 — CANDIDATE_PLAN_INCOMPLETE at ready-for-review (defensive
-- re-check for a state unreachable via the normal RPC surface — simulated
-- via a direct superuser delete of the plan row, mirroring the existing
-- owner_approved_cash_import_commit.test.sql Scenario 3 convention).
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.set_cash_import_label_mapping(
       (select id from pgtap_batch1), 'KM Nusantara', 'new_project_candidate', null,
       'KM Nusantara', (select id from pgtap_client_a), (select id from pgtap_service_type_a),
       (select id from pgtap_facility_a), '2036-07-01', 'standard'
     ) $$,
  'label re-mapped to new_project_candidate with a complete plan'
);
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch1) and vessel_label = 'KM Nusantara'), 'include', null
     ) $$, 'row included under the candidate mapping'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Simulate drift: directly (superuser, bypasses RLS/RPC) delete the plan.
delete from public.cash_import_candidate_plans where batch_id = (select id from pgtap_batch1) and vessel_label = 'KM Nusantara';

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch1)) $$,
  'CANDIDATE_PLAN_INCOMPLETE',
  '#4 an included new_project_candidate row with no matching plan blocks ready-for-review'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- Scenario 2b — auto-apply never includes an error-status row, even when its
-- label is otherwise cleanly mapped. Kept in its own tiny batch (never
-- advanced to ready_for_review) because ANY error-status row permanently
-- blocks ready_for_review via the pre-existing VALIDATION_ERRORS_PRESENT
-- guard regardless of disposition — unrelated to Gate 6I-A, just a fact
-- about this fixture's shape.
-- =============================================================================

select set_config(
  'pgtap.rows_scenario2b',
  $$[
    {"source_row_number":2,"source_fingerprint":"s2b-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":0,"calculated_balance":0,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"s2b-error","description":"baris rusak","vessel_label":"Kas","debit":10000,"credit":null,"workbook_balance":10000,"calculated_balance":10000,"provisional_classification":"cash_top_up_candidate","status":"error","validation_issues":[{"code":"AMOUNT_INVALID","severity":"error","message":"rusak"}]}
  ]$$,
  true
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'laporan-error-row.xlsx', 'sha-error-row-001', 'Sheet1', '2036-07-01',
       0, 10000, current_setting('pgtap.rows_scenario2b')::jsonb
     ) $$,
  'scenario 2b batch staged'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch2b as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-error-row-001';
grant select on pgtap_batch2b to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok($$ select public.set_cash_import_label_mapping((select id from pgtap_batch2b), 'Kas', 'cash') $$, 'error-row label mapped to cash (a normally-auto-includable kind)');
select is(
  (select (public.auto_apply_cash_import_batch_dispositions((select id from pgtap_batch2b))).auto_included_count),
  0, 'auto-apply includes zero rows — the only row is status=error'
);
select is(
  (select disposition from public.cash_import_rows where batch_id = (select id from pgtap_batch2b) and source_fingerprint = 's2b-error'),
  'manual_review', 'the error-status row is left for manual review, never auto-included, despite a clean cash mapping'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- Scenario 3 — full candidate approval happy path: exception-only
-- auto-disposition, atomic candidate creation ONLY at approval, exactly-once
-- creation, draft lifecycle + draft->active promotion, canonical totals.
-- =============================================================================

select set_config(
  'pgtap.rows_scenario3',
  $$[
    {"source_row_number":2,"source_fingerprint":"s3-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":1000000,"calculated_balance":1000000,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"s3-kas","description":"setor kas","vessel_label":"Kas","debit":500000,"credit":null,"workbook_balance":1500000,"calculated_balance":1500000,"provisional_classification":"cash_top_up_candidate","status":"valid","validation_issues":[]},
    {"source_row_number":4,"source_fingerprint":"s3-cand-expense","description":"beli spare part","vessel_label":"KM Cakrawala","debit":null,"credit":150000,"workbook_balance":1350000,"calculated_balance":1350000,"provisional_classification":"project_expense_candidate","status":"valid","validation_issues":[]},
    {"source_row_number":5,"source_fingerprint":"s3-cand-refund","description":"pengembalian sisa material","vessel_label":"KM Cakrawala","debit":30000,"credit":null,"workbook_balance":1380000,"calculated_balance":1380000,"provisional_classification":"project_cash_in_or_refund_review","status":"valid","validation_issues":[]},
    {"source_row_number":6,"source_fingerprint":"s3-overhead","description":"listrik kantor","vessel_label":"Lain-lain","debit":null,"credit":80000,"workbook_balance":1300000,"calculated_balance":1300000,"provisional_classification":"unallocated_expense_review","status":"valid","validation_issues":[]},
    {"source_row_number":7,"source_fingerprint":"s3-dup","description":"kemungkinan duplikat","vessel_label":"KM Cakrawala","debit":null,"credit":50000,"workbook_balance":1250000,"calculated_balance":1250000,"provisional_classification":"project_expense_candidate","status":"warning","validation_issues":[{"code":"DUPLICATE_ROW_CANDIDATE","severity":"warning","message":"dup"}]},
    {"source_row_number":8,"source_fingerprint":"s3-unmapped","description":"belum dipetakan","vessel_label":"KM Belum Dipetakan","debit":null,"credit":20000,"workbook_balance":1230000,"calculated_balance":1230000,"provisional_classification":"unallocated_expense_review","status":"valid","validation_issues":[]}
  ]$$,
  true
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'laporan-candidate-happy.xlsx', 'sha-candidate-happy-001', 'Sheet1', '2036-07-02',
       1000000, 1230000, current_setting('pgtap.rows_scenario3')::jsonb
     ) $$,
  'scenario 3 batch staged'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch3 as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-candidate-happy-001';
grant select on pgtap_batch3 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok($$ select public.set_cash_import_label_mapping((select id from pgtap_batch3), 'Kas', 'cash') $$, 'Kas mapped');
select lives_ok(
  $$ select public.set_cash_import_label_mapping(
       (select id from pgtap_batch3), 'KM Cakrawala', 'new_project_candidate', null,
       'KM Cakrawala', (select id from pgtap_client_a), (select id from pgtap_service_type_a),
       (select id from pgtap_facility_a), '2036-07-02', 'urgent'
     ) $$,
  'KM Cakrawala mapped as a new project candidate with a complete plan'
);
select lives_ok($$ select public.set_cash_import_label_mapping((select id from pgtap_batch3), 'Lain-lain', 'shared_overhead') $$, 'Lain-lain mapped');

-- --- #5 Exception-only auto-disposition: whole-batch bulk apply -------------
select is(
  (select (public.auto_apply_cash_import_batch_dispositions((select id from pgtap_batch3))).auto_included_count),
  4, '#5 auto-apply includes exactly the 4 unambiguous rows (Kas, 2x KM Cakrawala, Lain-lain)'
);
select is(
  (select (public.auto_apply_cash_import_batch_dispositions((select id from pgtap_batch3), null, false)).manual_review_count),
  0, 'a second whole-batch auto-apply call is a no-op — the 2 exception rows were already dispositioned manual_review by the first call'
);
select is(
  (select disposition from public.cash_import_rows where batch_id = (select id from pgtap_batch3) and vessel_label = 'Kas' and debit = 500000),
  'include', 'Kas top-up row auto-included'
);
select is(
  (select disposition from public.cash_import_rows where batch_id = (select id from pgtap_batch3) and vessel_label = 'KM Cakrawala' and credit = 150000),
  'include', 'candidate expense row auto-included'
);
select is(
  (select disposition from public.cash_import_rows where batch_id = (select id from pgtap_batch3) and vessel_label = 'KM Cakrawala' and debit = 30000),
  'include', 'candidate refund row auto-included'
);
select is(
  (select disposition from public.cash_import_rows where batch_id = (select id from pgtap_batch3) and vessel_label = 'Lain-lain'),
  'include', 'overhead row auto-included'
);
select is(
  (select disposition from public.cash_import_rows where batch_id = (select id from pgtap_batch3) and source_fingerprint = 's3-dup'),
  'manual_review', '#6 duplicate-flagged row stays an exception, never auto-included'
);
select is(
  (select disposition from public.cash_import_rows where batch_id = (select id from pgtap_batch3) and source_fingerprint = 's3-unmapped'),
  'manual_review', '#6 an unmapped label stays an exception, never auto-included'
);
select ok(
  (select disposition_reason from public.cash_import_rows where batch_id = (select id from pgtap_batch3) and source_fingerprint = 's3-dup') is not null,
  '#7 the exception disposition carries an explanatory reason'
);
select is(
  (select count(*)::int from public.cash_import_events where batch_id = (select id from pgtap_batch3) and event_type = 'auto_disposition_applied'),
  2, 'exactly two auto_disposition_applied audit events were recorded (one per call)'
);

-- Resolve the 2 remaining exceptions manually (skip them) so the batch can
-- reach ready_for_review. (auto-apply's own refusal to auto-include an
-- error-status row is proven separately in Scenario 2b, in a batch that
-- never attempts ready-for-review — a batch with ANY error-status row can
-- never reach ready_for_review regardless of disposition, per the
-- pre-existing VALIDATION_ERRORS_PRESENT guard, unrelated to Gate 6I-A.)
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch3) and source_fingerprint = 's3-dup'), 'skip', 'duplikat dikonfirmasi, dilewati'
     ) $$, 'duplicate row manually resolved as skip'
);
-- mark_cash_import_batch_ready_for_review requires EVERY non-opening row to
-- carry SOME mapping_kind, even one being skipped (pre-existing invariant,
-- unrelated to Gate 6I-A) — map it 'unresolved' now, AFTER auto-apply
-- already correctly left it manual_review while it was still unmapped.
select lives_ok(
  $$ select public.set_cash_import_label_mapping((select id from pgtap_batch3), 'KM Belum Dipetakan', 'unresolved') $$,
  'previously-unmapped label now mapped unresolved, so ready-for-review can proceed'
);
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch3) and source_fingerprint = 's3-unmapped'), 'skip', 'belum ada mapping, dilewati periode ini'
     ) $$, 'unmapped row manually resolved as skip'
);
select lives_ok($$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch3)) $$, 'scenario 3 batch reaches ready_for_review');
reset role;
select set_config('request.jwt.claims', '', true);

-- --- #8 Candidate vessel/project do not exist before approval ----------------
select is(
  (select count(*)::int from public.vessels where tenant_id = (select id from pgtap_tenant_p) and vessel_name = 'KM Cakrawala'),
  0, '#8 no candidate vessel exists yet — batch is only ready_for_review, not approved'
);

-- --- #9 Owner approves: atomic candidate creation + canonical commit --------
select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch3)) $$,
  '#9 owner approves scenario 3, creating the candidate vessel/project atomically with the ledger postings'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.vessels where tenant_id = (select id from pgtap_tenant_p) and vessel_name = 'KM Cakrawala'),
  1, '#10 exactly one candidate vessel was created'
);
select is(
  (select client_id from public.vessels where tenant_id = (select id from pgtap_tenant_p) and vessel_name = 'KM Cakrawala'),
  (select id from pgtap_client_a), 'candidate vessel carries the plan''s client'
);
select is(
  (select count(*)::int from public.vessel_projects vp
     join public.vessels v on v.id = vp.vessel_id
     where v.vessel_name = 'KM Cakrawala' and vp.tenant_id = (select id from pgtap_tenant_p)),
  1, '#10 exactly one candidate Project Kapal was created'
);
select is(
  (select lifecycle_status from public.vessel_projects vp join public.vessels v on v.id = vp.vessel_id where v.vessel_name = 'KM Cakrawala'),
  'draft', '#11 the candidate project is created in draft lifecycle status'
);
select is(
  (select priority from public.vessel_projects vp join public.vessels v on v.id = vp.vessel_id where v.vessel_name = 'KM Cakrawala'),
  'urgent', 'candidate project carries the plan''s priority'
);
select is(
  (select resolved_vessel_id from public.cash_import_candidate_plans where batch_id = (select id from pgtap_batch3) and vessel_label = 'KM Cakrawala'),
  (select id from public.vessels where vessel_name = 'KM Cakrawala'),
  'the plan row now records the resolved vessel id'
);

create temporary table pgtap_project_cakrawala as
  select vp.id from public.vessel_projects vp join public.vessels v on v.id = vp.vessel_id where v.vessel_name = 'KM Cakrawala';
grant select on pgtap_project_cakrawala to authenticated;

select is(
  (select count(*)::int from public.project_cost_ledger_entries where project_id = (select id from pgtap_project_cakrawala) and entry_kind = 'expense'),
  1, 'candidate project expense posted'
);
select is(
  (select amount from public.project_cost_ledger_entries where project_id = (select id from pgtap_project_cakrawala) and entry_kind = 'expense'),
  150000::numeric(16,2), 'candidate project expense amount correct'
);
select is(
  (select amount from public.project_cost_ledger_entries where project_id = (select id from pgtap_project_cakrawala) and entry_kind = 'refund'),
  30000::numeric(16,2), 'candidate project refund amount correct'
);
select is(
  (select total_cost from public.vessel_project_cost_summary where project_id = (select id from pgtap_project_cakrawala)),
  120000::numeric(16,2), 'candidate project cost summary is net of the refund: 150,000 - 30,000'
);
select is(
  (select canonical_closing_cash from public.cash_import_batches where id = (select id from pgtap_batch3)),
  1300000::numeric(16,2),
  'canonical closing cash correct with a candidate row mix: 1,000,000 + 500,000 + 30,000 - 150,000 - 80,000'
);

-- --- #12 Exactly-once: a second approval attempt creates nothing new --------
select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch3)) $$,
  'BATCH_ALREADY_COMMITTED',
  '#12 a second approval attempt is rejected deterministically'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.vessels where tenant_id = (select id from pgtap_tenant_p) and vessel_name = 'KM Cakrawala'),
  1, '#12 still exactly one candidate vessel after the second attempt'
);
select is(
  (select count(*)::int from public.vessel_projects vp join public.vessels v on v.id = vp.vessel_id where v.vessel_name = 'KM Cakrawala'),
  1, '#12 still exactly one candidate project after the second attempt'
);

-- --- #13 draft lifecycle transition guard + draft->active promotion --------
select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.transition_vessel_project_lifecycle((select id from pgtap_project_cakrawala), 'closed') $$,
  'invalid vessel project lifecycle transition from draft to closed',
  '#13 draft cannot skip straight to closed'
);
select throws_ok(
  $$ select public.transition_vessel_project_lifecycle((select id from pgtap_project_cakrawala), 'ready_to_close') $$,
  'invalid vessel project lifecycle transition from draft to ready_to_close',
  '#13 draft cannot skip straight to ready_to_close'
);
select lives_ok(
  $$ select public.transition_vessel_project_lifecycle((select id from pgtap_project_cakrawala), 'active', 'kelengkapan data selesai') $$,
  '#13 the minimal draft->active promotion is allowed via the existing transition RPC'
);
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select lifecycle_status from public.vessel_projects where id = (select id from pgtap_project_cakrawala)),
  'active', 'candidate project promoted from draft to active'
);

-- =============================================================================
-- Scenario 4 — atomic rollback: a mid-loop failure rolls back the candidate
-- vessel/project creation too, not just the ledger postings.
-- =============================================================================

select set_config(
  'pgtap.rows_scenario4',
  $$[
    {"source_row_number":2,"source_fingerprint":"s4-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":200000,"calculated_balance":200000,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"s4-cand","description":"beli spare part","vessel_label":"KM Gagal Bayar","debit":null,"credit":100000,"workbook_balance":100000,"calculated_balance":100000,"provisional_classification":"project_expense_candidate","status":"valid","validation_issues":[]},
    {"source_row_number":4,"source_fingerprint":"s4-bad-overhead","description":"listrik kantor (data rusak: debit, bukan kredit)","vessel_label":"Lain-lain","debit":50000,"credit":null,"workbook_balance":150000,"calculated_balance":150000,"provisional_classification":"unallocated_expense_review","status":"valid","validation_issues":[]}
  ]$$,
  true
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'laporan-candidate-rollback.xlsx', 'sha-candidate-rollback-001', 'Sheet1', '2036-07-03',
       200000, 150000, current_setting('pgtap.rows_scenario4')::jsonb
     ) $$,
  'scenario 4 batch staged'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch4 as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-candidate-rollback-001';
grant select on pgtap_batch4 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.set_cash_import_label_mapping(
       (select id from pgtap_batch4), 'KM Gagal Bayar', 'new_project_candidate', null,
       'KM Gagal Bayar', (select id from pgtap_client_a), (select id from pgtap_service_type_a),
       (select id from pgtap_facility_a), '2036-07-03', 'standard'
     ) $$,
  'candidate label mapped with a complete plan'
);
select lives_ok($$ select public.set_cash_import_label_mapping((select id from pgtap_batch4), 'Lain-lain', 'shared_overhead') $$, 'overhead label mapped');
select is(
  (select (public.auto_apply_cash_import_batch_dispositions((select id from pgtap_batch4))).auto_included_count),
  1, 'auto-apply includes only the valid candidate row — the bad-direction overhead row fails its direction check and is left an exception'
);
select is(
  (select disposition from public.cash_import_rows where batch_id = (select id from pgtap_batch4) and vessel_label = 'Lain-lain'),
  'manual_review', 'the bad-direction row was correctly left for manual review by auto-apply, not silently included'
);
-- Force it to 'include' anyway (simulating an admin manual override that
-- turns out to be wrong) so the commit RPC's own defensive direction check —
-- not auto-apply's — is what's actually under test here.
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch4) and vessel_label = 'Lain-lain'), 'include', null
     ) $$, 'admin manually overrides the bad-direction row to include anyway'
);
select lives_ok($$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch4)) $$, 'scenario 4 batch reaches ready_for_review');
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch4)) $$,
  'UNEXPECTED_ROW_DIRECTION',
  '#14 the bad-direction overhead row fails after the candidate vessel/project were already created within the same call'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.vessels where tenant_id = (select id from pgtap_tenant_p) and vessel_name = 'KM Gagal Bayar'),
  0, '#14 the whole commit rolled back — the candidate vessel created mid-transaction no longer exists'
);
select is(
  (select count(*)::int from public.vessel_projects vp join public.vessels v on v.id = vp.vessel_id where v.vessel_name = 'KM Gagal Bayar'),
  0, '#14 the candidate project created mid-transaction no longer exists either'
);
select ok(
  (select resolved_vessel_id from public.cash_import_candidate_plans where batch_id = (select id from pgtap_batch4) and vessel_label = 'KM Gagal Bayar') is null,
  '#14 the plan''s resolved_vessel_id was rolled back to null'
);
select is(
  (select status from public.cash_import_batches where id = (select id from pgtap_batch4)),
  'ready_for_review', '#14 the batch status was never changed by the failed commit'
);
select is(
  (select count(*)::int from public.cash_pools where tenant_id = (select id from pgtap_tenant_p) and business_date = '2036-07-03'),
  0, '#14 even the newly get-or-created pool row no longer exists'
);

-- =============================================================================
-- Scenario 5 — tenant isolation on the new table; unauthorized auto-apply
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'e2000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is_empty(
  $$ select id from public.cash_import_candidate_plans where batch_id = (select id from pgtap_batch3) $$,
  '#15 a different tenant''s owner cannot read tenant P''s candidate plans'
);
select throws_ok(
  $$ select public.auto_apply_cash_import_batch_dispositions((select id from pgtap_batch3)) $$,
  'not authorized to edit cash import batch mapping',
  '#15 a different tenant''s owner cannot run auto-apply (found by id via SECURITY DEFINER, rejected by the real tenant''s own role check)'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.auto_apply_cash_import_batch_dispositions((select id from pgtap_batch3)) $$,
  'not authorized to edit cash import batch mapping',
  '#16 viewer cannot call auto-apply'
);
reset role;
select set_config('request.jwt.claims', '', true);

select ok(
  not has_function_privilege('anon', 'public.auto_apply_cash_import_batch_dispositions(uuid, text, boolean)', 'EXECUTE'),
  '#17 anon cannot execute auto_apply_cash_import_batch_dispositions'
);
select ok(
  not has_table_privilege('authenticated', 'public.cash_import_candidate_plans', 'INSERT'),
  '#17 authenticated has no direct INSERT on cash_import_candidate_plans — mutation only via the RPCs'
);

-- =============================================================================
-- Scenario 6 — backward compatibility: an old-style batch using only
-- existing_vessel_project/cash (no candidate plans anywhere) still
-- auto-applies and commits exactly as it did before this gate.
-- =============================================================================

select set_config(
  'pgtap.rows_scenario6',
  $$[
    {"source_row_number":2,"source_fingerprint":"s6-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":300000,"calculated_balance":300000,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"s6-kas","description":"setor kas","vessel_label":"Kas","debit":100000,"credit":null,"workbook_balance":400000,"calculated_balance":400000,"provisional_classification":"cash_top_up_candidate","status":"valid","validation_issues":[]},
    {"source_row_number":4,"source_fingerprint":"s6-expense","description":"beli spare part","vessel_label":"KM Anchor IC","debit":null,"credit":60000,"workbook_balance":340000,"calculated_balance":340000,"provisional_classification":"project_expense_candidate","status":"valid","validation_issues":[]}
  ]$$,
  true
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'laporan-backward-compat.xlsx', 'sha-backward-compat-001', 'Sheet1', '2036-07-04',
       300000, 340000, current_setting('pgtap.rows_scenario6')::jsonb
     ) $$,
  'scenario 6 batch staged'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch6 as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-backward-compat-001';
grant select on pgtap_batch6 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok($$ select public.set_cash_import_label_mapping((select id from pgtap_batch6), 'Kas', 'cash') $$, 'Kas mapped');
select lives_ok(
  $$ select public.set_cash_import_label_mapping((select id from pgtap_batch6), 'KM Anchor IC', 'existing_vessel_project', (select id from pgtap_project_anchor)) $$,
  'label mapped to the pre-existing anchor project'
);
select is(
  (select (public.auto_apply_cash_import_batch_dispositions((select id from pgtap_batch6))).auto_included_count),
  2, 'auto-apply also works for the pre-Gate-6I-A existing_vessel_project/cash mapping kinds'
);
select lives_ok($$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch6)) $$, 'scenario 6 batch reaches ready_for_review');
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch6)) $$,
  'scenario 6 batch commits unchanged from the pre-Gate-6I-A behavior'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status from public.cash_import_batches where id = (select id from pgtap_batch6)),
  'committed', 'scenario 6 batch committed'
);
select is(
  (select count(*)::int from public.cash_import_candidate_plans where batch_id = (select id from pgtap_batch6)),
  0, 'no candidate plans were ever created for a batch that never used new_project_candidate'
);

-- =============================================================================
-- Scenario 7 — manual override before auto-apply is respected, never
-- overwritten (auto-apply only ever touches disposition IS NULL rows).
-- =============================================================================

select set_config(
  'pgtap.rows_scenario7',
  $$[
    {"source_row_number":2,"source_fingerprint":"s7-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":0,"calculated_balance":0,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"s7-kas","description":"setor kas","vessel_label":"Kas","debit":40000,"credit":null,"workbook_balance":40000,"calculated_balance":40000,"provisional_classification":"cash_top_up_candidate","status":"valid","validation_issues":[]}
  ]$$,
  true
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'laporan-manual-override.xlsx', 'sha-manual-override-001', 'Sheet1', '2036-07-05',
       0, 40000, current_setting('pgtap.rows_scenario7')::jsonb
     ) $$,
  'scenario 7 batch staged'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch7 as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-manual-override-001';
grant select on pgtap_batch7 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok($$ select public.set_cash_import_label_mapping((select id from pgtap_batch7), 'Kas', 'cash') $$, 'Kas mapped');
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch7) and vessel_label = 'Kas'), 'skip', 'admin memilih skip secara manual'
     ) $$, 'admin manually skips the row BEFORE auto-apply runs'
);
select is(
  (select (public.auto_apply_cash_import_batch_dispositions((select id from pgtap_batch7))).auto_included_count),
  0, '#18 auto-apply touches zero rows — the only row already has a disposition'
);
select is(
  (select disposition from public.cash_import_rows where batch_id = (select id from pgtap_batch7) and vessel_label = 'Kas'),
  'skip', '#18 the manual decision was never overwritten by auto-apply'
);
select is(
  (select disposition_reason from public.cash_import_rows where batch_id = (select id from pgtap_batch7) and vessel_label = 'Kas'),
  'admin memilih skip secara manual', '#18 the manual reason is preserved, not replaced by an auto-generated one'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- Scenario 8 — 500 rows across 12 unique vessel labels produce exactly as
-- many candidate plans as CANDIDATE labels, never one per row.
-- =============================================================================

select set_config(
  'pgtap.rows_scenario8',
  (
    select jsonb_build_array(
      jsonb_build_object(
        'source_row_number', 2, 'source_fingerprint', 's8-open', 'description', null, 'vessel_label', null,
        'debit', null, 'credit', null, 'workbook_balance', 0, 'calculated_balance', 0,
        'provisional_classification', 'opening_cash', 'status', 'valid', 'validation_issues', '[]'::jsonb
      )
    ) || jsonb_agg(
      jsonb_build_object(
        'source_row_number', i + 2,
        'source_fingerprint', 's8-bulk-' || i,
        'description', 'bulk row ' || i,
        'vessel_label', 'L' || lpad(((i - 1) % 12 + 1)::text, 2, '0'),
        'debit', null,
        'credit', 1000,
        'workbook_balance', -1000 * i,
        'calculated_balance', -1000 * i,
        'provisional_classification', 'project_expense_candidate',
        'status', 'valid',
        'validation_issues', '[]'::jsonb
      )
    )
    from generate_series(1, 500) as i
  )::text,
  true
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'laporan-bulk-500.xlsx', 'sha-bulk-500-001', 'Sheet1', '2036-07-06',
       0, -500000, current_setting('pgtap.rows_scenario8')::jsonb
     ) $$,
  '#19 500-row/12-label bulk batch staged'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch8 as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-bulk-500-001';
grant select on pgtap_batch8 to authenticated;

select is(
  (select count(distinct vessel_label)::int from public.cash_import_rows where batch_id = (select id from pgtap_batch8) and vessel_label is not null),
  12, '#19 the 500 rows really do carry exactly 12 distinct vessel labels'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
-- format(...) builds one distinct, fully-literal query string per label
-- (g is a plain SQL value here, not usable inside a static $$-quoted
-- literal passed to lives_ok, which EXECUTEs its argument in its own
-- context with no visibility into this query's g) — %L safely quotes each
-- interpolated value.
select lives_ok(
  format(
    $fmt$ select public.set_cash_import_label_mapping(
         (select id from pgtap_batch8), %L, 'new_project_candidate', null,
         %L, (select id from pgtap_client_a), (select id from pgtap_service_type_a),
         (select id from pgtap_facility_a), '2036-07-06', 'standard'
       ) $fmt$,
    'L' || lpad(g::text, 2, '0'),
    'Bulk Vessel ' || g
  ),
  'label L' || lpad(g::text, 2, '0') || ' mapped'
) from generate_series(1, 12) as g;
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.cash_import_candidate_plans where batch_id = (select id from pgtap_batch8)),
  12, '#19 exactly 12 candidate plans exist for 500 rows across 12 labels — never one per row'
);

-- =============================================================================
-- Scenario 9 — Corrective: draft operational safety (excluded from normal
-- Shared Overhead targets) + draft->active activation guard (fail-closed on
-- missing/cross-tenant facility location, unauthorized/cross-tenant
-- rejected, complete draft activates).
-- =============================================================================

insert into public.facility_locations (id, tenant_id, code, name) values
  ('e2a00000-0000-0000-0000-0000000000f1', 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2', 'FL-IC-Q', 'IC Facility Q');
create temporary table pgtap_facility_q as select 'e2a00000-0000-0000-0000-0000000000f1'::uuid as id;
grant select on pgtap_facility_q to authenticated;

select set_config(
  'pgtap.rows_scenario9',
  $$[
    {"source_row_number":2,"source_fingerprint":"s9-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":0,"calculated_balance":0,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"s9-cand","description":"beli spare part","vessel_label":"KM Belum Lengkap","debit":null,"credit":100000,"workbook_balance":-100000,"calculated_balance":-100000,"provisional_classification":"project_expense_candidate","status":"valid","validation_issues":[]}
  ]$$,
  true
);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'laporan-corrective.xlsx', 'sha-corrective-001', 'Sheet1', '2036-07-07',
       0, -100000, current_setting('pgtap.rows_scenario9')::jsonb
     ) $$,
  'scenario 9 batch staged'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch9 as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-corrective-001';
grant select on pgtap_batch9 to authenticated;

-- Deliberately NO facility location in this candidate plan — the point of
-- this scenario is a draft that's incomplete on exactly that field.
select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.set_cash_import_label_mapping(
       (select id from pgtap_batch9), 'KM Belum Lengkap', 'new_project_candidate', null,
       'KM Belum Lengkap', (select id from pgtap_client_a), (select id from pgtap_service_type_a),
       null, '2036-07-07', 'standard'
     ) $$,
  'candidate mapped with no facility location'
);
select is(
  (select (public.auto_apply_cash_import_batch_dispositions((select id from pgtap_batch9))).auto_included_count),
  1, 'the one candidate row auto-includes fine — facility location is not a mapping/disposition precondition'
);
select lives_ok($$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch9)) $$, 'scenario 9 batch reaches ready_for_review');
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch9)) $$,
  'owner approves scenario 9 — candidate vessel/draft project created without a facility location'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_project_incomplete as
  select vp.id from public.vessel_projects vp join public.vessels v on v.id = vp.vessel_id where v.vessel_name = 'KM Belum Lengkap';
grant select on pgtap_project_incomplete to authenticated;

select is(
  (select lifecycle_status from public.vessel_projects where id = (select id from pgtap_project_incomplete)),
  'draft', 'the new candidate project is draft, and facility_location_id is null'
);
select ok(
  (select facility_location_id from public.vessel_projects where id = (select id from pgtap_project_incomplete)) is null,
  'confirmed: facility_location_id is null on this draft'
);

-- --- #20 draft excluded from normal Shared Overhead allocation targets -----
-- Fixture: a standalone shared-overhead expense entry on tenant P's pool for
-- this batch's business_date, inserted directly (matches shared_overhead_
-- allocation.test.sql's own fixture-setup posture) since record_shared_
-- overhead_expense is not directly callable by `authenticated`.
create temporary table pgtap_pool9 as
  select id from public.cash_pools where tenant_id = (select id from pgtap_tenant_p) and business_date = '2036-07-07';
grant select on pgtap_pool9 to authenticated;

insert into public.project_cost_ledger_entries (
  tenant_id, pool_id, project_id, category_id, vendor_id, entry_kind, entry_scope, amount, description, actor_user_id
) values (
  (select id from pgtap_tenant_p), (select id from pgtap_pool9), null, null, null, 'expense', 'shared_overhead',
  50000, 'overhead scenario 9', 'e1000000-0000-4000-0000-000000000001'
);
create temporary table pgtap_overhead9 as
  select id from public.project_cost_ledger_entries
  where pool_id = (select id from pgtap_pool9) and entry_scope = 'shared_overhead';
grant select on pgtap_overhead9 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.allocate_shared_overhead_entry(
       (select id from pgtap_overhead9), (select id from pgtap_project_incomplete), 10000.00, 'coba alokasi ke draft'
     ) $$,
  'CANNOT_ALLOCATE_OVERHEAD_TO_INELIGIBLE_PROJECT',
  '#20 a draft project is rejected as a Shared Overhead allocation target, same as closed'
);
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from public.shared_overhead_allocations where project_id = (select id from pgtap_project_incomplete)),
  0, '#20 zero allocations exist against the draft project after the rejected attempt'
);

-- --- #21 draft->active fails closed when facility_location is missing -----
select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.transition_vessel_project_lifecycle((select id from pgtap_project_incomplete), 'active') $$,
  'DRAFT_ACTIVATION_MISSING_FACILITY_LOCATION',
  '#21 activating a draft with no facility location fails closed, via the RPC'
);
select is(
  (select lifecycle_status from public.vessel_projects where id = (select id from pgtap_project_incomplete)),
  'draft', '#21 the project is still draft after the rejected activation attempt'
);

-- --- #22 draft->active with a cross-tenant facility location is rejected ---
select throws_ok(
  format(
    $fmt$ select public.transition_vessel_project_lifecycle(%L, 'active', null, %L) $fmt$,
    (select id from pgtap_project_incomplete),
    (select id from pgtap_facility_q)
  ),
  'CROSS_TENANT_FACILITY_LOCATION_REJECTED',
  '#22 completing a draft with a different tenant''s facility location is rejected'
);
select is(
  (select lifecycle_status from public.vessel_projects where id = (select id from pgtap_project_incomplete)),
  'draft', '#22 still draft — the rejected cross-tenant attempt mutated nothing'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- --- #23 unauthorized / cross-tenant activation rejected --------------------
select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  format(
    $fmt$ select public.transition_vessel_project_lifecycle(%L, 'active', null, %L) $fmt$,
    (select id from pgtap_project_incomplete),
    (select id from pgtap_facility_a)
  ),
  'not authorized to transition vessel project lifecycle',
  '#23 viewer cannot activate a draft, even a complete one'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'e2000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  format(
    $fmt$ select public.transition_vessel_project_lifecycle(%L, 'active', null, %L) $fmt$,
    (select id from pgtap_project_incomplete),
    (select id from pgtap_facility_a)
  ),
  'not authorized to transition vessel project lifecycle',
  '#23 a different tenant''s owner cannot activate this draft (found by id via SECURITY DEFINER, rejected by the real tenant''s own role check)'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- --- #24 complete draft (admin-gated "Lengkapi & Aktifkan") activates ------
select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  format(
    $fmt$ select public.transition_vessel_project_lifecycle(%L, 'active', 'lengkapi facility lalu aktifkan', %L) $fmt$,
    (select id from pgtap_project_incomplete),
    (select id from pgtap_facility_a)
  ),
  '#24 admin completes the draft (facility location) and activates it in one atomic call'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select lifecycle_status from public.vessel_projects where id = (select id from pgtap_project_incomplete)),
  'active', '#24 the project is now active'
);
select is(
  (select facility_location_id from public.vessel_projects where id = (select id from pgtap_project_incomplete)),
  (select id from pgtap_facility_a), '#24 facility_location_id was set atomically with the activation'
);

-- --- #25 active/ready_to_close overhead allocation is unaffected ----------
select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.allocate_shared_overhead_entry(
       (select id from pgtap_overhead9), (select id from pgtap_project_incomplete), 10000.00, 'alokasi setelah aktif'
     ) $$,
  '#25 now that the project is active, the same overhead entry allocates fine — no regression'
);
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();

rollback;
