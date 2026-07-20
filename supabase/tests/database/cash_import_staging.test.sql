-- ADOP Phase 1 Gate 1J-B — pgTAP proof for Cash Import Staging, Mapping &
-- Upload Idempotency: schema, RLS, admin-only staging, owner-read-only,
-- cross-tenant isolation, atomic staging, upload-hash idempotency, mapping/
-- disposition invariants (error-cannot-include, skip-requires-reason,
-- cross-tenant project mapping rejected), audit events, and the
-- ready-for-review gate.
--
-- Self-contained: creates its own fixtures (tenant prefixes c1c1c1c1-/
-- c2c2c2c2-, not used by any other pgTAP file in this directory) and rolls
-- back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'pgtap-cash-import-tenant-p', 'PgTAP Cash Import Tenant P', 'active'),
  ('c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', 'pgtap-cash-import-tenant-q', 'PgTAP Cash Import Tenant Q', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-4000-0000-000000000001', 'authenticated', 'authenticated', 'owner-p@pgtap-cash-import.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-4000-0000-000000000002', 'authenticated', 'authenticated', 'admin-p@pgtap-cash-import.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-4000-0000-000000000003', 'authenticated', 'authenticated', 'viewer-p@pgtap-cash-import.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'c2000000-0000-4000-0000-000000000001', 'authenticated', 'authenticated', 'owner-q@pgtap-cash-import.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'c2000000-0000-4000-0000-000000000002', 'authenticated', 'authenticated', 'admin-q@pgtap-cash-import.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('c1500000-4000-0000-0000-000000000001', 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'c1000000-0000-4000-0000-000000000001', 'active'),
  ('c1500000-4000-0000-0000-000000000002', 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'c1000000-0000-4000-0000-000000000002', 'active'),
  ('c1500000-4000-0000-0000-000000000003', 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'c1000000-0000-4000-0000-000000000003', 'active'),
  ('c2500000-4000-0000-0000-000000000001', 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', 'c2000000-0000-4000-0000-000000000001', 'active'),
  ('c2500000-4000-0000-0000-000000000002', 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', 'c2000000-0000-4000-0000-000000000002', 'active');

insert into public.membership_roles (membership_id, role) values
  ('c1500000-4000-0000-0000-000000000001', 'owner'),
  ('c1500000-4000-0000-0000-000000000002', 'admin'),
  ('c1500000-4000-0000-0000-000000000003', 'viewer'),
  ('c2500000-4000-0000-0000-000000000001', 'owner'),
  ('c2500000-4000-0000-0000-000000000002', 'admin');

-- Anchor master data + one existing vessel_project per tenant, for the
-- existing_vessel_project mapping tests.
insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('c1a00000-0000-0000-0000-0000000000c1', 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'CL-P-ANCHOR', 'Anchor Client P', 'c1000000-0000-4000-0000-000000000001'),
  ('c2a00000-0000-0000-0000-0000000000c1', 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', 'CL-Q-ANCHOR', 'Anchor Client Q', 'c2000000-0000-4000-0000-000000000001');

insert into public.vessels (id, tenant_id, client_id, vessel_code, vessel_name, created_by) values
  ('c1a00000-0000-0000-0000-0000000000a1', 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'c1a00000-0000-0000-0000-0000000000c1', 'VS-P-ANCHOR', 'KM Anchor P', 'c1000000-0000-4000-0000-000000000001'),
  ('c2a00000-0000-0000-0000-0000000000a1', 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', 'c2a00000-0000-0000-0000-0000000000c1', 'VS-Q-ANCHOR', 'KM Anchor Q', 'c2000000-0000-4000-0000-000000000001');

insert into public.service_types (id, tenant_id, code, name) values
  ('c1a00000-0000-0000-0000-0000000000b1', 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'anchor-service', 'Anchor Service P'),
  ('c2a00000-0000-0000-0000-0000000000b1', 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', 'anchor-service', 'Anchor Service Q');

insert into public.facility_locations (id, tenant_id, code, name) values
  ('c1a00000-0000-0000-0000-0000000000f1', 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'FL-P-ANCHOR', 'Anchor Facility P'),
  ('c2a00000-0000-0000-0000-0000000000f1', 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', 'FL-Q-ANCHOR', 'Anchor Facility Q');

insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by) values
  ('c1a00000-0000-0000-0000-0000000000a2', 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'c1a00000-0000-0000-0000-0000000000a1', 'c1a00000-0000-0000-0000-0000000000c1', 'c1a00000-0000-0000-0000-0000000000b1', 'c1a00000-0000-0000-0000-0000000000f1', 'ID-P-PROJECT', '2035-01-01', 'c1000000-0000-4000-0000-000000000001');

insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by) values
  ('c2a00000-0000-0000-0000-0000000000a2', 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', 'c2a00000-0000-0000-0000-0000000000a1', 'c2a00000-0000-0000-0000-0000000000c1', 'c2a00000-0000-0000-0000-0000000000b1', 'c2a00000-0000-0000-0000-0000000000f1', 'ID-Q-PROJECT', '2035-01-01', 'c2000000-0000-4000-0000-000000000001');

-- =============================================================================
-- Baseline snapshot for §19 below, taken right after this file's own
-- fixtures and before any RPC under test runs. The whole file executes
-- inside one transaction (begin;...rollback; at the top/bottom), so this
-- sees every previously-committed row from seed.sql and any other test run
-- against this local database exactly as a real query would — comparing
-- against a captured baseline (not an absolute zero) is what makes this
-- assertion correct on a long-lived shared local dev database, where
-- cash_pools/cash_pool_entries in particular are permanently undeletable
-- (append-only trigger) and therefore accumulate across every prior
-- integration-test run ever executed against it.
create temporary table pgtap_operational_baseline as
select
  (select count(*)::int from public.clients) as clients,
  (select count(*)::int from public.vessels) as vessels,
  (select count(*)::int from public.vendors) as vendors,
  (select count(*)::int from public.vessel_projects) as vessel_projects,
  (select count(*)::int from public.cash_pools) as cash_pools,
  (select count(*)::int from public.cash_pool_entries) as cash_pool_entries,
  (select count(*)::int from public.expense_submissions) as expense_submissions,
  (select count(*)::int from public.expense_submission_revisions) as expense_submission_revisions,
  (select count(*)::int from public.project_cost_ledger_entries) as project_cost_ledger_entries,
  (select count(*)::int from public.cash_reconciliations) as cash_reconciliations,
  (select count(*)::int from public.expense_duplicate_candidates) as expense_duplicate_candidates;

-- SCHEMA
-- =============================================================================

select has_table('public', 'cash_import_batches', 'public.cash_import_batches exists');
select has_table('public', 'cash_import_rows', 'public.cash_import_rows exists');
select has_table('public', 'cash_import_events', 'public.cash_import_events exists');

select has_type('public', 'cash_import_batch_status', 'cash_import_batch_status enum exists');
select ok(
  (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.cash_import_batch_status'::regtype)
    = array['draft', 'mapping_required', 'ready_for_review', 'superseded', 'committed', 'rolled_back'],
  -- 'committed' appended by Gate 1J-C (20260720120000_owner_approved_cash_
  -- import_commit.sql), 'rolled_back' appended by Gate 1J-D
  -- (20260720130000_append_only_cash_import_rollback.sql), both via ALTER
  -- TYPE ... ADD VALUE — new enum values are always appended after existing
  -- ones, never inserted in sort order.
  'cash_import_batch_status is exactly draft/mapping_required/ready_for_review/superseded/committed/rolled_back'
);

select has_type('public', 'cash_import_mapping_kind', 'cash_import_mapping_kind enum exists');
select ok(
  (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.cash_import_mapping_kind'::regtype)
    = array['cash', 'existing_vessel_project', 'new_project_candidate', 'shared_overhead', 'unresolved'],
  'cash_import_mapping_kind is exactly the five locked mapping kinds'
);

select has_type('public', 'cash_import_row_disposition', 'cash_import_row_disposition enum exists');
select ok(
  (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.cash_import_row_disposition'::regtype)
    = array['include', 'skip', 'manual_review'],
  'cash_import_row_disposition is exactly include/skip/manual_review'
);

select ok((select relrowsecurity from pg_class where oid = 'public.cash_import_batches'::regclass), 'RLS enabled on cash_import_batches');
select ok((select relrowsecurity from pg_class where oid = 'public.cash_import_rows'::regclass), 'RLS enabled on cash_import_rows');
select ok((select relrowsecurity from pg_class where oid = 'public.cash_import_events'::regclass), 'RLS enabled on cash_import_events');

select has_trigger('public', 'cash_import_events', 'cash_import_events_append_only', 'cash_import_events has the append-only guard trigger');
select has_trigger('public', 'cash_import_batches', 'cash_import_batches_enforce_status_transition', 'cash_import_batches has the status transition guard trigger');

-- #20 — Direct table mutation ditolak (no INSERT/UPDATE/DELETE grant for `authenticated`).
select ok(not has_table_privilege('authenticated', 'public.cash_import_batches', 'INSERT'), 'authenticated has no INSERT on cash_import_batches');
select ok(not has_table_privilege('authenticated', 'public.cash_import_batches', 'UPDATE'), 'authenticated has no UPDATE on cash_import_batches');
select ok(not has_table_privilege('authenticated', 'public.cash_import_batches', 'DELETE'), 'authenticated has no DELETE on cash_import_batches');
select ok(not has_table_privilege('authenticated', 'public.cash_import_rows', 'INSERT'), 'authenticated has no INSERT on cash_import_rows');
select ok(not has_table_privilege('authenticated', 'public.cash_import_rows', 'UPDATE'), 'authenticated has no UPDATE on cash_import_rows');
select ok(not has_table_privilege('authenticated', 'public.cash_import_rows', 'DELETE'), 'authenticated has no DELETE on cash_import_rows');
select ok(not has_table_privilege('authenticated', 'public.cash_import_events', 'INSERT'), 'authenticated has no INSERT on cash_import_events');
select ok(not has_table_privilege('authenticated', 'public.cash_import_events', 'UPDATE'), 'authenticated has no UPDATE on cash_import_events');
select ok(not has_table_privilege('authenticated', 'public.cash_import_events', 'DELETE'), 'authenticated has no DELETE on cash_import_events');

-- #21 — anon rejected outright (no grant at all, before RLS is even evaluated).
select ok(not has_table_privilege('anon', 'public.cash_import_batches', 'SELECT'), 'anon has no SELECT on cash_import_batches');
select ok(not has_table_privilege('anon', 'public.cash_import_rows', 'SELECT'), 'anon has no SELECT on cash_import_rows');
select ok(
  not has_function_privilege('anon', 'public.create_cash_import_batch(uuid, text, text, text, date, numeric, numeric, jsonb)', 'EXECUTE'),
  'anon cannot execute create_cash_import_batch'
);

-- =============================================================================
-- Helper: a 5-row parsed-analysis payload (1 opening + 4 transaction rows)
-- =============================================================================
-- opening=1,000,000; +500,000 (Kas); +200,000/+200,000 (KM Duplicate pair,
-- same fingerprint -> duplicate_group_key); 0 (KM Error, AMOUNT_MISSING).
-- total_debit=900,000, total_credit=0 -> calculated closing = 1,900,000,
-- matched by workbook_closing_balance below (zero variance).

select set_config(
  'pgtap.rows_fixture',
  $$[
    {"source_row_number":2,"source_fingerprint":"fp-opening","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":1000000,"calculated_balance":1000000,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"fp-kas","description":"setor kas","vessel_label":"Kas","debit":500000,"credit":null,"workbook_balance":1500000,"calculated_balance":1500000,"provisional_classification":"cash_top_up_candidate","status":"valid","validation_issues":[]},
    {"source_row_number":4,"source_fingerprint":"fp-duplicate-pair","description":"beli spare part","vessel_label":"KM Duplicate","debit":200000,"credit":null,"workbook_balance":1700000,"calculated_balance":1700000,"provisional_classification":"project_cash_in_or_refund_review","status":"warning","validation_issues":[{"code":"DUPLICATE_ROW_CANDIDATE","severity":"warning","message":"dup"}]},
    {"source_row_number":5,"source_fingerprint":"fp-duplicate-pair","description":"beli spare part","vessel_label":"KM Duplicate","debit":200000,"credit":null,"workbook_balance":1900000,"calculated_balance":1900000,"provisional_classification":"project_cash_in_or_refund_review","status":"warning","validation_issues":[{"code":"DUPLICATE_ROW_CANDIDATE","severity":"warning","message":"dup"}]},
    {"source_row_number":6,"source_fingerprint":"fp-error","description":"baris rusak","vessel_label":"KM Error","debit":null,"credit":null,"workbook_balance":null,"calculated_balance":1900000,"provisional_classification":"manual_mapping_required","status":"error","validation_issues":[{"code":"AMOUNT_MISSING","severity":"error","message":"missing"}]}
  ]$$,
  true
);

-- =============================================================================
-- #2 — Owner cannot create or modify a batch
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.create_cash_import_batch(
       'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'laporan-kas.xlsx', 'sha-owner-attempt', 'Sheet1', '2036-01-01',
       1000000, 1900000, current_setting('pgtap.rows_fixture')::jsonb
     ) $$,
  'not authorized to stage cash import batch',
  '#2 owner cannot create a cash import batch'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #1 / #7 — Admin creates a staged batch; batch + all rows persist atomically
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'laporan-kas.xlsx', 'sha-fixture-001', 'Sheet1', '2036-01-01',
       1000000, 1900000, current_setting('pgtap.rows_fixture')::jsonb
     ) $$,
  '#1 admin creates a staged batch'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch_p as
  select id, status, transaction_count, warning_count, error_count from public.cash_import_batches
    where tenant_id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1' and source_sha256 = 'sha-fixture-001';
grant select on pgtap_batch_p to authenticated;

select is((select count(*)::int from pgtap_batch_p), 1, '#1 exactly one batch was created');
select is((select transaction_count from pgtap_batch_p), 4, '#7 transaction_count excludes the opening row (4 of 5)');
select is((select warning_count from pgtap_batch_p), 2, '#7 warning_count recomputed server-side (the duplicate pair)');
select is((select error_count from pgtap_batch_p), 1, '#7 error_count recomputed server-side (AMOUNT_MISSING row)');
select is(
  (select count(*)::int from public.cash_import_rows where batch_id = (select id from pgtap_batch_p)),
  5,
  '#7 all 5 rows persisted (1 opening + 4 transaction), full raw provenance kept'
);
select is(
  (select count(*)::int from public.cash_import_rows where batch_id = (select id from pgtap_batch_p) and duplicate_group_key = 'fp-duplicate-pair'),
  2,
  '#14 the duplicate pair is grouped by duplicate_group_key, never silently dropped'
);
select is(
  (select count(*)::int from public.cash_import_events where batch_id = (select id from pgtap_batch_p) and event_type = 'batch_created'),
  1,
  '#1 batch creation logged exactly one batch_created audit event'
);

-- =============================================================================
-- #8 — Atomic staging: a malformed row leaves no partial batch
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.create_cash_import_batch(
       'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'laporan-rusak.xlsx', 'sha-broken-001', 'Sheet1', '2036-01-02',
       1000000, 1000000,
       '[{"source_row_number":2,"source_fingerprint":"fp-x","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":1000000,"calculated_balance":1000000,"provisional_classification":"NOT_A_REAL_CLASSIFICATION","status":"valid","validation_issues":[]}]'::jsonb
     ) $$,
  'invalid input value for enum cash_import_provisional_classification: "NOT_A_REAL_CLASSIFICATION"',
  '#8 malformed provisional_classification is rejected'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.cash_import_batches where tenant_id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1' and source_sha256 = 'sha-broken-001'),
  0,
  '#8 the failed batch was never inserted (no partial batch left behind)'
);

-- =============================================================================
-- #9 / #10 / #11 — Upload idempotency
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
-- Same tenant + same hash, even under a DIFFERENT filename, resolves to the
-- existing batch — never a second one.
select is(
  (select (public.create_cash_import_batch(
       'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'laporan-kas-v2-rename.xlsx', 'sha-fixture-001', 'Sheet1', '2036-01-01',
       1000000, 1900000, current_setting('pgtap.rows_fixture')::jsonb
     )).is_new),
  false,
  '#9 same tenant + same hash (different filename) returns the existing batch, not a new one'
);
select is(
  (select ((public.create_cash_import_batch(
       'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'laporan-kas-v2-rename.xlsx', 'sha-fixture-001', 'Sheet1', '2036-01-01',
       1000000, 1900000, current_setting('pgtap.rows_fixture')::jsonb
     )).batch).id),
  (select id from pgtap_batch_p),
  '#9 the returned batch id is identical to the original'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.cash_import_rows where batch_id = (select id from pgtap_batch_p)),
  5,
  '#9 re-upload never duplicated rows (still 5)'
);
select is(
  (select count(*)::int from public.cash_import_events where batch_id = (select id from pgtap_batch_p) and event_type = 'batch_reopened'),
  2,
  '#9 each re-upload logged its own batch_reopened event (two calls above)'
);

select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(
  (select (public.create_cash_import_batch(
       'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'laporan-kas.xlsx', 'sha-fixture-DIFFERENT', 'Sheet1', '2036-02-01',
       1000000, 1900000, current_setting('pgtap.rows_fixture')::jsonb
     )).is_new),
  true,
  '#10 same filename + different hash creates a genuinely different batch'
);
reset role;
select set_config('request.jwt.claims', '', true);

select isnt(
  (select id from public.cash_import_batches where tenant_id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1' and source_sha256 = 'sha-fixture-DIFFERENT'),
  (select id from pgtap_batch_p),
  '#10 the different-hash batch has a distinct id'
);

select set_config('request.jwt.claims', json_build_object('sub', 'c2000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', 'laporan-kas.xlsx', 'sha-fixture-001', 'Sheet1', '2036-01-01',
       1000000, 1900000, current_setting('pgtap.rows_fixture')::jsonb
     ) $$,
  '#11 tenant Q staging the SAME hash succeeds independently'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.cash_import_batches where source_sha256 = 'sha-fixture-001'),
  2,
  '#11 the same hash produced two isolated batches, one per tenant'
);
select isnt(
  (select id from public.cash_import_batches where tenant_id = 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2' and source_sha256 = 'sha-fixture-001'),
  (select id from pgtap_batch_p),
  '#11 tenant Q''s batch id differs from tenant P''s'
);

-- =============================================================================
-- #3 / #4 / #5 / #21(viewer) — Read visibility
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(
  (select count(*)::int from public.cash_import_batches where id = (select id from pgtap_batch_p)),
  1,
  '#3 owner P can read tenant P''s batch'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-4000-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is_empty(
  $$ select id from public.cash_import_batches where id = (select id from pgtap_batch_p limit 1) $$,
  '#4 viewer cannot read the batch (owner/admin only)'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'c2000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is_empty(
  $$ select id from public.cash_import_batches where id = (select id from pgtap_batch_p limit 1) $$,
  '#5 owner Q (different tenant) cannot read tenant P''s batch'
);
select is_empty(
  $$ select id from public.cash_import_rows where batch_id = (select id from pgtap_batch_p limit 1) $$,
  '#5 owner Q cannot read tenant P''s rows either'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #16 / #12 — Error row cannot include; skip requires a reason
-- =============================================================================

create temporary table pgtap_row_error as
  select id from public.cash_import_rows where batch_id = (select id from pgtap_batch_p) and status = 'error';
grant select on pgtap_row_error to authenticated;

create temporary table pgtap_row_kas as
  select id from public.cash_import_rows where batch_id = (select id from pgtap_batch_p) and vessel_label = 'Kas';
grant select on pgtap_row_kas to authenticated;

create temporary table pgtap_rows_duplicate as
  select id from public.cash_import_rows where batch_id = (select id from pgtap_batch_p) and vessel_label = 'KM Duplicate' order by source_row_number;
grant select on pgtap_rows_duplicate to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.set_cash_import_row_disposition((select id from pgtap_row_error), 'include', null) $$,
  'ERROR_ROW_CANNOT_INCLUDE',
  '#16 an error-status row cannot be dispositioned as include'
);
select throws_ok(
  $$ select public.set_cash_import_row_disposition((select id from pgtap_row_kas), 'skip', null) $$,
  'SKIP_REASON_REQUIRED',
  '#15 skip without a reason is rejected'
);
select lives_ok(
  $$ select public.set_cash_import_row_disposition((select id from pgtap_row_error), 'skip', 'data tidak lengkap') $$,
  'error row can be skipped with a reason'
);
select lives_ok(
  $$ select public.set_cash_import_row_disposition((select id from pgtap_row_kas), 'include', null) $$,
  'valid Kas row can be included'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #13 — Duplicate row is not silently removed; both sides get a real decision
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.set_cash_import_row_disposition((select id from pgtap_rows_duplicate order by id limit 1), 'manual_review', null) $$,
  'first duplicate row is marked manual_review'
);
select lives_ok(
  $$ select public.set_cash_import_row_disposition((select id from pgtap_rows_duplicate order by id offset 1 limit 1), 'skip', 'duplikat dari baris sebelumnya') $$,
  'second duplicate row is skipped with a reason'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.cash_import_rows where batch_id = (select id from pgtap_batch_p) and duplicate_group_key = 'fp-duplicate-pair'),
  2,
  '#13 both duplicate rows still exist — a decision was recorded, neither was deleted'
);

-- =============================================================================
-- #6 / #14 — Mapping: cross-tenant rejected, valid mapping creates an audit event
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.set_cash_import_label_mapping(
       (select id from pgtap_batch_p), 'KM Duplicate', 'existing_vessel_project', 'c2a00000-0000-0000-0000-0000000000a2'
     ) $$,
  'CROSS_TENANT_PROJECT_MAPPING_REJECTED',
  '#6 mapping to a different tenant''s vessel project is rejected'
);
select lives_ok(
  $$ select public.set_cash_import_label_mapping(
       (select id from pgtap_batch_p), 'KM Duplicate', 'existing_vessel_project', 'c1a00000-0000-0000-0000-0000000000a2'
     ) $$,
  '#14 mapping to the SAME tenant''s vessel project succeeds'
);
select lives_ok(
  $$ select public.set_cash_import_label_mapping((select id from pgtap_batch_p), 'Kas', 'cash') $$,
  'Kas label mapped to cash'
);
select lives_ok(
  $$ select public.set_cash_import_label_mapping((select id from pgtap_batch_p), 'KM Error', 'unresolved') $$,
  'KM Error label mapped to unresolved'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.cash_import_rows
     where batch_id = (select id from pgtap_batch_p) and vessel_label = 'KM Duplicate'
       and mapping_kind = 'existing_vessel_project' and mapped_vessel_project_id = 'c1a00000-0000-0000-0000-0000000000a2'),
  2,
  '#14 the mapping decision fanned out to both rows sharing the label'
);
select is(
  (select count(*)::int from public.cash_import_events where batch_id = (select id from pgtap_batch_p) and event_type = 'label_mapping_set'),
  3,
  '#14 the three successful mapping decisions each created their own audit event — the rejected cross-tenant attempt created none'
);
select is(
  (select status from public.cash_import_batches where id = (select id from pgtap_batch_p)),
  'mapping_required',
  '#17 an edit after staging moved the batch from draft to mapping_required automatically'
);

-- =============================================================================
-- #17 / #18 — Ready-for-review gating
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch_p)) $$,
  'VALIDATION_ERRORS_PRESENT',
  '#17 cannot become ready_for_review while error_count > 0'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- The error row's status is fixed at staging time (server-recomputed), so
-- error_count on this batch can never reach zero — prove the batch stays
-- blocked, then prove a batch with zero errors (freshly staged, all
-- mapped/dispositioned) DOES reach ready_for_review.

select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_cash_import_batch(
       'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'laporan-kas-bersih.xlsx', 'sha-clean-001', 'Sheet1', '2036-03-01',
       1000000, 1500000,
       '[
         {"source_row_number":2,"source_fingerprint":"fp-open-clean","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":1000000,"calculated_balance":1000000,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
         {"source_row_number":3,"source_fingerprint":"fp-kas-clean","description":"setor kas","vessel_label":"Kas","debit":500000,"credit":null,"workbook_balance":1500000,"calculated_balance":1500000,"provisional_classification":"cash_top_up_candidate","status":"valid","validation_issues":[]}
       ]'::jsonb
     ) $$,
  'a clean, single-label batch is staged for the ready_for_review happy path'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_batch_clean as
  select id from public.cash_import_batches where tenant_id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1' and source_sha256 = 'sha-clean-001';
grant select on pgtap_batch_clean to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch_clean)) $$,
  'MAPPING_INCOMPLETE',
  '#17 cannot become ready_for_review before the label is mapped'
);
select lives_ok(
  $$ select public.set_cash_import_label_mapping((select id from pgtap_batch_clean), 'Kas', 'cash') $$,
  'Kas label mapped on the clean batch'
);
select throws_ok(
  $$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch_clean)) $$,
  'DISPOSITION_INCOMPLETE',
  '#17 cannot become ready_for_review before every row has a disposition'
);
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch_clean) and vessel_label = 'Kas'),
       'include', null
     ) $$,
  'Kas row dispositioned as include on the clean batch'
);
select lives_ok(
  $$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch_clean)) $$,
  '#18 fully mapped/dispositioned, reconciled batch becomes ready_for_review'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status from public.cash_import_batches where id = (select id from pgtap_batch_clean)),
  'ready_for_review',
  '#18 status is now ready_for_review'
);
select is(
  (select count(*)::int from public.cash_import_events where batch_id = (select id from pgtap_batch_clean) and event_type = 'ready_for_review'),
  1,
  '#18 exactly one ready_for_review audit event was recorded'
);

-- A further edit after ready_for_review reverts to mapping_required (needs
-- re-verification), proving "ready implies currently valid" stays honest.
select set_config('request.jwt.claims', json_build_object('sub', 'c1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.set_cash_import_label_mapping((select id from pgtap_batch_clean), 'Kas', 'shared_overhead') $$,
  'mapping edited again after ready_for_review'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status from public.cash_import_batches where id = (select id from pgtap_batch_clean)),
  'mapping_required',
  'editing a ready_for_review batch reverts it to mapping_required'
);

-- =============================================================================
-- #19 — Operational tables are completely untouched by this gate
-- =============================================================================

select is(
  (select count(*)::int from public.clients), (select clients from pgtap_operational_baseline), '#19 clients unchanged'
);
select is(
  (select count(*)::int from public.vessels), (select vessels from pgtap_operational_baseline), '#19 vessels unchanged'
);
select is(
  (select count(*)::int from public.vendors), (select vendors from pgtap_operational_baseline), '#19 vendors unchanged'
);
select is(
  (select count(*)::int from public.vessel_projects), (select vessel_projects from pgtap_operational_baseline),
  '#19 vessel_projects unchanged — mapping to an existing project never creates a new one'
);
select is(
  (select count(*)::int from public.cash_pools), (select cash_pools from pgtap_operational_baseline), '#19 cash_pools unchanged'
);
select is(
  (select count(*)::int from public.cash_pool_entries), (select cash_pool_entries from pgtap_operational_baseline),
  '#19 cash_pool_entries unchanged'
);
select is(
  (select count(*)::int from public.expense_submissions), (select expense_submissions from pgtap_operational_baseline),
  '#19 expense_submissions unchanged'
);
select is(
  (select count(*)::int from public.expense_submission_revisions),
  (select expense_submission_revisions from pgtap_operational_baseline),
  '#19 expense_submission_revisions unchanged'
);
select is(
  (select count(*)::int from public.project_cost_ledger_entries),
  (select project_cost_ledger_entries from pgtap_operational_baseline),
  '#19 project_cost_ledger_entries unchanged'
);
select is(
  (select count(*)::int from public.cash_reconciliations), (select cash_reconciliations from pgtap_operational_baseline),
  '#19 cash_reconciliations unchanged'
);
select is(
  (select count(*)::int from public.expense_duplicate_candidates),
  (select expense_duplicate_candidates from pgtap_operational_baseline),
  '#19 expense_duplicate_candidates unchanged'
);

select * from finish();

rollback;
