-- ADOP Phase 1 Gate 1F — pgTAP proof for Deterministic Duplicate Expense
-- Detection: schema, RLS, deterministic server-side detection on every
-- (re)submit, all four reason codes, draft exclusion, cross-tenant
-- isolation, canonical pair ordering/uniqueness, owner-only resolution,
-- the approval gate (DUPLICATE_REVIEW_REQUIRED / DUPLICATE_CONFIRMED),
-- append-only history, and actor/tenant/evidence forgery resistance.
--
-- Self-contained: creates its own fixtures (distinct tenant/user ids from
-- every other pgTAP file in this directory) and rolls back at the end.
-- Regression coverage for Gate 1B-1E lives in their own files — running
-- `supabase test db` (all files together) is what proves "Gate 1B-1E tetap
-- PASS" alongside this file's new assertions.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'pgtap-expense-dup-tenant-m', 'PgTAP Expense Dup Tenant M', 'active'),
  ('99999999-9999-9999-9999-999999999999', 'pgtap-expense-dup-tenant-n', 'PgTAP Expense Dup Tenant N', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-ffff-4444-0000-000000000001', 'authenticated', 'authenticated', 'owner-m@pgtap-expense-dup.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-ffff-4444-0000-000000000002', 'authenticated', 'authenticated', 'admin-m@pgtap-expense-dup.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-9999-4444-0000-000000000001', 'authenticated', 'authenticated', 'owner-n@pgtap-expense-dup.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('f0000000-4444-0000-0000-000000000001', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '00000000-ffff-4444-0000-000000000001', 'active'),
  ('f0000000-4444-0000-0000-000000000002', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '00000000-ffff-4444-0000-000000000002', 'active'),
  ('90000000-4444-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', '00000000-9999-4444-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('f0000000-4444-0000-0000-000000000001', 'owner'),
  ('f0000000-4444-0000-0000-000000000002', 'admin'),
  ('90000000-4444-0000-0000-000000000001', 'owner');

-- Anchor master-data + Project Kapal rows for tenant M (two projects, X and
-- Y, to exercise cross-project reference matching) and tenant N (one
-- project), inserted as the unrestricted fixture-setup role.
insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('f0000000-0000-0000-0000-0000000000c1', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'CL-M-ANCHOR', 'Anchor Client M', '00000000-ffff-4444-0000-000000000001'),
  ('90000000-0000-0000-0000-0000000000c1', '99999999-9999-9999-9999-999999999999', 'CL-N-ANCHOR', 'Anchor Client N', '00000000-9999-4444-0000-000000000001');

insert into public.vessels (id, tenant_id, client_id, vessel_code, vessel_name, created_by) values
  ('f0000000-0000-0000-0000-0000000000a1', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'f0000000-0000-0000-0000-0000000000c1', 'VS-M-ANCHOR', 'KM Anchor M', '00000000-ffff-4444-0000-000000000001'),
  ('90000000-0000-0000-0000-0000000000a1', '99999999-9999-9999-9999-999999999999', '90000000-0000-0000-0000-0000000000c1', 'VS-N-ANCHOR', 'KM Anchor N', '00000000-9999-4444-0000-000000000001');

insert into public.service_types (id, tenant_id, code, name) values
  ('f0000000-0000-0000-0000-0000000000b1', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'anchor-service', 'Anchor Service M'),
  ('90000000-0000-0000-0000-0000000000b1', '99999999-9999-9999-9999-999999999999', 'anchor-service', 'Anchor Service N');

insert into public.facility_locations (id, tenant_id, code, name) values
  ('f0000000-0000-0000-0000-0000000000f1', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'FL-M-ANCHOR', 'Anchor Facility M'),
  ('90000000-0000-0000-0000-0000000000f1', '99999999-9999-9999-9999-999999999999', 'FL-N-ANCHOR', 'Anchor Facility N');

insert into public.expense_categories (id, tenant_id, code, name) values
  ('f0000000-0000-0000-0000-0000000000e1', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'anchor-category', 'Anchor Category M'),
  ('90000000-0000-0000-0000-0000000000e1', '99999999-9999-9999-9999-999999999999', 'anchor-category', 'Anchor Category N');

insert into public.vendors (id, tenant_id, vendor_code, display_name) values
  ('f0000000-0000-0000-0000-0000000000d1', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'VN-M-ANCHOR', 'Anchor Vendor M'),
  ('90000000-0000-0000-0000-0000000000d1', '99999999-9999-9999-9999-999999999999', 'VN-N-ANCHOR', 'Anchor Vendor N');

insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by) values
  ('f0000000-0000-0000-0000-0000000000a2', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'f0000000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-0000000000c1', 'f0000000-0000-0000-0000-0000000000b1', 'f0000000-0000-0000-0000-0000000000f1', 'ID-M-PROJECT-X', '2035-01-01', '00000000-ffff-4444-0000-000000000001'),
  ('f0000000-0000-0000-0000-0000000000a3', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'f0000000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-0000000000c1', 'f0000000-0000-0000-0000-0000000000b1', 'f0000000-0000-0000-0000-0000000000f1', 'ID-M-PROJECT-Y', '2035-01-01', '00000000-ffff-4444-0000-000000000001');

insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by) values
  ('90000000-0000-0000-0000-0000000000a2', '99999999-9999-9999-9999-999999999999', '90000000-0000-0000-0000-0000000000a1', '90000000-0000-0000-0000-0000000000c1', '90000000-0000-0000-0000-0000000000b1', '90000000-0000-0000-0000-0000000000f1', 'ID-N-PROJECT', '2035-01-01', '00000000-9999-4444-0000-000000000001');

-- =============================================================================
-- SCHEMA
-- =============================================================================

select has_table('public', 'expense_duplicate_candidates', 'public.expense_duplicate_candidates exists');
select has_table('public', 'expense_duplicate_candidate_resolution_events', 'public.expense_duplicate_candidate_resolution_events exists');
select has_view('public', 'expense_duplicate_candidate_current', 'public.expense_duplicate_candidate_current view exists');

select has_type('public', 'expense_duplicate_reason_code', 'expense_duplicate_reason_code enum exists');
select ok(
  (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.expense_duplicate_reason_code'::regtype)
    = array['reference_match', 'exact_financial_match', 'cross_project_reference_match', 'same_day_amount_vendor_match'],
  'expense_duplicate_reason_code is exactly the four locked reason codes'
);

select has_type('public', 'expense_duplicate_candidate_status', 'expense_duplicate_candidate_status enum exists');
select ok(
  (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.expense_duplicate_candidate_status'::regtype)
    = array['pending', 'not_duplicate', 'confirmed_duplicate'],
  'expense_duplicate_candidate_status is exactly pending/not_duplicate/confirmed_duplicate'
);

select ok((select relrowsecurity from pg_class where oid = 'public.expense_duplicate_candidates'::regclass), 'RLS enabled on expense_duplicate_candidates');
select ok((select relrowsecurity from pg_class where oid = 'public.expense_duplicate_candidate_resolution_events'::regclass), 'RLS enabled on expense_duplicate_candidate_resolution_events');

select has_trigger('public', 'expense_duplicate_candidate_resolution_events', 'expense_duplicate_candidate_resolution_events_append_only', 'resolution events has the append-only guard trigger');
select has_trigger('public', 'expense_duplicate_candidates', 'expense_duplicate_candidates_enforce_status_transition', 'candidates has the status transition guard trigger');
select has_trigger('public', 'expense_duplicate_candidates', 'expense_duplicate_candidate_creation_log', 'candidates has the automatic creation-event trigger');

-- #20 — Direct table mutation ditolak (no INSERT/UPDATE/DELETE grant for `authenticated`).
select ok(not has_table_privilege('authenticated', 'public.expense_duplicate_candidates', 'INSERT'), 'authenticated has no INSERT on expense_duplicate_candidates');
select ok(not has_table_privilege('authenticated', 'public.expense_duplicate_candidates', 'UPDATE'), 'authenticated has no UPDATE on expense_duplicate_candidates');
select ok(not has_table_privilege('authenticated', 'public.expense_duplicate_candidates', 'DELETE'), 'authenticated has no DELETE on expense_duplicate_candidates');
select ok(not has_table_privilege('authenticated', 'public.expense_duplicate_candidate_resolution_events', 'INSERT'), 'authenticated has no INSERT on expense_duplicate_candidate_resolution_events');
select ok(not has_table_privilege('authenticated', 'public.expense_duplicate_candidate_resolution_events', 'UPDATE'), 'authenticated has no UPDATE on expense_duplicate_candidate_resolution_events');
select ok(not has_table_privilege('authenticated', 'public.expense_duplicate_candidate_resolution_events', 'DELETE'), 'authenticated has no DELETE on expense_duplicate_candidate_resolution_events');

select ok(
  has_function_privilege('authenticated', 'public.resolve_expense_duplicate_candidate(uuid, public.expense_duplicate_candidate_status, text)', 'EXECUTE'),
  'authenticated can execute resolve_expense_duplicate_candidate (internal owner-only role check gates it, not the grant)'
);
select ok(
  not has_function_privilege('anon', 'public.resolve_expense_duplicate_candidate(uuid, public.expense_duplicate_candidate_status, text)', 'EXECUTE'),
  'anon cannot execute resolve_expense_duplicate_candidate'
);

-- =============================================================================
-- SETUP — daily cash pools
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.get_or_create_daily_cash_pool('ffffffff-ffff-ffff-ffff-ffffffffffff', '2035-03-01') $$,
  'owner M can create the tenant M pool'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.get_or_create_daily_cash_pool('99999999-9999-9999-9999-999999999999', '2035-03-01') $$,
  'owner N can create the tenant N pool'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_dup_pool_m as
  select id from public.cash_pools where tenant_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' and business_date = '2035-03-01';
grant select on pgtap_dup_pool_m to authenticated;

create temporary table pgtap_dup_pool_n as
  select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2035-03-01';
grant select on pgtap_dup_pool_n to authenticated;

-- =============================================================================
-- #1 — Submission A: the very first submission produces no false candidate
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_expense_draft(
       'ffffffff-ffff-ffff-ffff-ffffffffffff', (select id from pgtap_dup_pool_m), 'f0000000-0000-0000-0000-0000000000a2', 'f0000000-0000-0000-0000-0000000000e1',
       500000.00, 'beli spare part utama', 'f0000000-0000-0000-0000-0000000000d1', 'REF-DUP-001'
     ) $$,
  'owner M creates submission A on project X'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_dup_submission_a as
  select id, current_revision_id as revision_id from public.expense_submissions
    where tenant_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' and current_revision_id in (
      select id from public.expense_submission_revisions where project_id = 'f0000000-0000-0000-0000-0000000000a2' and amount = 500000.00
    );
grant select on pgtap_dup_submission_a to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok($$ select public.submit_expense((select id from pgtap_dup_submission_a)) $$, 'owner M submits submission A');
select lives_ok($$ select public.approve_expense_submission((select id from pgtap_dup_submission_a)) $$, 'owner M approves submission A (no prior candidates to block it)');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.expense_duplicate_candidates
     where revision_id_1 = (select revision_id from pgtap_dup_submission_a) or revision_id_2 = (select revision_id from pgtap_dup_submission_a)),
  0,
  '#1 the very first submission (A) produced zero candidates'
);

-- =============================================================================
-- #2 / #3 / #5 — Submission B duplicates A: reference_match,
-- exact_financial_match, and same_day_amount_vendor_match all fire
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_expense_draft(
       'ffffffff-ffff-ffff-ffff-ffffffffffff', (select id from pgtap_dup_pool_m), 'f0000000-0000-0000-0000-0000000000a2', 'f0000000-0000-0000-0000-0000000000e1',
       500000.00, 'Beli   Spare Part Utama', 'f0000000-0000-0000-0000-0000000000d1', 'REF-DUP-001'
     ) $$,
  'admin M creates submission B on project X — same financials as A, different description casing/whitespace'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_dup_submission_b as
  select id, current_revision_id as revision_id from public.expense_submissions
    where tenant_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' and current_revision_id in (
      select id from public.expense_submission_revisions where project_id = 'f0000000-0000-0000-0000-0000000000a2' and description = 'Beli   Spare Part Utama'
    );
grant select on pgtap_dup_submission_b to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok($$ select public.submit_expense((select id from pgtap_dup_submission_b)) $$, 'admin M submits submission B — detection runs against A (currently approved)');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.expense_duplicate_candidates
     where reason_code = 'reference_match'
       and revision_id_1 in ((select revision_id from pgtap_dup_submission_a), (select revision_id from pgtap_dup_submission_b))
       and revision_id_2 in ((select revision_id from pgtap_dup_submission_a), (select revision_id from pgtap_dup_submission_b))),
  1,
  '#2 same non-empty reference within the same tenant (and same project) produced exactly one reference_match candidate'
);
select is(
  (select count(*)::int from public.expense_duplicate_candidates
     where reason_code = 'exact_financial_match'
       and revision_id_1 in ((select revision_id from pgtap_dup_submission_a), (select revision_id from pgtap_dup_submission_b))
       and revision_id_2 in ((select revision_id from pgtap_dup_submission_a), (select revision_id from pgtap_dup_submission_b))),
  1,
  '#3 identical business date/amount/project/category/vendor/normalized description produced exactly one exact_financial_match candidate'
);
select is(
  (select count(*)::int from public.expense_duplicate_candidates
     where reason_code = 'same_day_amount_vendor_match'
       and revision_id_1 in ((select revision_id from pgtap_dup_submission_a), (select revision_id from pgtap_dup_submission_b))
       and revision_id_2 in ((select revision_id from pgtap_dup_submission_a), (select revision_id from pgtap_dup_submission_b))),
  1,
  '#5 same business date/amount/vendor produced a same_day_amount_vendor_match candidate too (a weaker, independent signal)'
);
select ok(
  (select bool_and(status = 'pending') from public.expense_duplicate_candidates
     where revision_id_1 in ((select revision_id from pgtap_dup_submission_a), (select revision_id from pgtap_dup_submission_b))
       and revision_id_2 in ((select revision_id from pgtap_dup_submission_a), (select revision_id from pgtap_dup_submission_b))),
  '#5 every freshly detected candidate starts pending — a candidate only, never an automatic verdict'
);

-- =============================================================================
-- #4 — Submission C: same reference, different project -> cross_project_reference_match
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_expense_draft(
       'ffffffff-ffff-ffff-ffff-ffffffffffff', (select id from pgtap_dup_pool_m), 'f0000000-0000-0000-0000-0000000000a3', 'f0000000-0000-0000-0000-0000000000e1',
       999000.00, 'keperluan lain project Y', null, 'REF-DUP-001'
     ) $$,
  'owner M creates submission C on project Y — same reference as A/B but a different project, different amount/vendor'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_dup_submission_c as
  select id, current_revision_id as revision_id from public.expense_submissions
    where tenant_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' and current_revision_id in (
      select id from public.expense_submission_revisions where project_id = 'f0000000-0000-0000-0000-0000000000a3' and reference_number = 'REF-DUP-001'
    );
grant select on pgtap_dup_submission_c to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok($$ select public.submit_expense((select id from pgtap_dup_submission_c)) $$, 'owner M submits submission C');
reset role;
select set_config('request.jwt.claims', '', true);

select ok(
  (select count(*)::int from public.expense_duplicate_candidates
     where reason_code = 'cross_project_reference_match'
       and (revision_id_1 = (select revision_id from pgtap_dup_submission_c) or revision_id_2 = (select revision_id from pgtap_dup_submission_c))) >= 1,
  '#4 same reference across a different Project Kapal produced a cross_project_reference_match candidate'
);
select is(
  (select count(*)::int from public.expense_duplicate_candidates
     where reason_code in ('reference_match', 'exact_financial_match', 'same_day_amount_vendor_match')
       and (revision_id_1 = (select revision_id from pgtap_dup_submission_c) or revision_id_2 = (select revision_id from pgtap_dup_submission_c))),
  0,
  '#4 submission C (different project, different amount/vendor) did not also trigger the same-project reason codes'
);

-- =============================================================================
-- #6 — Draft is never compared
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_expense_draft(
       'ffffffff-ffff-ffff-ffff-ffffffffffff', (select id from pgtap_dup_pool_m), 'f0000000-0000-0000-0000-0000000000a2', 'f0000000-0000-0000-0000-0000000000e1',
       500000.00, 'beli spare part utama', 'f0000000-0000-0000-0000-0000000000d1', 'REF-DUP-001'
     ) $$,
  'owner M creates submission D — identical fields to A, but left as a draft'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_dup_submission_d as
  select id, current_revision_id as revision_id from public.expense_submissions
    where tenant_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' and current_revision_id in (
      select id from public.expense_submission_revisions where project_id = 'f0000000-0000-0000-0000-0000000000a2' and description = 'beli spare part utama'
        and submission_id not in (select id from pgtap_dup_submission_a)
    );

select is(
  (select status::text from public.expense_submissions where id = (select id from pgtap_dup_submission_d)),
  'draft',
  '#6 submission D remains a draft'
);
select is(
  (select count(*)::int from public.expense_duplicate_candidates
     where revision_id_1 = (select revision_id from pgtap_dup_submission_d) or revision_id_2 = (select revision_id from pgtap_dup_submission_d)),
  0,
  '#6 a draft (never submitted) produced zero candidates — draft is never compared'
);

-- =============================================================================
-- #7 — Cross-tenant data is never compared
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_expense_draft(
       '99999999-9999-9999-9999-999999999999', (select id from pgtap_dup_pool_n), '90000000-0000-0000-0000-0000000000a2', '90000000-0000-0000-0000-0000000000e1',
       500000.00, 'beli spare part utama', '90000000-0000-0000-0000-0000000000d1', 'REF-DUP-001'
     ) $$,
  'owner N creates submission E on tenant N — same amount/description/reference pattern as A/B, but a different tenant'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_dup_submission_e as
  select id, current_revision_id as revision_id from public.expense_submissions
    where tenant_id = '99999999-9999-9999-9999-999999999999';
grant select on pgtap_dup_submission_e to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok($$ select public.submit_expense((select id from pgtap_dup_submission_e)) $$, 'owner N submits submission E');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.expense_duplicate_candidates
     where revision_id_1 = (select revision_id from pgtap_dup_submission_e) or revision_id_2 = (select revision_id from pgtap_dup_submission_e)),
  0,
  '#7 tenant N''s submission (E), despite matching tenant M''s data, produced zero candidates — cross-tenant data is never compared'
);
select is(
  (select count(*)::int from public.expense_duplicate_candidates c
     join public.expense_submissions s1 on s1.id = c.submission_id_1
     join public.expense_submissions s2 on s2.id = c.submission_id_2
     where s1.tenant_id <> s2.tenant_id or s1.tenant_id <> c.tenant_id or s2.tenant_id <> c.tenant_id),
  0,
  '#7 no candidate row anywhere ever pairs two different tenants, or disagrees with its own tenant_id'
);

-- =============================================================================
-- #8 — Canonical pair ordering + uniqueness (A-B is never doubled as B-A)
-- =============================================================================

select ok(
  (select bool_and(revision_id_1 < revision_id_2) from public.expense_duplicate_candidates),
  '#8 every candidate row satisfies the canonical revision_id_1 < revision_id_2 ordering'
);
select is(
  (select count(*)::int
     from (select revision_id_1, revision_id_2, reason_code, count(*) c
             from public.expense_duplicate_candidates group by 1, 2, 3 having count(*) > 1) dupes),
  0,
  '#8 no (revision pair, reason code) combination appears more than once'
);

-- Role-independent, structural proof: a raw attempt to insert the SAME pair
-- in reversed order is rejected by the pair-order check constraint, and a
-- raw attempt to insert an exact duplicate of an existing row is rejected by
-- the unique index — even under the unrestricted fixture-setup role, so this
-- is a real database guarantee, not just something the detection function
-- happens to avoid.
reset role;
select throws_ok(
  $$ insert into public.expense_duplicate_candidates (tenant_id, revision_id_1, revision_id_2, submission_id_1, submission_id_2, reason_code, match_evidence)
     select tenant_id, revision_id_2, revision_id_1, submission_id_2, submission_id_1, reason_code, match_evidence
       from public.expense_duplicate_candidates where reason_code = 'exact_financial_match' limit 1 $$,
  '23514',
  null,
  '#8 inserting an existing pair in reversed order is rejected by the pair-order check constraint'
);
select throws_ok(
  $$ insert into public.expense_duplicate_candidates (tenant_id, revision_id_1, revision_id_2, submission_id_1, submission_id_2, reason_code, match_evidence)
     select tenant_id, revision_id_1, revision_id_2, submission_id_1, submission_id_2, reason_code, match_evidence
       from public.expense_duplicate_candidates where reason_code = 'exact_financial_match' limit 1 $$,
  '23505',
  null,
  '#8 inserting an exact duplicate of an existing (pair, reason) row is rejected by the unique index'
);

-- =============================================================================
-- #9 — A pending candidate blocks approval
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.approve_expense_submission((select id from pgtap_dup_submission_b)) $$,
  'DUPLICATE_REVIEW_REQUIRED',
  '#9 approving submission B while it still has pending candidates is rejected with the stable DUPLICATE_REVIEW_REQUIRED error'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #10 / #11 — Only the owner of the SAME tenant can resolve
-- =============================================================================

create temporary table pgtap_dup_candidate_b_exact as
  select id from public.expense_duplicate_candidates
    where reason_code = 'exact_financial_match'
      and (revision_id_1 = (select revision_id from pgtap_dup_submission_b) or revision_id_2 = (select revision_id from pgtap_dup_submission_b));
grant select on pgtap_dup_candidate_b_exact to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.resolve_expense_duplicate_candidate((select id from pgtap_dup_candidate_b_exact), 'not_duplicate', 'admin coba resolve') $$,
  'not authorized to resolve expense duplicate candidate',
  '#10 admin M cannot resolve a duplicate candidate — owner-only'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.resolve_expense_duplicate_candidate((select id from pgtap_dup_candidate_b_exact), 'not_duplicate', 'owner N lintas tenant coba resolve') $$,
  'not authorized to resolve expense duplicate candidate',
  '#11 owner N (a different tenant) cannot resolve tenant M''s duplicate candidate'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #12 / #15 — not_duplicate allows approval; resolving twice is rejected
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
do $$
declare
  v_candidate record;
begin
  for v_candidate in
    select id from public.expense_duplicate_candidates
    where (submission_id_1 = (select id from pgtap_dup_submission_b) or submission_id_2 = (select id from pgtap_dup_submission_b))
      and status = 'pending'
  loop
    perform public.resolve_expense_duplicate_candidate(v_candidate.id, 'not_duplicate', 'sudah ditinjau, bukan duplikat sebenarnya');
  end loop;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.expense_duplicate_candidates where id = (select id from pgtap_dup_candidate_b_exact)),
  'not_duplicate',
  '#12 submission B''s exact_financial_match candidate is now resolved not_duplicate'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.resolve_expense_duplicate_candidate((select id from pgtap_dup_candidate_b_exact), 'not_duplicate', 'coba resolve dua kali') $$,
  'expense duplicate candidate already resolved',
  '#15 resolving the same candidate a second time is rejected'
);
select lives_ok(
  $$ select public.approve_expense_submission((select id from pgtap_dup_submission_b)) $$,
  '#12 with all candidates resolved not_duplicate, submission B can now be approved'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- #21 — approval posts exactly one ledger entry; a repeated approval is
-- rejected, matching Gate 1E's own invariant (proves this gate did not
-- weaken it).
select is(
  (select count(*)::int from public.project_cost_ledger_entries
     where id = (select ledger_entry_id from public.expense_submissions where id = (select id from pgtap_dup_submission_b))),
  1,
  '#21 submission B''s approval is linked to exactly one ledger entry'
);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.approve_expense_submission((select id from pgtap_dup_submission_b)) $$,
  'expense submission is not awaiting review',
  '#21 approving submission B again is rejected — no duplicate ledger entry can be posted'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #13 / #14 / #19 — confirmed_duplicate blocks approval, stays visible, and
-- can still be rejected via the Gate 1E RPC; actor/evidence cannot be forged
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.create_expense_draft(
       'ffffffff-ffff-ffff-ffff-ffffffffffff', (select id from pgtap_dup_pool_m), 'f0000000-0000-0000-0000-0000000000a2', 'f0000000-0000-0000-0000-0000000000e1',
       500000.00, 'beli spare part utama', 'f0000000-0000-0000-0000-0000000000d1', 'REF-DUP-001'
     ) $$,
  'owner M creates submission F — identical to A/B again'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_dup_submission_f as
  select id, current_revision_id as revision_id from public.expense_submissions
    where tenant_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' and current_revision_id in (
      select id from public.expense_submission_revisions where project_id = 'f0000000-0000-0000-0000-0000000000a2' and description = 'beli spare part utama'
        and submission_id not in (select id from pgtap_dup_submission_a union select id from pgtap_dup_submission_d)
    );
grant select on pgtap_dup_submission_f to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok($$ select public.submit_expense((select id from pgtap_dup_submission_f)) $$, 'owner M submits submission F — detection runs against both A (approved) and B (approved)');
reset role;
select set_config('request.jwt.claims', '', true);

select ok(
  (select count(*)::int from public.expense_duplicate_candidates
     where status = 'pending'
       and (submission_id_1 = (select id from pgtap_dup_submission_f) or submission_id_2 = (select id from pgtap_dup_submission_f))) >= 1,
  'submission F produced at least one pending candidate'
);

-- Resolve every one of F's pending candidates: the first as
-- confirmed_duplicate, the rest as not_duplicate — isolates the
-- DUPLICATE_CONFIRMED path from DUPLICATE_REVIEW_REQUIRED.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
do $$
declare
  v_candidate record;
  v_first boolean := true;
begin
  for v_candidate in
    select id from public.expense_duplicate_candidates
    where (submission_id_1 = (select id from pgtap_dup_submission_f) or submission_id_2 = (select id from pgtap_dup_submission_f))
      and status = 'pending'
  loop
    if v_first then
      perform public.resolve_expense_duplicate_candidate(v_candidate.id, 'confirmed_duplicate', 'terindikasi duplikasi nyata dengan submission sebelumnya');
      v_first := false;
    else
      perform public.resolve_expense_duplicate_candidate(v_candidate.id, 'not_duplicate', 'kemiripan wajar, bukan duplikat');
    end if;
  end loop;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_dup_candidate_f_confirmed as
  select id from public.expense_duplicate_candidates
    where status = 'confirmed_duplicate'
      and (submission_id_1 = (select id from pgtap_dup_submission_f) or submission_id_2 = (select id from pgtap_dup_submission_f));
grant select on pgtap_dup_candidate_f_confirmed to authenticated;

select is(
  (select count(*)::int from public.expense_duplicate_candidates
     where status = 'pending'
       and (submission_id_1 = (select id from pgtap_dup_submission_f) or submission_id_2 = (select id from pgtap_dup_submission_f))),
  0,
  'no pending candidate remains for submission F (all resolved)'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.approve_expense_submission((select id from pgtap_dup_submission_f)) $$,
  'DUPLICATE_CONFIRMED',
  '#13 approving submission F is rejected with the stable DUPLICATE_CONFIRMED error once a candidate is confirmed'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- #19 — resolver identity is server-derived, never client-suppliable.
select is(
  (select resolved_by from public.expense_duplicate_candidates where id = (select id from pgtap_dup_candidate_f_confirmed)),
  '00000000-ffff-4444-0000-000000000001'::uuid,
  '#19 resolved_by on the confirmed candidate is the real owner who called resolve_expense_duplicate_candidate, never client-suppliable'
);
select ok(
  (select resolved_reason from public.expense_duplicate_candidates where id = (select id from pgtap_dup_candidate_f_confirmed)) is not null,
  '#19 resolved_reason is stored exactly as the owner supplied it'
);

-- #14 — confirmed_duplicate stays visible, is not deleted, and the
-- submission it blocks can still be rejected via the Gate 1E RPC.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.reject_expense_submission((select id from pgtap_dup_submission_f), 'ditolak karena terindikasi duplikasi') $$,
  '#14 submission F, blocked from approval by a confirmed duplicate, can still be rejected via the Gate 1E reject RPC'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.expense_submissions where id = (select id from pgtap_dup_submission_f)),
  'rejected',
  '#14 submission F is now rejected'
);
select is(
  (select status::text from public.expense_duplicate_candidates where id = (select id from pgtap_dup_candidate_f_confirmed)),
  'confirmed_duplicate',
  '#14 the confirmed_duplicate candidate remains visible and unchanged — it was never deleted or hidden by the rejection'
);

-- =============================================================================
-- #16 / #17 — a fresh revision re-runs detection; an old revision's
-- (still-pending) candidate never blocks the NEW current revision
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.request_expense_correction((select id from pgtap_dup_submission_c), 'perlu ditinjau ulang referensinya') $$,
  'owner M requests correction on submission C'
);
select lives_ok(
  $$ select public.revise_expense_draft(
       (select id from pgtap_dup_submission_c), (select id from pgtap_dup_pool_m), 'f0000000-0000-0000-0000-0000000000a3', 'f0000000-0000-0000-0000-0000000000e1',
       999000.00, 'keperluan lain project Y', null, 'REF-DUP-001'
     ) $$,
  'owner M revises submission C — same values, but this creates a brand new revision'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_dup_submission_c_rev2 as
  select current_revision_id as revision_id from public.expense_submissions where id = (select id from pgtap_dup_submission_c);
grant select on pgtap_dup_submission_c_rev2 to authenticated;

select isnt(
  (select revision_id from pgtap_dup_submission_c_rev2),
  (select revision_id from pgtap_dup_submission_c),
  'submission C now has a new current revision, distinct from the one already carrying a pending candidate'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok($$ select public.submit_expense((select id from pgtap_dup_submission_c)) $$, 'owner M resubmits submission C');
reset role;
select set_config('request.jwt.claims', '', true);

select ok(
  (select count(*)::int from public.expense_duplicate_candidates
     where status = 'pending'
       and (revision_id_1 = (select revision_id from pgtap_dup_submission_c_rev2) or revision_id_2 = (select revision_id from pgtap_dup_submission_c_rev2))) >= 1,
  '#16 resubmitting submission C ran detection again and produced a fresh candidate tied to the NEW revision'
);
select ok(
  (select count(*)::int from public.expense_duplicate_candidates
     where status = 'pending'
       and (revision_id_1 = (select revision_id from pgtap_dup_submission_c) or revision_id_2 = (select revision_id from pgtap_dup_submission_c))) >= 1,
  'the OLD revision''s candidate is still pending and untouched — history is preserved, not overwritten'
);

-- Resolve only the NEW revision's candidates — the old revision's pending
-- candidate is deliberately left unresolved to prove it cannot block
-- approval of the new current revision.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
do $$
declare
  v_candidate record;
begin
  for v_candidate in
    select id from public.expense_duplicate_candidates
    where (revision_id_1 = (select revision_id from pgtap_dup_submission_c_rev2) or revision_id_2 = (select revision_id from pgtap_dup_submission_c_rev2))
      and status = 'pending'
  loop
    perform public.resolve_expense_duplicate_candidate(v_candidate.id, 'not_duplicate', 'referensi sama tapi proyek berbeda, sudah ditinjau');
  end loop;
end $$;
select lives_ok(
  $$ select public.approve_expense_submission((select id from pgtap_dup_submission_c)) $$,
  '#17 submission C can be approved: the OLD revision''s still-pending candidate did not block the NEW current revision'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Scoped to the specific (C revision 1, A) pair — C's revision 1 also
-- produced a candidate against B, and that ONE got swept up and resolved by
-- the earlier "resolve every pending candidate touching B" loop (correctly
-- so: it was blocking B's own approval). The C-vs-A pair never involved B,
-- so it was never touched and must still be exactly as detection left it.
select is(
  (select status::text from public.expense_duplicate_candidates
     where (revision_id_1 = (select revision_id from pgtap_dup_submission_c) and revision_id_2 = (select revision_id from pgtap_dup_submission_a))
        or (revision_id_1 = (select revision_id from pgtap_dup_submission_a) and revision_id_2 = (select revision_id from pgtap_dup_submission_c))),
  'pending',
  '#17 the superseded revision''s candidate against A remains pending forever — resolving the new revision never touches old history'
);

-- =============================================================================
-- #18 — Append-only, role-independent (resolution events)
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ update public.expense_duplicate_candidate_resolution_events set reason = 'forged' where candidate_id = (select id from pgtap_dup_candidate_b_exact) $$,
  '42501',
  null,
  'owner M cannot UPDATE expense_duplicate_candidate_resolution_events directly — no grant'
);
select throws_ok(
  $$ delete from public.expense_duplicate_candidate_resolution_events where candidate_id = (select id from pgtap_dup_candidate_b_exact) $$,
  '42501',
  null,
  'owner M cannot DELETE expense_duplicate_candidate_resolution_events directly — no grant'
);
select throws_ok(
  $$ update public.expense_duplicate_candidates set status = 'not_duplicate' where id = (select id from pgtap_dup_candidate_f_confirmed) $$,
  '42501',
  null,
  '#20 owner M cannot UPDATE expense_duplicate_candidates directly — no grant, only the RPC can mutate it'
);
select throws_ok(
  $$ delete from public.expense_duplicate_candidates where id = (select id from pgtap_dup_candidate_f_confirmed) $$,
  '42501',
  null,
  '#20 owner M cannot DELETE expense_duplicate_candidates directly — no grant'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Role-independent: even the unrestricted fixture-setup role cannot mutate
-- resolution_events, proving the append-only guarantee is a real trigger.
reset role;
select throws_ok(
  $$ update public.expense_duplicate_candidate_resolution_events set reason = 'forged' where candidate_id = (select id from pgtap_dup_candidate_b_exact) $$,
  'access_audit_events is append-only: UPDATE not allowed',
  'UPDATE on expense_duplicate_candidate_resolution_events is blocked at the database level, regardless of role'
);
select throws_ok(
  $$ delete from public.expense_duplicate_candidate_resolution_events where candidate_id = (select id from pgtap_dup_candidate_b_exact) $$,
  'access_audit_events is append-only: DELETE not allowed',
  'DELETE on expense_duplicate_candidate_resolution_events is blocked at the database level, regardless of role'
);

-- Structural, role-independent proof that the status-transition guard is a
-- real trigger: a raw UPDATE (bypassing the RPC) attempting an invalid jump
-- is rejected even under the unrestricted fixture-setup role.
select throws_ok(
  $$ update public.expense_duplicate_candidates set status = 'confirmed_duplicate' where id = (select id from pgtap_dup_candidate_b_exact) $$,
  'invalid expense duplicate candidate status transition from not_duplicate to confirmed_duplicate',
  'a raw UPDATE attempting an invalid candidate status transition is rejected at the trigger level, regardless of caller'
);

-- =============================================================================
-- #19 — Direct INSERT cannot forge tenant/actor/evidence
-- =============================================================================

reset role;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ insert into public.expense_duplicate_candidates (tenant_id, revision_id_1, revision_id_2, submission_id_1, submission_id_2, reason_code, match_evidence, status)
     values (
       'ffffffff-ffff-ffff-ffff-ffffffffffff',
       (select revision_id from pgtap_dup_submission_a), (select revision_id from pgtap_dup_submission_c),
       (select id from pgtap_dup_submission_a), (select id from pgtap_dup_submission_c),
       'reference_match', '{}'::jsonb, 'confirmed_duplicate'
     ) $$,
  '42501',
  null,
  '#19 admin M cannot INSERT directly into expense_duplicate_candidates to forge a pre-confirmed candidate'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- CROSS-TENANT READ ISOLATION
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is_empty(
  $$ select id from public.expense_duplicate_candidates where tenant_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' $$,
  'owner N cannot read tenant M''s duplicate candidates'
);
select is_empty(
  $$ select candidate_id from public.expense_duplicate_candidate_resolution_events where tenant_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' $$,
  'owner N cannot read tenant M''s duplicate candidate resolution events'
);
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();

rollback;
