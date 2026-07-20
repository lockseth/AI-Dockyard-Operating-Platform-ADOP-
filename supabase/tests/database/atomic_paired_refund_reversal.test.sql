-- ADOP Phase 1 Gate 1K.1 — pgTAP proof for Atomic Paired Refund Reversal:
-- the deferred database constraint that makes a one-sided paired-refund
-- reversal structurally impossible to persist, the new
-- reverse_paired_project_refund RPC (authorization, validation, row
-- locking, idempotency), the hardened individual reverse_cash_pool_entry/
-- reverse_project_expense guards, and the 'partially_reversed' status the
-- trusted_transaction_history view now derives.
--
-- Gate 1J-D (append_only_cash_import_rollback.test.sql) and Gate 1K
-- (trusted_transaction_history.test.sql) already cover — unmodified by
-- this migration, still passing as-is — items #35/#36/#37 of this gate's
-- required scenario list: batch-rollback paired-refund reversal, its own
-- idempotency, and staging/rejected rows never appearing in the history.
-- This file does not duplicate those; it proves what is NEW in Gate 1K.1.
--
-- True concurrent racing (two simultaneous reverse_paired_project_refund
-- calls) cannot be expressed inside one pgTAP transaction (single
-- sequential connection) — matches append_only_cash_import_rollback.test.
-- sql's own documented posture. What IS proven here is the same
-- serialization mechanism concurrency relies on: the row lock plus the
-- idempotent-result check (a second sequential call after a first success
-- returns the existing pair rather than erroring or duplicating), which is
-- exactly what that lock exists to guarantee under real concurrency too.
--
-- Self-contained: creates its own fixtures (tenant prefixes c3c3c3c3-/
-- c4c4c4c4-, not used by any other pgTAP file in this directory) and rolls
-- back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', 'pgtap-paired-refund-tenant-p', 'PgTAP Paired Refund Tenant P', 'active'),
  ('c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4', 'pgtap-paired-refund-tenant-q', 'PgTAP Paired Refund Tenant Q', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', 'c3000000-0000-4000-0000-000000000001', 'authenticated', 'authenticated', 'owner-p@pgtap-paired-refund.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'c3000000-0000-4000-0000-000000000002', 'authenticated', 'authenticated', 'admin-p@pgtap-paired-refund.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'c3000000-0000-4000-0000-000000000003', 'authenticated', 'authenticated', 'viewer-p@pgtap-paired-refund.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'c3000000-0000-4000-0000-000000000004', 'authenticated', 'authenticated', 'reviewer-p@pgtap-paired-refund.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'c4000000-0000-4000-0000-000000000001', 'authenticated', 'authenticated', 'owner-q@pgtap-paired-refund.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('c3500000-4000-0000-0000-000000000001', 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', 'c3000000-0000-4000-0000-000000000001', 'active'),
  ('c3500000-4000-0000-0000-000000000002', 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', 'c3000000-0000-4000-0000-000000000002', 'active'),
  ('c3500000-4000-0000-0000-000000000003', 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', 'c3000000-0000-4000-0000-000000000003', 'active'),
  ('c3500000-4000-0000-0000-000000000004', 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', 'c3000000-0000-4000-0000-000000000004', 'active'),
  ('c4500000-4000-0000-0000-000000000001', 'c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4', 'c4000000-0000-4000-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('c3500000-4000-0000-0000-000000000001', 'owner'),
  ('c3500000-4000-0000-0000-000000000002', 'admin'),
  ('c3500000-4000-0000-0000-000000000003', 'viewer'),
  ('c3500000-4000-0000-0000-000000000004', 'reviewer'),
  ('c4500000-4000-0000-0000-000000000001', 'owner'),
  ('c4500000-4000-0000-0000-000000000001', 'admin');

insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('c3a00000-0000-0000-0000-0000000000c1', 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', 'CL-PR', 'Client PR', 'c3000000-0000-4000-0000-000000000001'),
  ('c4a00000-0000-0000-0000-0000000000c1', 'c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4', 'CL-PR-Q', 'Client PR Q', 'c4000000-0000-4000-0000-000000000001');

insert into public.vessels (id, tenant_id, client_id, vessel_code, vessel_name, created_by) values
  ('c3a00000-0000-0000-0000-0000000000a1', 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', 'c3a00000-0000-0000-0000-0000000000c1', 'VS-PR-1', 'KM PR Satu', 'c3000000-0000-4000-0000-000000000001'),
  ('c3a00000-0000-0000-0000-0000000000a2', 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', 'c3a00000-0000-0000-0000-0000000000c1', 'VS-PR-2', 'KM PR Dua', 'c3000000-0000-4000-0000-000000000001'),
  ('c4a00000-0000-0000-0000-0000000000a1', 'c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4', 'c4a00000-0000-0000-0000-0000000000c1', 'VS-PR-Q1', 'KM PR Q', 'c4000000-0000-4000-0000-000000000001');

insert into public.service_types (id, tenant_id, code, name) values
  ('c3a00000-0000-0000-0000-0000000000b1', 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', 'pr-svc', 'PR Service'),
  ('c4a00000-0000-0000-0000-0000000000b1', 'c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4', 'pr-svc-q', 'PR Service Q');

insert into public.facility_locations (id, tenant_id, code, name) values
  ('c3a00000-0000-0000-0000-0000000000f1', 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', 'FL-PR', 'PR Facility'),
  ('c4a00000-0000-0000-0000-0000000000f1', 'c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4', 'FL-PR-Q', 'PR Facility Q');

insert into public.expense_categories (id, tenant_id, code, name) values
  ('c3a00000-0000-0000-0000-0000000000e1', 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', 'PR-CAT', 'PR Category');

insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by) values
  ('c3a00000-0000-0000-0000-0000000000d1', 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', 'c3a00000-0000-0000-0000-0000000000a1', 'c3a00000-0000-0000-0000-0000000000c1', 'c3a00000-0000-0000-0000-0000000000b1', 'c3a00000-0000-0000-0000-0000000000f1', 'PR-PROJECT-1', '2037-01-01', 'c3000000-0000-4000-0000-000000000001'),
  ('c3a00000-0000-0000-0000-0000000000d2', 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', 'c3a00000-0000-0000-0000-0000000000a2', 'c3a00000-0000-0000-0000-0000000000c1', 'c3a00000-0000-0000-0000-0000000000b1', 'c3a00000-0000-0000-0000-0000000000f1', 'PR-PROJECT-2', '2037-01-01', 'c3000000-0000-4000-0000-000000000001'),
  ('c4a00000-0000-0000-0000-0000000000d1', 'c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4', 'c4a00000-0000-0000-0000-0000000000a1', 'c4a00000-0000-0000-0000-0000000000c1', 'c4a00000-0000-0000-0000-0000000000b1', 'c4a00000-0000-0000-0000-0000000000f1', 'PR-PROJECT-Q1', '2037-01-01', 'c4000000-0000-4000-0000-000000000001');

create temporary table pgtap_owner_p as select 'c3000000-0000-4000-0000-000000000001'::uuid as id;
create temporary table pgtap_admin_p as select 'c3000000-0000-4000-0000-000000000002'::uuid as id;
create temporary table pgtap_viewer_p as select 'c3000000-0000-4000-0000-000000000003'::uuid as id;
create temporary table pgtap_reviewer_p as select 'c3000000-0000-4000-0000-000000000004'::uuid as id;
create temporary table pgtap_owner_q as select 'c4000000-0000-4000-0000-000000000001'::uuid as id;
create temporary table pgtap_tenant_p as select 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3'::uuid as id;
create temporary table pgtap_tenant_q as select 'c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4'::uuid as id;
create temporary table pgtap_project_1 as select 'c3a00000-0000-0000-0000-0000000000d1'::uuid as id;
create temporary table pgtap_project_2 as select 'c3a00000-0000-0000-0000-0000000000d2'::uuid as id;
create temporary table pgtap_project_q1 as select 'c4a00000-0000-0000-0000-0000000000d1'::uuid as id;
grant select on
  pgtap_owner_p, pgtap_admin_p, pgtap_viewer_p, pgtap_reviewer_p, pgtap_owner_q,
  pgtap_tenant_p, pgtap_tenant_q, pgtap_project_1, pgtap_project_2, pgtap_project_q1
to authenticated, anon;

-- Helper: commit a single-row (opening + one paired refund) import batch
-- for a given tenant/project/business_date/sha, as the given admin actor,
-- then approve+commit as the given owner actor. Mirrors the exact shape
-- Gate 1K's own test file already uses.
create or replace function pgtap_commit_simple_refund_batch(
  p_tenant_id uuid, p_admin_sub uuid, p_owner_sub uuid, p_project_id uuid, p_vessel_label text,
  p_business_date date, p_sha text, p_amount numeric
) returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_admin_sub, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  perform public.create_cash_import_batch(
    p_tenant_id, p_sha || '.xlsx', p_sha, 'Sheet1', p_business_date,
    p_amount, p_amount * 2,
    jsonb_build_array(
      jsonb_build_object('source_row_number', 1, 'source_fingerprint', p_sha || '-open', 'description', null, 'vessel_label', null, 'debit', null, 'credit', null, 'workbook_balance', p_amount, 'calculated_balance', p_amount, 'provisional_classification', 'opening_cash', 'status', 'valid', 'validation_issues', '[]'::jsonb),
      jsonb_build_object('source_row_number', 2, 'source_fingerprint', p_sha || '-refund', 'description', 'refund ' || p_sha, 'vessel_label', p_vessel_label, 'debit', p_amount, 'credit', null, 'workbook_balance', p_amount * 2, 'calculated_balance', p_amount * 2, 'provisional_classification', 'project_cash_in_or_refund_review', 'status', 'valid', 'validation_issues', '[]'::jsonb)
    )
  );

  perform public.set_cash_import_label_mapping((select id from public.cash_import_batches where source_sha256 = p_sha), p_vessel_label, 'existing_vessel_project', p_project_id);
  perform public.set_cash_import_row_disposition((select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = p_sha) and source_row_number = 2), 'include', null);
  perform public.mark_cash_import_batch_ready_for_review((select id from public.cash_import_batches where source_sha256 = p_sha));

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  perform set_config('request.jwt.claims', json_build_object('sub', p_owner_sub, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.approve_and_commit_cash_import_batch((select id from public.cash_import_batches where source_sha256 = p_sha));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$fn$;

-- Pair A — the main happy-path pair (role denials, successful reversal,
-- idempotent retry).
select pgtap_commit_simple_refund_batch(
  (select id from pgtap_tenant_p), (select id from pgtap_admin_p), (select id from pgtap_owner_p),
  (select id from pgtap_project_1), 'KM PR Satu', '2037-06-01', 'sha-pr-pair-a', 40000
);
-- Pair B — stays untouched (active pair reads as 'active').
select pgtap_commit_simple_refund_batch(
  (select id from pgtap_tenant_p), (select id from pgtap_admin_p), (select id from pgtap_owner_p),
  (select id from pgtap_project_1), 'KM PR Satu', '2037-06-02', 'sha-pr-pair-b', 41000
);
-- Pair F — paired refund PLUS a normal cash top-up and project expense in
-- the same batch, for cash-not-refund / cost-not-refund / individual-
-- non-paired-still-works tests.
select set_config('request.jwt.claims', json_build_object('sub', (select id from pgtap_admin_p)::text, 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.create_cash_import_batch(
  (select id from pgtap_tenant_p), 'sha-pr-pair-f.xlsx', 'sha-pr-pair-f', 'Sheet1', '2037-06-03',
  100000, 152000,
  $$[
    {"source_row_number":1,"source_fingerprint":"f-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":100000,"calculated_balance":100000,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":2,"source_fingerprint":"f-kas","description":"F top up","vessel_label":"Kas","debit":20000,"credit":null,"workbook_balance":120000,"calculated_balance":120000,"provisional_classification":"cash_top_up_candidate","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"f-expense","description":"F expense","vessel_label":"KM PR Satu","debit":null,"credit":10000,"workbook_balance":110000,"calculated_balance":110000,"provisional_classification":"project_expense_candidate","status":"valid","validation_issues":[]},
    {"source_row_number":4,"source_fingerprint":"f-refund","description":"F refund","vessel_label":"KM PR Satu","debit":42000,"credit":null,"workbook_balance":152000,"calculated_balance":152000,"provisional_classification":"project_cash_in_or_refund_review","status":"valid","validation_issues":[]}
  ]$$::jsonb
);
select public.set_cash_import_label_mapping((select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-f'), 'Kas', 'cash');
select public.set_cash_import_label_mapping((select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-f'), 'KM PR Satu', 'existing_vessel_project', (select id from pgtap_project_1));
select public.set_cash_import_row_disposition((select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-f') and source_row_number = 2), 'include', null);
select public.set_cash_import_row_disposition((select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-f') and source_row_number = 3), 'include', null);
select public.set_cash_import_row_disposition((select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-f') and source_row_number = 4), 'include', null);
select public.mark_cash_import_batch_ready_for_review((select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-f'));
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', (select id from pgtap_owner_p)::text, 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.approve_and_commit_cash_import_batch((select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-f'));
reset role;
select set_config('request.jwt.claims', '', true);

-- Pair G — a second, independent paired refund (different import_row_id
-- from Pair F) for the "mismatched counterpart" and "reversal-as-original"
-- tests.
select pgtap_commit_simple_refund_batch(
  (select id from pgtap_tenant_p), (select id from pgtap_admin_p), (select id from pgtap_owner_p),
  (select id from pgtap_project_2), 'KM PR Dua', '2037-06-04', 'sha-pr-pair-g', 43000
);
-- Pair D1/D2/D3 — dedicated single-use pairs for the raw deferred-trigger
-- tests (one-sided rejected, two-sided raw succeeds, forced-error rolls
-- back both).
select pgtap_commit_simple_refund_batch(
  (select id from pgtap_tenant_p), (select id from pgtap_admin_p), (select id from pgtap_owner_p),
  (select id from pgtap_project_1), 'KM PR Satu', '2037-06-05', 'sha-pr-pair-d1', 44000
);
select pgtap_commit_simple_refund_batch(
  (select id from pgtap_tenant_p), (select id from pgtap_admin_p), (select id from pgtap_owner_p),
  (select id from pgtap_project_1), 'KM PR Satu', '2037-06-06', 'sha-pr-pair-d2', 45000
);
select pgtap_commit_simple_refund_batch(
  (select id from pgtap_tenant_p), (select id from pgtap_admin_p), (select id from pgtap_owner_p),
  (select id from pgtap_project_1), 'KM PR Satu', '2037-06-07', 'sha-pr-pair-d3', 46000
);
-- Pair E — dedicated for the synthetic partial-state tests (view status +
-- RPC rejection), always cleaned back to active via savepoint rollback.
select pgtap_commit_simple_refund_batch(
  (select id from pgtap_tenant_p), (select id from pgtap_admin_p), (select id from pgtap_owner_p),
  (select id from pgtap_project_2), 'KM PR Dua', '2037-06-08', 'sha-pr-pair-e', 47000
);
-- Pair Q — tenant Q's own paired refund, for cross-tenant tests.
select pgtap_commit_simple_refund_batch(
  (select id from pgtap_tenant_q), (select id from pgtap_owner_q), (select id from pgtap_owner_q),
  (select id from pgtap_project_q1), 'KM PR Q', '2037-06-01', 'sha-pr-pair-q', 48000
);

-- Resolve the cash/cost original ids for each pair into temp tables for
-- readable use below.
create temporary table pgtap_pair_a as
  select
    (select id from public.cash_pool_entries where tenant_id = (select id from pgtap_tenant_p) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-a') and source_row_number = 2)) as cash_id,
    (select id from public.project_cost_ledger_entries where tenant_id = (select id from pgtap_tenant_p) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-a') and source_row_number = 2)) as cost_id;
create temporary table pgtap_pair_b as
  select
    (select id from public.cash_pool_entries where tenant_id = (select id from pgtap_tenant_p) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-b') and source_row_number = 2)) as cash_id,
    (select id from public.project_cost_ledger_entries where tenant_id = (select id from pgtap_tenant_p) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-b') and source_row_number = 2)) as cost_id;
create temporary table pgtap_pair_f as
  select
    (select id from public.cash_pool_entries where tenant_id = (select id from pgtap_tenant_p) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-f') and source_row_number = 4)) as cash_id,
    (select id from public.project_cost_ledger_entries where tenant_id = (select id from pgtap_tenant_p) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-f') and source_row_number = 4)) as cost_id;
create temporary table pgtap_f_cash_topup as
  select id from public.cash_pool_entries where tenant_id = (select id from pgtap_tenant_p) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-f') and source_row_number = 2);
create temporary table pgtap_f_project_expense as
  select id from public.project_cost_ledger_entries where tenant_id = (select id from pgtap_tenant_p) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-f') and source_row_number = 3);
create temporary table pgtap_pair_g as
  select
    (select id from public.cash_pool_entries where tenant_id = (select id from pgtap_tenant_p) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-g') and source_row_number = 2)) as cash_id,
    (select id from public.project_cost_ledger_entries where tenant_id = (select id from pgtap_tenant_p) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-g') and source_row_number = 2)) as cost_id;
create temporary table pgtap_pair_d1 as
  select
    (select id from public.cash_pool_entries where tenant_id = (select id from pgtap_tenant_p) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-d1') and source_row_number = 2)) as cash_id,
    (select id from public.project_cost_ledger_entries where tenant_id = (select id from pgtap_tenant_p) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-d1') and source_row_number = 2)) as cost_id;
create temporary table pgtap_pair_d2 as
  select
    (select id from public.cash_pool_entries where tenant_id = (select id from pgtap_tenant_p) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-d2') and source_row_number = 2)) as cash_id,
    (select id from public.project_cost_ledger_entries where tenant_id = (select id from pgtap_tenant_p) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-d2') and source_row_number = 2)) as cost_id;
create temporary table pgtap_pair_d3 as
  select
    (select id from public.cash_pool_entries where tenant_id = (select id from pgtap_tenant_p) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-d3') and source_row_number = 2)) as cash_id,
    (select id from public.project_cost_ledger_entries where tenant_id = (select id from pgtap_tenant_p) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-d3') and source_row_number = 2)) as cost_id;
create temporary table pgtap_pair_e as
  select
    (select id from public.cash_pool_entries where tenant_id = (select id from pgtap_tenant_p) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-e') and source_row_number = 2)) as cash_id,
    (select id from public.project_cost_ledger_entries where tenant_id = (select id from pgtap_tenant_p) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-e') and source_row_number = 2)) as cost_id;
create temporary table pgtap_pair_q as
  select
    (select id from public.cash_pool_entries where tenant_id = (select id from pgtap_tenant_q) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-q') and source_row_number = 2)) as cash_id,
    (select id from public.project_cost_ledger_entries where tenant_id = (select id from pgtap_tenant_q) and import_row_id = (select id from public.cash_import_rows where batch_id = (select id from public.cash_import_batches where source_sha256 = 'sha-pr-pair-q') and source_row_number = 2)) as cost_id;
grant select on
  pgtap_pair_a, pgtap_pair_b, pgtap_pair_f, pgtap_f_cash_topup, pgtap_f_project_expense, pgtap_pair_g,
  pgtap_pair_d1, pgtap_pair_d2, pgtap_pair_d3, pgtap_pair_e, pgtap_pair_q
to authenticated, anon;

-- =============================================================================
-- #32 — Active pair reads as 'active' (baseline, before any reversal)
-- =============================================================================

select is(
  (select status from public.trusted_transaction_history where tenant_id = (select id from pgtap_tenant_p) and cash_entry_id = (select cash_id from pgtap_pair_b)),
  'active',
  'an untouched paired refund reads as active'
);

-- =============================================================================
-- #2/#3/#4 — role gating on reverse_paired_project_refund (tested against
-- Pair A before it is ever mutated — a rejected role check performs no write)
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', (select id from pgtap_admin_p)::text, 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select * from public.reverse_paired_project_refund((select cash_id from pgtap_pair_a), (select cost_id from pgtap_pair_a), 'admin attempt') $$,
  'NOT_FOUND',
  'admin P is denied — reverse_paired_project_refund is owner-only (the strictest of the two reversal RPCs it replaces the capability of); Gate 1K.1A collapses "wrong role" into the same NOT_FOUND as "does not exist"'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', (select id from pgtap_viewer_p)::text, 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select * from public.reverse_paired_project_refund((select cash_id from pgtap_pair_a), (select cost_id from pgtap_pair_a), 'viewer attempt') $$,
  'NOT_FOUND',
  'viewer P is denied — same indistinguishable NOT_FOUND'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', (select id from pgtap_reviewer_p)::text, 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select * from public.reverse_paired_project_refund((select cash_id from pgtap_pair_a), (select cost_id from pgtap_pair_a), 'reviewer attempt') $$,
  'NOT_FOUND',
  'reviewer P is denied — same indistinguishable NOT_FOUND'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', '', true);
select set_config('role', 'anon', true);
select throws_ok(
  $$ select * from public.reverse_paired_project_refund((select cash_id from pgtap_pair_a), (select cost_id from pgtap_pair_a), 'anon attempt') $$,
  'permission denied for function reverse_paired_project_refund',
  'anonymous is denied — no EXECUTE grant at all, rejected before the function body runs'
);
reset role;

-- =============================================================================
-- #5/#6 — cross-tenant pair rejected, tenant mismatch between the two
-- passed entries rejected
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', (select id from pgtap_owner_p)::text, 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select * from public.reverse_paired_project_refund((select cash_id from pgtap_pair_q), (select cost_id from pgtap_pair_q), 'owner P on tenant Q pair') $$,
  'NOT_FOUND',
  'owner P cannot reverse tenant Q''s own self-consistent pair — Gate 1K.1A: cross-tenant is NOT_FOUND, never "not authorized"'
);
select throws_ok(
  $$ select * from public.reverse_paired_project_refund((select cash_id from pgtap_pair_a), (select cost_id from pgtap_pair_q), 'mismatched tenant pair') $$,
  'NOT_FOUND',
  'a cash entry from tenant P paired with a cost entry from tenant Q is rejected as NOT_FOUND — the cost lookup is tenant-scoped to the cash entry''s own tenant, so a foreign cost id is indistinguishable from a nonexistent one'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- Gate 1K.1A — Cross-Tenant Confidentiality Hardening: the six required
-- indistinguishability scenarios all raise the exact same P0001/'NOT_FOUND'
-- exception, proving a caller can never learn (a) whether an id exists at
-- all, or (b) which tenant it belongs to, from the RPC's response.
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', (select id from pgtap_owner_p)::text, 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

-- (a) cash id does not exist at all (cost id valid, own tenant)
select throws_ok(
  $$ select * from public.reverse_paired_project_refund('00000000-0000-4000-8000-000000000000', (select cost_id from pgtap_pair_a), 'a: cash id absent') $$,
  'NOT_FOUND',
  '(a) a nonexistent cash id raises NOT_FOUND'
);
-- (b) cash id belongs to another tenant (cost id valid, own tenant)
select throws_ok(
  $$ select * from public.reverse_paired_project_refund((select cash_id from pgtap_pair_q), (select cost_id from pgtap_pair_a), 'b: cash id cross-tenant') $$,
  'NOT_FOUND',
  '(b) a cash id belonging to another tenant raises the SAME NOT_FOUND as (a)'
);
-- (c) cost id does not exist at all (cash id valid, own tenant)
select throws_ok(
  $$ select * from public.reverse_paired_project_refund((select cash_id from pgtap_pair_a), '00000000-0000-4000-8000-000000000000', 'c: cost id absent') $$,
  'NOT_FOUND',
  '(c) a nonexistent cost id raises the SAME NOT_FOUND'
);
-- (d) cost id belongs to another tenant (cash id valid, own tenant)
select throws_ok(
  $$ select * from public.reverse_paired_project_refund((select cash_id from pgtap_pair_a), (select cost_id from pgtap_pair_q), 'd: cost id cross-tenant') $$,
  'NOT_FOUND',
  '(d) a cost id belonging to another tenant raises the SAME NOT_FOUND'
);
-- (e) both ids belong to another tenant (a genuine, self-consistent
-- foreign pair)
select throws_ok(
  $$ select * from public.reverse_paired_project_refund((select cash_id from pgtap_pair_q), (select cost_id from pgtap_pair_q), 'e: both ids cross-tenant') $$,
  'NOT_FOUND',
  '(e) both ids from another tenant raises the SAME NOT_FOUND'
);
-- (f) one id own tenant, one id another tenant (mixed pair, cash-own
-- direction already proven above as the "mismatched tenant pair" case;
-- here proven in the OTHER direction — cash foreign, cost own — for
-- completeness in both directions)
select throws_ok(
  $$ select * from public.reverse_paired_project_refund((select cash_id from pgtap_pair_q), (select cost_id from pgtap_pair_a), 'f: cash cross-tenant, cost own') $$,
  'NOT_FOUND',
  '(f) a foreign cash id paired with the caller''s own cost id raises the SAME NOT_FOUND — mixed pairs leak nothing in either direction'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Explicit SQLSTATE-level proof (not just message text): capture the
-- returned_sqlstate for two of the six scenarios above and assert they are
-- byte-identical, satisfying "error code/SQLSTATE yang sama" literally.
select set_config('request.jwt.claims', json_build_object('sub', (select id from pgtap_owner_p)::text, 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
create temporary table pgtap_sqlstate_probe (scenario text, sqlstate_code text);
do $do$
declare
  v_state text;
begin
  begin
    perform public.reverse_paired_project_refund('00000000-0000-4000-8000-000000000000', (select cost_id from pgtap_pair_a), 'probe a');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    insert into pgtap_sqlstate_probe values ('cash_id_absent', v_state);
  end;

  begin
    perform public.reverse_paired_project_refund((select cash_id from pgtap_pair_q), (select cost_id from pgtap_pair_a), 'probe b');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    insert into pgtap_sqlstate_probe values ('cash_id_cross_tenant', v_state);
  end;

  begin
    perform public.reverse_paired_project_refund((select cash_id from pgtap_pair_q), (select cost_id from pgtap_pair_q), 'probe e');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    insert into pgtap_sqlstate_probe values ('both_cross_tenant', v_state);
  end;
end;
$do$;
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(distinct sqlstate_code)::int from pgtap_sqlstate_probe),
  1,
  'all probed scenarios (absent id, cross-tenant cash, cross-tenant pair) share exactly one SQLSTATE — no per-scenario distinguishability'
);
select is(
  (select sqlstate_code from pgtap_sqlstate_probe where scenario = 'cash_id_absent'),
  'P0001',
  'the shared SQLSTATE is P0001 (plain raise exception), not a distinguishing custom code'
);

-- =============================================================================
-- #7 — mismatched import_row_id (two genuine, independent paired refunds)
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', (select id from pgtap_owner_p)::text, 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select * from public.reverse_paired_project_refund((select cash_id from pgtap_pair_f), (select cost_id from pgtap_pair_g), 'mismatched import_row_id') $$,
  'INVALID_PAIRED_REFUND',
  'Pair F''s cash leg paired with Pair G''s cost leg (different import_row_id) is rejected as not genuine counterparts'
);

-- =============================================================================
-- #8/#9 — cash entry not project_refund / cost entry not refund
-- =============================================================================

select throws_ok(
  $$ select * from public.reverse_paired_project_refund((select id from pgtap_f_cash_topup), (select cost_id from pgtap_pair_f), 'cash side is a top-up, not a refund') $$,
  'INVALID_PAIRED_REFUND',
  'passing a cash_top_up entry as the cash leg is rejected'
);
select throws_ok(
  $$ select * from public.reverse_paired_project_refund((select cash_id from pgtap_pair_f), (select id from pgtap_f_project_expense), 'cost side is an expense, not a refund') $$,
  'INVALID_PAIRED_REFUND',
  'passing a project_expense entry as the cost leg is rejected'
);

-- =============================================================================
-- #11 — empty reason rejected
-- =============================================================================

select throws_ok(
  $$ select * from public.reverse_paired_project_refund((select cash_id from pgtap_pair_f), (select cost_id from pgtap_pair_f), '') $$,
  'reversal reason is required',
  'an empty reason is rejected before any insert'
);
select throws_ok(
  $$ select * from public.reverse_paired_project_refund((select cash_id from pgtap_pair_f), (select cost_id from pgtap_pair_f), '   ') $$,
  'reversal reason is required',
  'a whitespace-only reason is rejected (trimmed)'
);

-- =============================================================================
-- #24/#25 — individual (non-paired) reversal RPCs still work normally
-- =============================================================================

select lives_ok(
  $$ select public.reverse_cash_pool_entry((select id from pgtap_f_cash_topup), 'normal cash top-up reversal') $$,
  'reverse_cash_pool_entry still works for a normal (non-paired) cash entry'
);
select lives_ok(
  $$ select public.reverse_project_expense((select id from pgtap_f_project_expense), 'normal project expense reversal') $$,
  'reverse_project_expense still works for a normal (non-paired) project expense'
);

-- =============================================================================
-- #22/#23 — individual reversal RPCs reject a paired refund's leg, with
-- the new stable domain error
-- =============================================================================

select throws_ok(
  $$ select public.reverse_cash_pool_entry((select cash_id from pgtap_pair_f), 'attempt individual cash reversal on paired refund') $$,
  'PAIRED_REFUND_REQUIRES_ATOMIC_REVERSAL',
  'reverse_cash_pool_entry rejects the cash leg of a paired refund'
);
select throws_ok(
  $$ select public.reverse_project_expense((select cost_id from pgtap_pair_f), 'attempt individual cost reversal on paired refund') $$,
  'PAIRED_REFUND_REQUIRES_ATOMIC_REVERSAL',
  'reverse_project_expense rejects the cost leg of a paired refund'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #1/#12-#20 — successful atomic reversal (Pair A) + full effect proof
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', (select id from pgtap_owner_p)::text, 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

create temporary table pgtap_pair_a_result as
  select * from public.reverse_paired_project_refund((select cash_id from pgtap_pair_a), (select cost_id from pgtap_pair_a), 'owner atomic reversal test');
grant select on pgtap_pair_a_result to authenticated;

select is((select count(*)::int from pgtap_pair_a_result), 1, 'owner P successfully performs the atomic paired refund reversal');
select is((select result_status from pgtap_pair_a_result), 'reversed', 'first call reports result_status=reversed');

select is(
  (select count(*)::int from public.cash_pool_entries where reverses_entry_id = (select cash_id from pgtap_pair_a)),
  1,
  'exactly one cash-side reversal was created'
);
select is(
  (select count(*)::int from public.project_cost_ledger_entries where reverses_entry_id = (select cost_id from pgtap_pair_a)),
  1,
  'exactly one cost-side reversal was created'
);
select is(
  (select reverses_entry_id from public.cash_pool_entries where id = (select cash_reversal_id from pgtap_pair_a_result)),
  (select cash_id from pgtap_pair_a),
  'the cash reversal points to the cash original'
);
select is(
  (select reverses_entry_id from public.project_cost_ledger_entries where id = (select cost_reversal_id from pgtap_pair_a_result)),
  (select cost_id from pgtap_pair_a),
  'the cost reversal points to the cost original'
);
select is(
  (select created_by from public.cash_pool_entries where id = (select cash_reversal_id from pgtap_pair_a_result)),
  (select id from pgtap_owner_p),
  'the cash reversal''s actor is the real server-derived caller (owner P), never client-suppliable'
);
select is(
  (select actor_user_id from public.project_cost_ledger_entries where id = (select cost_reversal_id from pgtap_pair_a_result)),
  (select id from pgtap_owner_p),
  'the cost reversal''s actor is the real server-derived caller'
);

-- trusted_transaction_history is not granted to `authenticated` (Gate 1K
-- design — only reachable through its own gated RPCs); querying it
-- directly here (as the pgTAP superuser session) is a verification
-- vantage point, not the application's own access path.
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select signed_cash_effect from public.trusted_transaction_history where tenant_id = (select id from pgtap_tenant_p) and cash_entry_id = (select cash_reversal_id from pgtap_pair_a_result)),
  -40000.00,
  'the reversal''s signed cash effect is exactly opposite the original (Pair A amount 40,000)'
);
select is(
  (select signed_project_cost_effect from public.trusted_transaction_history where tenant_id = (select id from pgtap_tenant_p) and cost_entry_id = (select cost_reversal_id from pgtap_pair_a_result)),
  40000.00,
  'the reversal''s signed project-cost effect is exactly opposite the original''s cost-reduction'
);

select set_config('request.jwt.claims', json_build_object('sub', (select id from pgtap_owner_p)::text, 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select results_eq(
  $$ select amount, entry_type, entry_kind from public.cash_pool_entries where id = (select cash_id from pgtap_pair_a) $$,
  $$ values (40000.00::numeric, 'project_refund'::public.cash_pool_entry_type, 'entry'::public.cash_pool_entry_kind) $$,
  'the cash original is completely unchanged after reversal'
);
select results_eq(
  $$ select amount, entry_kind, entry_scope from public.project_cost_ledger_entries where id = (select cost_id from pgtap_pair_a) $$,
  $$ values (40000.00::numeric, 'refund'::public.project_cost_ledger_entry_kind, 'project'::public.project_cost_ledger_entry_scope) $$,
  'the cost original is completely unchanged after reversal'
);

-- =============================================================================
-- #19/#20/#21 — idempotent retry: same result, no duplicate, proves the
-- serialization mechanism concurrency also relies on
-- =============================================================================

create temporary table pgtap_pair_a_retry as
  select * from public.reverse_paired_project_refund((select cash_id from pgtap_pair_a), (select cost_id from pgtap_pair_a), 'retry — this reason must be ignored');
grant select on pgtap_pair_a_retry to authenticated;

select is(
  (select result_status from pgtap_pair_a_retry), 'already_reversed',
  'retrying after full success returns result_status=already_reversed'
);
select is(
  (select cash_reversal_id from pgtap_pair_a_retry), (select cash_reversal_id from pgtap_pair_a_result),
  'retry returns the SAME cash reversal id, not a new one'
);
select is(
  (select cost_reversal_id from pgtap_pair_a_retry), (select cost_reversal_id from pgtap_pair_a_result),
  'retry returns the SAME cost reversal id, not a new one'
);
select is(
  (select count(*)::int from public.cash_pool_entries where reverses_entry_id = (select cash_id from pgtap_pair_a)),
  1,
  'retry did not create a second cash-side reversal'
);
select is(
  (select count(*)::int from public.project_cost_ledger_entries where reverses_entry_id = (select cost_id from pgtap_pair_a)),
  1,
  'retry did not create a second cost-side reversal'
);
select is(
  (select description from public.cash_pool_entries where id = (select cash_reversal_id from pgtap_pair_a_result)),
  'owner atomic reversal test',
  'retry did not overwrite the original reversal''s reason/description'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #31/#33/#34 — reversed pair reads as 'reversed', still one logical
-- transaction, summary does not double-count
-- =============================================================================

select is(
  (select count(*)::int from public.trusted_transaction_history where tenant_id = (select id from pgtap_tenant_p) and cash_entry_id = (select cash_id from pgtap_pair_a)),
  1,
  'Pair A''s original still appears as exactly one logical transaction after reversal'
);
select is(
  (select status from public.trusted_transaction_history where tenant_id = (select id from pgtap_tenant_p) and cash_entry_id = (select cash_id from pgtap_pair_a)),
  'reversed',
  'Pair A''s original now reads as fully reversed'
);
select is(
  (select display_amount from public.trusted_transaction_history where tenant_id = (select id from pgtap_tenant_p) and cash_entry_id = (select cash_id from pgtap_pair_a)),
  40000.00,
  'display_amount is still 40,000 once, never doubled, after reversal'
);

select set_config('request.jwt.claims', json_build_object('sub', (select id from pgtap_owner_p)::text, 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select results_eq(
  $$ select transaction_count::int from public.summarize_trusted_transactions((select id from pgtap_tenant_p), '2037-06-01', '2037-06-01', null, null, null, null, null, null, null) $$,
  $$ values (3) $$,
  'summary for Pair A''s business date counts exactly 3 logical transactions (opening + refund original + refund reversal), never 4 (which would mean the refund pair was double-counted)'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #10 — a reversal entry cannot itself be used as an "original" in a
-- further atomic reversal call
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', (select id from pgtap_owner_p)::text, 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select * from public.reverse_paired_project_refund(
       (select cash_reversal_id from pgtap_pair_a_result), (select cost_id from pgtap_pair_g), 'reversal used as original'
     ) $$,
  'INVALID_PAIRED_REFUND',
  'passing an existing reversal row''s id as p_cash_entry_id is rejected (entry_kind <> entry)'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #26/#27/#28 — the deferred database constraint itself, exercised via
-- raw INSERT (bypassing every RPC), proving the invariant is enforced at
-- the data layer, not merely by application code
-- =============================================================================

-- #26: a raw one-sided reversal insert is rejected once constraints are
-- checked (forced immediate here so the failure is visible synchronously;
-- in real use it would surface at the natural end of the inserting
-- statement's implicit transaction instead).
savepoint pair_d1_one_sided;
set constraints all immediate;
select throws_ok(
  $$
  insert into public.cash_pool_entries (tenant_id, pool_id, entry_type, entry_kind, amount, description, reverses_entry_id, created_by)
  select tenant_id, pool_id, entry_type, 'reversal', amount, 'raw one-sided attempt', id, (select id from pgtap_owner_p)
  from public.cash_pool_entries where id = (select cash_id from pgtap_pair_d1)
  $$,
  'PAIRED_REFUND_PARTIALLY_REVERSED',
  'a raw one-sided reversal insert (cash leg only, no RPC involved) is rejected by the deferred constraint trigger'
);
rollback to savepoint pair_d1_one_sided;
set constraints all deferred;
select is(
  (select count(*)::int from public.cash_pool_entries where reverses_entry_id = (select cash_id from pgtap_pair_d1)),
  0,
  'Pair D1 has zero reversals after the rejected one-sided attempt was rolled back'
);

-- #27: a raw two-sided reversal insert (both legs, correct pairing) is
-- accepted by the same deferred constraint — proving the mechanism admits
-- a genuine complete pair, not just rejects incomplete ones.
select lives_ok(
  $$
  do $do$
  begin
    insert into public.cash_pool_entries (tenant_id, pool_id, entry_type, entry_kind, amount, description, reverses_entry_id, created_by)
    select tenant_id, pool_id, entry_type, 'reversal', amount, 'raw two-sided cash leg', id, (select id from pgtap_owner_p)
    from public.cash_pool_entries where id = (select cash_id from pgtap_pair_d2);

    insert into public.project_cost_ledger_entries (tenant_id, pool_id, project_id, category_id, vendor_id, entry_kind, entry_scope, amount, description, reference_number, reverses_entry_id, actor_user_id)
    select tenant_id, pool_id, project_id, category_id, vendor_id, 'reversal', entry_scope, amount, 'raw two-sided cost leg', null, id, (select id from pgtap_owner_p)
    from public.project_cost_ledger_entries where id = (select cost_id from pgtap_pair_d2);
  end
  $do$
  $$,
  'a raw two-sided reversal insert (both legs, same transaction) passes the deferred constraint'
);
select is(
  (select count(*)::int from public.cash_pool_entries where reverses_entry_id = (select cash_id from pgtap_pair_d2)),
  1,
  'Pair D2''s cash leg has its reversal persisted'
);
select is(
  (select count(*)::int from public.project_cost_ledger_entries where reverses_entry_id = (select cost_id from pgtap_pair_d2)),
  1,
  'Pair D2''s cost leg has its reversal persisted'
);

-- #28: a forced error after the first insert (a duplicate reversal attempt
-- on the SAME original, hitting the pre-existing partial unique index)
-- rolls back the entire transaction — including the first insert that had
-- already "succeeded" before the error.
select throws_ok(
  $$
  do $do$
  begin
    insert into public.cash_pool_entries (tenant_id, pool_id, entry_type, entry_kind, amount, description, reverses_entry_id, created_by)
    select tenant_id, pool_id, entry_type, 'reversal', amount, 'forced-error-first-insert', id, (select id from pgtap_owner_p)
    from public.cash_pool_entries where id = (select cash_id from pgtap_pair_d3);

    -- Deliberately violates cash_pool_entries_reverses_entry_id_unique —
    -- simulates a bug/crash between the two legs of an atomic reversal.
    insert into public.cash_pool_entries (tenant_id, pool_id, entry_type, entry_kind, amount, description, reverses_entry_id, created_by)
    select tenant_id, pool_id, entry_type, 'reversal', amount, 'forced-error-second-insert', id, (select id from pgtap_owner_p)
    from public.cash_pool_entries where id = (select cash_id from pgtap_pair_d3);
  end
  $do$
  $$,
  'duplicate key value violates unique constraint "cash_pool_entries_reverses_entry_id_unique"',
  'forcing an error after the first insert (duplicate reversal, unique_violation) rolls back the whole transaction, including the first insert'
);
select is(
  (select count(*)::int from public.cash_pool_entries where reverses_entry_id = (select cash_id from pgtap_pair_d3)),
  0,
  'Pair D3 has zero reversals — the first insert did not survive the forced error'
);

-- =============================================================================
-- #29/#30 — synthetic partial state: view derives 'partially_reversed';
-- the atomic RPC detects it and refuses to auto-repair
-- =============================================================================
-- This does not weaken or disable the production constraint — it relies
-- entirely on its normal DEFERRED timing (checked at commit, never at
-- ROLLBACK) plus a SAVEPOINT to inspect the transient state and then
-- discard it, exactly as suggested by this gate's own test-design guidance
-- (pure status derivation against a fixture, no bypass of any kind).

savepoint pair_e_synthetic_partial;
insert into public.cash_pool_entries (tenant_id, pool_id, entry_type, entry_kind, amount, description, reverses_entry_id, created_by)
select tenant_id, pool_id, entry_type, 'reversal', amount, 'synthetic one-sided reversal for #29/#30', id, (select id from pgtap_owner_p)
from public.cash_pool_entries where id = (select cash_id from pgtap_pair_e);

select is(
  (select status from public.trusted_transaction_history where tenant_id = (select id from pgtap_tenant_p) and cash_entry_id = (select cash_id from pgtap_pair_e)),
  'partially_reversed',
  'trusted_transaction_history reads a synthetic one-sided reversal as partially_reversed'
);
select is(
  (select cash_entry_id from public.trusted_transaction_history where tenant_id = (select id from pgtap_tenant_p) and cash_entry_id = (select cash_id from pgtap_pair_e)),
  (select cash_id from pgtap_pair_e),
  'the partially_reversed row still exposes the cash leg entry id (never hidden)'
);
select is(
  (select cost_entry_id from public.trusted_transaction_history where tenant_id = (select id from pgtap_tenant_p) and cash_entry_id = (select cash_id from pgtap_pair_e)),
  (select cost_id from pgtap_pair_e),
  'the partially_reversed row still exposes the cost leg entry id (never hidden)'
);

select set_config('request.jwt.claims', json_build_object('sub', (select id from pgtap_owner_p)::text, 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select * from public.reverse_paired_project_refund((select cash_id from pgtap_pair_e), (select cost_id from pgtap_pair_e), 'attempt on partial pair') $$,
  'PAIRED_REFUND_PARTIALLY_REVERSED',
  'reverse_paired_project_refund detects the pre-existing partial state and refuses to auto-repair it'
);
reset role;
select set_config('request.jwt.claims', '', true);

rollback to savepoint pair_e_synthetic_partial;

select is(
  (select status from public.trusted_transaction_history where tenant_id = (select id from pgtap_tenant_p) and cash_entry_id = (select cash_id from pgtap_pair_e)),
  'active',
  'after discarding the synthetic partial state, Pair E is clean and active again'
);

-- =============================================================================
-- Integrity queries — no paired-refund partial reversal survives, every
-- reversed pair has exactly two reversals, no original has more than one
-- reversal (proven over every fixture this file created)
-- =============================================================================

select is(
  (select count(*)::int from public.trusted_transaction_history where tenant_id in ((select id from pgtap_tenant_p), (select id from pgtap_tenant_q)) and status = 'partially_reversed'),
  0,
  'no paired refund is left partially_reversed after this file''s own cleanup'
);
select is(
  (select count(*)::int from public.cash_pool_entries e
     where e.entry_type = 'project_refund' and e.entry_kind = 'entry'
       and (select count(*) from public.cash_pool_entries r where r.reverses_entry_id = e.id) > 1),
  0,
  'no cash-side paired-refund original has more than one reversal'
);
select is(
  (select count(*)::int from public.project_cost_ledger_entries e
     where e.entry_kind = 'refund'
       and (select count(*) from public.project_cost_ledger_entries r where r.reverses_entry_id = e.id) > 1),
  0,
  'no cost-side paired-refund original has more than one reversal'
);

select * from finish();
rollback;
