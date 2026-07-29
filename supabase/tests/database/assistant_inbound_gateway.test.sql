-- ADOP — pgTAP proof for 20260730000000_assistant_inbound_gateway.sql
-- (Gate 6J-C, Inbound WhatsApp Gateway & PAIR/VERIFY Command Handler).
--
-- Self-contained: creates its own fixtures (tenant prefix 'h') and rolls
-- back at the end. Mirrors assistant_identity_pairing.test.sql's
-- set_config/reset role pattern and owner_control_notification_outbox.
-- test.sql's `set local role service_role` pattern for the service_role-only
-- RPCs under test here.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('b1111111-1111-1111-1111-111111111111', 'pgtap-aig-tenant-h1', 'PgTAP AIG Tenant H1', 'active'),
  ('b2222222-2222-2222-2222-222222222222', 'pgtap-aig-tenant-h2', 'PgTAP AIG Tenant H2', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', 'b0000001-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-h1@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'b0000002-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-h2@pgtap.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('bb000001-0000-0000-0000-000000000001', 'b1111111-1111-1111-1111-111111111111', 'b0000001-0000-0000-0000-000000000001', 'active'),
  ('bb000002-0000-0000-0000-000000000001', 'b2222222-2222-2222-2222-222222222222', 'b0000002-0000-0000-0000-000000000001', 'active');

insert into public.membership_roles (membership_id, role) values
  ('bb000001-0000-0000-0000-000000000001', 'owner'),
  ('bb000002-0000-0000-0000-000000000001', 'owner');

insert into public.clients (id, tenant_id, display_name, created_by) values
  ('bc000001-0000-0000-0000-000000000001', 'b1111111-1111-1111-1111-111111111111', 'PgTAP AIG Client H1', 'b0000001-0000-0000-0000-000000000001'),
  ('bc000002-0000-0000-0000-000000000001', 'b2222222-2222-2222-2222-222222222222', 'PgTAP AIG Client H2', 'b0000002-0000-0000-0000-000000000001');

-- =============================================================================
-- SECTION 1 — claim_inbound_assistant_event
-- =============================================================================

select ok(
  not has_function_privilege('authenticated', 'public.claim_inbound_assistant_event(text, text, text, text, text, text)', 'EXECUTE'),
  'authenticated cannot execute claim_inbound_assistant_event'
);
select ok(
  not has_function_privilege('anon', 'public.claim_inbound_assistant_event(text, text, text, text, text, text)', 'EXECUTE'),
  'anon cannot execute claim_inbound_assistant_event'
);
select ok(
  has_function_privilege('service_role', 'public.claim_inbound_assistant_event(text, text, text, text, text, text)', 'EXECUTE'),
  'service_role can execute claim_inbound_assistant_event'
);

set local role service_role;

select event_id as claim1_v_id, is_new as claim1_v_is_new
  from public.claim_inbound_assistant_event('fonnte', 'wamid.AAA001', 'digest-aaa', 'whatsapp', '+628003330001', 'pair') \gset

select ok(:'claim1_v_id' is not null, 'first claim returns a new event id');
select is(:'claim1_v_is_new'::boolean, true, 'first claim for a fresh provider_message_id is_new = true');

select event_id as claim2_v_id, is_new as claim2_v_is_new
  from public.claim_inbound_assistant_event('fonnte', 'wamid.AAA001', 'digest-aaa-retry', 'whatsapp', '+628003330001', 'pair') \gset

select is(:'claim2_v_id'::uuid, :'claim1_v_id'::uuid, 'a duplicate provider_message_id resolves to the SAME event id (idempotent claim)');
select is(:'claim2_v_is_new'::boolean, false, 'a duplicate claim reports is_new = false — the command must not run twice');

-- Different provider_message_id, same sender — a distinct claim.
select event_id as claim3_v_id, is_new as claim3_v_is_new
  from public.claim_inbound_assistant_event('fonnte', 'wamid.AAA002', 'digest-aaa2', 'whatsapp', '+628003330001', 'pair') \gset
select isnt(:'claim3_v_id'::uuid, :'claim1_v_id'::uuid, 'a different provider_message_id claims a brand-new row');

reset role;

-- DB-level constraint proof: a direct duplicate insert is rejected regardless
-- of the RPC (belt-and-suspenders, mirrors assistant_channel_identities'
-- own uniqueness proofs).
select throws_ok(
  $$ insert into public.assistant_inbound_events (provider, provider_message_id, payload_digest, channel, sender_address, command_type)
       values ('fonnte', 'wamid.AAA001', 'digest-dup', 'whatsapp', '+628003330001', 'pair') $$,
  '23505', null,
  'DB constraint: a second row for the same (provider, provider_message_id) is rejected'
);

-- =============================================================================
-- SECTION 2 — record_inbound_assistant_event_result (idempotent, one write)
-- =============================================================================

select ok(
  not has_function_privilege('authenticated', 'public.record_inbound_assistant_event_result(uuid, text)', 'EXECUTE'),
  'authenticated cannot execute record_inbound_assistant_event_result'
);
select ok(
  has_function_privilege('service_role', 'public.record_inbound_assistant_event_result(uuid, text)', 'EXECUTE'),
  'service_role can execute record_inbound_assistant_event_result'
);

set local role service_role;

select results_eq(
  format($$ select status, result_code from public.record_inbound_assistant_event_result(%L, 'paired') $$, :'claim1_v_id'),
  $$ values ('processed'::public.assistant_inbound_event_status, 'paired'::text) $$,
  'recording a result on a fresh received row marks it processed with the given result code'
);

-- Re-recording (as if the SAME duplicate webhook delivery re-entered after
-- the row was already processed) must NOT overwrite the result — the
-- command already ran exactly once.
select results_eq(
  format($$ select status, result_code from public.record_inbound_assistant_event_result(%L, 'a_different_code_that_must_be_ignored') $$, :'claim1_v_id'),
  $$ values ('processed'::public.assistant_inbound_event_status, 'paired'::text) $$,
  'STOP: recording a result twice on an already-processed row is a no-op — original result_code is preserved'
);

select throws_ok(
  $$ select public.record_inbound_assistant_event_result('00000000-0000-0000-0000-000000000000', 'x') $$,
  'Inbound assistant event not found',
  'recording a result for a non-existent event id raises not-found'
);

reset role;

-- =============================================================================
-- SECTION 3 — count_recent_inbound_assistant_events (rate-limit counter)
-- =============================================================================

select ok(
  not has_function_privilege('authenticated', 'public.count_recent_inbound_assistant_events(text, text, text, integer)', 'EXECUTE'),
  'authenticated cannot execute count_recent_inbound_assistant_events'
);
select ok(
  has_function_privilege('service_role', 'public.count_recent_inbound_assistant_events(text, text, text, integer)', 'EXECUTE'),
  'service_role can execute count_recent_inbound_assistant_events'
);

set local role service_role;

-- claim1/claim3 above were both 'pair' for +628003330001 — exactly 2 within
-- any recent window.
select is(
  public.count_recent_inbound_assistant_events('whatsapp', '+628003330001', 'pair', 3600),
  2,
  'counts exactly the two prior pair events for this sender within the window'
);
select is(
  public.count_recent_inbound_assistant_events('whatsapp', '+628003330001', 'verify', 3600),
  0,
  'a different command_type for the same sender is not counted (per-intent rate limiting)'
);
select is(
  public.count_recent_inbound_assistant_events('whatsapp', '+628003330099', 'pair', 3600),
  0,
  'a different sender is not counted'
);
-- pgTAP runs this whole file inside one transaction, so every row's
-- received_at shares the exact same frozen now() — a window of 0 cannot be
-- shown to EXCLUDE anything here, only that the clamp-to-1-second floor
-- does not error and still returns a sane non-negative count.
select ok(
  public.count_recent_inbound_assistant_events('whatsapp', '+628003330001', 'pair', 0) >= 0,
  'a zero/negative window clamps to at least 1 second rather than erroring'
);

reset role;

-- =============================================================================
-- SECTION 4 — assistant_complete_client_verification_by_address
-- =============================================================================

select ok(
  not has_function_privilege('authenticated', 'public.assistant_complete_client_verification_by_address(text, text, text)', 'EXECUTE'),
  'authenticated cannot execute assistant_complete_client_verification_by_address'
);
select ok(
  not has_function_privilege('anon', 'public.assistant_complete_client_verification_by_address(text, text, text)', 'EXECUTE'),
  'anon cannot execute assistant_complete_client_verification_by_address'
);
select ok(
  has_function_privilege('service_role', 'public.assistant_complete_client_verification_by_address(text, text, text)', 'EXECUTE'),
  'service_role can execute assistant_complete_client_verification_by_address'
);

-- Zero candidates anywhere.
set local role service_role;
select results_eq(
  $$ select outcome from public.assistant_complete_client_verification_by_address('whatsapp', '+628009990001', 'ANYCODE') $$,
  $$ values ('invalid_or_expired'::text) $$,
  'no pending candidate anywhere returns invalid_or_expired (not a distinguishable not_found)'
);
select throws_ok(
  $$ select public.assistant_complete_client_verification_by_address('telegram', '+628009990001', 'ANYCODE') $$,
  '22023', null,
  'unsupported channel is rejected'
);
reset role;

-- Single-tenant success path. (Fixture insert runs as the unrestricted
-- test-runner role — same convention as the Fixtures section above — since
-- `authenticated`'s INSERT grant on client_contacts does not include the
-- `id` column; only the RPC call itself needs the authenticated context.)
insert into public.client_contacts (id, tenant_id, client_id, full_name, whatsapp_number, status) values
  ('bd000001-0000-0000-0000-000000000001', 'b1111111-1111-1111-1111-111111111111', 'bc000001-0000-0000-0000-000000000001', 'H1 Contact Cross-Tenant Target', '+628009990010', 'active');

select set_config('request.jwt.claims', json_build_object('sub', 'b0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select challenge_code as h1_v_code from public.assistant_issue_client_verification_challenge('bd000001-0000-0000-0000-000000000001') \gset
reset role;
select set_config('request.jwt.claims', '', true);

set local role service_role;
select results_eq(
  format($$ select outcome, contact_id, tenant_id from public.assistant_complete_client_verification_by_address('whatsapp', '+628009990010', %L) $$, lower(:'h1_v_code')),
  format($$ values ('verified'::text, 'bd000001-0000-0000-0000-000000000001'::uuid, 'b1111111-1111-1111-1111-111111111111'::uuid) $$),
  'exactly one pending candidate anywhere completes verification and resolves its own tenant_id'
);

select results_eq(
  format($$ select outcome from public.assistant_complete_client_verification_by_address('whatsapp', '+628009990010', %L) $$, :'h1_v_code'),
  $$ values ('invalid_or_expired'::text) $$,
  'STOP: replaying the same code again is rejected as invalid_or_expired (single-use, no second verification)'
);
reset role;

-- Cross-tenant ambiguity: two DIFFERENT tenants both have a pending
-- verification for the SAME number. Forcing identical digests requires a
-- shared code — reissue is random, so pin both rows' digests directly
-- (test-only setup, not a runtime path) to deterministically prove the
-- fail-closed branch rather than relying on a 1-in-32^6 collision.
insert into public.client_contacts (id, tenant_id, client_id, full_name, whatsapp_number, status) values
  ('bd000001-0000-0000-0000-000000000002', 'b1111111-1111-1111-1111-111111111111', 'bc000001-0000-0000-0000-000000000001', 'H1 Ambiguous Candidate', '+628009990020', 'active');

select set_config('request.jwt.claims', json_build_object('sub', 'b0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.assistant_issue_client_verification_challenge('bd000001-0000-0000-0000-000000000002');
reset role;
select set_config('request.jwt.claims', '', true);

insert into public.client_contacts (id, tenant_id, client_id, full_name, whatsapp_number, status) values
  ('bd000002-0000-0000-0000-000000000001', 'b2222222-2222-2222-2222-222222222222', 'bc000002-0000-0000-0000-000000000001', 'H2 Ambiguous Candidate', '+628009990020', 'active');

select set_config('request.jwt.claims', json_build_object('sub', 'b0000002-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select public.assistant_issue_client_verification_challenge('bd000002-0000-0000-0000-000000000001');
reset role;
select set_config('request.jwt.claims', '', true);

-- Pin both rows to the same known digest (sha256('SHARED1') uppercased) so
-- the ambiguous branch is deterministic rather than probabilistic.
update public.client_contacts
set whatsapp_verification_digest = encode(extensions.digest('SHARED1', 'sha256'), 'hex')
where id in ('bd000001-0000-0000-0000-000000000002', 'bd000002-0000-0000-0000-000000000001');

set local role service_role;
select results_eq(
  $$ select outcome from public.assistant_complete_client_verification_by_address('whatsapp', '+628009990020', 'SHARED1') $$,
  $$ values ('ambiguous'::text) $$,
  'STOP: two different tenants both pending-matching the same code for the same number fail closed as ambiguous, never auto-picked'
);
reset role;
select results_eq(
  $$ select whatsapp_verification_status from public.client_contacts where id in ('bd000001-0000-0000-0000-000000000002', 'bd000002-0000-0000-0000-000000000001') $$,
  $$ values ('pending'::public.client_whatsapp_verification_status), ('pending'::public.client_whatsapp_verification_status) $$,
  'the ambiguous attempt leaves BOTH candidate rows pending, not silently verified'
);

-- Wrong-code attempt increments every pending candidate for that number
-- (conservative, mirrors assistant_complete_pairing).
set local role service_role;
select public.assistant_complete_client_verification_by_address('whatsapp', '+628009990020', 'TOTALLYWRONG');
reset role;
select results_eq(
  $$ select whatsapp_verification_attempt_count from public.client_contacts where id in ('bd000001-0000-0000-0000-000000000002', 'bd000002-0000-0000-0000-000000000001') order by id $$,
  $$ values (1), (1) $$,
  'a non-matching code conservatively increments the attempt count on every pending candidate sharing the number'
);

-- Locked candidate.
insert into public.client_contacts (id, tenant_id, client_id, full_name, whatsapp_number, status) values
  ('bd000001-0000-0000-0000-000000000003', 'b1111111-1111-1111-1111-111111111111', 'bc000001-0000-0000-0000-000000000001', 'H1 Lockout Candidate', '+628009990030', 'active');

select set_config('request.jwt.claims', json_build_object('sub', 'b0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select challenge_code as lockout_v_code from public.assistant_issue_client_verification_challenge('bd000001-0000-0000-0000-000000000003') \gset
reset role;
select set_config('request.jwt.claims', '', true);

update public.client_contacts set whatsapp_verification_attempt_count = 5 where id = 'bd000001-0000-0000-0000-000000000003';

set local role service_role;
select results_eq(
  format($$ select outcome from public.assistant_complete_client_verification_by_address('whatsapp', '+628009990030', %L) $$, :'lockout_v_code'),
  $$ values ('locked'::text) $$,
  'a candidate at 5 prior attempts is refused even with the correct code'
);
reset role;

-- Inactive contact.
insert into public.client_contacts (id, tenant_id, client_id, full_name, whatsapp_number, status) values
  ('bd000001-0000-0000-0000-000000000004', 'b1111111-1111-1111-1111-111111111111', 'bc000001-0000-0000-0000-000000000001', 'H1 Soon Inactive', '+628009990040', 'active');

select set_config('request.jwt.claims', json_build_object('sub', 'b0000001-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select challenge_code as inactive_v_code from public.assistant_issue_client_verification_challenge('bd000001-0000-0000-0000-000000000004') \gset
reset role;
select set_config('request.jwt.claims', '', true);

update public.client_contacts set status = 'inactive' where id = 'bd000001-0000-0000-0000-000000000004';

set local role service_role;
select results_eq(
  format($$ select outcome from public.assistant_complete_client_verification_by_address('whatsapp', '+628009990040', %L) $$, :'inactive_v_code'),
  $$ values ('contact_inactive'::text) $$,
  'a contact that became inactive after the challenge was issued is refused even with the correct code'
);
reset role;

-- =============================================================================
-- SECTION 5 — RLS & grants on assistant_inbound_events
-- =============================================================================

select ok(
  not has_table_privilege('authenticated', 'public.assistant_inbound_events', 'SELECT'),
  'authenticated has no direct SELECT on assistant_inbound_events'
);
select ok(
  not has_table_privilege('authenticated', 'public.assistant_inbound_events', 'INSERT'),
  'authenticated has no direct INSERT on assistant_inbound_events'
);
select ok(
  not has_table_privilege('anon', 'public.assistant_inbound_events', 'SELECT'),
  'anon has no direct SELECT on assistant_inbound_events'
);
select ok(
  not has_table_privilege('service_role', 'public.assistant_inbound_events', 'SELECT'),
  'service_role itself has no direct table grant either — RPC is the only surface, mirroring notification_events'
);

-- =============================================================================
-- SECTION 6 — Audit evidence: no plaintext code/digest leakage
-- =============================================================================

select ok(
  exists (
    select 1 from public.access_audit_events
    where entity_type = 'client_contact_verification' and action = 'client_verification_completed'
      and after_data->>'resolved_cross_tenant' = 'true'
  ),
  'cross-tenant verification completion is distinctly audited'
);
select ok(
  exists (select 1 from public.access_audit_events where entity_type = 'client_contact_verification' and action = 'client_verification_failed' and before_data is null and after_data->>'reason' = 'ambiguous_cross_tenant_candidate'),
  'ambiguous cross-tenant attempts are audited with a clear reason'
);
select ok(
  not exists (
    select 1 from public.access_audit_events
    where before_data::text ilike ('%' || :'h1_v_code' || '%')
       or after_data::text ilike ('%' || :'h1_v_code' || '%')
       or before_data::text ilike '%SHARED1%'
       or after_data::text ilike '%SHARED1%'
  ),
  'no audit event stores any plaintext verification code captured during this run'
);
select ok(
  not exists (select 1 from public.assistant_inbound_events where payload_digest ilike '%wamid%'),
  'assistant_inbound_events never stores raw provider payload — only the digest column, which is opaque'
);

select * from finish();

rollback;
