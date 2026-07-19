-- ADOP Phase 1 Gate 1C — pgTAP proof for the Shared Daily Cash Pool
-- Foundation: schema, one-pool-per-tenant/business_date, no vessel/project
-- reference on the pool header, owner/admin-only RPC mutation, server-computed
-- summary (opening/top-up/other-in/total_cash_out/closing formula),
-- append-only ledger with role-independent guards, reversal integrity
-- (same-tenant, original-only, one reversal max), and cross-tenant isolation.
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
  ('99999999-9999-9999-9999-999999999999', 'pgtap-cash-pool-tenant-g', 'PgTAP Cash Pool Tenant G', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pgtap-cash-pool-tenant-h', 'PgTAP Cash Pool Tenant H', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-9999-1111-0000-000000000001', 'authenticated', 'authenticated', 'owner-g@pgtap-cash.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-9999-1111-0000-000000000002', 'authenticated', 'authenticated', 'admin-g@pgtap-cash.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-9999-1111-0000-000000000003', 'authenticated', 'authenticated', 'reviewer-g@pgtap-cash.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-9999-1111-0000-000000000004', 'authenticated', 'authenticated', 'viewer-g@pgtap-cash.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '00000000-aaaa-1111-0000-000000000001', 'authenticated', 'authenticated', 'owner-h@pgtap-cash.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('90000000-1111-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', '00000000-9999-1111-0000-000000000001', 'active'),
  ('90000000-1111-0000-0000-000000000002', '99999999-9999-9999-9999-999999999999', '00000000-9999-1111-0000-000000000002', 'active'),
  ('90000000-1111-0000-0000-000000000003', '99999999-9999-9999-9999-999999999999', '00000000-9999-1111-0000-000000000003', 'active'),
  ('90000000-1111-0000-0000-000000000004', '99999999-9999-9999-9999-999999999999', '00000000-9999-1111-0000-000000000004', 'active'),
  ('a0000000-1111-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-aaaa-1111-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('90000000-1111-0000-0000-000000000001', 'owner'),
  ('90000000-1111-0000-0000-000000000002', 'admin'),
  ('90000000-1111-0000-0000-000000000003', 'reviewer'),
  ('90000000-1111-0000-0000-000000000004', 'viewer'),
  ('a0000000-1111-0000-0000-000000000001', 'owner');

-- =============================================================================
-- SCHEMA
-- =============================================================================

select has_table('public', 'cash_pools', 'public.cash_pools exists');
select has_table('public', 'cash_pool_entries', 'public.cash_pool_entries exists');
select has_view('public', 'cash_pool_daily_summary', 'public.cash_pool_daily_summary view exists');

select has_type('public', 'cash_pool_entry_type', 'cash_pool_entry_type enum exists');
select ok(
  (select array_agg(enumlabel::text order by enumsortorder) from pg_enum where enumtypid = 'public.cash_pool_entry_type'::regtype)
    = array['opening_cash', 'cash_top_up', 'other_cash_in'],
  'cash_pool_entry_type is exactly opening_cash/cash_top_up/other_cash_in'
);
select has_type('public', 'cash_pool_entry_kind', 'cash_pool_entry_kind enum exists');

select col_is_pk('public', 'cash_pools', 'id', 'cash_pools PK is id');
select col_is_pk('public', 'cash_pool_entries', 'id', 'cash_pool_entries PK is id');

select col_is_unique('public', 'cash_pools', array['tenant_id', 'business_date'], 'cash_pools (tenant_id, business_date) is unique — one pool per tenant per day');
select col_is_unique('public', 'cash_pools', array['id', 'tenant_id'], 'cash_pools (id, tenant_id) is unique — composite FK target');

select hasnt_column('public', 'cash_pools', 'vessel_id', 'cash_pools has no vessel_id — never a wallet per kapal');
select hasnt_column('public', 'cash_pools', 'vessel_project_id', 'cash_pools has no vessel_project_id');

select has_fk('public', 'cash_pool_entries', 'cash_pool_entries has a foreign key');
select col_not_null('public', 'cash_pool_entries', 'amount', 'cash_pool_entries.amount is not null');

select ok((select relrowsecurity from pg_class where oid = 'public.cash_pools'::regclass), 'RLS enabled on cash_pools');
select ok((select relrowsecurity from pg_class where oid = 'public.cash_pool_entries'::regclass), 'RLS enabled on cash_pool_entries');

select has_trigger('public', 'cash_pools', 'cash_pools_append_only', 'cash_pools has the append-only guard trigger');
select has_trigger('public', 'cash_pool_entries', 'cash_pool_entries_append_only', 'cash_pool_entries has the append-only guard trigger');
select has_trigger('public', 'cash_pool_entries', 'cash_pool_entries_enforce_reversal_integrity', 'cash_pool_entries has the reversal integrity guard trigger');

select ok(
  not has_table_privilege('authenticated', 'public.cash_pools', 'INSERT'),
  'authenticated has no INSERT grant on cash_pools — the RPC is the only creation path'
);
select ok(
  not has_table_privilege('authenticated', 'public.cash_pools', 'UPDATE'),
  'authenticated has no UPDATE grant on cash_pools'
);
select ok(
  not has_table_privilege('authenticated', 'public.cash_pools', 'DELETE'),
  'authenticated has no DELETE grant on cash_pools — hard delete is structurally impossible'
);
select ok(
  not has_table_privilege('authenticated', 'public.cash_pool_entries', 'INSERT'),
  'authenticated has no INSERT grant on cash_pool_entries — the RPC is the only write path'
);
select ok(
  not has_table_privilege('authenticated', 'public.cash_pool_entries', 'UPDATE'),
  'authenticated has no UPDATE grant on cash_pool_entries'
);
select ok(
  not has_table_privilege('authenticated', 'public.cash_pool_entries', 'DELETE'),
  'authenticated has no DELETE grant on cash_pool_entries'
);

select ok(
  has_function_privilege('authenticated', 'public.get_or_create_daily_cash_pool(uuid, date)', 'EXECUTE'),
  'authenticated can execute get_or_create_daily_cash_pool (internal role check gates it, not the grant)'
);
select ok(
  not has_function_privilege('anon', 'public.get_or_create_daily_cash_pool(uuid, date)', 'EXECUTE'),
  'anon cannot execute get_or_create_daily_cash_pool'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.get_or_create_daily_cash_pool(uuid, date)'::regprocedure),
  'get_or_create_daily_cash_pool is SECURITY DEFINER'
);
select ok(
  exists (
    select 1 from pg_proc, unnest(proconfig) as cfg
    where oid = 'public.get_or_create_daily_cash_pool(uuid, date)'::regprocedure
      and cfg = 'search_path=public, pg_temp'
  ),
  'get_or_create_daily_cash_pool has a fixed search_path'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.record_cash_pool_entry(uuid, public.cash_pool_entry_type, numeric, text)'::regprocedure),
  'record_cash_pool_entry is SECURITY DEFINER'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.reverse_cash_pool_entry(uuid, text)'::regprocedure),
  'reverse_cash_pool_entry is SECURITY DEFINER'
);

-- =============================================================================
-- GET-OR-CREATE — owner/admin only, idempotent, tenant_id not forgeable
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ select public.get_or_create_daily_cash_pool('99999999-9999-9999-9999-999999999999', '2031-03-01') $$,
  'owner G can create the tenant G pool for 2031-03-01'
);
select is(
  (select count(*)::int from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01'),
  1,
  'exactly one pool row exists for tenant G / 2031-03-01'
);
select results_eq(
  $$ select business_date, created_by from public.cash_pools
       where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01' $$,
  $$ values ('2031-03-01'::date, '00000000-9999-1111-0000-000000000001'::uuid) $$,
  'the pool is attributed to the creating owner, server-derived from auth.uid()'
);

-- Idempotent retry: calling again returns the same row, not a duplicate.
select is(
  (select (public.get_or_create_daily_cash_pool('99999999-9999-9999-9999-999999999999', '2031-03-01')).id),
  (select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01'),
  'get_or_create_daily_cash_pool is idempotent — repeated call returns the same pool id'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Admin G resolves to the same pool — same rights as owner.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-1111-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(
  (select (public.get_or_create_daily_cash_pool('99999999-9999-9999-9999-999999999999', '2031-03-01')).id),
  (select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01'),
  'admin G resolves to the same tenant G pool for 2031-03-01, not a new one'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- reviewer/viewer cannot create.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-1111-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.get_or_create_daily_cash_pool('99999999-9999-9999-9999-999999999999', '2031-03-02') $$,
  'not authorized to create or access daily cash pool',
  'reviewer G cannot create a daily cash pool'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-1111-0000-000000000004', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.get_or_create_daily_cash_pool('99999999-9999-9999-9999-999999999999', '2031-03-02') $$,
  'not authorized to create or access daily cash pool',
  'viewer G cannot create a daily cash pool'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Forged tenant_id: owner G has no owner/admin role in tenant H.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.get_or_create_daily_cash_pool('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2031-03-02') $$,
  'not authorized to create or access daily cash pool',
  'owner G cannot forge tenant_id to create a pool for tenant H'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.cash_pools where business_date = '2031-03-02'),
  0,
  'no pool was created for 2031-03-02 by any of the rejected attempts above'
);

-- Owner H creates their own, separate pool for the same business_date owner
-- G already used — cross-tenant, not shared.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.get_or_create_daily_cash_pool('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2031-03-01') $$,
  'owner H can create a separate tenant H pool for the same business_date (2031-03-01)'
);
reset role;
select set_config('request.jwt.claims', '', true);

select isnt(
  (select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01'),
  (select id from public.cash_pools where tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and business_date = '2031-03-01'),
  'tenant G and tenant H pools for the same business_date are different rows'
);

-- Captured while still unrestricted (RLS-bypassing) so the cross-tenant
-- checks below can address tenant G's pool/entries by id — owner H's own
-- session cannot see these rows via SELECT (RLS), so a live subquery under
-- their role would return null and mask "not authorized" behind a false
-- "not found".
create temporary table pgtap_cash_pool_g as
  select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01';
grant select on pgtap_cash_pool_g to authenticated;

-- =============================================================================
-- RECORD ENTRY — owner/admin only, amount > 0, tenant re-derived from the pool
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ select public.record_cash_pool_entry(
       (select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01'),
       'opening_cash', 50000000, 'saldo awal hari'
     ) $$,
  'owner G can record an opening_cash entry'
);
select lives_ok(
  $$ select public.record_cash_pool_entry(
       (select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01'),
       'cash_top_up', 10000000, null
     ) $$,
  'owner G can record a cash_top_up entry'
);
select lives_ok(
  $$ select public.record_cash_pool_entry(
       (select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01'),
       'other_cash_in', 1500000.50, null
     ) $$,
  'owner G can record an other_cash_in entry'
);

select throws_ok(
  $$ select public.record_cash_pool_entry(
       (select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01'),
       'other_cash_in', 0, null
     ) $$,
  'amount must be greater than zero',
  'a zero amount is rejected'
);
select throws_ok(
  $$ select public.record_cash_pool_entry(
       (select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01'),
       'other_cash_in', -100, null
     ) $$,
  'amount must be greater than zero',
  'a negative amount is rejected'
);

reset role;
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$ select opening_cash, cash_top_up, other_cash_in, total_cash_out, closing_cash
       from public.cash_pool_daily_summary
       where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01' $$,
  $$ values (50000000.00::numeric, 10000000.00::numeric, 1500000.50::numeric, 0.00::numeric, 61500000.50::numeric) $$,
  'the summary matches the canonical formula: closing = opening + top_up + other_in - total_cash_out(0)'
);

-- reviewer/viewer cannot record entries.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-1111-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.record_cash_pool_entry(
       (select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01'),
       'other_cash_in', 1, null
     ) $$,
  'not authorized to record daily cash pool entry',
  'reviewer G cannot record a cash pool entry'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Cross-tenant: owner H cannot record against tenant G's pool.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.record_cash_pool_entry(
       (select id from pgtap_cash_pool_g),
       'other_cash_in', 1, null
     ) $$,
  'not authorized to record daily cash pool entry',
  'owner H cannot record an entry against tenant G''s pool'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Captured while still unrestricted, same reasoning as pgtap_cash_pool_g
-- above — needed for the cross-tenant reversal check further down.
create temporary table pgtap_cash_pool_g_opening_entry as
  select id from public.cash_pool_entries
    where pool_id = (select id from pgtap_cash_pool_g)
      and entry_type = 'opening_cash' and entry_kind = 'entry';
grant select on pgtap_cash_pool_g_opening_entry to authenticated;

-- =============================================================================
-- REVERSAL — same-tenant, original-only, one reversal max
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ select public.reverse_cash_pool_entry(
       (select id from public.cash_pool_entries
          where pool_id = (select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01')
            and entry_type = 'cash_top_up' and entry_kind = 'entry'),
       'salah input nominal top up'
     ) $$,
  'owner G can reverse the cash_top_up entry'
);

reset role;
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$ select cash_top_up, closing_cash from public.cash_pool_daily_summary
       where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01' $$,
  $$ values (0.00::numeric, 51500000.50::numeric) $$,
  'after reversal, cash_top_up drops out of the summary and closing_cash reflects it'
);
select is(
  (select count(*)::int from public.cash_pool_entries
     where pool_id = (select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01')),
  4,
  'the original cash_top_up row still exists — reversal added a row, deleted nothing'
);

select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select public.reverse_cash_pool_entry(
       (select id from public.cash_pool_entries
          where pool_id = (select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01')
            and entry_type = 'cash_top_up' and entry_kind = 'entry'),
       'coba reverse dua kali'
     ) $$,
  'cash pool entry already reversed',
  'the same entry cannot be reversed twice'
);
select throws_ok(
  $$ select public.reverse_cash_pool_entry(
       (select id from public.cash_pool_entries
          where pool_id = (select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01')
            and entry_kind = 'reversal'),
       'coba reverse hasil reversal'
     ) $$,
  'only an original entry can be reversed',
  'a reversal row itself cannot be reversed'
);
select throws_ok(
  $$ select public.reverse_cash_pool_entry(
       (select id from public.cash_pool_entries
          where pool_id = (select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01')
            and entry_type = 'opening_cash' and entry_kind = 'entry'),
       ''
     ) $$,
  'reversal reason is required',
  'an empty reversal reason is rejected'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- Cross-tenant reversal rejected.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.reverse_cash_pool_entry(
       (select id from pgtap_cash_pool_g_opening_entry),
       'lintas tenant'
     ) $$,
  'not authorized to reverse daily cash pool entry',
  'owner H cannot reverse an entry belonging to tenant G'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- CROSS-TENANT READ ISOLATION
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is_empty(
  $$ select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' $$,
  'owner H cannot list tenant G''s cash pools'
);
select is_empty(
  $$ select id from public.cash_pool_entries where tenant_id = '99999999-9999-9999-9999-999999999999' $$,
  'owner H cannot read tenant G''s cash pool entries'
);
select is_empty(
  $$ select pool_id from public.cash_pool_daily_summary where tenant_id = '99999999-9999-9999-9999-999999999999' $$,
  'owner H cannot read tenant G''s cash pool summary'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- HARD DELETE / MUTATION — structurally impossible, role-independent
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', '00000000-9999-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ delete from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' $$,
  '42501',
  null,
  'owner G cannot hard-delete a cash pool — no DELETE grant'
);
select throws_ok(
  $$ update public.cash_pool_entries set amount = 1 where tenant_id = '99999999-9999-9999-9999-999999999999' $$,
  '42501',
  null,
  'owner G cannot update a cash pool entry — no UPDATE grant'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Role-independent: even the unrestricted fixture-setup role cannot mutate,
-- proving the append-only guarantee is a real trigger, not just a grant.
reset role;
select throws_ok(
  $$ delete from public.cash_pool_entries
       where pool_id = (select id from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01') $$,
  'access_audit_events is append-only: DELETE not allowed',
  'DELETE on cash_pool_entries is blocked at the database level, regardless of role'
);
select throws_ok(
  $$ delete from public.cash_pools where tenant_id = '99999999-9999-9999-9999-999999999999' and business_date = '2031-03-01' $$,
  'access_audit_events is append-only: DELETE not allowed',
  'DELETE on cash_pools is blocked at the database level, regardless of role'
);

select * from finish();

rollback;
