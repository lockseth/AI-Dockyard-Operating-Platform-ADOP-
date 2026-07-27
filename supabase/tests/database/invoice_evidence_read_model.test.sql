-- ADOP Gate 4C — pgTAP proof for the Invoice & Evidence Read Model
-- (20260724000000_invoice_evidence_read_model.sql): invoice_billing_summary
-- (list/detail aggregate), invoice_eligible_transactions (billable-
-- transaction business rule), transaction_invoice_bindings (Riwayat
-- Transaksi lookup, void-preserves-history), and record_invoice_evidence_
-- access (evidence.accessed audit control point).
--
-- Builds all invoice/evidence state through the Gate 4B RPCs (already
-- proven correct by invoice_evidence_binding.test.sql) rather than raw
-- inserts, so this file only tests the NEW read surface.
--
-- Self-contained: distinct tenant/user ids from every other pgTAP file in
-- this directory; rolls back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'pgtap-invev-readmodel-tenant-k', 'PgTAP Invoice Evidence ReadModel Tenant K', 'active'),
  ('b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4', 'pgtap-invev-readmodel-tenant-l', 'PgTAP Invoice Evidence ReadModel Tenant L', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-a4a4-4444-0000-000000000001', 'authenticated', 'authenticated', 'owner-k@pgtap-invev-rm.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-a4a4-4444-0000-000000000002', 'authenticated', 'authenticated', 'admin-k@pgtap-invev-rm.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-a4a4-4444-0000-000000000003', 'authenticated', 'authenticated', 'reviewer-k@pgtap-invev-rm.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-a4a4-4444-0000-000000000004', 'authenticated', 'authenticated', 'viewer-k@pgtap-invev-rm.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-b4b4-4444-0000-000000000001', 'authenticated', 'authenticated', 'owner-l@pgtap-invev-rm.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('a0000000-4444-0000-0000-000000000001', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', '00000000-a4a4-4444-0000-000000000001', 'active'),
  ('a0000000-4444-0000-0000-000000000002', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', '00000000-a4a4-4444-0000-000000000002', 'active'),
  ('a0000000-4444-0000-0000-000000000003', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', '00000000-a4a4-4444-0000-000000000003', 'active'),
  ('a0000000-4444-0000-0000-000000000004', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', '00000000-a4a4-4444-0000-000000000004', 'active'),
  ('b0000000-4444-0000-0000-000000000001', 'b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4', '00000000-b4b4-4444-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('a0000000-4444-0000-0000-000000000001', 'owner'),
  ('a0000000-4444-0000-0000-000000000002', 'admin'),
  ('a0000000-4444-0000-0000-000000000003', 'reviewer'),
  ('a0000000-4444-0000-0000-000000000004', 'viewer'),
  ('b0000000-4444-0000-0000-000000000001', 'owner');

insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('a0000000-0000-0000-0000-0000000000c1', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'CL-K-ANCHOR', 'Anchor Client K', '00000000-a4a4-4444-0000-000000000001');

insert into public.vessels (id, tenant_id, client_id, vessel_code, vessel_name, created_by) values
  ('a0000000-0000-0000-0000-0000000000a1', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'a0000000-0000-0000-0000-0000000000c1', 'VS-K-ANCHOR', 'KM Anchor K', '00000000-a4a4-4444-0000-000000000001');

insert into public.service_types (id, tenant_id, code, name) values
  ('a0000000-0000-0000-0000-0000000000b1', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'anchor-service', 'Anchor Service K');

insert into public.facility_locations (id, tenant_id, code, name) values
  ('a0000000-0000-0000-0000-0000000000f1', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'FL-K-ANCHOR', 'Anchor Facility K');

insert into public.expense_categories (id, tenant_id, code, name) values
  ('a0000000-0000-0000-0000-0000000000e1', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'anchor-category', 'Anchor Category K');

-- Two projects: one will be closed (billable), one stays active (never
-- eligible, regardless of its expense rows).
insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, lifecycle_status, start_date, created_by) values
  ('a0000000-0000-0000-0000-0000000000a2', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000f1', 'RM-CL-PROJECT-TO-CLOSE', 'active', '2033-01-01', '00000000-a4a4-4444-0000-000000000001'),
  ('a0000000-0000-0000-0000-0000000000a3', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000f1', 'RM-CL-PROJECT-ACTIVE', 'active', '2033-01-01', '00000000-a4a4-4444-0000-000000000001');

insert into public.cash_pools (id, tenant_id, business_date, created_by) values
  ('a0000000-0000-0000-0000-0000000000d1', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', '2033-01-01', '00000000-a4a4-4444-0000-000000000001');

-- Three closed-project expenses (bindable), one active-project expense (not
-- eligible regardless), one reversed closed-project expense (not eligible).
insert into public.project_cost_ledger_entries (id, tenant_id, pool_id, project_id, category_id, entry_kind, amount, description) values
  ('a1000000-0000-0000-0000-000000000001', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000e1', 'expense', 500000.00, 'rm bindable expense 1'),
  ('a1000000-0000-0000-0000-000000000002', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000e1', 'expense', 300000.00, 'rm bindable expense 2'),
  ('a1000000-0000-0000-0000-000000000003', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000e1', 'expense', 150000.00, 'rm bindable expense 3'),
  ('a1000000-0000-0000-0000-000000000004', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-0000000000e1', 'expense', 100000.00, 'rm not-closed-project expense'),
  ('a1000000-0000-0000-0000-000000000005', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000e1', 'expense', 200000.00, 'rm to-be-reversed expense');

insert into public.project_cost_ledger_entries (id, tenant_id, pool_id, project_id, category_id, entry_kind, amount, description, reverses_entry_id) values
  ('a1000000-0000-0000-0000-000000000006', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'a0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000e1', 'reversal', 200000.00, 'reversal of a1...005', 'a1000000-0000-0000-0000-000000000005');

-- Close the billable project (fixture expense rows must exist first — the
-- closed-project guard trigger fires on any 'expense' insert regardless of
-- caller).
select set_config('request.jwt.claims', json_build_object('sub', '00000000-a4a4-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.transition_vessel_project_lifecycle('a0000000-0000-0000-0000-0000000000a2', 'ready_to_close', null);
select public.transition_vessel_project_lifecycle('a0000000-0000-0000-0000-0000000000a2', 'closed', null);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- SCHEMA
-- =============================================================================

select has_view('public', 'invoice_billing_summary', 'invoice_billing_summary view exists');
select has_view('public', 'invoice_eligible_transactions', 'invoice_eligible_transactions view exists');
select has_view('public', 'transaction_invoice_bindings', 'transaction_invoice_bindings view exists');

select ok(not has_table_privilege('authenticated', 'public.invoice_billing_summary', 'SELECT'), 'authenticated has no direct SELECT on invoice_billing_summary');
select ok(not has_table_privilege('authenticated', 'public.invoice_eligible_transactions', 'SELECT'), 'authenticated has no direct SELECT on invoice_eligible_transactions');

select ok(not has_function_privilege('anon', 'public.list_invoices(uuid, public.invoice_status, integer)', 'EXECUTE'), 'anon cannot execute list_invoices');
select ok(has_function_privilege('authenticated', 'public.list_invoices(uuid, public.invoice_status, integer)', 'EXECUTE'), 'authenticated can execute list_invoices');
select ok(has_function_privilege('authenticated', 'public.list_invoice_eligible_transactions(uuid, uuid)', 'EXECUTE'), 'authenticated can execute list_invoice_eligible_transactions');
select ok(has_function_privilege('authenticated', 'public.list_transaction_invoice_bindings(uuid, uuid)', 'EXECUTE'), 'authenticated can execute list_transaction_invoice_bindings');
select ok(has_function_privilege('authenticated', 'public.record_invoice_evidence_access(uuid)', 'EXECUTE'), 'authenticated can execute record_invoice_evidence_access');

-- =============================================================================
-- ELIGIBLE TRANSACTIONS — closed-only, non-reversed, not actively bound
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-a4a4-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.list_invoice_eligible_transactions('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4') $$,
  'not authorized to view eligible transactions',
  'reviewer K cannot list eligible transactions'
);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-b4b4-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.list_invoice_eligible_transactions('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4') $$,
  'not authorized to view eligible transactions',
  'owner L cannot list tenant K''s eligible transactions'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-a4a4-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select results_eq(
  $$ select transaction_entry_id from public.list_invoice_eligible_transactions('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4') order by transaction_entry_id $$,
  $$ values
    ('a1000000-0000-0000-0000-000000000001'::uuid),
    ('a1000000-0000-0000-0000-000000000002'::uuid),
    ('a1000000-0000-0000-0000-000000000003'::uuid)
  $$,
  'only the three closed-project, non-reversed expenses are eligible — not-closed and reversed excluded'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- Build invoice state through Gate 4B RPCs
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-a4a4-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok($$ select public.create_draft_invoice('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4') $$, 'owner K creates draft invoice 1');
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_rm_invoice_1 as
  select id from public.invoices where tenant_id = 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4';
grant select on pgtap_rm_invoice_1 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-a4a4-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select lives_ok(
  format($$ select public.bind_invoice_transaction(%L, 'a1000000-0000-0000-0000-000000000001') $$, (select id from pgtap_rm_invoice_1)),
  'admin K binds expense 1 to invoice 1'
);
select lives_ok(
  format($$ select public.bind_invoice_transaction(%L, 'a1000000-0000-0000-0000-000000000002') $$, (select id from pgtap_rm_invoice_1)),
  'admin K binds expense 2 to invoice 1'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Once bound, expense 1/2 disappear from the eligible list; expense 3 stays.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-a4a4-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select results_eq(
  $$ select transaction_entry_id from public.list_invoice_eligible_transactions('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4') $$,
  $$ values ('a1000000-0000-0000-0000-000000000003'::uuid) $$,
  'bound expenses 1 and 2 drop out of the eligible list; expense 3 remains'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- --- invoice_billing_summary reflects the draft's binding aggregate -------

select set_config('request.jwt.claims', json_build_object('sub', '00000000-a4a4-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  format($$ select public.get_invoice_summary(%L) $$, (select id from pgtap_rm_invoice_1)),
  'not authorized to view invoices',
  'reviewer K cannot get invoice summary'
);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-b4b4-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  format($$ select public.get_invoice_summary(%L) $$, (select id from pgtap_rm_invoice_1)),
  'not authorized to view invoices',
  'owner L cannot get tenant K''s invoice summary'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-a4a4-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select results_eq(
  format($$ select status, line_count, total_amount, current_version_status, is_final_document from public.get_invoice_summary(%L) $$, (select id from pgtap_rm_invoice_1)),
  $$ values ('draft'::public.invoice_status, 2::bigint, 800000.00::numeric(16,2), null::public.invoice_evidence_version_status, false) $$,
  'draft invoice 1 summary: 2 lines, 800000 total, no evidence yet'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- --- Issue, upload+verify evidence, check is_final_document ----------------

select set_config('request.jwt.claims', json_build_object('sub', '00000000-a4a4-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(format($$ select public.issue_invoice(%L) $$, (select id from pgtap_rm_invoice_1)), 'owner K issues invoice 1');
reset role;

select lives_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, metadata)
       values ('invoice-evidence', 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4/' || %L || '/1-rm.pdf',
               jsonb_build_object('size', 4242, 'mimetype', 'application/pdf')) $$,
    (select id from pgtap_rm_invoice_1)
  ),
  'fixture: simulate an uploaded object for invoice 1 version 1'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-a4a4-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  format(
    $$ select public.finalize_invoice_evidence_version(%L, 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4/' || %L || '/1-rm.pdf', repeat('a', 64), 4242, 'application/pdf') $$,
    (select id from pgtap_rm_invoice_1), (select id from pgtap_rm_invoice_1)
  ),
  'owner K finalizes evidence version 1 for invoice 1'
);
select results_eq(
  format($$ select current_version_status, is_final_document from public.get_invoice_summary(%L) $$, (select id from pgtap_rm_invoice_1)),
  $$ values ('pending'::public.invoice_evidence_version_status, false) $$,
  'pending evidence is visible but not yet final'
);

create temporary table pgtap_rm_version_1 as
  select v.id from public.invoice_evidence_versions v
  join public.invoice_evidence e on e.id = v.evidence_id
  where e.invoice_id = (select id from pgtap_rm_invoice_1) and v.version_number = 1;
grant select on pgtap_rm_version_1 to authenticated;

select lives_ok(
  $$ select public.verify_invoice_evidence_version((select id from pgtap_rm_version_1)) $$,
  'owner K verifies evidence version 1'
);
select results_eq(
  format($$ select current_version_status, is_final_document from public.get_invoice_summary(%L) $$, (select id from pgtap_rm_invoice_1)),
  $$ values ('verified'::public.invoice_evidence_version_status, true) $$,
  'verified + current evidence is now flagged as the final document'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- VOID + REISSUE — transaction_invoice_bindings preserves history
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-a4a4-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select lives_ok(
  format($$ select public.void_invoice(%L, 'rm koreksi nominal') $$, (select id from pgtap_rm_invoice_1)),
  'owner K voids invoice 1'
);
select lives_ok(
  format($$ select public.reissue_invoice(%L) $$, (select id from pgtap_rm_invoice_1)),
  'owner K reissues invoice 1'
);
reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_rm_invoice_2 as
  select id from public.invoices where predecessor_invoice_id = (select id from pgtap_rm_invoice_1);
grant select on pgtap_rm_invoice_2 to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-a4a4-4444-0000-000000000002', 'role', 'authenticated')::text, true);
select lives_ok(
  format($$ select public.bind_invoice_transaction(%L, 'a1000000-0000-0000-0000-000000000001') $$, (select id from pgtap_rm_invoice_2)),
  'admin K re-binds expense 1 (freed by the void) to reissued invoice 2'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- invoice_billing_summary.successor_invoice_id links the void predecessor
-- forward to its reissue.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-a4a4-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select results_eq(
  format($$ select successor_invoice_id from public.get_invoice_summary(%L) $$, (select id from pgtap_rm_invoice_1)),
  $$ select id from pgtap_rm_invoice_2 $$,
  'the voided invoice 1''s successor_invoice_id points at the reissued invoice 2'
);
reset role;

-- Expense 1 was bound to invoice 1 (now void) AND invoice 2 (draft) — both
-- rows must still be visible via transaction_invoice_bindings, proving void
-- does not erase history (task instruction H).
select set_config('request.jwt.claims', json_build_object('sub', '00000000-a4a4-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.list_transaction_invoice_bindings('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'a1000000-0000-0000-0000-000000000001') $$,
  'not authorized to view invoice bindings',
  'reviewer K cannot list transaction invoice bindings'
);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-b4b4-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.list_transaction_invoice_bindings('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'a1000000-0000-0000-0000-000000000001') $$,
  'not authorized to view invoice bindings',
  'owner L cannot list tenant K''s transaction invoice bindings'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-a4a4-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select results_eq(
  $$ select invoice_id, invoice_status from public.list_transaction_invoice_bindings('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'a1000000-0000-0000-0000-000000000001') order by invoice_status $$,
  format(
    $$ values (%L::uuid, 'draft'::public.invoice_status), (%L::uuid, 'void'::public.invoice_status) $$,
    (select id from pgtap_rm_invoice_2), (select id from pgtap_rm_invoice_1)
  ),
  'expense 1''s full invoice history (void predecessor + draft reissue) is both visible'
);
select is(
  (select is_final_document from public.list_transaction_invoice_bindings('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4', 'a1000000-0000-0000-0000-000000000001') where invoice_id = (select id from pgtap_rm_invoice_1)),
  true,
  'the void invoice''s binding still reports its verified evidence as the final document (history not erased)'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- record_invoice_evidence_access — evidence.accessed audit control point
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-a4a4-4444-0000-000000000003', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.record_invoice_evidence_access((select id from pgtap_rm_version_1)) $$,
  'not authorized to access invoice evidence',
  'reviewer K cannot record/obtain evidence access'
);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-b4b4-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.record_invoice_evidence_access((select id from pgtap_rm_version_1)) $$,
  'not authorized to access invoice evidence',
  'owner L cannot access tenant K''s evidence'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-a4a4-4444-0000-000000000001', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::int from public.access_audit_events where entity_id = (select id from pgtap_rm_version_1) and action = 'evidence.accessed'),
  0,
  'no evidence.accessed event recorded yet'
);
select results_eq(
  $$ select storage_path from public.record_invoice_evidence_access((select id from pgtap_rm_version_1)) $$,
  format($$ values ('a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4/' || %L || '/1-rm.pdf') $$, (select id from pgtap_rm_invoice_1)),
  'owner K accesses evidence version 1 and gets back its real storage_path'
);
select is(
  (select count(*)::int from public.access_audit_events where entity_id = (select id from pgtap_rm_version_1) and action = 'evidence.accessed'),
  1,
  'AU-08: evidence.accessed recorded exactly once for this access'
);
select lives_ok(
  $$ select public.record_invoice_evidence_access((select id from pgtap_rm_version_1)) $$,
  'a second, independent access is allowed (each open is its own audit event)'
);
select is(
  (select count(*)::int from public.access_audit_events where entity_id = (select id from pgtap_rm_version_1) and action = 'evidence.accessed'),
  2,
  'a second access records a second, distinct evidence.accessed event (not deduplicated away)'
);
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();

rollback;
