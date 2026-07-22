-- ADOP Phase 1 Gate 1N/1O — pgTAP proof for Shared Overhead Allocation and
-- the Project-Close Overhead Guard: schema, tenant-safe composite
-- relationships, owner/admin-only allocate, owner-only reverse, the
-- amount-never-exceeds-entry guard (role-independent, fires even on a raw
-- INSERT), reversal integrity, append-only guarantees, the derived
-- (never-stored) allocation_status view, and the applicable-cost-period +
-- facility scoped project-close guard added to
-- transition_vessel_project_lifecycle.
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
  ('99999999-9999-9999-9999-999999999999', 'pgtap-overhead-tenant-g', 'PgTAP Overhead Tenant G', 'active'),
  ('10101010-1010-1010-1010-101010101010', 'pgtap-overhead-tenant-h', 'PgTAP Overhead Tenant H', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-9999-3333-0000-000000000001', 'authenticated', 'authenticated', 'owner-g@pgtap-overhead.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-9999-3333-0000-000000000002', 'authenticated', 'authenticated', 'admin-g@pgtap-overhead.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-9999-3333-0000-000000000003', 'authenticated', 'authenticated', 'viewer-g@pgtap-overhead.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-1010-3333-0000-000000000001', 'authenticated', 'authenticated', 'owner-h@pgtap-overhead.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('90000000-3333-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', '00000000-9999-3333-0000-000000000001', 'active'),
  ('90000000-3333-0000-0000-000000000002', '99999999-9999-9999-9999-999999999999', '00000000-9999-3333-0000-000000000002', 'active'),
  ('90000000-3333-0000-0000-000000000003', '99999999-9999-9999-9999-999999999999', '00000000-9999-3333-0000-000000000003', 'active'),
  ('10000000-3333-0000-0000-000000000001', '10101010-1010-1010-1010-101010101010', '00000000-1010-3333-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('90000000-3333-0000-0000-000000000001', 'owner'),
  ('90000000-3333-0000-0000-000000000002', 'admin'),
  ('90000000-3333-0000-0000-000000000003', 'viewer'),
  ('10000000-3333-0000-0000-000000000001', 'owner');

-- Anchor master-data rows, inserted as the migration/table-owner role
-- (bypasses RLS and column grants — only fixture setup ever does this),
-- same posture as project_cost_ledger.test.sql.
insert into public.clients (id, tenant_id, client_code, display_name, created_by) values
  ('90000000-0000-0000-0000-0000000000c1', '99999999-9999-9999-9999-999999999999', 'CL-G-ANCHOR', 'Anchor Client G', '00000000-9999-3333-0000-000000000001'),
  ('10000000-0000-0000-0000-0000000000c1', '10101010-1010-1010-1010-101010101010', 'CL-H-ANCHOR', 'Anchor Client H', '00000000-1010-3333-0000-000000000001');

insert into public.vessels (id, tenant_id, client_id, vessel_code, vessel_name, created_by) values
  ('90000000-0000-0000-0000-0000000000a1', '99999999-9999-9999-9999-999999999999', '90000000-0000-0000-0000-0000000000c1', 'VS-G-ANCHOR', 'KM Anchor G', '00000000-9999-3333-0000-000000000001'),
  ('10000000-0000-0000-0000-0000000000a1', '10101010-1010-1010-1010-101010101010', '10000000-0000-0000-0000-0000000000c1', 'VS-H-ANCHOR', 'KM Anchor H', '00000000-1010-3333-0000-000000000001');

insert into public.service_types (id, tenant_id, code, name) values
  ('90000000-0000-0000-0000-0000000000b1', '99999999-9999-9999-9999-999999999999', 'anchor-service', 'Anchor Service G'),
  ('10000000-0000-0000-0000-0000000000b1', '10101010-1010-1010-1010-101010101010', 'anchor-service', 'Anchor Service H');

insert into public.facility_locations (id, tenant_id, code, name) values
  ('90000000-0000-0000-0000-0000000000f1', '99999999-9999-9999-9999-999999999999', 'FL-G-ANCHOR', 'Anchor Facility G'),
  ('90000000-0000-0000-0000-0000000000f2', '99999999-9999-9999-9999-999999999999', 'FL-G-OTHER', 'Other Facility G'),
  ('10000000-0000-0000-0000-0000000000f1', '10101010-1010-1010-1010-101010101010', 'FL-H-ANCHOR', 'Anchor Facility H');

insert into public.expense_categories (id, tenant_id, code, name) values
  ('90000000-0000-0000-0000-0000000000e1', '99999999-9999-9999-9999-999999999999', 'anchor-category', 'Anchor Category G');

-- vessel_projects — inserted directly as the unrestricted fixture-setup
-- role, same posture as project_cost_ledger.test.sql. start_date is far in
-- the past (real-world 2020) so the applicable cost period
-- [start_date, current_date] safely spans both an ordinary business_date and
-- excludes a deliberately far-future one, without needing to fake now().
insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by) values
  ('90000000-0000-0000-0000-0000000000a2', '99999999-9999-9999-9999-999999999999', '90000000-0000-0000-0000-0000000000a1', '90000000-0000-0000-0000-0000000000c1', '90000000-0000-0000-0000-0000000000b1', '90000000-0000-0000-0000-0000000000f1', 'GT-OVERHEAD-PROJECT-A', '2020-01-01', '00000000-9999-3333-0000-000000000001'),
  ('90000000-0000-0000-0000-0000000000a3', '99999999-9999-9999-9999-999999999999', '90000000-0000-0000-0000-0000000000a1', '90000000-0000-0000-0000-0000000000c1', '90000000-0000-0000-0000-0000000000b1', '90000000-0000-0000-0000-0000000000f1', 'GT-OVERHEAD-PROJECT-B', '2020-01-01', '00000000-9999-3333-0000-000000000001');

insert into public.vessel_projects (id, tenant_id, vessel_id, client_id, service_type_id, facility_location_id, project_code, start_date, created_by) values
  ('10000000-0000-0000-0000-0000000000a2', '10101010-1010-1010-1010-101010101010', '10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000f1', 'HT-OVERHEAD-PROJECT-H', '2020-01-01', '00000000-1010-3333-0000-000000000001');

-- =============================================================================
-- SCHEMA
-- =============================================================================

select has_table('public', 'shared_overhead_allocations', 'public.shared_overhead_allocations exists');
select has_view('public', 'shared_overhead_allocations_current', 'public.shared_overhead_allocations_current view exists');
select has_view('public', 'shared_overhead_allocation_status', 'public.shared_overhead_allocation_status view exists');

select has_type('public', 'shared_overhead_allocation_kind', 'shared_overhead_allocation_kind enum exists');
select ok(
  (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.shared_overhead_allocation_kind'::regtype)
    = array['allocation', 'reversal'],
  'shared_overhead_allocation_kind is exactly allocation/reversal'
);

select col_is_pk('public', 'shared_overhead_allocations', 'id', 'shared_overhead_allocations PK is id');
select col_is_unique('public', 'project_cost_ledger_entries', array['id', 'tenant_id'], 'project_cost_ledger_entries (id, tenant_id) is now unique — added for the composite FK from shared_overhead_allocations');
select col_not_null('public', 'shared_overhead_allocations', 'amount', 'shared_overhead_allocations.amount is not null');

select has_trigger('public', 'shared_overhead_allocations', 'shared_overhead_allocations_append_only', 'shared_overhead_allocations has the append-only guard trigger');
select has_trigger('public', 'shared_overhead_allocations', 'shared_overhead_allocations_enforce_amount', 'shared_overhead_allocations has the amount guard trigger');
select has_trigger('public', 'shared_overhead_allocations', 'shared_overhead_allocations_enforce_reversal_integrity', 'shared_overhead_allocations has the reversal integrity trigger');

select ok(
  (select prosecdef from pg_proc where oid = 'public.allocate_shared_overhead_entry(uuid, uuid, numeric, text)'::regprocedure),
  'allocate_shared_overhead_entry is SECURITY DEFINER'
);
select ok(
  not has_function_privilege('anon', 'public.allocate_shared_overhead_entry(uuid, uuid, numeric, text)', 'EXECUTE'),
  'anon cannot execute allocate_shared_overhead_entry'
);
select ok(
  not has_function_privilege('anon', 'public.reverse_shared_overhead_allocation(uuid, text)', 'EXECUTE'),
  'anon cannot execute reverse_shared_overhead_allocation'
);

-- =============================================================================
-- SETUP — daily cash pools + shared overhead entries for tenant G
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-3333-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ select public.get_or_create_daily_cash_pool('99999999-9999-9999-9999-999999999999', '2020-06-01') $$,
  'owner G can create the in-period pool'
);
select lives_ok(
  $$ select public.get_or_create_daily_cash_pool('99999999-9999-9999-9999-999999999999', '2099-01-01') $$,
  'owner G can create the far-future (out-of-period) pool'
);

reset role;
select set_config('request.jwt.claims', '', true);

create temporary table pgtap_ov_pool_in_period as
  select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2020-06-01';
create temporary table pgtap_ov_pool_future as
  select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2099-01-01';

-- record_shared_overhead_expense is not granted to `authenticated` (same
-- posture as record_project_expense since Gate 1E) — exercised here the
-- same way project_cost_ledger.test.sql exercises record_project_expense:
-- request.jwt.claims set, but the Postgres role kept as the unrestricted
-- pgTAP session role.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-3333-0000-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.record_shared_overhead_expense(
       (select id from pgtap_ov_pool_in_period), '90000000-0000-0000-0000-0000000000e1',
       1000000.00, 'listrik dan air dermaga — in-period entry'
     ) $$,
  'owner G can record an in-period shared overhead expense'
);
select lives_ok(
  $$ select public.record_shared_overhead_expense(
       (select id from pgtap_ov_pool_future), '90000000-0000-0000-0000-0000000000e1',
       500000.00, 'sewa genset — future/out-of-period entry'
     ) $$,
  'owner G can record a far-future shared overhead expense'
);

select set_config('request.jwt.claims', '', true);

create temporary table pgtap_ov_entry_in_period as
  select id from public.project_cost_ledger_entries
  where pool_id = (select id from pgtap_ov_pool_in_period) and entry_scope = 'shared_overhead';
create temporary table pgtap_ov_entry_future as
  select id from public.project_cost_ledger_entries
  where pool_id = (select id from pgtap_ov_pool_future) and entry_scope = 'shared_overhead';
grant select on pgtap_ov_entry_in_period to authenticated;
grant select on pgtap_ov_entry_future to authenticated;

-- =============================================================================
-- GUARD #1 — an entirely unallocated in-period overhead entry blocks close;
-- the future/out-of-period entry never blocks (it is left unallocated for
-- the rest of this file, on purpose).
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-3333-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select results_eq(
  $$ select allocation_status::text from public.shared_overhead_allocation_status where overhead_entry_id = (select id from pgtap_ov_entry_in_period) $$,
  $$ values ('unallocated') $$,
  'in-period entry starts unallocated'
);

select lives_ok(
  $$ select public.transition_vessel_project_lifecycle('90000000-0000-0000-0000-0000000000a2', 'ready_to_close', null) $$,
  'project A can move active -> ready_to_close regardless of overhead allocation'
);

select throws_ok(
  $$ select public.transition_vessel_project_lifecycle('90000000-0000-0000-0000-0000000000a2', 'closed', null) $$,
  'SHARED_OVERHEAD_ALLOCATION_INCOMPLETE',
  'project A cannot close while the in-period overhead entry is unallocated'
);

-- =============================================================================
-- GUARD #2 — partial allocation still blocks close.
-- =============================================================================

select lives_ok(
  $$ select public.allocate_shared_overhead_entry(
       (select id from pgtap_ov_entry_in_period), '90000000-0000-0000-0000-0000000000a2', 400000.00, 'sebagian ke project A'
     ) $$,
  'owner G can partially allocate the in-period entry to project A'
);

select results_eq(
  $$ select allocation_status::text from public.shared_overhead_allocation_status where overhead_entry_id = (select id from pgtap_ov_entry_in_period) $$,
  $$ values ('partially_allocated') $$,
  'in-period entry is now partially_allocated'
);

select throws_ok(
  $$ select public.transition_vessel_project_lifecycle('90000000-0000-0000-0000-0000000000a2', 'closed', null) $$,
  'SHARED_OVERHEAD_ALLOCATION_INCOMPLETE',
  'project A still cannot close while the entry is only partially allocated'
);

-- =============================================================================
-- OVER-ALLOCATION — the remaining sum can never exceed the entry amount,
-- even split across two different projects.
-- =============================================================================

select throws_ok(
  $$ select public.allocate_shared_overhead_entry(
       (select id from pgtap_ov_entry_in_period), '90000000-0000-0000-0000-0000000000a3', 700000.00, 'kelebihan alokasi'
     ) $$,
  'allocation exceeds shared overhead entry amount',
  '400,000 + 700,000 > 1,000,000 is rejected — running sum checked against the entry amount'
);

-- =============================================================================
-- GUARD #3 — fully allocating the remainder (to a DIFFERENT project than the
-- one closing) makes the entry fully_allocated, which unblocks EVERY
-- project, not just the one it was allocated to.
-- =============================================================================

select lives_ok(
  $$ select public.allocate_shared_overhead_entry(
       (select id from pgtap_ov_entry_in_period), '90000000-0000-0000-0000-0000000000a3', 600000.00, 'sisa ke project B'
     ) $$,
  'owner G can allocate the remaining 600,000 to project B'
);

select results_eq(
  $$ select allocation_status::text from public.shared_overhead_allocation_status where overhead_entry_id = (select id from pgtap_ov_entry_in_period) $$,
  $$ values ('fully_allocated') $$,
  'in-period entry is now fully_allocated (400,000 to A + 600,000 to B = 1,000,000)'
);

select lives_ok(
  $$ select public.transition_vessel_project_lifecycle('90000000-0000-0000-0000-0000000000a2', 'closed', null) $$,
  'project A can now close — its own overhead entry is fully allocated, and the future entry is out of period'
);

-- =============================================================================
-- GUARD #4 — future/out-of-period entry never blocked project A, proven
-- directly: it is still unallocated right now, yet project A closed above.
-- =============================================================================

select results_eq(
  $$ select allocation_status::text from public.shared_overhead_allocation_status where overhead_entry_id = (select id from pgtap_ov_entry_future) $$,
  $$ values ('unallocated') $$,
  'the far-future entry is still unallocated — it simply never applied to project A''s cost period'
);

select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- AUTHORIZATION — viewer cannot allocate/reverse; admin can allocate but not
-- reverse (owner-only, same posture as reverse_project_expense).
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-3333-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.allocate_shared_overhead_entry(
       (select id from pgtap_ov_entry_future), '90000000-0000-0000-0000-0000000000a3', 1000.00, 'viewer coba alokasi'
     ) $$,
  'not authorized to allocate shared overhead',
  'viewer cannot allocate shared overhead'
);
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-3333-0000-000000000002', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.allocate_shared_overhead_entry(
       (select id from pgtap_ov_entry_future), '90000000-0000-0000-0000-0000000000a3', 500000.00, 'admin alokasi entry future'
     ) $$,
  'admin can allocate shared overhead'
);
select throws_ok(
  $$ select public.reverse_shared_overhead_allocation(
       (select id from public.shared_overhead_allocations where overhead_entry_id = (select id from pgtap_ov_entry_future) and allocation_kind = 'allocation'),
       'admin coba reverse'
     ) $$,
  'not authorized to reverse shared overhead allocation',
  'admin cannot reverse a shared overhead allocation — owner-only'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- REVERSAL — owner can reverse; status goes back to unallocated; double
-- reversal and reversing a reversal are both rejected.
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-3333-0000-000000000001', 'role', 'authenticated')::text, true);

create temporary table pgtap_ov_future_allocation as
  select id from public.shared_overhead_allocations
  where overhead_entry_id = (select id from pgtap_ov_entry_future) and allocation_kind = 'allocation';
grant select on pgtap_ov_future_allocation to authenticated;

select results_eq(
  $$ select allocation_status::text from public.shared_overhead_allocation_status where overhead_entry_id = (select id from pgtap_ov_entry_future) $$,
  $$ values ('fully_allocated') $$,
  'future entry is fully_allocated after the admin''s 500,000 allocation'
);

select lives_ok(
  $$ select public.reverse_shared_overhead_allocation((select id from pgtap_ov_future_allocation), 'salah alokasi') $$,
  'owner can reverse the allocation'
);

select results_eq(
  $$ select allocation_status::text from public.shared_overhead_allocation_status where overhead_entry_id = (select id from pgtap_ov_entry_future) $$,
  $$ values ('unallocated') $$,
  'status returns to unallocated after the allocation is reversed — derived from the live sum, not a stale flag'
);

select throws_ok(
  $$ select public.reverse_shared_overhead_allocation((select id from pgtap_ov_future_allocation), 'coba reverse lagi') $$,
  'shared overhead allocation already reversed',
  'the same allocation cannot be reversed twice'
);

select throws_ok(
  $$ select public.reverse_shared_overhead_allocation(
       (select id from public.shared_overhead_allocations where reverses_allocation_id = (select id from pgtap_ov_future_allocation)),
       'coba reverse hasil reversal'
     ) $$,
  'only an original allocation can be reversed',
  'a reversal row itself cannot be reversed'
);

select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- CROSS-TENANT — owner H cannot allocate tenant G's overhead to tenant H's
-- project, and cannot allocate against tenant G's entry at all.
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-1010-3333-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.allocate_shared_overhead_entry(
       (select id from pgtap_ov_entry_future), '10000000-0000-0000-0000-0000000000a2', 1000.00, 'lintas tenant'
     ) $$,
  'not authorized to allocate shared overhead',
  'owner H is not authorized against tenant G''s overhead entry — role check runs against the entry''s own real tenant'
);
select set_config('request.jwt.claims', '', true);

-- Cross-tenant project reference from a same-tenant caller: owner G cannot
-- allocate tenant G's overhead entry to tenant H's project (composite FK/
-- explicit tenant match inside the RPC rejects it as "not found").
select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-3333-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.allocate_shared_overhead_entry(
       (select id from pgtap_ov_entry_in_period), '10000000-0000-0000-0000-0000000000a2', 1000.00, 'project lintas tenant'
     ) $$,
  'vessel project not found',
  'a cross-tenant project_id is rejected as not found, never silently allocated across tenants'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- CLOSED-PROJECT REJECTION — cannot allocate shared overhead to an
-- already-closed project.
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-3333-0000-000000000001', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select public.allocate_shared_overhead_entry(
       (select id from pgtap_ov_entry_future), '90000000-0000-0000-0000-0000000000a2', 1000.00, 'project A sudah closed'
     ) $$,
  'cannot allocate shared overhead to a closed vessel project',
  'project A already closed above — new allocations to it are rejected'
);
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- ROLE-INDEPENDENT GUARDS — a raw INSERT (bypassing the RPCs entirely, as
-- the unrestricted fixture-setup role) is still caught by the amount trigger.
-- =============================================================================

reset role;

select throws_ok(
  $$ insert into public.shared_overhead_allocations (tenant_id, overhead_entry_id, project_id, allocation_kind, amount)
     values ('99999999-9999-9999-9999-999999999999', (select id from pgtap_ov_entry_in_period), '90000000-0000-0000-0000-0000000000a2', 'allocation', 1)
  $$,
  'allocation exceeds shared overhead entry amount',
  'a raw INSERT cannot bypass the amount guard — the in-period entry is already fully allocated, so even 1 rupiah more is rejected'
);

-- Append-only: the shared private.block_audit_mutation() guard (reused
-- verbatim from Gate 0A, same fixed message every other append-only table in
-- this schema reports) blocks even an unrestricted-role UPDATE/DELETE
-- attempt — no UPDATE/DELETE grant exists for `authenticated` at all.
select throws_ok(
  $$ update public.shared_overhead_allocations set amount = 1 where id = (select id from pgtap_ov_future_allocation) $$,
  'access_audit_events is append-only: UPDATE not allowed',
  'shared_overhead_allocations rows cannot be updated, even by the unrestricted role'
);
select throws_ok(
  $$ delete from public.shared_overhead_allocations where id = (select id from pgtap_ov_future_allocation) $$,
  'access_audit_events is append-only: DELETE not allowed',
  'shared_overhead_allocations rows cannot be deleted, even by the unrestricted role'
);

select * from finish();

rollback;
