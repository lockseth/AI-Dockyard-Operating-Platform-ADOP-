-- ADOP Phase 1 Gate 1G — pgTAP proof for the End-of-Day Cash Reconciliation
-- & Daily Close Foundation: server-computed expected closing/variance,
-- actual-cash validation, variance-requires-explanation, admin draft/submit
-- vs owner-only review, the draft -> submitted -> approved|needs_correction|
-- rejected workflow with append-only revisions/status events, the pool's
-- open -> pending_close -> closed lifecycle and its mutation guard,
-- financial-version staleness detection at approval, controlled owner-only
-- reopen, and cross-tenant isolation.
--
-- Self-contained: creates its own fixtures (distinct tenant/user ids from
-- every other pgTAP file in this directory) and rolls back at the end.
-- Regression coverage for Gate 1A-1F lives in their own files — running
-- `supabase test db` (all files together) is what proves "Gate 1C-1F tetap
-- PASS" alongside this file's new assertions (in particular, Gate 1C's own
-- file already proves cash_pools_append_only still blocks DELETE and still
-- exists as a trigger of that name — see the migration header for why that
-- name was preserved).

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'pgtap-cash-recon-tenant-m', 'PgTAP Cash Reconciliation Tenant M', 'active'),
  ('11111111-2222-3333-4444-555555555555', 'pgtap-cash-recon-tenant-n', 'PgTAP Cash Reconciliation Tenant N', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-ffff-4444-0000-000000000001', 'authenticated', 'authenticated', 'owner-m@pgtap-recon.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-ffff-4444-0000-000000000002', 'authenticated', 'authenticated', 'admin-m@pgtap-recon.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-ffff-4444-0000-000000000003', 'authenticated', 'authenticated', 'reviewer-m@pgtap-recon.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-ffff-4444-0000-000000000004', 'authenticated', 'authenticated', 'viewer-m@pgtap-recon.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-1111-4444-0000-000000000001', 'authenticated', 'authenticated', 'owner-n@pgtap-recon.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('f0000000-4444-0000-0000-000000000001', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '00000000-ffff-4444-0000-000000000001', 'active'),
  ('f0000000-4444-0000-0000-000000000002', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '00000000-ffff-4444-0000-000000000002', 'active'),
  ('f0000000-4444-0000-0000-000000000003', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '00000000-ffff-4444-0000-000000000003', 'active'),
  ('f0000000-4444-0000-0000-000000000004', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '00000000-ffff-4444-0000-000000000004', 'active'),
  ('10000000-4444-0000-0000-000000000001', '11111111-2222-3333-4444-555555555555', '00000000-1111-4444-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('f0000000-4444-0000-0000-000000000001', 'owner'),
  ('f0000000-4444-0000-0000-000000000002', 'admin'),
  ('f0000000-4444-0000-0000-000000000003', 'reviewer'),
  ('f0000000-4444-0000-0000-000000000004', 'viewer'),
  ('10000000-4444-0000-0000-000000000001', 'owner');

-- =============================================================================
-- SCHEMA
-- =============================================================================

select has_table('public', 'cash_reconciliations', 'public.cash_reconciliations exists');
select has_table('public', 'cash_reconciliation_revisions', 'public.cash_reconciliation_revisions exists');
select has_table('public', 'cash_reconciliation_status_events', 'public.cash_reconciliation_status_events exists');
select has_table('public', 'cash_pool_reopen_events', 'public.cash_pool_reopen_events exists');
select has_view('public', 'cash_pool_reconciliation_current', 'public.cash_pool_reconciliation_current view exists');

select has_type('public', 'cash_reconciliation_status', 'cash_reconciliation_status enum exists');
select ok(
  (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.cash_reconciliation_status'::regtype)
    = array['draft', 'submitted', 'approved', 'needs_correction', 'rejected'],
  'cash_reconciliation_status is exactly draft/submitted/approved/needs_correction/rejected'
);
select has_type('public', 'cash_pool_daily_close_status', 'cash_pool_daily_close_status enum exists');
select ok(
  (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.cash_pool_daily_close_status'::regtype)
    = array['open', 'pending_close', 'closed'],
  'cash_pool_daily_close_status is exactly open/pending_close/closed'
);

select has_column('public', 'cash_pools', 'financial_version', 'cash_pools has financial_version');
select has_column('public', 'cash_pools', 'daily_close_status', 'cash_pools has daily_close_status');
select col_default_is('public', 'cash_pools', 'daily_close_status', 'open', 'a new pool starts open');
select col_default_is('public', 'cash_pools', 'financial_version', '0', 'a new pool starts at financial_version 0');

select ok((select relrowsecurity from pg_class where oid = 'public.cash_reconciliations'::regclass), 'RLS enabled on cash_reconciliations');
select ok((select relrowsecurity from pg_class where oid = 'public.cash_reconciliation_revisions'::regclass), 'RLS enabled on cash_reconciliation_revisions');
select ok((select relrowsecurity from pg_class where oid = 'public.cash_reconciliation_status_events'::regclass), 'RLS enabled on cash_reconciliation_status_events');
select ok((select relrowsecurity from pg_class where oid = 'public.cash_pool_reopen_events'::regclass), 'RLS enabled on cash_pool_reopen_events');

select has_trigger('public', 'cash_reconciliation_revisions', 'cash_reconciliation_revisions_append_only', 'revisions has the append-only guard trigger');
select has_trigger('public', 'cash_reconciliation_status_events', 'cash_reconciliation_status_events_append_only', 'status events has the append-only guard trigger');
select has_trigger('public', 'cash_pool_reopen_events', 'cash_pool_reopen_events_append_only', 'reopen events has the append-only guard trigger');
select has_trigger('public', 'cash_reconciliations', 'cash_reconciliations_enforce_status_transition', 'reconciliations has the status transition guard trigger');
select has_trigger('public', 'cash_reconciliations', 'cash_reconciliation_creation_log', 'reconciliations has the automatic creation-event trigger');
select has_trigger('public', 'cash_pools', 'cash_pools_enforce_daily_close_transition', 'cash_pools has the daily-close transition guard trigger');
select has_trigger('public', 'cash_pool_entries', 'cash_pool_entries_enforce_pool_open', 'cash_pool_entries has the pool-open mutation guard trigger');
select has_trigger('public', 'cash_pool_entries', 'cash_pool_entries_bump_financial_version', 'cash_pool_entries has the financial-version bump trigger');
select has_trigger('public', 'project_cost_ledger_entries', 'project_cost_ledger_entries_enforce_pool_open', 'project_cost_ledger_entries has the pool-open mutation guard trigger');
select has_trigger('public', 'project_cost_ledger_entries', 'project_cost_ledger_entries_bump_financial_version', 'project_cost_ledger_entries has the financial-version bump trigger');

-- Gate 1C's own trigger name/behavior is preserved (see migration header) —
-- structural proof it still exists here too.
select has_trigger('public', 'cash_pools', 'cash_pools_append_only', 'cash_pools keeps the (now DELETE-only) append-only guard trigger under its original name');

select ok(
  not has_table_privilege('authenticated', 'public.cash_reconciliations', 'INSERT'), 'authenticated has no INSERT on cash_reconciliations'
);
select ok(
  not has_table_privilege('authenticated', 'public.cash_reconciliations', 'UPDATE'), 'authenticated has no UPDATE on cash_reconciliations'
);
select ok(
  not has_table_privilege('authenticated', 'public.cash_reconciliations', 'DELETE'), 'authenticated has no DELETE on cash_reconciliations'
);
select ok(
  not has_table_privilege('authenticated', 'public.cash_reconciliation_revisions', 'INSERT'), 'authenticated has no INSERT on cash_reconciliation_revisions'
);
select ok(
  not has_table_privilege('authenticated', 'public.cash_reconciliation_status_events', 'INSERT'), 'authenticated has no INSERT on cash_reconciliation_status_events'
);
select ok(
  not has_table_privilege('authenticated', 'public.cash_pool_reopen_events', 'INSERT'), 'authenticated has no INSERT on cash_pool_reopen_events'
);
select ok(
  not has_table_privilege('authenticated', 'public.cash_pools', 'UPDATE'), 'authenticated still has no UPDATE grant on cash_pools — RPCs are the only mutation path'
);

select ok(
  exists (
    select 1 from pg_proc
    where oid = any(array[
      'public.create_cash_reconciliation_draft(uuid, numeric, text)'::regprocedure,
      'public.revise_cash_reconciliation_draft(uuid, numeric, text)'::regprocedure,
      'public.submit_cash_reconciliation(uuid)'::regprocedure,
      'public.approve_cash_reconciliation(uuid)'::regprocedure,
      'public.reject_cash_reconciliation(uuid, text)'::regprocedure,
      'public.request_cash_reconciliation_correction(uuid, text)'::regprocedure,
      'public.reopen_cash_pool(uuid, text)'::regprocedure
    ])
    group by 1 having count(*) = 7
  ) is not null,
  'all seven cash-reconciliation RPCs exist'
);
select ok(
  not has_function_privilege('anon', 'public.create_cash_reconciliation_draft(uuid, numeric, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.approve_cash_reconciliation(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.reopen_cash_pool(uuid, text)', 'EXECUTE'),
  'anon cannot execute the cash-reconciliation RPCs'
);

-- =============================================================================
-- SETUP — daily cash pool for tenant M with a known summary
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.get_or_create_daily_cash_pool('ffffffff-ffff-ffff-ffff-ffffffffffff', '2034-04-01') $$,
  'owner M can create the tenant M pool'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_recon_pool_m as
  select id from public.cash_pools where tenant_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' and business_date = '2034-04-01';
grant select on pgtap_recon_pool_m to authenticated;

select is(
  (select financial_version from public.cash_pools where id = (select id from pgtap_recon_pool_m)),
  0::bigint,
  'a fresh pool starts at financial_version 0'
);
select is(
  (select daily_close_status::text from public.cash_pools where id = (select id from pgtap_recon_pool_m)),
  'open',
  'a fresh pool starts open'
);

-- opening_cash 10,000,000 + cash_top_up 2,000,000 = expected closing
-- 12,000,000 (no expense ledger yet, total_cash_out = 0).
select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.record_cash_pool_entry((select id from pgtap_recon_pool_m), 'opening_cash', 10000000, 'saldo awal') $$,
  'owner M records opening cash 10,000,000'
);
select lives_ok(
  $$ select public.record_cash_pool_entry((select id from pgtap_recon_pool_m), 'cash_top_up', 2000000, null) $$,
  'owner M records a cash top-up of 2,000,000'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- #22 (part) — the two bumps above already moved financial_version to 2,
-- proving cash_pool_entries inserts bump it.
select is(
  (select financial_version from public.cash_pools where id = (select id from pgtap_recon_pool_m)),
  2::bigint,
  'two cash_pool_entries inserts bumped financial_version to 2'
);
select results_eq(
  $$ select closing_cash from public.cash_pool_daily_summary where pool_id = (select id from pgtap_recon_pool_m) $$,
  $$ values (12000000.00::numeric) $$,
  'expected closing cash is 12,000,000 (opening 10M + top-up 2M - cash-out 0)'
);

-- =============================================================================
-- #1 / #2 / #3 — CREATE DRAFT: server-computed expected/variance, actual
-- cash cannot be negative, non-zero variance requires explanation
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select public.create_cash_reconciliation_draft((select id from pgtap_recon_pool_m), -1, null) $$,
  'actual counted cash must not be negative',
  'a negative actual counted cash is rejected'
);
select throws_ok(
  $$ select public.create_cash_reconciliation_draft((select id from pgtap_recon_pool_m), 11000000, null) $$,
  'explanation is required when variance is non-zero',
  'a non-zero variance without an explanation is rejected'
);
select lives_ok(
  $$ select public.create_cash_reconciliation_draft(
       (select id from pgtap_recon_pool_m), 11000000, 'selisih 1 juta karena uang kembalian belum disetor'
     ) $$,
  'admin M can create a draft with a non-zero variance and an explanation'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_recon_a as
  select id from public.cash_reconciliations where pool_id = (select id from pgtap_recon_pool_m);
grant select on pgtap_recon_a to authenticated;

select is(
  (select status::text from public.cash_reconciliations where id = (select id from pgtap_recon_a)),
  'draft',
  'the new reconciliation starts in draft status'
);
select is(
  (select revision_number from public.cash_reconciliation_revisions where reconciliation_id = (select id from pgtap_recon_a)),
  1,
  'the first revision is numbered 1'
);
select is(
  (select count(*)::int from public.cash_reconciliation_status_events where reconciliation_id = (select id from pgtap_recon_a)),
  1,
  'the automatic creation event (null -> draft) was logged'
);
select results_eq(
  $$ select actual_counted_cash from public.cash_reconciliation_revisions where reconciliation_id = (select id from pgtap_recon_a) $$,
  $$ values (11000000.00::numeric) $$,
  'the revision stores the admin-entered actual counted cash'
);

-- #21 — only one active reconciliation per pool (a second draft attempt for
-- the same still-open pool collides with the partial unique index).
select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.create_cash_reconciliation_draft((select id from pgtap_recon_pool_m), 12000000, null) $$,
  '23505',
  null,
  'a second concurrent draft for the same pool is rejected — only one active reconciliation per pool'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #5 — Admin can draft/submit but not review
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.create_cash_reconciliation_draft((select id from pgtap_recon_pool_m), 1, null) $$,
  'not authorized to create cash reconciliation',
  'reviewer M cannot create a draft'
);
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.revise_cash_reconciliation_draft((select id from pgtap_recon_a), 1, null) $$,
  'not authorized to revise cash reconciliation',
  'owner N (a different tenant) cannot revise tenant M''s reconciliation'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #8 — SUBMIT: pool becomes pending_close
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.submit_cash_reconciliation((select id from pgtap_recon_a)) $$,
  'admin M can submit the draft for review'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.cash_reconciliations where id = (select id from pgtap_recon_a)),
  'submitted',
  'the reconciliation is now submitted'
);
select is(
  (select daily_close_status::text from public.cash_pools where id = (select id from pgtap_recon_pool_m)),
  'pending_close',
  'submitting the reconciliation moved the pool to pending_close'
);
select results_eq(
  $$ select submitted_expected_closing_cash, submitted_variance, submitted_financial_version
       from public.cash_reconciliations where id = (select id from pgtap_recon_a) $$,
  $$ values (12000000.00::numeric, -1000000.00::numeric, 2::bigint) $$,
  'the server-computed snapshot (expected closing 12M, variance -1M, financial_version 2) was stored at submit time'
);

-- =============================================================================
-- #9 — PENDING-CLOSE POOL rejects all financial mutation
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.record_cash_pool_entry((select id from pgtap_recon_pool_m), 'other_cash_in', 5000, null) $$,
  'cash pool is not open for new financial entries',
  'a pending_close pool rejects a new cash-in entry'
);
select throws_ok(
  $$ select public.reverse_cash_pool_entry(
       (select id from public.cash_pool_entries where pool_id = (select id from pgtap_recon_pool_m) and entry_type = 'cash_top_up'),
       'coba reversal saat pending_close'
     ) $$,
  'cash pool is not open for new financial entries',
  'a pending_close pool rejects a cash-entry reversal'
);
select throws_ok(
  $$ select public.create_cash_reconciliation_draft((select id from pgtap_recon_pool_m), 1, null) $$,
  'cash pool is not open for a new reconciliation',
  'a pending_close pool rejects a second reconciliation draft attempt'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Direct/internal project expense posting and its reversal are also
-- rejected — proven with a real Project Kapal + category so the insert
-- reaches the pool-open guard rather than failing on an unrelated FK first.
insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('f0000000-0000-0000-0000-0000000000c1', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'CL-M-ANCHOR', 'Anchor Client M', '00000000-ffff-4444-0000-000000000001');
insert into public.vessels (id, tenant_id, client_id, vessel_code, vessel_name, created_by) values
  ('f0000000-0000-0000-0000-0000000000a1', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'f0000000-0000-0000-0000-0000000000c1', 'VS-M-ANCHOR', 'KM Anchor M', '00000000-ffff-4444-0000-000000000001');
insert into public.service_types (id, tenant_id, code, name) values
  ('f0000000-0000-0000-0000-0000000000b1', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'anchor-service', 'Anchor Service M');
insert into public.facility_locations (id, tenant_id, code, name) values
  ('f0000000-0000-0000-0000-0000000000f1', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'FL-M-ANCHOR', 'Anchor Facility M');
insert into public.expense_categories (id, tenant_id, code, name) values
  ('f0000000-0000-0000-0000-0000000000e1', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'anchor-category', 'Anchor Category M');
insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by) values
  ('f0000000-0000-0000-0000-0000000000a2', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'f0000000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-0000000000c1', 'f0000000-0000-0000-0000-0000000000b1', 'f0000000-0000-0000-0000-0000000000f1', 'IG-M-PROJECT-A', '2034-01-01', '00000000-ffff-4444-0000-000000000001');

-- record_project_expense has no EXECUTE grant for `authenticated` since Gate
-- 1E (approve_expense_submission is the only remaining caller) — the
-- role-independent pool-open guard is proven directly under the
-- unrestricted fixture-setup role instead, which is exactly the "raw
-- insert/service role fixture" scenario Task LOCK §5 calls out.
reset role;
select throws_ok(
  $$ insert into public.project_cost_ledger_entries (
       tenant_id, pool_id, project_id, category_id, entry_kind, amount, description, actor_user_id
     ) values (
       'ffffffff-ffff-ffff-ffff-ffffffffffff', (select id from pgtap_recon_pool_m), 'f0000000-0000-0000-0000-0000000000a2',
       'f0000000-0000-0000-0000-0000000000e1', 'expense', 1000, 'coba posting langsung saat pending_close', '00000000-ffff-4444-0000-000000000001'
     ) $$,
  'cash pool is not open for new financial entries',
  'a pending_close pool rejects a direct project-expense insert, even under the unrestricted fixture-setup role'
);

-- =============================================================================
-- #11 / #10 — FINANCIAL CHANGE makes the reconciliation stale, even when the
-- resulting closing balance happens to match
-- =============================================================================

-- Reopen a second, throwaway pool-day to prove version-only comparison (not
-- closing-balance comparison) drives staleness — two different transaction
-- sets that net to the same closing figure must still be treated as stale.
-- Simpler and sufficient here: bump financial_version on the SAME pool via a
-- reversal + re-entry that nets to the identical closing_cash Gate 1G's
-- submit already snapshotted (12,000,000), proving “same closing balance,
-- different version” is still caught. Cash entries are blocked while
-- pending_close (proven above) — so financial_version is bumped here via
-- direct fixture inserts issued as the unrestricted role, mirroring the same
-- "raw insert bypass must still be caught" posture: the version increments
-- honestly (the bump trigger is role-independent) even though the pool-open
-- guard on cash_pool_entries would reject an RPC-driven insert. This models
-- a case the task explicitly warns about: do not compare closing balances.
reset role;
update public.cash_pools set daily_close_status = 'open' where id = (select id from pgtap_recon_pool_m);
insert into public.cash_pool_entries (tenant_id, pool_id, entry_type, entry_kind, amount, description)
  values ('ffffffff-ffff-ffff-ffff-ffffffffffff', (select id from pgtap_recon_pool_m), 'other_cash_in', 'entry', 500000, 'in');
insert into public.cash_pool_entries (tenant_id, pool_id, entry_type, entry_kind, amount, description, reverses_entry_id)
  values (
    'ffffffff-ffff-ffff-ffff-ffffffffffff', (select id from pgtap_recon_pool_m), 'other_cash_in', 'reversal', 500000, 'out',
    (select id from public.cash_pool_entries where pool_id = (select id from pgtap_recon_pool_m) and entry_type = 'other_cash_in' and entry_kind = 'entry')
  );
update public.cash_pools set daily_close_status = 'pending_close' where id = (select id from pgtap_recon_pool_m);

select is(
  (select financial_version from public.cash_pools where id = (select id from pgtap_recon_pool_m)),
  4::bigint,
  'financial_version is now 4 (2 at submit time + 2 more from the in/out pair), while closing_cash is unchanged at 12,000,000'
);
select results_eq(
  $$ select closing_cash from public.cash_pool_daily_summary where pool_id = (select id from pgtap_recon_pool_m) $$,
  $$ values (12000000.00::numeric) $$,
  'closing_cash still nets to the same 12,000,000 the reconciliation was submitted against'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.approve_cash_reconciliation((select id from pgtap_recon_a)) $$,
  'RECONCILIATION_STALE',
  'approval is rejected as stale — same closing balance, different financial_version, exactly what Task LOCK §3 warns against trusting'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.cash_reconciliations where id = (select id from pgtap_recon_a)),
  'submitted',
  'the rejected stale approval left the reconciliation status unchanged'
);
select is(
  (select daily_close_status::text from public.cash_pools where id = (select id from pgtap_recon_pool_m)),
  'pending_close',
  'the rejected stale approval left the pool status unchanged'
);

-- =============================================================================
-- #4 / #7 — ONLY OWNER can approve/reject/request correction; admin/reviewer
-- cannot
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.approve_cash_reconciliation((select id from pgtap_recon_a)) $$,
  'not authorized to review cash reconciliation',
  'admin M cannot approve'
);
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.reject_cash_reconciliation((select id from pgtap_recon_a), 'reviewer coba reject') $$,
  'not authorized to review cash reconciliation',
  'reviewer M cannot reject'
);
select throws_ok(
  $$ select public.request_cash_reconciliation_correction((select id from pgtap_recon_a), 'reviewer coba minta koreksi') $$,
  'not authorized to review cash reconciliation',
  'reviewer M cannot request correction'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #14 — NEEDS_CORRECTION returns the pool to open, requires a fresh revision
-- before resubmission, and the old revision stays intact (#15)
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.request_cash_reconciliation_correction((select id from pgtap_recon_a), '') $$,
  'correction reason is required',
  'an empty correction reason is rejected'
);
select lives_ok(
  $$ select public.request_cash_reconciliation_correction((select id from pgtap_recon_a), 'nominal counting perlu diverifikasi ulang') $$,
  'owner M requests correction'
);
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.cash_reconciliations where id = (select id from pgtap_recon_a)),
  'needs_correction',
  'the reconciliation is now needs_correction'
);
select is(
  (select daily_close_status::text from public.cash_pools where id = (select id from pgtap_recon_pool_m)),
  'open',
  'requesting correction returned the pool to open'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.submit_cash_reconciliation((select id from pgtap_recon_a)) $$,
  'cash reconciliation requires a new revision before resubmission',
  'resubmitting needs_correction without a new revision is rejected'
);
select lives_ok(
  $$ select public.revise_cash_reconciliation_draft(
       (select id from pgtap_recon_a), 12000000, null
     ) $$,
  'admin M revises the reconciliation to match the (unchanged) expected closing — a new revision is created'
);
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.cash_reconciliation_revisions where reconciliation_id = (select id from pgtap_recon_a)),
  2,
  'revising added a second revision row — the first revision is not deleted'
);
select results_eq(
  $$ select actual_counted_cash from public.cash_reconciliation_revisions
       where reconciliation_id = (select id from pgtap_recon_a) and revision_number = 1 $$,
  $$ values (11000000.00::numeric) $$,
  'revision 1''s actual_counted_cash is untouched by the later revision'
);

-- =============================================================================
-- #6 / #12 — RESUBMIT + APPROVE: matching financial_version closes the pool
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.submit_cash_reconciliation((select id from pgtap_recon_a)) $$,
  'admin M resubmits after the correction'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select daily_close_status::text from public.cash_pools where id = (select id from pgtap_recon_pool_m)),
  'pending_close',
  'resubmission moved the pool back to pending_close'
);
select results_eq(
  $$ select submitted_financial_version, submitted_variance from public.cash_reconciliations where id = (select id from pgtap_recon_a) $$,
  $$ values (4::bigint, 0.00::numeric) $$,
  'the fresh snapshot captured financial_version 4 and a zero variance (12M actual vs 12M expected)'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.approve_cash_reconciliation((select id from pgtap_recon_a)) $$,
  'owner M approves — financial_version matches, closing balance is irrelevant to the decision'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.cash_reconciliations where id = (select id from pgtap_recon_a)),
  'approved',
  'the reconciliation is now approved'
);
select is(
  (select daily_close_status::text from public.cash_pools where id = (select id from pgtap_recon_pool_m)),
  'closed',
  'approval closed the pool'
);

-- Terminal: approved cannot transition further, and a closed pool rejects
-- new financial rows (#13).
select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.reject_cash_reconciliation((select id from pgtap_recon_a), 'coba reject setelah approved') $$,
  'cash reconciliation is not awaiting review',
  'an approved reconciliation cannot be rejected — approved is terminal'
);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.record_cash_pool_entry((select id from pgtap_recon_pool_m), 'other_cash_in', 1, null) $$,
  'cash pool is not open for new financial entries',
  'a closed pool rejects a new cash-in entry'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #17 / #16 / #18 — REOPEN: owner-only, requires a reason, preserves the old
-- approved reconciliation, and allows a fresh cycle
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.reopen_cash_pool((select id from pgtap_recon_pool_m), 'admin coba reopen') $$,
  'not authorized to reopen cash pool',
  'admin M cannot reopen a closed pool — owner-only'
);
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.reopen_cash_pool((select id from pgtap_recon_pool_m), '') $$,
  'reopen reason is required',
  'an empty reopen reason is rejected'
);
select lives_ok(
  $$ select public.reopen_cash_pool((select id from pgtap_recon_pool_m), 'owner menemukan salah hitung, perlu koreksi ulang') $$,
  'owner M reopens the closed pool with a reason'
);
select set_config('request.jwt.claims', '', true);

select is(
  (select daily_close_status::text from public.cash_pools where id = (select id from pgtap_recon_pool_m)),
  'open',
  'reopen returned the pool to open'
);
select is(
  (select status::text from public.cash_reconciliations where id = (select id from pgtap_recon_a)),
  'approved',
  'the old reconciliation is still approved — reopen did not overwrite its terminal status'
);
select ok(
  (select superseded_at from public.cash_reconciliations where id = (select id from pgtap_recon_a)) is not null,
  'the old approved reconciliation is now marked superseded'
);
select is(
  (select count(*)::int from public.cash_pool_reopen_events where pool_id = (select id from pgtap_recon_pool_m)),
  1,
  'exactly one reopen event was logged'
);

-- A fresh reconciliation cycle is now possible (superseded no longer counts
-- as "active" for the partial unique index).
select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.create_cash_reconciliation_draft((select id from pgtap_recon_pool_m), 12000000, null) $$,
  'owner M can start a fresh reconciliation cycle after reopen'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #3 (reject path) — REJECT leaves the pool open, is terminal, requires a
-- reason
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

create temporary table pgtap_recon_pool_reject as
  select (public.get_or_create_daily_cash_pool('ffffffff-ffff-ffff-ffff-ffffffffffff', '2034-04-02')).id as id;
grant select on pgtap_recon_pool_reject to authenticated;

select lives_ok(
  $$ select public.record_cash_pool_entry((select id from pgtap_recon_pool_reject), 'opening_cash', 500000, null) $$,
  'owner M funds the second pool-day'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.create_cash_reconciliation_draft((select id from pgtap_recon_pool_reject), 500000, null) $$,
  'owner M creates a matching-variance draft for the second pool-day'
);
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_recon_reject as
  select id from public.cash_reconciliations where pool_id = (select id from pgtap_recon_pool_reject);
grant select on pgtap_recon_reject to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok($$ select public.submit_cash_reconciliation((select id from pgtap_recon_reject)) $$, 'owner M submits the second pool-day''s draft');
select throws_ok(
  $$ select public.reject_cash_reconciliation((select id from pgtap_recon_reject), '') $$,
  'rejection reason is required',
  'an empty rejection reason is rejected'
);
select lives_ok(
  $$ select public.reject_cash_reconciliation((select id from pgtap_recon_reject), 'counting fisik tidak sesuai, ulangi besok') $$,
  'owner M rejects the second pool-day''s reconciliation'
);
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.cash_reconciliations where id = (select id from pgtap_recon_reject)),
  'rejected',
  'the second pool-day''s reconciliation is now rejected'
);
select is(
  (select daily_close_status::text from public.cash_pools where id = (select id from pgtap_recon_pool_reject)),
  'open',
  'rejection returned the second pool to open — rejected never closes a pool'
);

-- Rejected is terminal.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.approve_cash_reconciliation((select id from pgtap_recon_reject)) $$,
  'cash reconciliation is not awaiting review',
  'a rejected reconciliation cannot be approved — rejected is terminal'
);
select set_config('request.jwt.claims', '', true);

-- A fresh draft is allowed after rejection (pool never left open, and
-- rejected does not count as "active" for the uniqueness guard).
select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.create_cash_reconciliation_draft((select id from pgtap_recon_pool_reject), 500000, null) $$,
  'a fresh draft can be created for the same pool after a rejection, without a reopen'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #19 — Direct mutation/event deletion rejected, role-independent
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ update public.cash_reconciliations set status = 'approved' where id = (select id from pgtap_recon_reject) $$,
  '42501',
  null,
  'owner M cannot UPDATE cash_reconciliations directly — no grant'
);
select throws_ok(
  $$ update public.cash_reconciliation_revisions set actual_counted_cash = 1 where reconciliation_id = (select id from pgtap_recon_reject) $$,
  '42501',
  null,
  'owner M cannot UPDATE cash_reconciliation_revisions directly — no grant'
);
select throws_ok(
  $$ delete from public.cash_reconciliation_status_events where reconciliation_id = (select id from pgtap_recon_reject) $$,
  '42501',
  null,
  'owner M cannot DELETE cash_reconciliation_status_events directly — no grant'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Role-independent: even the unrestricted fixture-setup role cannot mutate,
-- proving the append-only guarantee is a real trigger, not just a grant.
reset role;
select throws_ok(
  $$ update public.cash_reconciliation_revisions set actual_counted_cash = 1
       where reconciliation_id = (select id from pgtap_recon_reject) $$,
  'access_audit_events is append-only: UPDATE not allowed',
  'UPDATE on cash_reconciliation_revisions is blocked at the database level, regardless of role'
);
select throws_ok(
  $$ delete from public.cash_reconciliation_status_events where reconciliation_id = (select id from pgtap_recon_reject) $$,
  'access_audit_events is append-only: DELETE not allowed',
  'DELETE on cash_reconciliation_status_events is blocked at the database level, regardless of role'
);
select throws_ok(
  $$ delete from public.cash_pool_reopen_events where pool_id = (select id from pgtap_recon_pool_m) $$,
  'access_audit_events is append-only: DELETE not allowed',
  'DELETE on cash_pool_reopen_events is blocked at the database level, regardless of role'
);
select throws_ok(
  $$ update public.cash_reconciliations set status = 'draft' where id = (select id from pgtap_recon_reject) $$,
  'invalid cash reconciliation status transition from rejected to draft',
  'a raw UPDATE attempting an invalid status transition is rejected at the trigger level, regardless of caller'
);

-- =============================================================================
-- #7 (cont) — Cross-tenant access is rejected
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.approve_cash_reconciliation((select id from pgtap_recon_reject)) $$,
  'not authorized to review cash reconciliation',
  'owner N (a different tenant) cannot approve tenant M''s reconciliation'
);
select throws_ok(
  $$ select public.reopen_cash_pool((select id from pgtap_recon_pool_m), 'lintas tenant') $$,
  'not authorized to reopen cash pool',
  'owner N cannot reopen tenant M''s pool'
);
select is_empty(
  $$ select id from public.cash_reconciliations where tenant_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' $$,
  'owner N cannot read tenant M''s cash reconciliations'
);
select is_empty(
  $$ select id from public.cash_reconciliation_revisions where tenant_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' $$,
  'owner N cannot read tenant M''s cash reconciliation revisions'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #7 (read model) — the read model surfaces status, snapshot, variance, and
-- stale/superseded indication
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-ffff-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select ok(
  (select is_stale from public.cash_pool_reconciliation_current where reconciliation_id = (select id from pgtap_recon_a)) is false,
  'the approved (now superseded) reconciliation''s snapshot is not flagged stale — its own submitted_financial_version still matches when it was approved'
);
select ok(
  (select superseded_at from public.cash_pool_reconciliation_current where reconciliation_id = (select id from pgtap_recon_a)) is not null,
  'the read model surfaces the superseded indication'
);
select is(
  (select decision_reason from public.cash_pool_reconciliation_current where reconciliation_id = (select id from pgtap_recon_reject)),
  'counting fisik tidak sesuai, ulangi besok',
  'the read model surfaces the owner''s decision reason for the rejected reconciliation'
);
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();

rollback;
