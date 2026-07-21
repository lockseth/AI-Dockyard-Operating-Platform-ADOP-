-- ADOP — Opening Cash Atomic Duplicate Guard pgTAP proof (Locked UI &
-- Operational Safety Revision, Gate 1).
--
-- Proves: a second opening_cash entry for the same pool is rejected at the
-- database level (not just the UI), a reversed opening_cash entry re-opens
-- the guard for a corrected repost, and cash_top_up/other_cash_in are
-- unaffected (still allow multiple entries per pool).
--
-- Self-contained: creates its own fixtures, rolls back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('b1111111-1111-4111-8111-111111111111', 'pgtap-opening-cash-guard-tenant', 'PgTAP Opening Cash Guard Tenant', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-b111-1111-0000-000000000001', 'authenticated', 'authenticated', 'owner-opening-guard@pgtap-cash.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('90000000-2222-0000-0000-000000000001', 'b1111111-1111-4111-8111-111111111111', '00000000-b111-1111-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('90000000-2222-0000-0000-000000000001', 'owner');

select set_config('request.jwt.claims', json_build_object('sub', '00000000-b111-1111-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

-- =============================================================================
-- Setup: create the pool and post the first opening_cash entry
-- =============================================================================

select (public.get_or_create_daily_cash_pool('b1111111-1111-4111-8111-111111111111'::uuid, '2026-08-01'::date)).id as pool_id \gset

select ok(
  (select opening_cash_posted from public.cash_pools where id = :'pool_id'::uuid) = false,
  'opening_cash_posted starts false on a freshly created pool'
);

select lives_ok(
  format($$ select public.record_cash_pool_entry(%L::uuid, 'opening_cash', 500000, 'first opening cash') $$, :'pool_id'),
  'first opening_cash entry for the pool succeeds'
);

select ok(
  (select opening_cash_posted from public.cash_pools where id = :'pool_id'::uuid) = true,
  'opening_cash_posted flips true after the first opening_cash entry'
);

-- =============================================================================
-- Duplicate opening_cash is rejected atomically
-- =============================================================================

select throws_ok(
  format($$ select public.record_cash_pool_entry(%L::uuid, 'opening_cash', 750000, 'duplicate opening cash attempt') $$, :'pool_id'),
  'P0001', 'opening cash already posted for this pool',
  'a second opening_cash entry for the same pool is rejected'
);

select is(
  (select count(*)::int from public.cash_pool_entries
   where pool_id = :'pool_id'::uuid and entry_type = 'opening_cash' and entry_kind = 'entry'),
  1,
  'exactly one opening_cash entry row exists after the rejected duplicate attempt'
);

-- =============================================================================
-- cash_top_up/other_cash_in are unaffected — still allow multiple entries
-- =============================================================================

select lives_ok(
  format($$ select public.record_cash_pool_entry(%L::uuid, 'cash_top_up', 100000, 'top up 1') $$, :'pool_id'),
  'first cash_top_up entry succeeds'
);

select lives_ok(
  format($$ select public.record_cash_pool_entry(%L::uuid, 'cash_top_up', 50000, 'top up 2') $$, :'pool_id'),
  'a second cash_top_up entry for the same pool still succeeds — guard is opening_cash-only'
);

-- =============================================================================
-- Reversing the opening_cash entry re-opens the guard for a corrected repost
-- =============================================================================

select id as opening_entry_id from public.cash_pool_entries
  where pool_id = :'pool_id'::uuid and entry_type = 'opening_cash' and entry_kind = 'entry' \gset

select lives_ok(
  format($$ select public.reverse_cash_pool_entry(%L::uuid, 'correcting a data-entry mistake') $$, :'opening_entry_id'),
  'reversing the opening_cash entry succeeds'
);

select ok(
  (select opening_cash_posted from public.cash_pools where id = :'pool_id'::uuid) = false,
  'opening_cash_posted resets to false after the entry is reversed'
);

select lives_ok(
  format($$ select public.record_cash_pool_entry(%L::uuid, 'opening_cash', 600000, 'corrected opening cash') $$, :'pool_id'),
  'a corrected opening_cash entry can be posted after the original was reversed'
);

select throws_ok(
  format($$ select public.record_cash_pool_entry(%L::uuid, 'opening_cash', 900000, 'second duplicate after correction') $$, :'pool_id'),
  'P0001', 'opening cash already posted for this pool',
  'the guard re-engages once the corrected entry is posted'
);

select * from finish();

rollback;
