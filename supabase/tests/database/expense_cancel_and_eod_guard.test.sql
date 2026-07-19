-- ADOP Phase 1 Gate 1G.1 — pgTAP proof for the Unresolved Expense Daily-Close
-- Guard: draft/submitted/needs_correction expense submissions block EOD
-- submit and approve, approved/rejected/cancelled do not, the new
-- cancel_expense_submission RPC (owner/admin-only, draft/needs_correction
-- only, reason required, append-only, never posts a ledger entry or affects
-- the cash summary), pending/confirmed duplicate candidates still block via
-- their submissions' own 'submitted' status, approve's defensive unresolved
-- recheck, the submit_expense <-> submit_cash_reconciliation/approve_cash_
-- reconciliation concurrency serialization via the shared cash_pools row
-- lock, and cross-tenant isolation.
--
-- Self-contained: creates its own fixtures (distinct tenant/user ids from
-- every other pgTAP file in this directory) and rolls back at the end.
-- Regression coverage for Gate 1A-1G lives in their own files — running
-- `supabase test db` (all files together) is what proves "Gate 1C-1G tetap
-- PASS" alongside this file's new assertions.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'pgtap-eod-guard-tenant-q', 'PgTAP EOD Guard Tenant Q', 'active'),
  ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'pgtap-eod-guard-tenant-r', 'PgTAP EOD Guard Tenant R', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', 'a0a0a0a0-1111-4444-0000-000000000001', 'authenticated', 'authenticated', 'owner-q@pgtap-eodguard.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'a0a0a0a0-1111-4444-0000-000000000002', 'authenticated', 'authenticated', 'admin-q@pgtap-eodguard.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'a0a0a0a0-1111-4444-0000-000000000003', 'authenticated', 'authenticated', 'reviewer-q@pgtap-eodguard.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'a0a0a0a0-1111-4444-0000-000000000004', 'authenticated', 'authenticated', 'viewer-q@pgtap-eodguard.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'b0b0b0b0-1111-4444-0000-000000000001', 'authenticated', 'authenticated', 'owner-r@pgtap-eodguard.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('a0000000-9999-0000-0000-000000000001', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'a0a0a0a0-1111-4444-0000-000000000001', 'active'),
  ('a0000000-9999-0000-0000-000000000002', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'a0a0a0a0-1111-4444-0000-000000000002', 'active'),
  ('a0000000-9999-0000-0000-000000000003', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'a0a0a0a0-1111-4444-0000-000000000003', 'active'),
  ('a0000000-9999-0000-0000-000000000004', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'a0a0a0a0-1111-4444-0000-000000000004', 'active'),
  ('b0000000-9999-0000-0000-000000000001', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'b0b0b0b0-1111-4444-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('a0000000-9999-0000-0000-000000000001', 'owner'),
  ('a0000000-9999-0000-0000-000000000002', 'admin'),
  ('a0000000-9999-0000-0000-000000000003', 'reviewer'),
  ('a0000000-9999-0000-0000-000000000004', 'viewer'),
  ('b0000000-9999-0000-0000-000000000001', 'owner');

-- Anchor master-data + Project Kapal rows, inserted as the unrestricted
-- fixture-setup role (bypasses RLS and column grants), same posture as
-- expense_submission_approval.test.sql / cash_reconciliation.test.sql.
insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('a0000000-0000-0000-0000-0000000000c1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'CL-Q-ANCHOR', 'Anchor Client Q', 'a0a0a0a0-1111-4444-0000-000000000001');

insert into public.vessels (id, tenant_id, client_id, vessel_code, vessel_name, created_by) values
  ('a0000000-0000-0000-0000-0000000000a1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'a0000000-0000-0000-0000-0000000000c1', 'VS-Q-ANCHOR', 'KM Anchor Q', 'a0a0a0a0-1111-4444-0000-000000000001');

insert into public.service_types (id, tenant_id, code, name) values
  ('a0000000-0000-0000-0000-0000000000b1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'anchor-service', 'Anchor Service Q');

insert into public.facility_locations (id, tenant_id, code, name) values
  ('a0000000-0000-0000-0000-0000000000f1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'FL-Q-ANCHOR', 'Anchor Facility Q');

insert into public.expense_categories (id, tenant_id, code, name) values
  ('a0000000-0000-0000-0000-0000000000e1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'anchor-category', 'Anchor Category Q');

insert into public.vendors (id, tenant_id, vendor_code, display_name) values
  ('a0000000-0000-0000-0000-0000000000d1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'VN-Q-ANCHOR', 'Anchor Vendor Q');

insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by) values
  ('a0000000-0000-0000-0000-0000000000a2', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000f1', 'IG1-Q-PROJECT-D', '2034-05-01', 'a0a0a0a0-1111-4444-0000-000000000001'),
  ('a0000000-0000-0000-0000-0000000000a3', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000f1', 'IG1-Q-PROJECT-X', '2034-05-01', 'a0a0a0a0-1111-4444-0000-000000000001'),
  ('a0000000-0000-0000-0000-0000000000a4', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000f1', 'IG1-Q-PROJECT-E', '2034-05-01', 'a0a0a0a0-1111-4444-0000-000000000001'),
  ('a0000000-0000-0000-0000-0000000000a5', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000f1', 'IG1-Q-PROJECT-F', '2034-05-01', 'a0a0a0a0-1111-4444-0000-000000000001'),
  ('a0000000-0000-0000-0000-0000000000a6', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000f1', 'IG1-Q-PROJECT-G', '2034-05-01', 'a0a0a0a0-1111-4444-0000-000000000001'),
  ('a0000000-0000-0000-0000-0000000000a7', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000f1', 'IG1-Q-PROJECT-P', '2034-05-01', 'a0a0a0a0-1111-4444-0000-000000000001'),
  ('a0000000-0000-0000-0000-0000000000a8', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000f1', 'IG1-Q-PROJECT-STRAY', '2034-05-01', 'a0a0a0a0-1111-4444-0000-000000000001');

-- =============================================================================
-- SCHEMA
-- =============================================================================

select ok(
  has_function_privilege('authenticated', 'public.cancel_expense_submission(uuid, text)', 'EXECUTE'),
  'authenticated can execute cancel_expense_submission (internal role check gates it, not the grant)'
);
select ok(
  not has_function_privilege('anon', 'public.cancel_expense_submission(uuid, text)', 'EXECUTE'),
  'anon cannot execute cancel_expense_submission'
);
select ok(
  has_function_privilege('authenticated', 'public.get_unresolved_expense_count(uuid)', 'EXECUTE'),
  'authenticated can execute get_unresolved_expense_count'
);
select ok(
  not has_function_privilege('anon', 'public.get_unresolved_expense_count(uuid)', 'EXECUTE'),
  'anon cannot execute get_unresolved_expense_count'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'expense_submission_status_events_cancel_reason_required'
      and conrelid = 'public.expense_submission_status_events'::regclass
  ),
  'the cancel-reason-required check constraint exists on expense_submission_status_events'
);

-- =============================================================================
-- SETUP — daily cash pool for tenant Q, funded with opening cash
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.get_or_create_daily_cash_pool('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', '2034-05-01') $$,
  'owner Q can create the tenant Q pool'
);
select lives_ok(
  $$ select public.record_cash_pool_entry(
       (select id from public.cash_pools where tenant_id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0' and business_date = '2034-05-01'),
       'opening_cash', 5000000, 'saldo awal'
     ) $$,
  'owner Q records opening cash 5,000,000'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_eod_pool_q as
  select id from public.cash_pools where tenant_id = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0' and business_date = '2034-05-01';
grant select on pgtap_eod_pool_q to authenticated;

-- A single reconciliation cycle carries the whole file. A non-empty
-- explanation is supplied up front so later variance changes (as expenses
-- resolve) never trip the unrelated "explanation is required when variance
-- is non-zero" check — this file is only exercising the unresolved-expense
-- guard, not Gate 1G's own variance validation (already covered by its own
-- test file).
select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.create_cash_reconciliation_draft(
       (select id from pgtap_eod_pool_q), 5000000, 'menunggu resolusi seluruh expense sebelum EOD close'
     ) $$,
  'owner Q creates the EOD reconciliation draft'
);
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_eod_recon_q as
  select id from public.cash_reconciliations where pool_id = (select id from pgtap_eod_pool_q);
grant select on pgtap_eod_recon_q to authenticated;

-- =============================================================================
-- #1 — a DRAFT expense submission blocks EOD submit
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.create_expense_draft(
       'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', (select id from pgtap_eod_pool_q), 'a0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000e1',
       100000.00, 'expense D draft'
     ) $$,
  'admin Q creates draft submission D'
);
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_eod_submission_d as
  select id from public.expense_submissions
    where current_revision_id in (select id from public.expense_submission_revisions where project_id = 'a0000000-0000-0000-0000-0000000000a2');
grant select on pgtap_eod_submission_d to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.submit_cash_reconciliation((select id from pgtap_eod_recon_q)) $$,
  'UNRESOLVED_EXPENSES',
  'a draft expense submission blocks EOD submit (#1)'
);
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.cash_reconciliations where id = (select id from pgtap_eod_recon_q)),
  'draft',
  'the rejected EOD submit attempt left the reconciliation status unchanged'
);
select is(
  (select daily_close_status::text from public.cash_pools where id = (select id from pgtap_eod_pool_q)),
  'open',
  'the rejected EOD submit attempt left the pool status unchanged'
);

-- =============================================================================
-- #17 (part 1) — cross-tenant cancel is rejected; #19 (bonus) — reviewer/
-- viewer cannot cancel either
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'b0b0b0b0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.cancel_expense_submission((select id from pgtap_eod_submission_d), 'owner R lintas tenant coba cancel') $$,
  'not authorized to cancel expense submission',
  'owner R (a different tenant) cannot cancel tenant Q''s submission D'
);
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.cancel_expense_submission((select id from pgtap_eod_submission_d), 'reviewer coba cancel') $$,
  'not authorized to cancel expense submission',
  'reviewer Q cannot cancel submission D'
);
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000004', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.cancel_expense_submission((select id from pgtap_eod_submission_d), 'viewer coba cancel') $$,
  'not authorized to cancel expense submission',
  'viewer Q cannot cancel submission D'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #7 — admin/owner CAN cancel a draft, with a reason; empty reason rejected
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.cancel_expense_submission((select id from pgtap_eod_submission_d), '') $$,
  'cancellation reason is required',
  'an empty cancellation reason is rejected'
);
select lives_ok(
  $$ select public.cancel_expense_submission((select id from pgtap_eod_submission_d), 'salah input, dibatalkan sebelum submit') $$,
  'admin Q cancels draft submission D with a reason (#7)'
);
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.expense_submissions where id = (select id from pgtap_eod_submission_d)),
  'cancelled',
  'submission D is now cancelled'
);

-- =============================================================================
-- #2 / #3 — SUBMITTED and NEEDS_CORRECTION also block EOD submit; #8 —
-- needs_correction can be cancelled with a reason
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.create_expense_draft(
       'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', (select id from pgtap_eod_pool_q), 'a0000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-0000000000e1',
       130000.00, 'expense X draft'
     ) $$,
  'admin Q creates draft submission X'
);
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_eod_submission_x as
  select id from public.expense_submissions
    where current_revision_id in (select id from public.expense_submission_revisions where project_id = 'a0000000-0000-0000-0000-0000000000a3');
grant select on pgtap_eod_submission_x to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.submit_expense((select id from pgtap_eod_submission_x)) $$,
  'admin Q submits submission X'
);
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.submit_cash_reconciliation((select id from pgtap_eod_recon_q)) $$,
  'UNRESOLVED_EXPENSES',
  'a submitted expense submission blocks EOD submit (#2)'
);
select lives_ok(
  $$ select public.request_expense_correction((select id from pgtap_eod_submission_x), 'nominal perlu ditinjau ulang') $$,
  'owner Q requests correction on submission X'
);
select throws_ok(
  $$ select public.submit_cash_reconciliation((select id from pgtap_eod_recon_q)) $$,
  'UNRESOLVED_EXPENSES',
  'a needs_correction expense submission blocks EOD submit (#3)'
);
select lives_ok(
  $$ select public.cancel_expense_submission((select id from pgtap_eod_submission_x), 'diputuskan dibatalkan, tidak jadi diajukan ulang') $$,
  'owner Q cancels needs_correction submission X with a reason (#8)'
);
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.expense_submissions where id = (select id from pgtap_eod_submission_x)),
  'cancelled',
  'submission X is now cancelled'
);

-- =============================================================================
-- #10 — already-cancelled cannot be cancelled again
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.cancel_expense_submission((select id from pgtap_eod_submission_d), 'coba cancel lagi') $$,
  'expense submission cannot be cancelled from its current status',
  'an already-cancelled submission (D) cannot be cancelled again (#10)'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #4 — an APPROVED expense submission does not block EOD submit (proven at
-- the final successful submit below); build it now
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.create_expense_draft(
       'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', (select id from pgtap_eod_pool_q), 'a0000000-0000-0000-0000-0000000000a4', 'a0000000-0000-0000-0000-0000000000e1',
       200000.00, 'expense E untuk approved'
     ) $$,
  'owner Q creates draft submission E'
);
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_eod_submission_e as
  select id from public.expense_submissions
    where current_revision_id in (select id from public.expense_submission_revisions where project_id = 'a0000000-0000-0000-0000-0000000000a4');
grant select on pgtap_eod_submission_e to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok($$ select public.submit_expense((select id from pgtap_eod_submission_e)) $$, 'owner Q submits submission E');
select lives_ok($$ select public.approve_expense_submission((select id from pgtap_eod_submission_e)) $$, 'owner Q approves submission E');
select throws_ok(
  $$ select public.cancel_expense_submission((select id from pgtap_eod_submission_e), 'coba cancel setelah approved') $$,
  'expense submission cannot be cancelled from its current status',
  'an approved submission (E) cannot be cancelled (#10)'
);
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.expense_submissions where id = (select id from pgtap_eod_submission_e)),
  'approved',
  'submission E is approved'
);

-- =============================================================================
-- #5 — a REJECTED expense submission does not block EOD submit
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.create_expense_draft(
       'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', (select id from pgtap_eod_pool_q), 'a0000000-0000-0000-0000-0000000000a5', 'a0000000-0000-0000-0000-0000000000e1',
       150000.00, 'expense F untuk rejected'
     ) $$,
  'owner Q creates draft submission F'
);
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_eod_submission_f as
  select id from public.expense_submissions
    where current_revision_id in (select id from public.expense_submission_revisions where project_id = 'a0000000-0000-0000-0000-0000000000a5');
grant select on pgtap_eod_submission_f to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok($$ select public.submit_expense((select id from pgtap_eod_submission_f)) $$, 'owner Q submits submission F');
select lives_ok(
  $$ select public.reject_expense_submission((select id from pgtap_eod_submission_f), 'nominal tidak sesuai bukti') $$,
  'owner Q rejects submission F'
);
select throws_ok(
  $$ select public.cancel_expense_submission((select id from pgtap_eod_submission_f), 'coba cancel setelah rejected') $$,
  'expense submission cannot be cancelled from its current status',
  'a rejected submission (F) cannot be cancelled (#10)'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #9 — a SUBMITTED expense submission cannot be cancelled by admin
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.create_expense_draft(
       'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', (select id from pgtap_eod_pool_q), 'a0000000-0000-0000-0000-0000000000a6', 'a0000000-0000-0000-0000-0000000000e1',
       90000.00, 'expense G submitted'
     ) $$,
  'admin Q creates draft submission G'
);
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_eod_submission_g as
  select id from public.expense_submissions
    where current_revision_id in (select id from public.expense_submission_revisions where project_id = 'a0000000-0000-0000-0000-0000000000a6');
grant select on pgtap_eod_submission_g to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select lives_ok($$ select public.submit_expense((select id from pgtap_eod_submission_g)) $$, 'admin Q submits submission G');
select throws_ok(
  $$ select public.cancel_expense_submission((select id from pgtap_eod_submission_g), 'admin coba cancel submitted') $$,
  'expense submission cannot be cancelled from its current status',
  'admin Q cannot cancel a submitted submission (G) — only draft/needs_correction can be cancelled (#9)'
);
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.reject_expense_submission((select id from pgtap_eod_submission_g), 'ditolak untuk membersihkan unresolved') $$,
  'owner Q rejects submission G to resolve it'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #13 / #14 — pending and confirmed duplicate candidates still block via
-- their submissions' own 'submitted' status, until the submissions are
-- rejected
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.create_expense_draft(
       'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', (select id from pgtap_eod_pool_q), 'a0000000-0000-0000-0000-0000000000a7', 'a0000000-0000-0000-0000-0000000000e1',
       111000.00, 'expense P1 duplicate test', null, 'REF-DUP-Q-1'
     ) $$,
  'owner Q creates draft submission P1'
);
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_eod_submission_p1 as
  select s.id from public.expense_submissions s
    join public.expense_submission_revisions r on r.id = s.current_revision_id
    where r.project_id = 'a0000000-0000-0000-0000-0000000000a7' and r.amount = 111000.00;
grant select on pgtap_eod_submission_p1 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok($$ select public.submit_expense((select id from pgtap_eod_submission_p1)) $$, 'owner Q submits submission P1');
select lives_ok(
  $$ select public.create_expense_draft(
       'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', (select id from pgtap_eod_pool_q), 'a0000000-0000-0000-0000-0000000000a7', 'a0000000-0000-0000-0000-0000000000e1',
       222000.00, 'expense P2 duplicate test', null, 'REF-DUP-Q-1'
     ) $$,
  'owner Q creates draft submission P2 (same reference number as P1)'
);
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_eod_submission_p2 as
  select s.id from public.expense_submissions s
    join public.expense_submission_revisions r on r.id = s.current_revision_id
    where r.project_id = 'a0000000-0000-0000-0000-0000000000a7' and r.amount = 222000.00;
grant select on pgtap_eod_submission_p2 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.submit_expense((select id from pgtap_eod_submission_p2)) $$,
  'owner Q submits submission P2 — triggers reference_match duplicate detection against P1'
);
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.expense_duplicate_candidates
     where submission_id_1 in ((select id from pgtap_eod_submission_p1), (select id from pgtap_eod_submission_p2))
       and submission_id_2 in ((select id from pgtap_eod_submission_p1), (select id from pgtap_eod_submission_p2))),
  'pending',
  'a pending duplicate candidate was detected for P1/P2'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.submit_cash_reconciliation((select id from pgtap_eod_recon_q)) $$,
  'UNRESOLVED_EXPENSES',
  'a pending duplicate candidate blocks EOD submit through its submissions'' own submitted status (#13)'
);
select lives_ok(
  $$ select public.resolve_expense_duplicate_candidate(
       (select id from public.expense_duplicate_candidates
          where submission_id_1 in ((select id from pgtap_eod_submission_p1), (select id from pgtap_eod_submission_p2))
            and submission_id_2 in ((select id from pgtap_eod_submission_p1), (select id from pgtap_eod_submission_p2))),
       'confirmed_duplicate', 'dikonfirmasi duplikat oleh owner'
     ) $$,
  'owner Q confirms the P1/P2 candidate as a duplicate'
);
select throws_ok(
  $$ select public.submit_cash_reconciliation((select id from pgtap_eod_recon_q)) $$,
  'UNRESOLVED_EXPENSES',
  'confirming the duplicate candidate alone does not clear the block — P1/P2 are still submitted (#14)'
);
select lives_ok(
  $$ select public.reject_expense_submission((select id from pgtap_eod_submission_p1), 'terkonfirmasi duplikat, ditolak') $$,
  'owner Q rejects submission P1'
);
select lives_ok(
  $$ select public.reject_expense_submission((select id from pgtap_eod_submission_p2), 'terkonfirmasi duplikat, ditolak') $$,
  'owner Q rejects submission P2 — the block is lifted only once both are rejected (#14)'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #17 (part 2) — cross-tenant read of the unresolved-expense count is
-- rejected
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'b0b0b0b0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.get_unresolved_expense_count((select id from pgtap_eod_pool_q)) $$,
  'not authorized to view cash pool',
  'owner R (a different tenant) cannot read tenant Q''s unresolved-expense count'
);
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select results_eq(
  $$ select public.get_unresolved_expense_count((select id from pgtap_eod_pool_q)) $$,
  $$ values (0) $$,
  'every expense submission for the pool is now resolved (cancelled/approved/rejected) — unresolved count is 0'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- #4 / #5 / #6 — EOD submit now succeeds, proving approved/rejected/
-- cancelled submissions never blocked it
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.submit_cash_reconciliation((select id from pgtap_eod_recon_q)) $$,
  'EOD submit succeeds once every submission is approved/rejected/cancelled (#4, #5, #6)'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.cash_reconciliations where id = (select id from pgtap_eod_recon_q)),
  'submitted',
  'the reconciliation is now submitted'
);
select is(
  (select daily_close_status::text from public.cash_pools where id = (select id from pgtap_eod_pool_q)),
  'pending_close',
  'the pool is now pending_close'
);

-- =============================================================================
-- #16 — concurrency: once the pool is pending_close, a NEW expense cannot
-- become 'submitted' — proxy for "EOD locks the pool row first", the same
-- lock ordering that makes the reverse direction (#2's own assertion above:
-- an expense that already reached 'submitted' while the pool was still open
-- is correctly seen as unresolved by a subsequent EOD submit) safe too.
-- Neither ordering ever leaves a pending_close/closed pool with a newly-
-- submitted expense.
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.create_expense_draft(
       'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', (select id from pgtap_eod_pool_q), 'a0000000-0000-0000-0000-0000000000a8', 'a0000000-0000-0000-0000-0000000000e1',
       40000.00, 'expense stray draft'
     ) $$,
  'admin Q can still create a draft while the pool is pending_close (create_expense_draft is not pool-status gated)'
);
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_eod_submission_stray as
  select id from public.expense_submissions
    where current_revision_id in (select id from public.expense_submission_revisions where project_id = 'a0000000-0000-0000-0000-0000000000a8');
grant select on pgtap_eod_submission_stray to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.submit_expense((select id from pgtap_eod_submission_stray)) $$,
  'cash pool is not open for expense submission',
  'submitting the stray draft is rejected while the pool is pending_close (#16)'
);
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.expense_submissions where id = (select id from pgtap_eod_submission_stray)),
  'draft',
  'the stray submission stays draft — still unresolved — after the rejected submit attempt'
);

-- =============================================================================
-- #15 — approve performs a defensive unresolved recheck: the stray draft
-- created after submit (but before approve) still blocks approval
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.approve_cash_reconciliation((select id from pgtap_eod_recon_q)) $$,
  'UNRESOLVED_EXPENSES',
  'approval is rejected — the stray draft appeared after submit, proving approve rechecks rather than trusting submit''s earlier check (#15)'
);
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.cash_reconciliations where id = (select id from pgtap_eod_recon_q)),
  'submitted',
  'the rejected approval left the reconciliation status unchanged — no partial status event'
);
select is(
  (select daily_close_status::text from public.cash_pools where id = (select id from pgtap_eod_pool_q)),
  'pending_close',
  'the rejected approval left the pool status unchanged'
);
select is(
  (select count(*)::int from public.cash_reconciliation_status_events where reconciliation_id = (select id from pgtap_eod_recon_q) and to_status = 'approved'),
  0,
  'no approved status event was logged for the rejected approval attempt'
);

-- Resolve the stray draft, then approval succeeds.
select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.cancel_expense_submission((select id from pgtap_eod_submission_stray), 'dibatalkan agar EOD close bisa dilanjutkan') $$,
  'admin Q cancels the stray draft'
);
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.approve_cash_reconciliation((select id from pgtap_eod_recon_q)) $$,
  'owner Q approves the reconciliation once the stray draft is resolved'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status::text from public.cash_reconciliations where id = (select id from pgtap_eod_recon_q)),
  'approved',
  'the reconciliation is now approved'
);
select is(
  (select daily_close_status::text from public.cash_pools where id = (select id from pgtap_eod_pool_q)),
  'closed',
  'the pool is now closed'
);

-- =============================================================================
-- #11 / #12 — cancelled submissions never post a ledger entry and never
-- affect the cash summary
-- =============================================================================

select is(
  (select count(*)::int from public.project_cost_ledger_entries where project_id = 'a0000000-0000-0000-0000-0000000000a2'),
  0,
  'cancelled submission D posted no ledger entry (#11)'
);
select is(
  (select count(*)::int from public.project_cost_ledger_entries where project_id = 'a0000000-0000-0000-0000-0000000000a3'),
  0,
  'cancelled submission X posted no ledger entry (#11)'
);
select is(
  (select count(*)::int from public.project_cost_ledger_entries where project_id = 'a0000000-0000-0000-0000-0000000000a8'),
  0,
  'cancelled stray submission posted no ledger entry (#11)'
);
select results_eq(
  $$ select total_cash_out from public.cash_pool_daily_summary where pool_id = (select id from pgtap_eod_pool_q) $$,
  $$ values (200000.00::numeric) $$,
  'total_cash_out reflects only E''s approved 200,000 — cancelled/rejected submissions never affected the cash summary (#12)'
);

-- =============================================================================
-- #18 — revisions and status events (including the cancellation events) stay
-- append-only, role-independent
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a0a0a0a0-1111-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ update public.expense_submission_status_events set reason = 'diubah'
       where submission_id = (select id from pgtap_eod_submission_d) and to_status = 'cancelled' $$,
  '42501',
  null,
  'owner Q cannot UPDATE a cancellation status event directly — no grant'
);
select throws_ok(
  $$ delete from public.expense_submission_status_events where submission_id = (select id from pgtap_eod_submission_d) $$,
  '42501',
  null,
  'owner Q cannot DELETE a cancellation status event directly — no grant'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Role-independent: even the unrestricted fixture-setup role cannot mutate.
reset role;
select throws_ok(
  $$ update public.expense_submission_status_events set reason = 'diubah'
       where submission_id = (select id from pgtap_eod_submission_d) and to_status = 'cancelled' $$,
  'access_audit_events is append-only: UPDATE not allowed',
  'UPDATE on a cancellation status event is blocked at the database level, regardless of role (#18)'
);
select throws_ok(
  $$ delete from public.expense_submission_status_events where submission_id = (select id from pgtap_eod_submission_x) $$,
  'access_audit_events is append-only: DELETE not allowed',
  'DELETE on expense_submission_status_events is blocked at the database level, regardless of role (#18)'
);

select is(
  (select count(*)::int from public.expense_submission_status_events
     where submission_id = (select id from pgtap_eod_submission_d) and to_status = 'cancelled'),
  1,
  'exactly one cancellation event was logged for submission D — append-only, not overwritten'
);

select * from finish();

rollback;
