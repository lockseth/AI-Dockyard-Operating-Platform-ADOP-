-- ADOP Phase 1 Gate 1E — pgTAP proof for the Expense Submission & Owner
-- Approval Foundation: schema, RLS, RPC authorization (admin/owner draft +
-- submit, owner-only review), revision history (append-only, no overwrite
-- after submission), atomic approval (exactly one ledger entry, no
-- duplication on repeated approval attempts), rejected/needs_correction
-- leaving cash/cost untouched, needs_correction requiring a fresh revision
-- before resubmission, closed-project rejection at approval time, actor/
-- tenant/status forgery resistance, the record_project_expense direct-post
-- bypass closure, and reverse_project_expense's new owner-only posture.
--
-- Self-contained: creates its own fixtures (distinct tenant/user ids from
-- every other pgTAP file in this directory) and rolls back at the end.
-- Regression coverage for Gate 1B-1D lives in their own files — running
-- `supabase test db` (all files together) is what proves "Gate 1B-1D tetap
-- PASS" alongside this file's new assertions.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pgtap-expense-approval-tenant-k', 'PgTAP Expense Approval Tenant K', 'active'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'pgtap-expense-approval-tenant-l', 'PgTAP Expense Approval Tenant L', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-dddd-4444-0000-000000000001', 'authenticated', 'authenticated', 'owner-k@pgtap-expense.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-dddd-4444-0000-000000000002', 'authenticated', 'authenticated', 'admin-k@pgtap-expense.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-dddd-4444-0000-000000000003', 'authenticated', 'authenticated', 'reviewer-k@pgtap-expense.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-dddd-4444-0000-000000000004', 'authenticated', 'authenticated', 'viewer-k@pgtap-expense.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-eeee-4444-0000-000000000001', 'authenticated', 'authenticated', 'owner-l@pgtap-expense.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('d0000000-4444-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-dddd-4444-0000-000000000001', 'active'),
  ('d0000000-4444-0000-0000-000000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-dddd-4444-0000-000000000002', 'active'),
  ('d0000000-4444-0000-0000-000000000003', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-dddd-4444-0000-000000000003', 'active'),
  ('d0000000-4444-0000-0000-000000000004', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-dddd-4444-0000-000000000004', 'active'),
  ('e0000000-4444-0000-0000-000000000001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '00000000-eeee-4444-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('d0000000-4444-0000-0000-000000000001', 'owner'),
  ('d0000000-4444-0000-0000-000000000002', 'admin'),
  ('d0000000-4444-0000-0000-000000000003', 'reviewer'),
  ('d0000000-4444-0000-0000-000000000004', 'viewer'),
  ('e0000000-4444-0000-0000-000000000001', 'owner');

-- Anchor master-data + Project Kapal rows, inserted as the unrestricted
-- fixture-setup role (bypasses RLS and column grants), same posture as
-- project_cost_ledger.test.sql.
insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('d0000000-0000-0000-0000-0000000000c1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'CL-K-ANCHOR', 'Anchor Client K', '00000000-dddd-4444-0000-000000000001'),
  ('e0000000-0000-0000-0000-0000000000c1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'CL-L-ANCHOR', 'Anchor Client L', '00000000-eeee-4444-0000-000000000001');

insert into public.vessels (id, tenant_id, client_id, vessel_code, vessel_name, created_by) values
  ('d0000000-0000-0000-0000-0000000000a1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'd0000000-0000-0000-0000-0000000000c1', 'VS-K-ANCHOR', 'KM Anchor K', '00000000-dddd-4444-0000-000000000001'),
  ('e0000000-0000-0000-0000-0000000000a1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'e0000000-0000-0000-0000-0000000000c1', 'VS-L-ANCHOR', 'KM Anchor L', '00000000-eeee-4444-0000-000000000001');

insert into public.service_types (id, tenant_id, code, name) values
  ('d0000000-0000-0000-0000-0000000000b1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'anchor-service', 'Anchor Service K'),
  ('e0000000-0000-0000-0000-0000000000b1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'anchor-service', 'Anchor Service L');

insert into public.facility_locations (id, tenant_id, code, name) values
  ('d0000000-0000-0000-0000-0000000000f1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'FL-K-ANCHOR', 'Anchor Facility K'),
  ('e0000000-0000-0000-0000-0000000000f1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'FL-L-ANCHOR', 'Anchor Facility L');

insert into public.expense_categories (id, tenant_id, code, name) values
  ('d0000000-0000-0000-0000-0000000000e1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'anchor-category', 'Anchor Category K'),
  ('e0000000-0000-0000-0000-0000000000e1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'anchor-category', 'Anchor Category L');

insert into public.vendors (id, tenant_id, vendor_code, display_name) values
  ('d0000000-0000-0000-0000-0000000000d1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'VN-K-ANCHOR', 'Anchor Vendor K');

insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by) values
  ('d0000000-0000-0000-0000-0000000000a2', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'd0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-0000000000c1', 'd0000000-0000-0000-0000-0000000000b1', 'd0000000-0000-0000-0000-0000000000f1', 'IE-CL-PROJECT-A', '2033-01-01', '00000000-dddd-4444-0000-000000000001'),
  ('d0000000-0000-0000-0000-0000000000a3', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'd0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-0000000000c1', 'd0000000-0000-0000-0000-0000000000b1', 'd0000000-0000-0000-0000-0000000000f1', 'IE-CL-PROJECT-B', '2033-01-01', '00000000-dddd-4444-0000-000000000001'),
  ('d0000000-0000-0000-0000-0000000000a4', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'd0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-0000000000c1', 'd0000000-0000-0000-0000-0000000000b1', 'd0000000-0000-0000-0000-0000000000f1', 'IE-CL-PROJECT-C', '2033-01-01', '00000000-dddd-4444-0000-000000000001');

insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by) values
  ('e0000000-0000-0000-0000-0000000000a2', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'e0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000f1', 'IE-CL-PROJECT-L', '2033-01-01', '00000000-eeee-4444-0000-000000000001');

-- =============================================================================
-- SCHEMA
-- =============================================================================

select has_table('public', 'expense_submissions', 'public.expense_submissions exists');
select has_table('public', 'expense_submission_revisions', 'public.expense_submission_revisions exists');
select has_table('public', 'expense_submission_status_events', 'public.expense_submission_status_events exists');
select has_view('public', 'expense_submission_current', 'public.expense_submission_current view exists');

select has_type('public', 'expense_submission_status', 'expense_submission_status enum exists');
select ok(
  (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.expense_submission_status'::regtype)
    = array['draft', 'submitted', 'approved', 'rejected', 'needs_correction'],
  'expense_submission_status is exactly draft/submitted/approved/rejected/needs_correction'
);

select col_is_pk('public', 'expense_submissions', 'id', 'expense_submissions PK is id');
select col_not_null('public', 'expense_submission_revisions', 'amount', 'expense_submission_revisions.amount is not null');
select col_not_null('public', 'expense_submission_revisions', 'description', 'expense_submission_revisions.description is not null');
select ok(
  (select is_nullable from information_schema.columns
     where table_schema = 'public' and table_name = 'expense_submission_revisions' and column_name = 'vendor_id') = 'YES',
  'expense_submission_revisions.vendor_id is nullable'
);

select ok((select relrowsecurity from pg_class where oid = 'public.expense_submissions'::regclass), 'RLS enabled on expense_submissions');
select ok((select relrowsecurity from pg_class where oid = 'public.expense_submission_revisions'::regclass), 'RLS enabled on expense_submission_revisions');
select ok((select relrowsecurity from pg_class where oid = 'public.expense_submission_status_events'::regclass), 'RLS enabled on expense_submission_status_events');

select has_trigger('public', 'expense_submission_revisions', 'expense_submission_revisions_append_only', 'revisions has the append-only guard trigger');
select has_trigger('public', 'expense_submission_status_events', 'expense_submission_status_events_append_only', 'status events has the append-only guard trigger');
select has_trigger('public', 'expense_submissions', 'expense_submissions_enforce_status_transition', 'submissions has the status transition guard trigger');
select has_trigger('public', 'expense_submissions', 'expense_submission_creation_log', 'submissions has the automatic creation-event trigger');

select ok(not has_table_privilege('authenticated', 'public.expense_submissions', 'INSERT'), 'authenticated has no INSERT on expense_submissions');
select ok(not has_table_privilege('authenticated', 'public.expense_submissions', 'UPDATE'), 'authenticated has no UPDATE on expense_submissions');
select ok(not has_table_privilege('authenticated', 'public.expense_submissions', 'DELETE'), 'authenticated has no DELETE on expense_submissions');
select ok(not has_table_privilege('authenticated', 'public.expense_submission_revisions', 'INSERT'), 'authenticated has no INSERT on expense_submission_revisions');
select ok(not has_table_privilege('authenticated', 'public.expense_submission_revisions', 'UPDATE'), 'authenticated has no UPDATE on expense_submission_revisions');
select ok(not has_table_privilege('authenticated', 'public.expense_submission_status_events', 'INSERT'), 'authenticated has no INSERT on expense_submission_status_events');

select ok(
  exists (
    select 1 from pg_proc
    where oid = any(array[
      'public.create_expense_draft(uuid, uuid, uuid, uuid, numeric, text, uuid, text)'::regprocedure,
      'public.revise_expense_draft(uuid, uuid, uuid, uuid, numeric, text, uuid, text)'::regprocedure,
      'public.submit_expense(uuid)'::regprocedure,
      'public.approve_expense_submission(uuid)'::regprocedure,
      'public.reject_expense_submission(uuid, text)'::regprocedure,
      'public.request_expense_correction(uuid, text)'::regprocedure
    ])
    group by 1 having count(*) = 6
  ) is not null,
  'all six expense-approval RPCs exist'
);
select ok(
  has_function_privilege('authenticated', 'public.create_expense_draft(uuid, uuid, uuid, uuid, numeric, text, uuid, text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.revise_expense_draft(uuid, uuid, uuid, uuid, numeric, text, uuid, text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.submit_expense(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.approve_expense_submission(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.reject_expense_submission(uuid, text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.request_expense_correction(uuid, text)', 'EXECUTE'),
  'authenticated can execute all six RPCs (internal role checks gate them, not the grant)'
);
select ok(
  not has_function_privilege('anon', 'public.create_expense_draft(uuid, uuid, uuid, uuid, numeric, text, uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.approve_expense_submission(uuid)', 'EXECUTE'),
  'anon cannot execute the expense-approval RPCs'
);

-- #13 — Direct ledger-post RPC ditolak untuk authenticated.
select ok(
  not has_function_privilege('authenticated', 'public.record_project_expense(uuid, uuid, uuid, numeric, text, uuid, text)', 'EXECUTE'),
  'authenticated has no EXECUTE grant on record_project_expense — approve_expense_submission is the only remaining caller'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.record_project_expense(
       '00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-0000000000a2', 'd0000000-0000-0000-0000-0000000000e1',
       1000, 'owner K coba langsung ke ledger', null, null
     ) $$,
  '42501',
  null,
  'owner K cannot call record_project_expense directly anymore — the bypass is closed'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- SETUP — daily cash pool for tenant K
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.get_or_create_daily_cash_pool('dddddddd-dddd-dddd-dddd-dddddddddddd', '2033-02-01') $$,
  'owner K can create the tenant K pool'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_expense_pool_k as
  select id from public.cash_pools where tenant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' and business_date = '2033-02-01';
grant select on pgtap_expense_pool_k to authenticated;

-- =============================================================================
-- #1 / #2 — CREATE DRAFT: admin/owner can, other tenant / other roles cannot
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_expense_draft(
       'dddddddd-dddd-dddd-dddd-dddddddddddd', (select id from pgtap_expense_pool_k), 'd0000000-0000-0000-0000-0000000000a2', 'd0000000-0000-0000-0000-0000000000e1',
       500000.00, 'beli spare part project A', 'd0000000-0000-0000-0000-0000000000d1', 'REF-A-001'
     ) $$,
  'admin K can create an expense draft'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_expense_submission_a as
  select id from public.expense_submissions
    where tenant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' and current_revision_id in (
      select id from public.expense_submission_revisions where project_id = 'd0000000-0000-0000-0000-0000000000a2'
    );
grant select on pgtap_expense_submission_a to authenticated;

select is(
  (select status::text from public.expense_submissions where id = (select id from pgtap_expense_submission_a)),
  'draft',
  'the new submission starts in draft status'
);
select is(
  (select revision_number from public.expense_submission_revisions where submission_id = (select id from pgtap_expense_submission_a)),
  1,
  'the first revision is numbered 1'
);
select is(
  (select count(*)::int from public.expense_submission_status_events where submission_id = (select id from pgtap_expense_submission_a)),
  1,
  'the automatic creation event (null -> draft) was logged'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.create_expense_draft(
       'dddddddd-dddd-dddd-dddd-dddddddddddd', (select id from pgtap_expense_pool_k), 'd0000000-0000-0000-0000-0000000000a2', 'd0000000-0000-0000-0000-0000000000e1',
       1000, 'reviewer coba buat draft', null, null
     ) $$,
  'not authorized to create expense submission',
  'reviewer K cannot create an expense draft'
);
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.create_expense_draft(
       'dddddddd-dddd-dddd-dddd-dddddddddddd', (select id from pgtap_expense_pool_k), 'd0000000-0000-0000-0000-0000000000a2', 'd0000000-0000-0000-0000-0000000000e1',
       1000, 'owner L lintas tenant', null, null
     ) $$,
  'not authorized to create expense submission',
  'owner L (a different tenant) cannot create a draft against tenant K'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #3 — REVISE DRAFT: history stays intact
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.revise_expense_draft(
       (select id from pgtap_expense_submission_a), (select id from pgtap_expense_pool_k), 'd0000000-0000-0000-0000-0000000000a2', 'd0000000-0000-0000-0000-0000000000e1',
       600000.00, 'beli spare part project A (revisi harga)', 'd0000000-0000-0000-0000-0000000000d1', 'REF-A-001'
     ) $$,
  'owner K can revise the draft'
);
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.expense_submission_revisions where submission_id = (select id from pgtap_expense_submission_a)),
  2,
  'revising a draft adds a new revision row, revision 1 is not deleted'
);
select results_eq(
  $$ select amount from public.expense_submission_revisions
       where submission_id = (select id from pgtap_expense_submission_a) and revision_number = 1 $$,
  $$ values (500000.00::numeric) $$,
  'revision 1''s amount is untouched by the later revision'
);
select is(
  (select current_revision_id from public.expense_submissions where id = (select id from pgtap_expense_submission_a)),
  (select id from public.expense_submission_revisions where submission_id = (select id from pgtap_expense_submission_a) and revision_number = 2),
  'the header now points at revision 2 as current'
);

-- =============================================================================
-- #4 — SUBMIT: submitted financial data can no longer be overwritten
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.submit_expense((select id from pgtap_expense_submission_a)) $$,
  'owner K can submit the draft'
);
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.expense_submissions where id = (select id from pgtap_expense_submission_a)),
  'submitted',
  'the submission is now submitted'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.revise_expense_draft(
       (select id from pgtap_expense_submission_a), (select id from pgtap_expense_pool_k), 'd0000000-0000-0000-0000-0000000000a2', 'd0000000-0000-0000-0000-0000000000e1',
       999999.00, 'coba overwrite setelah submit', null, null
     ) $$,
  'expense submission cannot be revised in its current status',
  'a submitted submission cannot be revised — financial data cannot be overwritten'
);
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from public.expense_submission_revisions where submission_id = (select id from pgtap_expense_submission_a)),
  2,
  'the rejected revise attempt added no new revision'
);

-- =============================================================================
-- #5 — REVIEW: only owner can approve/reject/request correction
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.approve_expense_submission((select id from pgtap_expense_submission_a)) $$,
  'not authorized to review expense submission',
  'admin K cannot approve'
);
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.reject_expense_submission((select id from pgtap_expense_submission_a), 'reviewer coba reject') $$,
  'not authorized to review expense submission',
  'reviewer K cannot reject'
);
select throws_ok(
  $$ select public.request_expense_correction((select id from pgtap_expense_submission_a), 'reviewer coba minta koreksi') $$,
  'not authorized to review expense submission',
  'reviewer K cannot request correction'
);
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000004', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.approve_expense_submission((select id from pgtap_expense_submission_a)) $$,
  'not authorized to review expense submission',
  'viewer K cannot approve'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #6 / #7 — APPROVE: exactly one ledger entry, repeated approval rejected
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.approve_expense_submission((select id from pgtap_expense_submission_a)) $$,
  'owner K can approve the submission'
);
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.expense_submissions where id = (select id from pgtap_expense_submission_a)),
  'approved',
  'the submission is now approved'
);
select is(
  (select count(*)::int from public.project_cost_ledger_entries where project_id = 'd0000000-0000-0000-0000-0000000000a2'),
  1,
  'approval posted exactly one ledger entry'
);
select results_eq(
  $$ select amount from public.project_cost_ledger_entries where project_id = 'd0000000-0000-0000-0000-0000000000a2' $$,
  $$ values (600000.00::numeric) $$,
  'the posted ledger entry uses the CURRENT (revision 2) amount, not the original draft amount'
);
select ok(
  (select ledger_entry_id from public.expense_submissions where id = (select id from pgtap_expense_submission_a)) is not null,
  'the submission stores a link to its ledger entry'
);
select is(
  (select ledger_entry_id from public.expense_submissions where id = (select id from pgtap_expense_submission_a)),
  (select id from public.project_cost_ledger_entries where project_id = 'd0000000-0000-0000-0000-0000000000a2'),
  'the stored ledger_entry_id matches the actual posted ledger row'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.approve_expense_submission((select id from pgtap_expense_submission_a)) $$,
  'expense submission is not awaiting review',
  'approving an already-approved submission again is rejected — sequential double-approval is the standard proxy for concurrent double-approval in this test harness'
);
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from public.project_cost_ledger_entries where project_id = 'd0000000-0000-0000-0000-0000000000a2'),
  1,
  'the repeated approval attempt did not create a second ledger entry'
);

-- Terminal state: approved cannot transition further.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.reject_expense_submission((select id from pgtap_expense_submission_a), 'coba reject setelah approved') $$,
  'expense submission is not awaiting review',
  'an approved submission cannot be rejected — approved is terminal'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #8 — REJECT / NEEDS_CORRECTION do not touch cash/cost
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.create_expense_draft(
       'dddddddd-dddd-dddd-dddd-dddddddddddd', (select id from pgtap_expense_pool_k), 'd0000000-0000-0000-0000-0000000000a3', 'd0000000-0000-0000-0000-0000000000e1',
       300000.00, 'biaya project B untuk ditolak', null, null
     ) $$,
  'owner K creates a draft for project B (to be rejected)'
);
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_expense_submission_b as
  select id from public.expense_submissions
    where current_revision_id in (select id from public.expense_submission_revisions where project_id = 'd0000000-0000-0000-0000-0000000000a3');
grant select on pgtap_expense_submission_b to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok($$ select public.submit_expense((select id from pgtap_expense_submission_b)) $$, 'owner K submits project B''s draft');
select throws_ok(
  $$ select public.reject_expense_submission((select id from pgtap_expense_submission_b), '') $$,
  'rejection reason is required',
  'an empty rejection reason is rejected'
);
select lives_ok(
  $$ select public.reject_expense_submission((select id from pgtap_expense_submission_b), 'nominal tidak sesuai bukti') $$,
  'owner K rejects project B''s submission with a reason'
);
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.expense_submissions where id = (select id from pgtap_expense_submission_b)),
  'rejected',
  'project B''s submission is now rejected'
);
select is(
  (select count(*)::int from public.project_cost_ledger_entries where project_id = 'd0000000-0000-0000-0000-0000000000a3'),
  0,
  'a rejected submission posted no ledger entry'
);
select results_eq(
  $$ select total_cost from public.vessel_project_cost_summary where project_id = 'd0000000-0000-0000-0000-0000000000a3' $$,
  $$ values (0.00::numeric) $$,
  'project B''s total cost is untouched by the rejection'
);

-- =============================================================================
-- #9 / #10 — NEEDS_CORRECTION requires a fresh revision before resubmission,
-- then the latest revision can be approved
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.create_expense_draft(
       'dddddddd-dddd-dddd-dddd-dddddddddddd', (select id from pgtap_expense_pool_k), 'd0000000-0000-0000-0000-0000000000a4', 'd0000000-0000-0000-0000-0000000000e1',
       200000.00, 'biaya project C butuh koreksi', null, null
     ) $$,
  'owner K creates a draft for project C (to need correction)'
);
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_expense_submission_c as
  select id from public.expense_submissions
    where current_revision_id in (select id from public.expense_submission_revisions where project_id = 'd0000000-0000-0000-0000-0000000000a4');
grant select on pgtap_expense_submission_c to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok($$ select public.submit_expense((select id from pgtap_expense_submission_c)) $$, 'owner K submits project C''s draft');
select throws_ok(
  $$ select public.request_expense_correction((select id from pgtap_expense_submission_c), '') $$,
  'correction reason is required',
  'an empty correction reason is rejected'
);
select lives_ok(
  $$ select public.request_expense_correction((select id from pgtap_expense_submission_c), 'kategori biaya salah, mohon perbaiki') $$,
  'owner K requests correction on project C''s submission'
);
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.expense_submissions where id = (select id from pgtap_expense_submission_c)),
  'needs_correction',
  'project C''s submission is now needs_correction'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.submit_expense((select id from pgtap_expense_submission_c)) $$,
  'expense submission requires a new revision before resubmission',
  'resubmitting needs_correction without a new revision is rejected'
);
select lives_ok(
  $$ select public.revise_expense_draft(
       (select id from pgtap_expense_submission_c), (select id from pgtap_expense_pool_k), 'd0000000-0000-0000-0000-0000000000a4', 'd0000000-0000-0000-0000-0000000000e1',
       250000.00, 'biaya project C setelah koreksi kategori', null, null
     ) $$,
  'admin K revises project C''s submission — a new revision is created'
);
select lives_ok(
  $$ select public.submit_expense((select id from pgtap_expense_submission_c)) $$,
  'admin K can now resubmit project C''s submission after the correction'
);
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.approve_expense_submission((select id from pgtap_expense_submission_c)) $$,
  'owner K approves project C''s corrected, resubmitted submission'
);
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$ select amount from public.project_cost_ledger_entries where project_id = 'd0000000-0000-0000-0000-0000000000a4' $$,
  $$ values (250000.00::numeric) $$,
  'the ledger entry uses the corrected (latest) revision''s amount, not the original 200000'
);

-- =============================================================================
-- #11 — Project closed before approval is rejected
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.create_expense_draft(
       'dddddddd-dddd-dddd-dddd-dddddddddddd', (select id from pgtap_expense_pool_k), 'd0000000-0000-0000-0000-0000000000a3', 'd0000000-0000-0000-0000-0000000000e1',
       150000.00, 'biaya project B kedua, sebelum ditutup', null, null
     ) $$,
  'owner K creates a second draft for project B'
);
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_expense_submission_b2 as
  select s.id from public.expense_submissions s
    join public.expense_submission_revisions r on r.id = s.current_revision_id
    where r.project_id = 'd0000000-0000-0000-0000-0000000000a3' and r.amount = 150000.00;
grant select on pgtap_expense_submission_b2 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok($$ select public.submit_expense((select id from pgtap_expense_submission_b2)) $$, 'owner K submits the second project B draft');
select lives_ok(
  $$ select public.transition_vessel_project_lifecycle('d0000000-0000-0000-0000-0000000000a3', 'ready_to_close', null) $$,
  'project B can transition to ready_to_close'
);
select lives_ok(
  $$ select public.transition_vessel_project_lifecycle('d0000000-0000-0000-0000-0000000000a3', 'closed', null) $$,
  'project B can transition to closed'
);
select throws_ok(
  $$ select public.approve_expense_submission((select id from pgtap_expense_submission_b2)) $$,
  'vessel project is closed to new expenses',
  'approving a submission whose project closed after submission is rejected'
);
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.expense_submissions where id = (select id from pgtap_expense_submission_b2)),
  'submitted',
  'the rejected approval attempt left the submission status unchanged (still submitted, not approved)'
);
select is(
  (select count(*)::int from public.project_cost_ledger_entries where project_id = 'd0000000-0000-0000-0000-0000000000a3'),
  0,
  'no ledger entry was posted for the closed-project approval attempt'
);

-- =============================================================================
-- #12 — Actor / tenant / status cannot be forged
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ insert into public.expense_submissions (tenant_id, status, created_by)
     values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'approved', '00000000-dddd-4444-0000-000000000002') $$,
  '42501',
  null,
  'admin K cannot INSERT directly into expense_submissions to forge an approved status'
);
select throws_ok(
  $$ update public.expense_submissions set status = 'approved' where id = (select id from pgtap_expense_submission_a) $$,
  '42501',
  null,
  'admin K cannot UPDATE expense_submissions directly to forge a status'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select created_by from public.expense_submissions where id = (select id from pgtap_expense_submission_a)),
  '00000000-dddd-4444-0000-000000000002'::uuid,
  'created_by on the earlier draft is the real actor (admin K) who called create_expense_draft, never client-suppliable'
);
select is(
  (select decided_by from public.expense_submissions where id = (select id from pgtap_expense_submission_a)),
  '00000000-dddd-4444-0000-000000000001'::uuid,
  'decided_by is the real owner who approved, never client-suppliable'
);

-- =============================================================================
-- #14 — Admin cannot reverse a ledger entry directly (owner-only now)
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.reverse_project_expense(
       (select id from public.project_cost_ledger_entries where project_id = 'd0000000-0000-0000-0000-0000000000a2'),
       'admin coba reverse langsung'
     ) $$,
  'not authorized to reverse project expense',
  'admin K cannot reverse a ledger entry directly — reversal is owner-only as of Gate 1E'
);
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.reverse_project_expense(
       (select id from public.project_cost_ledger_entries where project_id = 'd0000000-0000-0000-0000-0000000000a2'),
       'owner K masih bisa reverse'
     ) $$,
  'owner K can still reverse a ledger entry directly'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #15 — Revisions and status events are append-only, role-independent
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-dddd-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ update public.expense_submission_revisions set amount = 1 where submission_id = (select id from pgtap_expense_submission_a) $$,
  '42501',
  null,
  'owner K cannot UPDATE expense_submission_revisions directly — no grant'
);
select throws_ok(
  $$ delete from public.expense_submission_status_events where submission_id = (select id from pgtap_expense_submission_a) $$,
  '42501',
  null,
  'owner K cannot DELETE expense_submission_status_events directly — no grant'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Role-independent: even the unrestricted fixture-setup role cannot mutate,
-- proving the append-only guarantee is a real trigger, not just a grant —
-- same posture proven for project_cost_ledger_entries in Gate 1D.
reset role;
select throws_ok(
  $$ update public.expense_submission_revisions set amount = 1
       where submission_id = (select id from pgtap_expense_submission_a) $$,
  'access_audit_events is append-only: UPDATE not allowed',
  'UPDATE on expense_submission_revisions is blocked at the database level, regardless of role'
);
select throws_ok(
  $$ delete from public.expense_submission_status_events
       where submission_id = (select id from pgtap_expense_submission_a) $$,
  'access_audit_events is append-only: DELETE not allowed',
  'DELETE on expense_submission_status_events is blocked at the database level, regardless of role'
);

-- Structural, role-independent proof that the status-transition guard is a
-- real trigger: a raw UPDATE (bypassing every RPC) attempting an invalid
-- jump is rejected even under the unrestricted fixture-setup role.
select throws_ok(
  $$ update public.expense_submissions set status = 'draft' where id = (select id from pgtap_expense_submission_b) $$,
  'invalid expense submission status transition from rejected to draft',
  'a raw UPDATE attempting an invalid status transition is rejected at the trigger level, regardless of caller'
);

-- =============================================================================
-- CROSS-TENANT READ ISOLATION
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-eeee-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is_empty(
  $$ select id from public.expense_submissions where tenant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  'owner L cannot read tenant K''s expense submissions'
);
select is_empty(
  $$ select id from public.expense_submission_revisions where tenant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  'owner L cannot read tenant K''s expense submission revisions'
);
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();

rollback;
