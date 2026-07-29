-- ADOP — pgTAP proof for 20260729030000_assistant_identity_pairing.sql
-- (Gate 6J-B, Identity Pairing & Client Verification Foundation).
--
-- Self-contained: creates its own fixtures (tenant prefix 'g') and rolls
-- back at the end. Mirrors owner_direct_user_provisioning.test.sql's
-- set_config/reset role pattern for `authenticated`, and
-- owner_control_notification_outbox.test.sql's `set local role
-- service_role` pattern for the two complete_* RPCs.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('a1111111-1111-1111-1111-111111111111', 'pgtap-aip-tenant-g1', 'PgTAP AIP Tenant G1', 'active'),
  ('a2222222-2222-2222-2222-222222222222', 'pgtap-aip-tenant-g2', 'PgTAP AIP Tenant G2', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', 'a0000001-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-g1@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'a0000001-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'admin-g1@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'a0000001-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'reviewer-g1@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'a0000001-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'viewer-g1@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'a0000001-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'second-admin-g1@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'a0000002-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-g2@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('aa000001-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'a0000001-0000-0000-0000-000000000001', 'active'),
  ('aa000001-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', 'a0000001-0000-0000-0000-000000000002', 'active'),
  ('aa000001-0000-0000-0000-000000000003', 'a1111111-1111-1111-1111-111111111111', 'a0000001-0000-0000-0000-000000000003', 'active'),
  ('aa000001-0000-0000-0000-000000000004', 'a1111111-1111-1111-1111-111111111111', 'a0000001-0000-0000-0000-000000000004', 'active'),
  ('aa000001-0000-0000-0000-000000000005', 'a1111111-1111-1111-1111-111111111111', 'a0000001-0000-0000-0000-000000000005', 'active'),
  ('aa000002-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222', 'a0000002-0000-0000-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('aa000001-0000-0000-0000-000000000001', 'owner'),
  ('aa000001-0000-0000-0000-000000000002', 'admin'),
  ('aa000001-0000-0000-0000-000000000003', 'reviewer'),
  ('aa000001-0000-0000-0000-000000000004', 'viewer'),
  ('aa000001-0000-0000-0000-000000000005', 'admin'),
  ('aa000002-0000-0000-0000-000000000001', 'owner');

insert into public.clients (id, tenant_id, display_name, created_by) values
  ('ac000001-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'PgTAP AIP Client G1', 'a0000001-0000-0000-0000-000000000001');

insert into public.client_contacts (id, tenant_id, client_id, full_name, whatsapp_number, status) values
  ('ad000001-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'ac000001-0000-0000-0000-000000000001', 'Contact A (active, has number)', '+628002220001', 'active'),
  ('ad000001-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', 'ac000001-0000-0000-0000-000000000001', 'Contact B (active, no number)', null, 'active'),
  ('ad000001-0000-0000-0000-000000000003', 'a1111111-1111-1111-1111-111111111111', 'ac000001-0000-0000-0000-000000000001', 'Contact C (inactive)', '+628002220003', 'inactive'),
  ('ad000001-0000-0000-0000-000000000004', 'a1111111-1111-1111-1111-111111111111', 'ac000001-0000-0000-0000-000000000001', 'Contact D (ambiguous 1)', '+628002220005', 'active'),
  ('ad000001-0000-0000-0000-000000000005', 'a1111111-1111-1111-1111-111111111111', 'ac000001-0000-0000-0000-000000000001', 'Contact E (ambiguous 2)', '+628002220005', 'active'),
  ('ad000001-0000-0000-0000-000000000006', 'a1111111-1111-1111-1111-111111111111', 'ac000001-0000-0000-0000-000000000001', 'Contact F (duplicate number target)', '+628002220006', 'active');

-- =============================================================================
-- SECTION 1 — assistant_issue_pairing_challenge
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select * from public.assistant_issue_pairing_challenge('a1111111-1111-1111-1111-111111111111', 'whatsapp', '+628001119001') $$,
  '42501', null,
  'reviewer cannot issue a pairing challenge'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select * from public.assistant_issue_pairing_challenge('a1111111-1111-1111-1111-111111111111', 'whatsapp', '+628001119001') $$,
  '42501', null,
  'viewer cannot issue a pairing challenge'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'a0000002-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select * from public.assistant_issue_pairing_challenge('a1111111-1111-1111-1111-111111111111', 'whatsapp', '+628001119001') $$,
  '42501', null,
  'STOP: owner of a different tenant (G2) cannot issue a pairing challenge for G1'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select * from public.assistant_issue_pairing_challenge('a1111111-1111-1111-1111-111111111111', 'telegram', '+628001119001') $$,
  '22023', null,
  'unsupported channel is rejected'
);
select throws_ok(
  $$ select * from public.assistant_issue_pairing_challenge('a1111111-1111-1111-1111-111111111111', 'whatsapp', '0812-not-e164') $$,
  '22023', null,
  'non-E.164 address is rejected'
);

select identity_id as owner_g1_v_identity_id, challenge_code as owner_g1_v_code, challenge_expires_at as owner_g1_v_expires
  from public.assistant_issue_pairing_challenge('a1111111-1111-1111-1111-111111111111', 'whatsapp', '+628001119003') \gset

select ok(:'owner_g1_v_identity_id' is not null, 'owner self-issue returns an identity_id');
select is(length(:'owner_g1_v_code'), 6, 'the plaintext challenge code is 6 characters');

select results_eq(
  $$ select status, challenge_attempt_count from public.assistant_channel_identities where id = '$$ || :'owner_g1_v_identity_id' || $$' $$,
  $$ values ('pending'::public.assistant_channel_identity_status, 0) $$,
  'the new row is pending with a zero attempt count'
);

select results_eq(
  format($$ select challenge_expires_at = (now() + interval '10 minutes') from public.assistant_channel_identities where id = %L $$, :'owner_g1_v_identity_id'),
  $$ values (true) $$,
  'TTL is exactly 10 minutes, computed from the same transaction-frozen now()'
);

-- challenge_digest is not SELECT-granted to `authenticated` at all (§4/§7 of
-- the migration) — reset to the unrestricted test-runner role to inspect it
-- directly, same as any other privileged-column assertion in this suite.
reset role;

select results_eq(
  format($$ select challenge_digest = encode(extensions.digest(%L, 'sha256'), 'hex')
       from public.assistant_channel_identities where id = %L $$, :'owner_g1_v_code', :'owner_g1_v_identity_id'),
  $$ values (true) $$,
  'the stored digest matches sha256(plaintext code)'
);

select isnt(
  (select challenge_digest from public.assistant_channel_identities where id = :'owner_g1_v_identity_id'),
  :'owner_g1_v_code',
  'the stored digest is never the plaintext code itself'
);

-- admin self-issue (separate identity)
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select identity_id as admin_g1_v_identity_id, challenge_code as admin_g1_v_code
  from public.assistant_issue_pairing_challenge('a1111111-1111-1111-1111-111111111111', 'whatsapp', '+628001110002') \gset

select ok(:'admin_g1_v_identity_id' is not null, 'admin self-issue also succeeds');

-- Re-issuing for the SAME (tenant, user, channel) invalidates the earlier pending row.
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);

select identity_id as admin_g1_v_identity_id_2
  from public.assistant_issue_pairing_challenge('a1111111-1111-1111-1111-111111111111', 'whatsapp', '+628001110099') \gset

select results_eq(
  format($$ select status, revoked_reason from public.assistant_channel_identities where id = %L $$, :'admin_g1_v_identity_id'),
  $$ values ('revoked'::public.assistant_channel_identity_status, 'superseded_by_new_challenge') $$,
  'the earlier pending challenge for the same identity is superseded on re-issue'
);
select isnt(:'admin_g1_v_identity_id'::uuid, :'admin_g1_v_identity_id_2'::uuid, 'a re-issue creates a brand-new row, not a reused one');

reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- SECTION 2 — assistant_complete_pairing (service_role only)
-- =============================================================================

select ok(
  not has_function_privilege('authenticated', 'public.assistant_complete_pairing(text, text, text)', 'EXECUTE'),
  'authenticated cannot execute assistant_complete_pairing'
);
select ok(
  has_function_privilege('service_role', 'public.assistant_complete_pairing(text, text, text)', 'EXECUTE'),
  'service_role can execute assistant_complete_pairing'
);

-- Fresh pending row for the lockout scenario.
select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select challenge_code as lockout_v_code
  from public.assistant_issue_pairing_challenge('a1111111-1111-1111-1111-111111111111', 'whatsapp', '+628001119010') \gset
reset role;
select set_config('request.jwt.claims', '', true);

set local role service_role;

select results_eq(
  $$ select outcome from public.assistant_complete_pairing('whatsapp', '+628001119010', 'WRONGWRONG') $$,
  $$ values ('invalid_code'::text) $$,
  'a wrong code returns outcome invalid_code'
);
select results_eq(
  $$ select challenge_attempt_count from public.assistant_channel_identities where normalized_address = '+628001119010' and status = 'pending' $$,
  $$ values (1) $$,
  'the attempt counter increment SURVIVES the failed call (not rolled back by an exception, since none is raised)'
);

-- 4 more wrong attempts bring the count to 5 (locked).
select public.assistant_complete_pairing('whatsapp', '+628001119010', 'WRONG2');
select public.assistant_complete_pairing('whatsapp', '+628001119010', 'WRONG3');
select public.assistant_complete_pairing('whatsapp', '+628001119010', 'WRONG4');
select public.assistant_complete_pairing('whatsapp', '+628001119010', 'WRONG5');

select results_eq(
  $$ select challenge_attempt_count from public.assistant_channel_identities where normalized_address = '+628001119010' and status = 'pending' $$,
  $$ values (5) $$,
  'five wrong attempts accumulate to exactly 5'
);

select results_eq(
  format($$ select outcome from public.assistant_complete_pairing('whatsapp', '+628001119010', %L) $$, :'lockout_v_code'),
  $$ values ('locked'::text) $$,
  'the CORRECT code is refused once locked out (5 prior wrong attempts)'
);

reset role;

-- not_found: no pending row at all for this address.
set local role service_role;
select results_eq(
  $$ select outcome from public.assistant_complete_pairing('whatsapp', '+628001119099', 'ANYCODE') $$,
  $$ values ('not_found'::text) $$,
  'completing against an address with no pending challenge returns not_found'
);
reset role;

-- Expired challenge.
select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select challenge_code as expired_v_code
  from public.assistant_issue_pairing_challenge('a1111111-1111-1111-1111-111111111111', 'whatsapp', '+628001119002') \gset
reset role;
select set_config('request.jwt.claims', '', true);

update public.assistant_channel_identities set challenge_expires_at = now() - interval '1 minute'
  where normalized_address = '+628001119002' and status = 'pending';

set local role service_role;
select results_eq(
  format($$ select outcome from public.assistant_complete_pairing('whatsapp', '+628001119002', %L) $$, :'expired_v_code'),
  $$ values ('expired'::text) $$,
  'an expired challenge is rejected even with the correct code'
);
reset role;

-- Valid completion (case-insensitive code), then single-use replay.
select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select identity_id as verified_v_identity_id, challenge_code as verified_v_code
  from public.assistant_issue_pairing_challenge('a1111111-1111-1111-1111-111111111111', 'whatsapp', '+628001119003') \gset
reset role;
select set_config('request.jwt.claims', '', true);

set local role service_role;

select results_eq(
  format($$ select outcome, identity_id, user_id from public.assistant_complete_pairing('whatsapp', '+628001119003', %L) $$, lower(:'verified_v_code')),
  format($$ values ('verified'::text, %L::uuid, 'a0000001-0000-0000-0000-000000000001'::uuid) $$, :'verified_v_identity_id'),
  'a correct (lowercase-typed) code completes pairing and returns the identity/user'
);

select results_eq(
  format($$ select status, challenge_digest, challenge_expires_at from public.assistant_channel_identities where id = %L $$, :'verified_v_identity_id'),
  $$ values ('verified'::public.assistant_channel_identity_status, null::text, null::timestamptz) $$,
  'the row is verified and the challenge digest/expiry are cleared'
);

select results_eq(
  format($$ select outcome from public.assistant_complete_pairing('whatsapp', '+628001119003', %L) $$, :'verified_v_code'),
  $$ values ('not_found'::text) $$,
  'STOP: replaying the same code again is rejected as not_found (single-use, idempotent-safe — not a second verification)'
);
reset role;

-- Ambiguous: owner-g1 (already verified on +628001119003 above) tries a
-- second address — fails closed, and the row stays pending (not silently
-- replacing the existing verified binding).
select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select identity_id as ambig_user_v_identity_id, challenge_code as ambig_user_v_code
  from public.assistant_issue_pairing_challenge('a1111111-1111-1111-1111-111111111111', 'whatsapp', '+628001119004') \gset
reset role;
select set_config('request.jwt.claims', '', true);

set local role service_role;
select results_eq(
  format($$ select outcome from public.assistant_complete_pairing('whatsapp', '+628001119004', %L) $$, :'ambig_user_v_code'),
  $$ values ('ambiguous_binding'::text) $$,
  'STOP: a second verified address for the same (tenant,user,channel) is refused — one active verified binding per identity'
);
reset role;
select results_eq(
  format($$ select status from public.assistant_channel_identities where id = %L $$, :'ambig_user_v_identity_id'),
  $$ values ('pending'::public.assistant_channel_identity_status) $$,
  'the ambiguous attempt leaves the row pending, not silently verified'
);

-- Ambiguous: admin-g1 tries to verify the SAME address owner-g1 already
-- holds verified, within the same tenant.
select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select challenge_code as ambig_addr_v_code
  from public.assistant_issue_pairing_challenge('a1111111-1111-1111-1111-111111111111', 'whatsapp', '+628001119003') \gset
reset role;
select set_config('request.jwt.claims', '', true);

set local role service_role;
select results_eq(
  format($$ select outcome from public.assistant_complete_pairing('whatsapp', '+628001119003', %L) $$, :'ambig_addr_v_code'),
  $$ values ('ambiguous_binding'::text) $$,
  'STOP: a different user verifying an address already verified-active for someone else in the same tenant is refused'
);
reset role;

-- Membership/role no longer valid at completion time.
select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000005', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select identity_id as membership_v_identity_id, challenge_code as membership_v_code
  from public.assistant_issue_pairing_challenge('a1111111-1111-1111-1111-111111111111', 'whatsapp', '+628001119005') \gset
reset role;
select set_config('request.jwt.claims', '', true);

update public.tenant_memberships set status = 'suspended' where id = 'aa000001-0000-0000-0000-000000000005';

set local role service_role;
select results_eq(
  format($$ select outcome from public.assistant_complete_pairing('whatsapp', '+628001119005', %L) $$, :'membership_v_code'),
  $$ values ('membership_invalid'::text) $$,
  'a suspended membership at completion time is refused even with the correct code'
);
reset role;
select results_eq(
  format($$ select status, revoked_reason from public.assistant_channel_identities where id = %L $$, :'membership_v_identity_id'),
  $$ values ('revoked'::public.assistant_channel_identity_status, 'membership_or_role_no_longer_valid') $$,
  'the row is auto-revoked when membership/role is no longer valid at completion'
);

-- Reactivate for the rest of the suite (harmless, not asserted further).
update public.tenant_memberships set status = 'active' where id = 'aa000001-0000-0000-0000-000000000005';

-- DB-level constraint proof (not just application logic): a second verified
-- row for the same tenant+channel+address, or the same tenant+user+channel,
-- is rejected by the partial unique index itself.
select throws_ok(
  $$ insert into public.assistant_channel_identities (tenant_id, user_id, channel, normalized_address, status, verified_at)
       values ('a1111111-1111-1111-1111-111111111111', 'a0000001-0000-0000-0000-000000000005', 'whatsapp', '+628001119003', 'verified', now()) $$,
  '23505', null,
  'DB constraint: a second verified row for the same tenant+channel+address is rejected'
);
select throws_ok(
  $$ insert into public.assistant_channel_identities (tenant_id, user_id, channel, normalized_address, status, verified_at)
       values ('a1111111-1111-1111-1111-111111111111', 'a0000001-0000-0000-0000-000000000001', 'whatsapp', '+628001119098', 'verified', now()) $$,
  '23505', null,
  'DB constraint: a second verified row for the same tenant+user+channel is rejected'
);

-- =============================================================================
-- SECTION 3 — assistant_revoke_pairing
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select identity_id as revoke_self_v_id from public.assistant_issue_pairing_challenge('a1111111-1111-1111-1111-111111111111', 'whatsapp', '+628001119006') \gset

select results_eq(
  format($$ select status from public.assistant_revoke_pairing(%L, 'no longer needed') $$, :'revoke_self_v_id'),
  $$ values ('revoked'::public.assistant_channel_identity_status) $$,
  'a user can revoke their own pairing binding'
);

-- Idempotent: revoking again is a no-op, not an error.
select lives_ok(
  format($$ select public.assistant_revoke_pairing(%L, 'again') $$, :'revoke_self_v_id'),
  'revoking an already-revoked binding is idempotent (no error)'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Owner revokes ANOTHER user's binding within the same tenant.
select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select identity_id as revoke_by_owner_v_id from public.assistant_issue_pairing_challenge('a1111111-1111-1111-1111-111111111111', 'whatsapp', '+628001119007') \gset
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select results_eq(
  format($$ select status from public.assistant_revoke_pairing(%L, 'owner cleanup') $$, :'revoke_by_owner_v_id'),
  $$ values ('revoked'::public.assistant_channel_identity_status) $$,
  'owner can revoke another member''s binding in the same tenant'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Admin CANNOT revoke another user's (non-self) binding.
select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select identity_id as revoke_denied_v_id from public.assistant_issue_pairing_challenge('a1111111-1111-1111-1111-111111111111', 'whatsapp', '+628001119008') \gset
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  format($$ select public.assistant_revoke_pairing(%L, 'admin overreach') $$, :'revoke_denied_v_id'),
  '42501', null,
  'STOP: admin cannot revoke another (non-self) member''s binding'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Cross-tenant owner cannot revoke.
select set_config('request.jwt.claims', json_build_object('sub', 'a0000002-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  format($$ select public.assistant_revoke_pairing(%L, 'cross tenant') $$, :'revoke_denied_v_id'),
  '42501', null,
  'STOP: an owner of a different tenant cannot revoke a G1 binding'
);
select throws_ok(
  $$ select public.assistant_revoke_pairing('00000000-0000-0000-0000-000000000000', null) $$,
  'Assistant channel identity not found',
  'revoking a non-existent identity id raises not-found'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- SECTION 4 — RLS & grants
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(
  (select count(*)::int from public.assistant_channel_identities),
  0,
  'viewer (no own binding, not owner/admin) sees zero rows via RLS'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'a0000002-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(
  (select count(*)::int from public.assistant_channel_identities),
  0,
  'tenant isolation: G2''s owner sees zero G1 assistant_channel_identities rows'
);
reset role;
select set_config('request.jwt.claims', '', true);

select ok(
  not has_column_privilege('authenticated', 'public.assistant_channel_identities', 'challenge_digest', 'SELECT'),
  'authenticated can never SELECT challenge_digest on assistant_channel_identities'
);
select ok(
  not has_table_privilege('authenticated', 'public.assistant_channel_identities', 'INSERT'),
  'authenticated has no direct INSERT on assistant_channel_identities — mutation is RPC-only'
);
select ok(
  not has_table_privilege('authenticated', 'public.assistant_channel_identities', 'UPDATE'),
  'authenticated has no direct UPDATE on assistant_channel_identities — mutation is RPC-only'
);
select ok(
  not has_table_privilege('authenticated', 'public.assistant_channel_identities', 'DELETE'),
  'authenticated has no direct DELETE on assistant_channel_identities'
);

-- =============================================================================
-- SECTION 5 — Client verification
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select * from public.assistant_issue_client_verification_challenge('ad000001-0000-0000-0000-000000000001') $$,
  '42501', null,
  'reviewer cannot issue a client verification challenge'
);
reset role;
select set_config('request.jwt.claims', '', true);

select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select * from public.assistant_issue_client_verification_challenge('ad000001-0000-0000-0000-000000000003') $$,
  'Client contact is not active',
  'an inactive contact cannot be issued a verification challenge'
);
select throws_ok(
  $$ select * from public.assistant_issue_client_verification_challenge('ad000001-0000-0000-0000-000000000002') $$,
  'Client contact has no WhatsApp number to verify',
  'a contact with no WhatsApp number cannot be issued a verification challenge'
);

select challenge_code as contact_a_v_code, challenge_expires_at as contact_a_v_expires
  from public.assistant_issue_client_verification_challenge('ad000001-0000-0000-0000-000000000001') \gset

select results_eq(
  $$ select whatsapp_verification_status, whatsapp_verification_attempt_count from public.client_contacts where id = 'ad000001-0000-0000-0000-000000000001' $$,
  $$ values ('pending'::public.client_whatsapp_verification_status, 0) $$,
  'contact A is now pending verification with a zero attempt count'
);
-- whatsapp_verification_digest is not SELECT-granted to `authenticated`
-- either — reset to the unrestricted test-runner role to inspect it.
reset role;
select results_eq(
  format($$ select whatsapp_verification_digest = encode(extensions.digest(%L, 'sha256'), 'hex')
       from public.client_contacts where id = 'ad000001-0000-0000-0000-000000000001' $$, :'contact_a_v_code'),
  $$ values (true) $$,
  'the stored client verification digest matches sha256(plaintext code)'
);
select results_eq(
  format($$ select whatsapp_verification_expires_at = (now() + interval '10 minutes') from public.client_contacts where id = 'ad000001-0000-0000-0000-000000000001' $$),
  $$ values (true) $$,
  'client verification TTL is exactly 10 minutes'
);

reset role;
select set_config('request.jwt.claims', '', true);

set local role service_role;

select results_eq(
  $$ select outcome from public.assistant_complete_client_verification('a1111111-1111-1111-1111-111111111111', '+628002220001', 'WRONGCODE') $$,
  $$ values ('invalid_code'::text) $$,
  'a wrong client verification code returns outcome invalid_code'
);
select results_eq(
  $$ select whatsapp_verification_attempt_count from public.client_contacts where id = 'ad000001-0000-0000-0000-000000000001' $$,
  $$ values (1) $$,
  'the client verification attempt counter increment survives the failed call'
);

update public.client_contacts set whatsapp_verification_expires_at = now() - interval '1 minute'
  where id = 'ad000001-0000-0000-0000-000000000001';
select results_eq(
  format($$ select outcome from public.assistant_complete_client_verification('a1111111-1111-1111-1111-111111111111', '+628002220001', %L) $$, :'contact_a_v_code'),
  $$ values ('expired'::text) $$,
  'an expired client verification challenge is rejected even with the correct code'
);
-- restore for the successful-completion assertion below
update public.client_contacts set whatsapp_verification_expires_at = now() + interval '10 minutes'
  where id = 'ad000001-0000-0000-0000-000000000001';

select results_eq(
  format($$ select outcome, contact_id from public.assistant_complete_client_verification('a1111111-1111-1111-1111-111111111111', '+628002220001', %L) $$, :'contact_a_v_code'),
  $$ values ('verified'::text, 'ad000001-0000-0000-0000-000000000001'::uuid) $$,
  'a correct client verification code completes verification'
);
select results_eq(
  $$ select whatsapp_verification_status, whatsapp_verification_digest, whatsapp_verification_expires_at, whatsapp_verified_at is not null
      from public.client_contacts where id = 'ad000001-0000-0000-0000-000000000001' $$,
  $$ values ('verified'::public.client_whatsapp_verification_status, null::text, null::timestamptz, true) $$,
  'contact A is verified and the digest/expiry are cleared, verified_at is set'
);

select results_eq(
  format($$ select outcome from public.assistant_complete_client_verification('a1111111-1111-1111-1111-111111111111', '+628002220001', %L) $$, :'contact_a_v_code'),
  $$ values ('not_found'::text) $$,
  'STOP: replaying the same client verification code is rejected as not_found'
);

-- Ambiguous: two active contacts (D, E) both pending on the same number.
reset role;
select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.assistant_issue_client_verification_challenge('ad000001-0000-0000-0000-000000000004');
select public.assistant_issue_client_verification_challenge('ad000001-0000-0000-0000-000000000005');
reset role;
select set_config('request.jwt.claims', '', true);

set local role service_role;
select results_eq(
  $$ select outcome from public.assistant_complete_client_verification('a1111111-1111-1111-1111-111111111111', '+628002220005', 'ANYCODE') $$,
  $$ values ('ambiguous'::text) $$,
  'STOP: exactly-one-pending-candidate is enforced — two contacts pending the same number fail closed'
);
reset role;

-- Duplicate number: contact F attempts to verify a number already verified
-- on contact A (direct insert-equivalent: reuse A's now-verified number).
select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
update public.client_contacts set whatsapp_number = '+628002220001' where id = 'ad000001-0000-0000-0000-000000000006';
select challenge_code as contact_f_v_code from public.assistant_issue_client_verification_challenge('ad000001-0000-0000-0000-000000000006') \gset
reset role;
select set_config('request.jwt.claims', '', true);

set local role service_role;
select results_eq(
  format($$ select outcome from public.assistant_complete_client_verification('a1111111-1111-1111-1111-111111111111', '+628002220001', %L) $$, :'contact_f_v_code'),
  $$ values ('duplicate_number'::text) $$,
  'STOP: verifying a number already verified on another contact in the same tenant is refused'
);
reset role;

-- Number change clears verification (fires regardless of caller — direct
-- authenticated UPDATE, not an RPC).
select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
update public.client_contacts set whatsapp_number = '+628002229999' where id = 'ad000001-0000-0000-0000-000000000001';
reset role;
select results_eq(
  $$ select whatsapp_verification_status, whatsapp_verification_digest, whatsapp_verification_expires_at, whatsapp_verified_at, whatsapp_verification_attempt_count
      from public.client_contacts where id = 'ad000001-0000-0000-0000-000000000001' $$,
  $$ values ('unverified'::public.client_whatsapp_verification_status, null::text, null::timestamptz, null::timestamptz, 0) $$,
  'changing whatsapp_number resets verification to unverified and clears every verification field'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- assistant_reset_client_verification: pending -> unverified, idempotent, authz.
select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.assistant_issue_client_verification_challenge('ad000001-0000-0000-0000-000000000004');
select results_eq(
  $$ select whatsapp_verification_status from public.assistant_reset_client_verification('ad000001-0000-0000-0000-000000000004', 'cancel pending') $$,
  $$ values ('unverified'::public.client_whatsapp_verification_status) $$,
  'resetting a pending client verification cancels it back to unverified'
);
select lives_ok(
  $$ select public.assistant_reset_client_verification('ad000001-0000-0000-0000-000000000004', 'again') $$,
  'resetting an already-unverified contact is idempotent'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- verified -> revoked (contact F, now verified — complete it first).
select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
update public.client_contacts set whatsapp_number = '+628002229998' where id = 'ad000001-0000-0000-0000-000000000006';
select challenge_code as contact_f_v_code2 from public.assistant_issue_client_verification_challenge('ad000001-0000-0000-0000-000000000006') \gset
reset role;
select set_config('request.jwt.claims', '', true);
set local role service_role;
select public.assistant_complete_client_verification('a1111111-1111-1111-1111-111111111111', '+628002229998', :'contact_f_v_code2');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', 'a0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select results_eq(
  $$ select whatsapp_verification_status from public.assistant_reset_client_verification('ad000001-0000-0000-0000-000000000006', 'revoke verified') $$,
  $$ values ('revoked'::public.client_whatsapp_verification_status) $$,
  'resetting an already-verified contact explicitly revokes it (distinct from unverified)'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Cross-tenant denial for the reset RPC.
select set_config('request.jwt.claims', json_build_object('sub', 'a0000002-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$ select public.assistant_reset_client_verification('ad000001-0000-0000-0000-000000000006', 'cross tenant') $$,
  '42501', null,
  'STOP: an owner of a different tenant cannot reset a G1 contact''s verification'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- DB-level constraint proof: a second verified contact for the same
-- tenant+number is rejected by the partial unique index. Dedicated fresh
-- number/rows here, decoupled from contact F's lifecycle above (F was
-- reset to 'revoked' by then, which no longer holds the partial index).
insert into public.client_contacts (tenant_id, client_id, full_name, whatsapp_number, whatsapp_verification_status, whatsapp_verified_at)
  values ('a1111111-1111-1111-1111-111111111111', 'ac000001-0000-0000-0000-000000000001', 'Direct Insert Verified 1', '+628002229977', 'verified', now());
select throws_ok(
  $$ insert into public.client_contacts (tenant_id, client_id, full_name, whatsapp_number, whatsapp_verification_status, whatsapp_verified_at)
       values ('a1111111-1111-1111-1111-111111111111', 'ac000001-0000-0000-0000-000000000001', 'Direct Insert Dup', '+628002229977', 'verified', now()) $$,
  '23505', null,
  'DB constraint: a second verified contact for the same tenant+whatsapp_number is rejected'
);

-- =============================================================================
-- SECTION 6 — Audit evidence
-- =============================================================================

select ok(exists (select 1 from public.access_audit_events where entity_type = 'assistant_channel_identity' and action = 'pairing_challenge_issued'), 'pairing_challenge_issued audit events exist');
select ok(exists (select 1 from public.access_audit_events where entity_type = 'assistant_channel_identity' and action = 'pairing_completed'), 'pairing_completed audit events exist');
select ok(exists (select 1 from public.access_audit_events where entity_type = 'assistant_channel_identity' and action = 'pairing_revoked'), 'pairing_revoked audit events exist');
select ok(exists (select 1 from public.access_audit_events where entity_type = 'assistant_channel_identity' and action = 'pairing_failed'), 'pairing_failed audit events exist (ambiguous/membership-invalid cases)');
select ok(exists (select 1 from public.access_audit_events where entity_type = 'client_contact_verification' and action = 'client_verification_challenge_issued'), 'client_verification_challenge_issued audit events exist');
select ok(exists (select 1 from public.access_audit_events where entity_type = 'client_contact_verification' and action = 'client_verification_completed'), 'client_verification_completed audit events exist');
select ok(exists (select 1 from public.access_audit_events where entity_type = 'client_contact_verification' and action = 'client_verification_failed'), 'client_verification_failed audit events exist (ambiguous/duplicate cases)');
select ok(exists (select 1 from public.access_audit_events where entity_type = 'client_contact_verification' and action = 'client_verification_reset'), 'client_verification_reset audit events exist');

-- No audit event anywhere contains any plaintext challenge code captured
-- during this run — mirrors owner_direct_user_provisioning.test.sql's
-- "no password/token" proof.
select ok(
  not exists (
    select 1 from public.access_audit_events
    where before_data::text ilike ('%' || :'owner_g1_v_code' || '%')
       or after_data::text ilike ('%' || :'owner_g1_v_code' || '%')
       or before_data::text ilike ('%' || :'verified_v_code' || '%')
       or after_data::text ilike ('%' || :'verified_v_code' || '%')
       or before_data::text ilike ('%' || :'contact_a_v_code' || '%')
       or after_data::text ilike ('%' || :'contact_a_v_code' || '%')
  ),
  'no audit event stores any captured plaintext challenge code anywhere in before_data/after_data'
);

select ok(
  not exists (
    select 1 from public.access_audit_events
    where before_data::text ilike '%digest%' or after_data::text ilike '%digest%'
  ),
  'no audit event stores a digest value either'
);

select * from finish();

rollback;
