-- ADOP Gate 6J-E1 — pgTAP proof for the Morning Brief extension to the
-- generic WhatsApp outbox (see 20260731000000_morning_brief_notification_
-- outbox_extension.sql): the new business_date column + partial unique
-- index (at most one Morning Brief per tenant per business_date),
-- enqueue_and_claim_morning_brief_notification's idempotent-enqueue +
-- conditional-claim contract, lease-expiry reclaim, and that the existing
-- complete_notification_event/fail_notification_event RPCs work unmodified
-- on morning_brief rows (no second lifecycle engine was built).
--
-- Run against a real local Supabase instance (Gate 6J-E1-B) via `pnpm
-- db:test` — written to the same convention as
-- owner_control_notification_outbox.test.sql.
--
-- Self-contained: creates its own tenant fixture (prefix e3e3e3e3-, not used
-- by any other pgTAP file in this directory) and rolls back at the end.
-- Unlike owner_control_notification_outbox.test.sql, no auth.users/
-- tenant_memberships fixture is needed — every RPC under test here is
-- service_role-only and never checks auth.uid()/tenant role membership.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3', 'pgtap-morning-brief-tenant', 'PgTAP Morning Brief Tenant', 'active');

create temporary table pgtap_mb_tenant as
  select 'e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3'::uuid as id;
grant select on pgtap_mb_tenant to service_role;

-- =============================================================================
-- 1. Schema shape — new column and enum value exist.
-- =============================================================================

select has_column('public', 'notification_events', 'business_date', 'notification_events gains a business_date column');

-- pgTAP has col_not_null (asserts NOT NULL) but no positive col_is_nullable
-- counterpart in this install (confirmed: only col_not_null/col_is_null/
-- col_is_pk/col_is_fk/col_is_unique exist) — assert directly against
-- information_schema instead.
select is(
  (select is_nullable from information_schema.columns
     where table_schema = 'public' and table_name = 'notification_events' and column_name = 'business_date'),
  'YES',
  'business_date is nullable (existing rows are untouched)'
);

select ok(
  'morning_brief' = any(enum_range(null::public.notification_event_type)::text[]),
  'notification_event_type gains the morning_brief value'
);

-- =============================================================================
-- 2. Grants — service_role only, same posture as the other three RPCs.
-- =============================================================================

select ok(
  not has_function_privilege(
    'authenticated',
    'public.enqueue_and_claim_morning_brief_notification(uuid, date, text, text, text, integer)',
    'EXECUTE'
  ),
  'authenticated cannot call enqueue_and_claim_morning_brief_notification'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.enqueue_and_claim_morning_brief_notification(uuid, date, text, text, text, integer)',
    'EXECUTE'
  ),
  'anon cannot call enqueue_and_claim_morning_brief_notification'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.enqueue_and_claim_morning_brief_notification(uuid, date, text, text, text, integer)',
    'EXECUTE'
  ),
  'service_role can call enqueue_and_claim_morning_brief_notification'
);

-- =============================================================================
-- 3. First call for (tenant, 2026-07-31) enqueues and claims in one step.
-- =============================================================================

set local role service_role;
select lives_ok(
  $$ select public.enqueue_and_claim_morning_brief_notification(
       (select id from pgtap_mb_tenant), '2026-07-31'::date, 'worker-a',
       'Ringkasan ADOP pagi ini.', '/app/executive-report', 300
     ) $$,
  'worker-a enqueues and claims the 2026-07-31 Morning Brief'
);
reset role;

create temporary table pgtap_mb_row1 as
  select id from public.notification_events
  where tenant_id = (select id from pgtap_mb_tenant)
    and event_type = 'morning_brief' and business_date = '2026-07-31';
grant select on pgtap_mb_row1 to service_role;

select results_eq(
  $$ select count(*)::int from public.notification_events
       where tenant_id = (select id from pgtap_mb_tenant) and event_type = 'morning_brief' $$,
  $$ values (1) $$,
  'exactly one morning_brief row exists for this tenant so far'
);

select results_eq(
  $$ select status, claimed_by from public.notification_events where id = (select id from pgtap_mb_row1) $$,
  $$ values ('processing'::public.notification_status, 'worker-a'::text) $$,
  'the row is processing, claimed by worker-a'
);

-- =============================================================================
-- 4. A second call for the SAME tenant+business_date (retry, overlapping
--    trigger, manual re-run) is idempotent: no second row, and a different
--    worker does NOT steal the still-leased claim.
-- =============================================================================

set local role service_role;
select lives_ok(
  $$ select public.enqueue_and_claim_morning_brief_notification(
       (select id from pgtap_mb_tenant), '2026-07-31'::date, 'worker-b',
       'Ringkasan ADOP pagi ini.', '/app/executive-report', 300
     ) $$,
  'worker-b calling for the same business_date does not error'
);
reset role;

select results_eq(
  $$ select count(*)::int from public.notification_events
       where tenant_id = (select id from pgtap_mb_tenant) and event_type = 'morning_brief' $$,
  $$ values (1) $$,
  'still exactly one row — the duplicate call inserted nothing new'
);
select results_eq(
  $$ select claimed_by from public.notification_events where id = (select id from pgtap_mb_row1) $$,
  $$ values ('worker-a'::text) $$,
  'worker-b did not steal worker-a''s still-leased claim'
);

-- =============================================================================
-- 5. The generic complete_notification_event RPC works unmodified on a
--    morning_brief row — no second completion engine was built.
-- =============================================================================

set local role service_role;
select lives_ok(
  $$ select public.complete_notification_event((select id from pgtap_mb_row1), 'worker-a', 'fonnte-mb-1') $$,
  'worker-a completes the Morning Brief send via the existing generic RPC'
);
reset role;

select results_eq(
  $$ select status, provider_message_id from public.notification_events where id = (select id from pgtap_mb_row1) $$,
  $$ values ('sent'::public.notification_status, 'fonnte-mb-1'::text) $$,
  'the morning_brief row is sent, exactly like a cash-import notification would be'
);

-- =============================================================================
-- 6. A THIRD call for the same tenant+business_date, after it is already
--    sent, must not resurrect or reclaim it — today's brief is done.
-- =============================================================================

set local role service_role;
select lives_ok(
  $$ select public.enqueue_and_claim_morning_brief_notification(
       (select id from pgtap_mb_tenant), '2026-07-31'::date, 'worker-c',
       'Ringkasan ADOP pagi ini.', '/app/executive-report', 300
     ) $$,
  'a post-sent call for the same business_date does not error'
);
reset role;

select results_eq(
  $$ select status, claimed_by from public.notification_events where id = (select id from pgtap_mb_row1) $$,
  $$ values ('sent'::public.notification_status, 'worker-a'::text) $$,
  'the already-sent row is untouched — worker-c did not reclaim or resend it'
);

-- =============================================================================
-- 7. A different business_date is a genuinely new brief.
-- =============================================================================

set local role service_role;
select lives_ok(
  $$ select public.enqueue_and_claim_morning_brief_notification(
       (select id from pgtap_mb_tenant), '2026-08-01'::date, 'worker-a',
       'Ringkasan ADOP pagi ini.', '/app/executive-report', 300
     ) $$,
  'the next calendar day enqueues a fresh Morning Brief'
);
reset role;

select results_eq(
  $$ select count(*)::int from public.notification_events
       where tenant_id = (select id from pgtap_mb_tenant) and event_type = 'morning_brief' $$,
  $$ values (2) $$,
  'two distinct morning_brief rows now exist — one per business_date'
);

-- =============================================================================
-- 8. Lease-expiry reclaim — a stuck claim past its lease becomes claimable
--    again, same as claim_next_notification_event's own reclaim semantics.
--    Backdating lease_expires_at requires the table owner (service_role has
--    no direct UPDATE grant on notification_events, mutation is RPC-only).
-- =============================================================================

update public.notification_events
set lease_expires_at = now() - interval '1 minute'
where tenant_id = (select id from pgtap_mb_tenant) and event_type = 'morning_brief' and business_date = '2026-08-01';

set local role service_role;
select lives_ok(
  $$ select public.enqueue_and_claim_morning_brief_notification(
       (select id from pgtap_mb_tenant), '2026-08-01'::date, 'worker-reclaim',
       'Ringkasan ADOP pagi ini.', '/app/executive-report', 300
     ) $$,
  'a worker can reclaim a lease-expired morning_brief row'
);
reset role;

select results_eq(
  $$ select status, claimed_by from public.notification_events
       where tenant_id = (select id from pgtap_mb_tenant) and event_type = 'morning_brief' and business_date = '2026-08-01' $$,
  $$ values ('processing'::public.notification_status, 'worker-reclaim'::text) $$,
  'the lease-expired row is now claimed by worker-reclaim'
);

-- =============================================================================
-- 9. The partial unique index itself rejects a duplicate row even bypassing
--    the RPC entirely (defense in depth, not just the RPC's ON CONFLICT).
-- =============================================================================

-- 4-arg form used explicitly (errcode, NULL message, description) — pgTAP's
-- 3-arg throws_ok(sql, code_or_message, description) auto-dispatches on
-- octet_length($2) = 5 by delegating to throws_ok($1, $2::char(5), $3, NULL),
-- which silently sends OUR description string in as the expected exact
-- error MESSAGE (and drops the real description) whenever the code happens
-- to be 5 bytes, as '23505' is here. That made this assertion compare
-- Postgres's real message ("duplicate key value violates unique
-- constraint...") against our description text and fail every time,
-- regardless of whether the unique index actually fired correctly.
select throws_ok(
  $$ insert into public.notification_events (
       tenant_id, event_type, channel, subject_type, subject_id, source_event_id, business_date, payload
     ) values (
       (select id from pgtap_mb_tenant), 'morning_brief', 'whatsapp', 'morning_brief', gen_random_uuid(), gen_random_uuid(),
       '2026-07-31'::date, '{}'::jsonb
     ) $$,
  '23505',
  NULL,
  'a second raw insert for the same tenant+business_date violates the partial unique index'
);

select * from finish();
rollback;
