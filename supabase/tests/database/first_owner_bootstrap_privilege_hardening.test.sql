-- ADOP — pgTAP proof for 20260807010000_first_owner_bootstrap_privilege_hardening.sql
-- (Gate 6J-E2-B3, First Owner Bootstrap Cloud Privilege Corrective).
--
-- Pure grant-shape assertions (has_table_privilege / has_function_privilege /
-- pg_catalog introspection) — no fixtures, no RPC invocation. Mirrors the
-- grant assertions in assistant_identity_privilege_hardening.test.sql (Gate
-- 6J-B1) but for first_owner_bootstrap_tokens / resolve_first_owner_bootstrap_
-- token / claim_first_owner_bootstrap. These assertions check the actual
-- catalog grant/RLS/function state directly, independent of whether a given
-- environment's pg_default_acl auto-grants anon/authenticated on new objects
-- (the hosted ADOP Demo project does; local dev does not for EXECUTE and only
-- partially for table privileges) — so they hold regardless of environment.

begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

-- =============================================================================
-- SECTION 1 — first_owner_bootstrap_tokens table privileges
-- =============================================================================

select ok(
  not has_table_privilege('anon', 'public.first_owner_bootstrap_tokens', 'SELECT'),
  'anon has no table-level SELECT on first_owner_bootstrap_tokens'
);
select ok(
  not has_table_privilege('anon', 'public.first_owner_bootstrap_tokens', 'INSERT'),
  'anon has no INSERT on first_owner_bootstrap_tokens'
);
select ok(
  not has_table_privilege('anon', 'public.first_owner_bootstrap_tokens', 'UPDATE'),
  'anon has no UPDATE on first_owner_bootstrap_tokens'
);
select ok(
  not has_table_privilege('anon', 'public.first_owner_bootstrap_tokens', 'DELETE'),
  'anon has no DELETE on first_owner_bootstrap_tokens'
);
select ok(
  not has_table_privilege('authenticated', 'public.first_owner_bootstrap_tokens', 'SELECT'),
  'authenticated has no table-level SELECT on first_owner_bootstrap_tokens'
);
select ok(
  not has_table_privilege('authenticated', 'public.first_owner_bootstrap_tokens', 'INSERT'),
  'authenticated has no INSERT on first_owner_bootstrap_tokens'
);
select ok(
  not has_table_privilege('authenticated', 'public.first_owner_bootstrap_tokens', 'UPDATE'),
  'authenticated has no UPDATE on first_owner_bootstrap_tokens'
);
select ok(
  not has_table_privilege('authenticated', 'public.first_owner_bootstrap_tokens', 'DELETE'),
  'authenticated has no DELETE on first_owner_bootstrap_tokens'
);
select ok(
  not has_table_privilege('public', 'public.first_owner_bootstrap_tokens', 'SELECT'),
  'PUBLIC pseudo-role has no table-level SELECT on first_owner_bootstrap_tokens'
);
select ok(
  has_table_privilege('service_role', 'public.first_owner_bootstrap_tokens', 'SELECT, INSERT, UPDATE, DELETE'),
  'service_role retains full DML privileges on first_owner_bootstrap_tokens'
);

-- =============================================================================
-- SECTION 2 — RPC execute privileges
-- =============================================================================

select ok(
  not has_function_privilege('anon', 'public.resolve_first_owner_bootstrap_token(text)', 'EXECUTE'),
  'anon cannot execute resolve_first_owner_bootstrap_token'
);
select ok(
  not has_function_privilege('authenticated', 'public.resolve_first_owner_bootstrap_token(text)', 'EXECUTE'),
  'authenticated cannot execute resolve_first_owner_bootstrap_token'
);
select ok(
  not has_function_privilege('public', 'public.resolve_first_owner_bootstrap_token(text)', 'EXECUTE'),
  'PUBLIC pseudo-role cannot execute resolve_first_owner_bootstrap_token'
);
select ok(
  has_function_privilege('service_role', 'public.resolve_first_owner_bootstrap_token(text)', 'EXECUTE'),
  'service_role can execute resolve_first_owner_bootstrap_token'
);
select ok(
  not has_function_privilege('anon', 'public.claim_first_owner_bootstrap(text, uuid)', 'EXECUTE'),
  'anon cannot execute claim_first_owner_bootstrap'
);
select ok(
  not has_function_privilege('authenticated', 'public.claim_first_owner_bootstrap(text, uuid)', 'EXECUTE'),
  'authenticated cannot execute claim_first_owner_bootstrap'
);
select ok(
  not has_function_privilege('public', 'public.claim_first_owner_bootstrap(text, uuid)', 'EXECUTE'),
  'PUBLIC pseudo-role cannot execute claim_first_owner_bootstrap'
);
select ok(
  has_function_privilege('service_role', 'public.claim_first_owner_bootstrap(text, uuid)', 'EXECUTE'),
  'service_role can execute claim_first_owner_bootstrap'
);

-- =============================================================================
-- SECTION 3 — RLS remains active with zero open policies (no policy added)
-- =============================================================================

select ok(
  (select relrowsecurity from pg_class where oid = 'public.first_owner_bootstrap_tokens'::regclass),
  'row level security is enabled on first_owner_bootstrap_tokens'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'first_owner_bootstrap_tokens'),
  0,
  'first_owner_bootstrap_tokens carries zero RLS policies (fail-closed by default, unchanged by this corrective)'
);

-- =============================================================================
-- SECTION 4 — function shape unchanged: SECURITY DEFINER + locked search_path
-- =============================================================================

select ok(
  (select prosecdef from pg_proc where oid = 'public.resolve_first_owner_bootstrap_token(text)'::regprocedure),
  'resolve_first_owner_bootstrap_token remains SECURITY DEFINER'
);
select ok(
  (select proconfig from pg_proc where oid = 'public.resolve_first_owner_bootstrap_token(text)'::regprocedure)
    @> array['search_path=public, pg_temp'],
  'resolve_first_owner_bootstrap_token search_path remains locked to public, pg_temp'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.claim_first_owner_bootstrap(text, uuid)'::regprocedure),
  'claim_first_owner_bootstrap remains SECURITY DEFINER'
);
select ok(
  (select proconfig from pg_proc where oid = 'public.claim_first_owner_bootstrap(text, uuid)'::regprocedure)
    @> array['search_path=public, pg_temp'],
  'claim_first_owner_bootstrap search_path remains locked to public, pg_temp'
);

select * from finish();

rollback;
