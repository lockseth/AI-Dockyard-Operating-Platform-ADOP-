-- ADOP — pgTAP proof for 20260807000000_first_owner_bootstrap.sql:
-- resolve_first_owner_bootstrap_token, claim_first_owner_bootstrap.
--
-- Self-contained: creates its own fixtures (tenant prefix '9') and rolls
-- back at the end. Token hashes here are deterministic test-only sha256
-- hex digests of fixed literal strings (never real tokens) — the app-side
-- hashing (Node crypto) is verified separately in token.test.ts; this file
-- only proves the RPC contract against whatever hash it is given.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('91111111-1111-1111-1111-111111111111', 'pgtap-fob-tenant-91', 'PgTAP FOB Tenant G1 (pending)', 'active'),
  ('92222222-2222-2222-2222-222222222222', 'pgtap-fob-tenant-92', 'PgTAP FOB Tenant G2 (already owned)', 'active'),
  ('93333333-3333-3333-3333-333333333333', 'pgtap-fob-tenant-93', 'PgTAP FOB Tenant G3 (expired)', 'active'),
  ('94444444-4444-4444-4444-444444444444', 'pgtap-fob-tenant-94', 'PgTAP FOB Tenant G4 (revoked)', 'active'),
  ('95555555-5555-5555-5555-555555555555', 'pgtap-fob-tenant-95', 'PgTAP FOB Tenant G5 (claim happy path)', 'active'),
  ('96666666-6666-6666-6666-666666666666', 'pgtap-fob-tenant-96', 'PgTAP FOB Tenant G6 (email mismatch)', 'active'),
  ('97777777-7777-7777-7777-777777777777', 'pgtap-fob-tenant-97', 'PgTAP FOB Tenant G7 (race: owner appears)', 'active');

-- 92 already has an active owner — resolve/claim must fail closed on it.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', '90000002-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'existing-owner-92@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '90000005-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'claimant-95@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '90000005-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'someone-else@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '90000006-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'wrong-email-holder@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '90000007-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'claimant-97@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', '90000007-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'racing-owner-97@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('9a000002-0000-0000-0000-000000000001', '92222222-2222-2222-2222-222222222222', '90000002-0000-0000-0000-000000000001', 'active'),
  ('9a000007-0000-0000-0000-000000000002', '97777777-7777-7777-7777-777777777777', '90000007-0000-0000-0000-000000000002', 'active');

insert into public.membership_roles (membership_id, role) values
  ('9a000002-0000-0000-0000-000000000001', 'owner'),
  ('9a000007-0000-0000-0000-000000000002', 'owner');

insert into public.first_owner_bootstrap_tokens (id, tenant_id, email, token_hash, status, expires_at) values
  ('9b000000-0000-0000-0000-000000000001', '91111111-1111-1111-1111-111111111111', 'pending-91@pgtap.local', 'hash-pending-91', 'pending', now() + interval '1 day'),
  ('9b000000-0000-0000-0000-000000000002', '92222222-2222-2222-2222-222222222222', 'newcomer-92@pgtap.local', 'hash-already-owned-92', 'pending', now() + interval '1 day'),
  ('9b000000-0000-0000-0000-000000000003', '93333333-3333-3333-3333-333333333333', 'expired-93@pgtap.local', 'hash-expired-93', 'pending', now() - interval '1 hour'),
  ('9b000000-0000-0000-0000-000000000004', '94444444-4444-4444-4444-444444444444', 'revoked-94@pgtap.local', 'hash-revoked-94', 'revoked', now() + interval '1 day'),
  ('9b000000-0000-0000-0000-000000000005', '95555555-5555-5555-5555-555555555555', 'claimant-95@pgtap.local', 'hash-claim-happy-95', 'pending', now() + interval '1 day'),
  ('9b000000-0000-0000-0000-000000000006', '96666666-6666-6666-6666-666666666666', 'intended-96@pgtap.local', 'hash-mismatch-96', 'pending', now() + interval '1 day'),
  ('9b000000-0000-0000-0000-000000000007', '97777777-7777-7777-7777-777777777777', 'claimant-97@pgtap.local', 'hash-race-97', 'pending', now() + interval '1 day');

-- =============================================================================
-- Privilege surface: only service_role may ever call these, on this table
-- =============================================================================

set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '90000005-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select * from public.resolve_first_owner_bootstrap_token('hash-pending-91') $$,
  '42501',
  null,
  'authenticated cannot execute resolve_first_owner_bootstrap_token'
);

select throws_ok(
  $$ select * from public.claim_first_owner_bootstrap('hash-pending-91', '90000005-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'authenticated cannot execute claim_first_owner_bootstrap'
);

select throws_ok(
  $$ select 1 from public.first_owner_bootstrap_tokens limit 1 $$,
  '42501',
  null,
  'authenticated cannot select first_owner_bootstrap_tokens directly'
);

reset role;
select set_config('request.jwt.claims', '', true);

set role service_role;

-- =============================================================================
-- resolve_first_owner_bootstrap_token
-- =============================================================================

select results_eq(
  $$ select token_id, tenant_id, email from public.resolve_first_owner_bootstrap_token('hash-pending-91') $$,
  $$ values ('9b000000-0000-0000-0000-000000000001'::uuid, '91111111-1111-1111-1111-111111111111'::uuid, 'pending-91@pgtap.local'::text) $$,
  'resolve returns the pending token for a valid, unclaimed, unexpired hash'
);

select throws_ok(
  $$ select * from public.resolve_first_owner_bootstrap_token('hash-does-not-exist') $$,
  'P0002',
  null,
  'resolve rejects an unknown token hash'
);

select throws_ok(
  $$ select * from public.resolve_first_owner_bootstrap_token('hash-expired-93') $$,
  'P0002',
  null,
  'resolve rejects an expired token'
);

select throws_ok(
  $$ select * from public.resolve_first_owner_bootstrap_token('hash-revoked-94') $$,
  'P0002',
  null,
  'resolve rejects a revoked token'
);

select throws_ok(
  $$ select * from public.resolve_first_owner_bootstrap_token('hash-already-owned-92') $$,
  'P0010',
  null,
  'resolve fails closed when the tenant already has an active owner'
);

-- =============================================================================
-- claim_first_owner_bootstrap — failure paths (none of these may write)
-- =============================================================================

select throws_ok(
  $$ select * from public.claim_first_owner_bootstrap('hash-does-not-exist', '90000005-0000-0000-0000-000000000001') $$,
  'P0002',
  null,
  'claim rejects an unknown token hash'
);

select throws_ok(
  $$ select * from public.claim_first_owner_bootstrap('hash-expired-93', '90000005-0000-0000-0000-000000000001') $$,
  'P0002',
  null,
  'claim rejects an expired token'
);

select throws_ok(
  $$ select * from public.claim_first_owner_bootstrap('hash-revoked-94', '90000005-0000-0000-0000-000000000001') $$,
  'P0002',
  null,
  'claim rejects a revoked token'
);

select throws_ok(
  $$ select * from public.claim_first_owner_bootstrap('hash-mismatch-96', '90000006-0000-0000-0000-000000000001') $$,
  'P0011',
  null,
  'claim rejects when the created auth user email does not match the token email'
);

select is_empty(
  $$ select 1 from public.tenant_memberships where tenant_id = '96666666-6666-6666-6666-666666666666' $$,
  'email-mismatch claim attempt created no membership (rolled back)'
);

select throws_ok(
  $$ select * from public.claim_first_owner_bootstrap('hash-race-97', '90000007-0000-0000-0000-000000000001') $$,
  'P0010',
  null,
  'claim fails closed when the tenant already has an active owner (race re-check)'
);

select is(
  (select status from public.first_owner_bootstrap_tokens where id = '9b000000-0000-0000-0000-000000000007'),
  'pending'::public.first_owner_bootstrap_status,
  'a claim rejected by the owner-race re-check leaves the token pending (no side effect) for manual operator review'
);

-- =============================================================================
-- claim_first_owner_bootstrap — happy path + replay/idempotency + duplicate rejection
-- =============================================================================

select results_eq(
  $$ select count(*)::int from public.tenant_memberships where tenant_id = '95555555-5555-5555-5555-555555555555' $$,
  $$ values (0) $$,
  'no membership exists yet for the happy-path tenant before claim'
);

select lives_ok(
  $$ select * from public.claim_first_owner_bootstrap('hash-claim-happy-95', '90000005-0000-0000-0000-000000000001') $$,
  'happy-path claim succeeds'
);

select results_eq(
  $$ select tm.status, mr.role
       from public.tenant_memberships tm
       join public.membership_roles mr on mr.membership_id = tm.id
      where tm.tenant_id = '95555555-5555-5555-5555-555555555555'
        and tm.user_id = '90000005-0000-0000-0000-000000000001' $$,
  $$ values ('active'::public.membership_status, 'owner'::public.tenant_role) $$,
  'claim produced exactly one active owner membership for the claimant'
);

select is(
  (select count(*)::int from public.tenant_memberships where tenant_id = '95555555-5555-5555-5555-555555555555'),
  1,
  'exactly one membership exists for the tenant after claim'
);

select is(
  (select status from public.first_owner_bootstrap_tokens where id = '9b000000-0000-0000-0000-000000000005'),
  'claimed'::public.first_owner_bootstrap_status,
  'token is marked claimed'
);

select is(
  (select claimed_by from public.first_owner_bootstrap_tokens where id = '9b000000-0000-0000-0000-000000000005'),
  '90000005-0000-0000-0000-000000000001'::uuid,
  'token records the claiming user'
);

select results_eq(
  $$ select action from public.access_audit_events
      where tenant_id = '95555555-5555-5555-5555-555555555555' and entity_type = 'tenant'
        and action = 'first_owner_bootstrap_claimed' $$,
  $$ values ('first_owner_bootstrap_claimed'::text) $$,
  'claim wrote its own audit event'
);

select results_eq(
  $$ select action from public.access_audit_events
      where tenant_id = '95555555-5555-5555-5555-555555555555' and entity_type = 'tenant_membership'
        and action = 'member_joined' $$,
  $$ values ('member_joined'::text) $$,
  'the pre-existing automatic membership audit trigger still fired for the claim-created membership'
);

select results_eq(
  $$ select tenant_id, membership_id from public.claim_first_owner_bootstrap('hash-claim-happy-95', '90000005-0000-0000-0000-000000000001') $$,
  $$ select '95555555-5555-5555-5555-555555555555'::uuid, tm.id
      from public.tenant_memberships tm
     where tm.tenant_id = '95555555-5555-5555-5555-555555555555' and tm.user_id = '90000005-0000-0000-0000-000000000001' $$,
  'replaying the same claim (same token, same user) is idempotent and returns the same membership'
);

select is(
  (select count(*)::int from public.tenant_memberships where tenant_id = '95555555-5555-5555-5555-555555555555'),
  1,
  'replaying the claim did not create a second membership'
);

select throws_ok(
  $$ select * from public.claim_first_owner_bootstrap('hash-claim-happy-95', '90000005-0000-0000-0000-000000000002') $$,
  'P0012',
  null,
  'a claimed token cannot be reclaimed by a different user id'
);

-- =============================================================================
-- AUDIT — no raw token/hash value ever stored in the audit trail
-- =============================================================================

select ok(
  not exists (
    select 1 from public.access_audit_events
    where action = 'first_owner_bootstrap_claimed'
      and (before_data::text ilike '%hash-%' or after_data::text ilike '%hash-%')
  ),
  'first_owner_bootstrap_claimed audit events never contain the token hash — only the token row id'
);

select * from finish();

rollback;
