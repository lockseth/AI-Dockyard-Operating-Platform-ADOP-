-- ADOP — pgTAP proof for 20260729040000_assistant_identity_privilege_hardening.sql
-- (Gate 6J-B1, Assistant Identity Cloud Privilege Corrective).
--
-- Pure grant-shape assertions (has_function_privilege / has_table_privilege /
-- has_column_privilege) — no fixtures, no RPC invocation, mirrors the grant
-- assertions already present in assistant_identity_pairing.test.sql (Section
-- 2 and Section 4) but adds `anon` coverage that file never asserted.

begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

-- =============================================================================
-- SECTION 1 — Completion RPCs: service_role only
-- =============================================================================

select ok(
  not has_function_privilege('anon', 'public.assistant_complete_pairing(text, text, text)', 'EXECUTE'),
  'anon cannot execute assistant_complete_pairing'
);
select ok(
  not has_function_privilege('authenticated', 'public.assistant_complete_pairing(text, text, text)', 'EXECUTE'),
  'authenticated cannot execute assistant_complete_pairing'
);
select ok(
  has_function_privilege('service_role', 'public.assistant_complete_pairing(text, text, text)', 'EXECUTE'),
  'service_role can execute assistant_complete_pairing'
);

select ok(
  not has_function_privilege('anon', 'public.assistant_complete_client_verification(uuid, text, text)', 'EXECUTE'),
  'anon cannot execute assistant_complete_client_verification'
);
select ok(
  not has_function_privilege('authenticated', 'public.assistant_complete_client_verification(uuid, text, text)', 'EXECUTE'),
  'authenticated cannot execute assistant_complete_client_verification'
);
select ok(
  has_function_privilege('service_role', 'public.assistant_complete_client_verification(uuid, text, text)', 'EXECUTE'),
  'service_role can execute assistant_complete_client_verification'
);

-- =============================================================================
-- SECTION 2 — Browser-session RPCs: authenticated (+ service_role), never anon
-- =============================================================================

select ok(
  not has_function_privilege('anon', 'public.assistant_issue_pairing_challenge(uuid, text, text)', 'EXECUTE'),
  'anon cannot execute assistant_issue_pairing_challenge'
);
select ok(
  has_function_privilege('authenticated', 'public.assistant_issue_pairing_challenge(uuid, text, text)', 'EXECUTE'),
  'authenticated can execute assistant_issue_pairing_challenge'
);

select ok(
  not has_function_privilege('anon', 'public.assistant_revoke_pairing(uuid, text)', 'EXECUTE'),
  'anon cannot execute assistant_revoke_pairing'
);
select ok(
  has_function_privilege('authenticated', 'public.assistant_revoke_pairing(uuid, text)', 'EXECUTE'),
  'authenticated can execute assistant_revoke_pairing'
);

select ok(
  not has_function_privilege('anon', 'public.assistant_issue_client_verification_challenge(uuid)', 'EXECUTE'),
  'anon cannot execute assistant_issue_client_verification_challenge'
);
select ok(
  has_function_privilege('authenticated', 'public.assistant_issue_client_verification_challenge(uuid)', 'EXECUTE'),
  'authenticated can execute assistant_issue_client_verification_challenge'
);

select ok(
  not has_function_privilege('anon', 'public.assistant_reset_client_verification(uuid, text)', 'EXECUTE'),
  'anon cannot execute assistant_reset_client_verification'
);
select ok(
  has_function_privilege('authenticated', 'public.assistant_reset_client_verification(uuid, text)', 'EXECUTE'),
  'authenticated can execute assistant_reset_client_verification'
);

-- =============================================================================
-- SECTION 3 — assistant_channel_identities table privileges
-- =============================================================================

select ok(
  not has_table_privilege('anon', 'public.assistant_channel_identities', 'SELECT'),
  'anon has no table-level SELECT on assistant_channel_identities'
);
select ok(
  not has_table_privilege('anon', 'public.assistant_channel_identities', 'INSERT'),
  'anon has no INSERT on assistant_channel_identities'
);
select ok(
  not has_table_privilege('authenticated', 'public.assistant_channel_identities', 'INSERT'),
  'authenticated has no direct INSERT on assistant_channel_identities'
);
select ok(
  not has_table_privilege('authenticated', 'public.assistant_channel_identities', 'UPDATE'),
  'authenticated has no direct UPDATE on assistant_channel_identities'
);
select ok(
  not has_table_privilege('authenticated', 'public.assistant_channel_identities', 'DELETE'),
  'authenticated has no direct DELETE on assistant_channel_identities'
);
select ok(
  not has_column_privilege('authenticated', 'public.assistant_channel_identities', 'challenge_digest', 'SELECT'),
  'authenticated cannot SELECT challenge_digest on assistant_channel_identities'
);
select ok(
  has_column_privilege('authenticated', 'public.assistant_channel_identities', 'status', 'SELECT'),
  'authenticated can still SELECT the safe column `status` on assistant_channel_identities'
);

-- =============================================================================
-- SECTION 4 — client_contacts verification digest (unchanged, re-affirmed)
-- =============================================================================

select ok(
  not has_column_privilege('authenticated', 'public.client_contacts', 'whatsapp_verification_digest', 'SELECT'),
  'authenticated cannot SELECT whatsapp_verification_digest on client_contacts'
);

select * from finish();

rollback;
