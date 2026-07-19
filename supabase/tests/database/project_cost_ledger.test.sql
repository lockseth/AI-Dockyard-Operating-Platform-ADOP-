-- ADOP Phase 1 Gate 1D — pgTAP proof for the Immutable Project Cost/Expense
-- Ledger Foundation: schema, tenant-safe composite relationships, owner/
-- admin-only RPC mutation (record/reverse), amount/description validation,
-- closed-project rejection of new expenses (but not reversals), reversal
-- integrity (same-tenant/pool/project, original-only, one reversal max),
-- append-only guarantees, the cash_pool_daily_summary total_cash_out/
-- closing_cash integration boundary now derived from this ledger, the
-- vessel_project_cost_summary read model, and cross-tenant isolation.
--
-- Self-contained: creates its own fixtures (distinct tenant/user ids from
-- every other pgTAP file in this directory) and rolls back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'pgtap-cost-ledger-tenant-i', 'PgTAP Cost Ledger Tenant I', 'active'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'pgtap-cost-ledger-tenant-j', 'PgTAP Cost Ledger Tenant J', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-bbbb-2222-0000-000000000001', 'authenticated', 'authenticated', 'owner-i@pgtap-cost.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-bbbb-2222-0000-000000000002', 'authenticated', 'authenticated', 'admin-i@pgtap-cost.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-bbbb-2222-0000-000000000003', 'authenticated', 'authenticated', 'reviewer-i@pgtap-cost.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-bbbb-2222-0000-000000000004', 'authenticated', 'authenticated', 'viewer-i@pgtap-cost.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-cccc-2222-0000-000000000001', 'authenticated', 'authenticated', 'owner-j@pgtap-cost.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('b0000000-2222-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-bbbb-2222-0000-000000000001', 'active'),
  ('b0000000-2222-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-bbbb-2222-0000-000000000002', 'active'),
  ('b0000000-2222-0000-0000-000000000003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-bbbb-2222-0000-000000000003', 'active'),
  ('b0000000-2222-0000-0000-000000000004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-bbbb-2222-0000-000000000004', 'active'),
  ('c0000000-2222-0000-0000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-cccc-2222-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('b0000000-2222-0000-0000-000000000001', 'owner'),
  ('b0000000-2222-0000-0000-000000000002', 'admin'),
  ('b0000000-2222-0000-0000-000000000003', 'reviewer'),
  ('b0000000-2222-0000-0000-000000000004', 'viewer'),
  ('c0000000-2222-0000-0000-000000000001', 'owner');

-- Anchor master-data rows, inserted as the migration/table-owner role
-- (bypasses RLS and column grants — only fixture setup ever does this),
-- same posture as vessel_project_lifecycle.test.sql.
insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('b0000000-0000-0000-0000-0000000000c1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'CL-I-ANCHOR', 'Anchor Client I', '00000000-bbbb-2222-0000-000000000001'),
  ('c0000000-0000-0000-0000-0000000000c1', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'CL-J-ANCHOR', 'Anchor Client J', '00000000-cccc-2222-0000-000000000001');

insert into public.vessels (id, tenant_id, client_id, vessel_code, vessel_name, created_by) values
  ('b0000000-0000-0000-0000-0000000000a1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b0000000-0000-0000-0000-0000000000c1', 'VS-I-ANCHOR', 'KM Anchor I', '00000000-bbbb-2222-0000-000000000001'),
  ('c0000000-0000-0000-0000-0000000000a1', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'c0000000-0000-0000-0000-0000000000c1', 'VS-J-ANCHOR', 'KM Anchor J', '00000000-cccc-2222-0000-000000000001');

insert into public.service_types (id, tenant_id, code, name) values
  ('b0000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'anchor-service', 'Anchor Service I'),
  ('c0000000-0000-0000-0000-0000000000b1', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'anchor-service', 'Anchor Service J');

insert into public.facility_locations (id, tenant_id, code, name) values
  ('b0000000-0000-0000-0000-0000000000f1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'FL-I-ANCHOR', 'Anchor Facility I'),
  ('c0000000-0000-0000-0000-0000000000f1', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'FL-J-ANCHOR', 'Anchor Facility J');

insert into public.expense_categories (id, tenant_id, code, name) values
  ('b0000000-0000-0000-0000-0000000000e1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'anchor-category', 'Anchor Category I'),
  ('c0000000-0000-0000-0000-0000000000e1', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'anchor-category', 'Anchor Category J');

insert into public.vendors (id, tenant_id, vendor_code, display_name) values
  ('b0000000-0000-0000-0000-0000000000d1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'VN-I-ANCHOR', 'Anchor Vendor I');

-- vessel_projects: inserted directly as the unrestricted fixture-setup role
-- (bypasses RLS and column grants, same posture as clients/vessels/
-- service_types/facility_locations/expense_categories/vendors above) —
-- explicit id/created_by, not exercised through the authenticated RLS path
-- since that is already proven by vessel_project_lifecycle.test.sql.
insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by) values
  ('b0000000-0000-0000-0000-0000000000a2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000c1', 'b0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000f1', 'IT-CL-PROJECT-A', '2032-01-01', '00000000-bbbb-2222-0000-000000000001'),
  ('b0000000-0000-0000-0000-0000000000a3', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000c1', 'b0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000f1', 'IT-CL-PROJECT-B', '2032-01-01', '00000000-bbbb-2222-0000-000000000001');

insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by) values
  ('c0000000-0000-0000-0000-0000000000a2', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'c0000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-0000000000c1', 'c0000000-0000-0000-0000-0000000000b1', 'c0000000-0000-0000-0000-0000000000f1', 'IT-CL-PROJECT-J', '2032-01-01', '00000000-cccc-2222-0000-000000000001');

-- =============================================================================
-- SCHEMA
-- =============================================================================

select has_table('public', 'project_cost_ledger_entries', 'public.project_cost_ledger_entries exists');
select has_view('public', 'vessel_project_cost_summary', 'public.vessel_project_cost_summary view exists');
select has_view('public', 'cash_pool_daily_summary', 'public.cash_pool_daily_summary view still exists');

select has_type('public', 'project_cost_ledger_entry_kind', 'project_cost_ledger_entry_kind enum exists');
select ok(
  (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.project_cost_ledger_entry_kind'::regtype)
    = array['expense', 'reversal'],
  'project_cost_ledger_entry_kind is exactly expense/reversal'
);

select col_is_pk('public', 'project_cost_ledger_entries', 'id', 'project_cost_ledger_entries PK is id');
select col_is_unique('public', 'vendors', array['id', 'tenant_id'], 'vendors (id, tenant_id) is now unique — added for the composite FK from project_cost_ledger_entries');
select col_not_null('public', 'project_cost_ledger_entries', 'amount', 'project_cost_ledger_entries.amount is not null');
select col_not_null('public', 'project_cost_ledger_entries', 'description', 'project_cost_ledger_entries.description is not null');
select col_not_null('public', 'project_cost_ledger_entries', 'project_id', 'project_cost_ledger_entries.project_id is not null');
select col_not_null('public', 'project_cost_ledger_entries', 'pool_id', 'project_cost_ledger_entries.pool_id is not null');
select col_not_null('public', 'project_cost_ledger_entries', 'category_id', 'project_cost_ledger_entries.category_id is not null');
select ok(
  (select is_nullable from information_schema.columns
     where table_schema = 'public' and table_name = 'project_cost_ledger_entries' and column_name = 'vendor_id') = 'YES',
  'project_cost_ledger_entries.vendor_id is nullable'
);
select ok(
  (select is_nullable from information_schema.columns
     where table_schema = 'public' and table_name = 'project_cost_ledger_entries' and column_name = 'reference_number') = 'YES',
  'project_cost_ledger_entries.reference_number is nullable'
);

select has_fk('public', 'project_cost_ledger_entries', 'project_cost_ledger_entries has a foreign key');

select ok((select relrowsecurity from pg_class where oid = 'public.project_cost_ledger_entries'::regclass), 'RLS enabled on project_cost_ledger_entries');

select has_trigger('public', 'project_cost_ledger_entries', 'project_cost_ledger_entries_append_only', 'project_cost_ledger_entries has the append-only guard trigger');
select has_trigger('public', 'project_cost_ledger_entries', 'project_cost_ledger_entries_enforce_project_status', 'project_cost_ledger_entries has the closed-project guard trigger');
select has_trigger('public', 'project_cost_ledger_entries', 'project_cost_ledger_entries_enforce_reversal_integrity', 'project_cost_ledger_entries has the reversal integrity guard trigger');

select ok(
  not has_table_privilege('authenticated', 'public.project_cost_ledger_entries', 'INSERT'),
  'authenticated has no INSERT grant on project_cost_ledger_entries — the RPC is the only write path'
);
select ok(
  not has_table_privilege('authenticated', 'public.project_cost_ledger_entries', 'UPDATE'),
  'authenticated has no UPDATE grant on project_cost_ledger_entries'
);
select ok(
  not has_table_privilege('authenticated', 'public.project_cost_ledger_entries', 'DELETE'),
  'authenticated has no DELETE grant on project_cost_ledger_entries'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.record_project_expense(uuid, uuid, uuid, numeric, text, uuid, text)'::regprocedure),
  'record_project_expense is SECURITY DEFINER'
);
select ok(
  exists (
    select 1 from pg_proc, unnest(proconfig) as cfg
    where oid = 'public.record_project_expense(uuid, uuid, uuid, numeric, text, uuid, text)'::regprocedure
      and cfg = 'search_path=public, pg_temp'
  ),
  'record_project_expense has a fixed search_path'
);
select ok(
  has_function_privilege('authenticated', 'public.record_project_expense(uuid, uuid, uuid, numeric, text, uuid, text)', 'EXECUTE'),
  'authenticated can execute record_project_expense (internal role check gates it, not the grant)'
);
select ok(
  not has_function_privilege('anon', 'public.record_project_expense(uuid, uuid, uuid, numeric, text, uuid, text)', 'EXECUTE'),
  'anon cannot execute record_project_expense'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.reverse_project_expense(uuid, text)'::regprocedure),
  'reverse_project_expense is SECURITY DEFINER'
);
select ok(
  not has_function_privilege('anon', 'public.reverse_project_expense(uuid, text)', 'EXECUTE'),
  'anon cannot execute reverse_project_expense'
);

-- =============================================================================
-- SETUP — daily cash pool for tenant I, business_date 2032-01-01
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-bbbb-2222-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ select public.get_or_create_daily_cash_pool('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2032-01-01') $$,
  'owner I can create the tenant I pool for 2032-01-01'
);

reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_cost_pool_i as
  select id from public.cash_pools where tenant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and business_date = '2032-01-01';
grant select on pgtap_cost_pool_i to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-cccc-2222-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ select public.get_or_create_daily_cash_pool('cccccccc-cccc-cccc-cccc-cccccccccccc', '2032-01-01') $$,
  'owner J can create a separate tenant J pool for the same business_date'
);

reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_cost_pool_j as
  select id from public.cash_pools where tenant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' and business_date = '2032-01-01';
grant select on pgtap_cost_pool_j to authenticated;

-- =============================================================================
-- RECORD EXPENSE — owner/admin only, amount > 0, description required,
-- tenant re-derived from the pool, project/category/vendor tenant-safe
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-bbbb-2222-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ select public.record_project_expense(
       (select id from pgtap_cost_pool_i), 'b0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-0000000000e1',
       750000.00, 'beli spare part project A', 'b0000000-0000-0000-0000-0000000000d1', 'INV-A-001'
     ) $$,
  'owner I can record a project expense with a vendor and reference number'
);
select lives_ok(
  $$ select public.record_project_expense(
       (select id from pgtap_cost_pool_i), 'b0000000-0000-0000-0000-0000000000a3', 'b0000000-0000-0000-0000-0000000000e1',
       250000.50, 'sewa alat project B', null, null
     ) $$,
  'owner I can record a project expense without a vendor (nullable)'
);

select throws_ok(
  $$ select public.record_project_expense(
       (select id from pgtap_cost_pool_i), 'b0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-0000000000e1',
       0, 'nominal nol', null, null
     ) $$,
  'amount must be greater than zero',
  'a zero amount is rejected'
);
select throws_ok(
  $$ select public.record_project_expense(
       (select id from pgtap_cost_pool_i), 'b0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-0000000000e1',
       -100, 'nominal negatif', null, null
     ) $$,
  'amount must be greater than zero',
  'a negative amount is rejected'
);
select throws_ok(
  $$ select public.record_project_expense(
       (select id from pgtap_cost_pool_i), 'b0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-0000000000e1',
       1000, '', null, null
     ) $$,
  'expense description is required',
  'an empty description is rejected'
);
select throws_ok(
  $$ select public.record_project_expense(
       (select id from pgtap_cost_pool_i), 'b0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-0000000000e1',
       1000, null, null, null
     ) $$,
  'expense description is required',
  'a null description is rejected'
);

select throws_ok(
  $$ select public.record_project_expense(
       '00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-0000000000e1',
       1000, 'pool tidak ada', null, null
     ) $$,
  'daily cash pool not found',
  'a non-existent pool_id is rejected'
);

-- Cross-tenant project/category reference: owner I's own pool, but a
-- project/category id from tenant J — rejected by the composite FK.
select throws_ok(
  $$ select public.record_project_expense(
       (select id from pgtap_cost_pool_i), 'c0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-0000000000e1',
       1000, 'project lintas tenant', null, null
     ) $$,
  '23503',
  null,
  'a cross-tenant project_id is rejected by the composite FK'
);
select throws_ok(
  $$ select public.record_project_expense(
       (select id from pgtap_cost_pool_i), 'b0000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-0000000000e1',
       1000, 'kategori lintas tenant', null, null
     ) $$,
  '23503',
  null,
  'a cross-tenant category_id is rejected by the composite FK'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- Captured while still unrestricted (RLS-bypassing) so the cross-tenant
-- reversal check further down can address project B's expense id — owner
-- J's own session cannot see this row via SELECT (RLS), so a live subquery
-- under their role would return null and mask "not authorized" behind a
-- false "not found", same reasoning as pgtap_cash_pool_g_opening_entry in
-- shared_daily_cash_pool.test.sql.
create temporary table pgtap_cost_project_b_expense as
  select id from public.project_cost_ledger_entries
    where project_id = 'b0000000-0000-0000-0000-0000000000a3' and entry_kind = 'expense';
grant select on pgtap_cost_project_b_expense to authenticated;

select results_eq(
  $$ select opening_cash, cash_top_up, other_cash_in, total_cash_out, closing_cash
       from public.cash_pool_daily_summary
       where tenant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and business_date = '2032-01-01' $$,
  $$ values (0.00::numeric, 0.00::numeric, 0.00::numeric, 1000000.50::numeric, -1000000.50::numeric) $$,
  'total_cash_out is derived from the ledger (both projects'' expenses), not a hardcoded constant, and closing_cash reflects it'
);

select results_eq(
  $$ select total_cost from public.vessel_project_cost_summary
       where project_id = 'b0000000-0000-0000-0000-0000000000a2' $$,
  $$ values (750000.00::numeric) $$,
  'vessel_project_cost_summary reports project A''s own total, not tenant-wide'
);
select results_eq(
  $$ select total_cost from public.vessel_project_cost_summary
       where project_id = 'b0000000-0000-0000-0000-0000000000a3' $$,
  $$ values (250000.50::numeric) $$,
  'vessel_project_cost_summary reports project B''s own total, separately'
);

-- reviewer/viewer cannot record.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-bbbb-2222-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.record_project_expense(
       (select id from pgtap_cost_pool_i), 'b0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-0000000000e1',
       1000, 'reviewer coba input', null, null
     ) $$,
  'not authorized to record project expense',
  'reviewer I cannot record a project expense'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-bbbb-2222-0000-000000000004', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.record_project_expense(
       (select id from pgtap_cost_pool_i), 'b0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-0000000000e1',
       1000, 'viewer coba input', null, null
     ) $$,
  'not authorized to record project expense',
  'viewer I cannot record a project expense'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Cross-tenant: owner J cannot record against tenant I's pool.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-cccc-2222-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.record_project_expense(
       (select id from pgtap_cost_pool_i), 'b0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-0000000000e1',
       1000, 'owner J lintas tenant', null, null
     ) $$,
  'not authorized to record project expense',
  'owner J cannot record an expense against tenant I''s pool'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- CLOSED PROJECT — new expenses rejected, but reversal of a pre-closure
-- expense is still allowed
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-bbbb-2222-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ select public.transition_vessel_project_lifecycle('b0000000-0000-0000-0000-0000000000a2', 'ready_to_close', null) $$,
  'project A can transition to ready_to_close'
);
select lives_ok(
  $$ select public.transition_vessel_project_lifecycle('b0000000-0000-0000-0000-0000000000a2', 'closed', null) $$,
  'project A can transition to closed'
);

select throws_ok(
  $$ select public.record_project_expense(
       (select id from pgtap_cost_pool_i), 'b0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-0000000000e1',
       1000, 'expense pada project closed', null, null
     ) $$,
  'vessel project is closed to new expenses',
  'a new expense on a closed project is rejected'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- The rejected attempt above did not change the ledger or the summary.
select results_eq(
  $$ select total_cost from public.vessel_project_cost_summary
       where project_id = 'b0000000-0000-0000-0000-0000000000a2' $$,
  $$ values (750000.00::numeric) $$,
  'the rejected closed-project expense attempt left project A''s total unchanged'
);

-- =============================================================================
-- REVERSAL — same-tenant/pool/project, original-only, one reversal max,
-- allowed even after the project has closed
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-bbbb-2222-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ select public.reverse_project_expense(
       (select id from public.project_cost_ledger_entries
          where project_id = 'b0000000-0000-0000-0000-0000000000a2' and entry_kind = 'expense'),
       'salah kategori biaya'
     ) $$,
  'owner I can reverse project A''s expense even though the project is now closed'
);

reset role;
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$ select total_cost from public.vessel_project_cost_summary
       where project_id = 'b0000000-0000-0000-0000-0000000000a2' $$,
  $$ values (0.00::numeric) $$,
  'after reversal, project A''s total drops to zero — the reversed expense excluded from the summary'
);
select is(
  (select count(*)::int from public.project_cost_ledger_entries where project_id = 'b0000000-0000-0000-0000-0000000000a2'),
  2,
  'the original expense row still exists — reversal added a row, deleted nothing'
);
select results_eq(
  $$ select entry_kind, amount from public.project_cost_ledger_entries
       where project_id = 'b0000000-0000-0000-0000-0000000000a2' and entry_kind = 'expense' $$,
  $$ values ('expense'::public.project_cost_ledger_entry_kind, 750000.00::numeric) $$,
  'the original expense row is untouched — same entry_kind and amount as before the reversal'
);

select results_eq(
  $$ select total_cash_out from public.cash_pool_daily_summary
       where tenant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and business_date = '2032-01-01' $$,
  $$ values (250000.50::numeric) $$,
  'the shared pool''s total_cash_out reflects the reversal — only project B''s expense remains'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-bbbb-2222-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select public.reverse_project_expense(
       (select id from public.project_cost_ledger_entries
          where project_id = 'b0000000-0000-0000-0000-0000000000a2' and entry_kind = 'expense'),
       'coba reverse dua kali'
     ) $$,
  'project expense already reversed',
  'the same expense cannot be reversed twice'
);
select throws_ok(
  $$ select public.reverse_project_expense(
       (select id from public.project_cost_ledger_entries
          where project_id = 'b0000000-0000-0000-0000-0000000000a2' and entry_kind = 'reversal'),
       'coba reverse hasil reversal'
     ) $$,
  'only an original expense can be reversed',
  'a reversal row itself cannot be reversed'
);
select throws_ok(
  $$ select public.reverse_project_expense(
       (select id from public.project_cost_ledger_entries
          where project_id = 'b0000000-0000-0000-0000-0000000000a3' and entry_kind = 'expense'),
       ''
     ) $$,
  'reversal reason is required',
  'an empty reversal reason is rejected'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- reviewer/viewer cannot reverse.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-bbbb-2222-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.reverse_project_expense(
       (select id from public.project_cost_ledger_entries
          where project_id = 'b0000000-0000-0000-0000-0000000000a3' and entry_kind = 'expense'),
       'reviewer coba reverse'
     ) $$,
  'not authorized to reverse project expense',
  'reviewer I cannot reverse a project expense'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Cross-tenant reversal rejected.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-cccc-2222-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.reverse_project_expense(
       (select id from pgtap_cost_project_b_expense),
       'lintas tenant'
     ) $$,
  'not authorized to reverse project expense',
  'owner J cannot reverse an expense belonging to tenant I'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Reversal-integrity trigger is role-independent: a raw INSERT (bypassing
-- the RPC entirely) claiming a reversal against project B's expense but
-- tagging it with project A's project_id is rejected regardless of caller,
-- matching cash_pool_entries' equivalent structural guard.
reset role;
select throws_ok(
  format(
    $$ insert into public.project_cost_ledger_entries
         (tenant_id, pool_id, project_id, category_id, entry_kind, amount, description, reverses_entry_id)
       values
         ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', %L, 'b0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-0000000000e1',
          'reversal', 250000.50, 'raw insert mismatch', %L) $$,
    (select id from pgtap_cost_pool_i),
    (select id from public.project_cost_ledger_entries where project_id = 'b0000000-0000-0000-0000-0000000000a3' and entry_kind = 'expense')
  ),
  'reversal must reference an entry in the same vessel project',
  'a raw reversal insert with a mismatched project_id is rejected at the trigger level, regardless of caller'
);

-- =============================================================================
-- CROSS-TENANT READ ISOLATION
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-cccc-2222-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is_empty(
  $$ select id from public.project_cost_ledger_entries where tenant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  'owner J cannot read tenant I''s project cost ledger entries'
);
select is_empty(
  $$ select project_id from public.vessel_project_cost_summary where tenant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  'owner J cannot read tenant I''s vessel project cost summary'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- HARD DELETE / MUTATION — structurally impossible, role-independent
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-bbbb-2222-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ delete from public.project_cost_ledger_entries where tenant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  '42501',
  null,
  'owner I cannot hard-delete a project cost ledger entry — no DELETE grant'
);
select throws_ok(
  $$ update public.project_cost_ledger_entries set amount = 1 where tenant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  '42501',
  null,
  'owner I cannot update a project cost ledger entry — no UPDATE grant'
);
select throws_ok(
  $$ insert into public.project_cost_ledger_entries
       (tenant_id, pool_id, project_id, category_id, entry_kind, amount, description)
     values
       ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', (select id from pgtap_cost_pool_i), 'b0000000-0000-0000-0000-0000000000a3', 'b0000000-0000-0000-0000-0000000000e1',
        'expense', 1, 'direct insert attempt') $$,
  '42501',
  null,
  'owner I cannot INSERT directly on project_cost_ledger_entries — the RPC is the only write path'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Role-independent: even the unrestricted fixture-setup role cannot mutate,
-- proving the append-only guarantee is a real trigger, not just a grant.
reset role;
select throws_ok(
  $$ delete from public.project_cost_ledger_entries
       where project_id = 'b0000000-0000-0000-0000-0000000000a3' $$,
  'access_audit_events is append-only: DELETE not allowed',
  'DELETE on project_cost_ledger_entries is blocked at the database level, regardless of role'
);
select throws_ok(
  $$ update public.project_cost_ledger_entries set amount = 1
       where project_id = 'b0000000-0000-0000-0000-0000000000a3' $$,
  'access_audit_events is append-only: UPDATE not allowed',
  'UPDATE on project_cost_ledger_entries is blocked at the database level, regardless of role'
);

select * from finish();

rollback;
