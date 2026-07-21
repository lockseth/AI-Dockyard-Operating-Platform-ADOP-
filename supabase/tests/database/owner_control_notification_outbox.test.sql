-- ADOP Phase 1 Gate 1L — pgTAP proof for the Owner Control WhatsApp
-- Notification Outbox: exactly-once enqueue on ready-for-review and on
-- owner-approved-commit, no enqueue on reject, retry-submit non-duplication,
-- claim/complete/fail lifecycle (lease, bounded retry, claim-ownership
-- enforcement), append-only/no-delete, and tenant-safe grants (nobody but
-- service_role can reach the outbox at all — see
-- 20260721000000_owner_control_notification_outbox.sql).
--
-- claim_next_notification_event claims the globally oldest PENDING row
-- (not scoped to any one business object), and this whole file runs inside
-- one pgTAP transaction where now() is frozen — so every created_at in this
-- file is identical, and two simultaneously-pending rows would tie with no
-- meaningful secondary order. To keep every claim assertion deterministic,
-- each notification this file creates is driven to a terminal state (sent
-- or failed) before the NEXT one is created, so at every untargeted claim
-- call there is provably exactly one pending row in the whole table.
--
-- True concurrent claims (two simultaneous workers) cannot be expressed
-- inside one pgTAP transaction (single sequential connection) — that is
-- proven with real parallel calls in
-- tests/integration/owner-control-notification-outbox.integration.test.ts.
-- This file proves the sequential state machine each claim/complete/fail
-- transition depends on.
--
-- Self-contained: creates its own fixtures (tenant prefixes e1e1e1e1-/
-- e2e2e2e2-, not used by any other pgTAP file in this directory) and rolls
-- back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'pgtap-notif-outbox-tenant-p', 'PgTAP Notif Outbox Tenant P', 'active'),
  ('e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2', 'pgtap-notif-outbox-tenant-q', 'PgTAP Notif Outbox Tenant Q', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-0000-000000000001', 'authenticated', 'authenticated', 'owner-p@pgtap-notif-outbox.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-0000-000000000002', 'authenticated', 'authenticated', 'admin-p@pgtap-notif-outbox.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-0000-000000000003', 'authenticated', 'authenticated', 'viewer-p@pgtap-notif-outbox.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('e1500000-4000-0000-0000-000000000001', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'e1000000-0000-4000-0000-000000000001', 'active'),
  ('e1500000-4000-0000-0000-000000000002', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'e1000000-0000-4000-0000-000000000002', 'active'),
  ('e1500000-4000-0000-0000-000000000003', 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'e1000000-0000-4000-0000-000000000003', 'active');

insert into public.membership_roles (membership_id, role) values
  ('e1500000-4000-0000-0000-000000000001', 'owner'),
  ('e1500000-4000-0000-0000-000000000002', 'admin'),
  ('e1500000-4000-0000-0000-000000000003', 'viewer');

create temporary table pgtap_owner_p as select 'e1000000-0000-4000-0000-000000000001'::uuid as id;
create temporary table pgtap_admin_p as select 'e1000000-0000-4000-0000-000000000002'::uuid as id;
create temporary table pgtap_tenant_p as select 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1'::uuid as id;
grant select on pgtap_tenant_p to authenticated;

-- One opening row + one cash top-up row — the minimum shape that can reach
-- mapping_required (a batch with zero non-opening rows never leaves
-- 'draft': touch_cash_import_batch_after_edit only fires from a mapping/
-- disposition edit, and there is nothing to map/dispose without a
-- non-opening row) and then ready_for_review.
select set_config(
  'pgtap.notif_rows',
  $$[
    {"source_row_number":2,"source_fingerprint":"nf-open","description":null,"vessel_label":null,"debit":null,"credit":null,"workbook_balance":1000000,"calculated_balance":1000000,"provisional_classification":"opening_cash","status":"valid","validation_issues":[]},
    {"source_row_number":3,"source_fingerprint":"nf-kas","description":"setor kas","vessel_label":"Kas","debit":500000,"credit":null,"workbook_balance":1500000,"calculated_balance":1500000,"provisional_classification":"cash_top_up_candidate","status":"valid","validation_issues":[]}
  ]$$,
  true
);

-- =============================================================================
-- 1. mark_cash_import_batch_ready_for_review enqueues exactly one
--    import_review_requested notification, with the fixed message and a
--    link_path that carries only the batch id.
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ select public.create_cash_import_batch(
       'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'laporan-notif.xlsx', 'sha-notif-001', 'Sheet1', '2036-06-01',
       1000000, 1500000, current_setting('pgtap.notif_rows')::jsonb
     ) $$,
  'batch staged'
);

create temporary table pgtap_batch1 as
  select id from public.cash_import_batches where tenant_id = (select id from pgtap_tenant_p) and source_sha256 = 'sha-notif-001';
grant select on pgtap_batch1 to authenticated;

select lives_ok($$ select public.set_cash_import_label_mapping((select id from pgtap_batch1), 'Kas', 'cash') $$, 'Kas mapped to cash');
select lives_ok(
  $$ select public.set_cash_import_row_disposition(
       (select id from public.cash_import_rows where batch_id = (select id from pgtap_batch1) and vessel_label = 'Kas'), 'include', null
     ) $$,
  'Kas row included'
);

select lives_ok(
  $$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch1)) $$,
  'batch marked ready for review'
);

reset role;
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$ select count(*)::int from public.notification_events
       where tenant_id = (select id from pgtap_tenant_p)
         and event_type = 'import_review_requested'
         and subject_id = (select id from pgtap_batch1) $$,
  $$ values (1) $$,
  'exactly one import_review_requested notification was enqueued'
);

select results_eq(
  $$ select status, channel, attempt_count, payload ->> 'message_line1', payload ->> 'link_path'
       from public.notification_events
       where tenant_id = (select id from pgtap_tenant_p) and event_type = 'import_review_requested'
         and subject_id = (select id from pgtap_batch1) $$,
  $$ values (
       'pending'::public.notification_status, 'whatsapp'::text, 0,
       'Pak Hanafi, ada hasil import kas yang menunggu pemeriksaan.'::text,
       ('/owner/review/cash-import/' || (select id from pgtap_batch1)::text)
     ) $$,
  'review-requested payload matches the LOCKed message and carries only the batch id in the link'
);

-- =============================================================================
-- 2. Retry submit does not duplicate — a second submit call on an
--    already-ready_for_review batch must fail and must not add a row.
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select throws_like(
  $$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch1)) $$,
  '%BATCH_NOT_ELIGIBLE_FOR_REVIEW%',
  'resubmitting an already-ready_for_review batch is rejected'
);

reset role;
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$ select count(*)::int from public.notification_events
       where tenant_id = (select id from pgtap_tenant_p) and event_type = 'import_review_requested'
         and subject_id = (select id from pgtap_batch1) $$,
  $$ values (1) $$,
  'retrying submit did not create a second notification'
);

-- =============================================================================
-- 3. Claim / complete lifecycle — driven to a terminal state (sent) right
--    here, while this is the ONLY notification in the whole outbox, so the
--    "claim the oldest pending row" calls below are unambiguous. Run as
--    service_role, the only role that can reach these RPCs (mirrors
--    master_data_audit_atomicity.test.sql's `set local role service_role`
--    pattern; no JWT claim is needed or set). notification_events itself
--    grants NOTHING directly, not even to service_role — every read used to
--    VERIFY a result runs at the default (table-owner) session role; only
--    the actual claim/complete/fail RPC calls run under service_role,
--    tightly scoped per call.
-- =============================================================================

set local role service_role;
select throws_like(
  $$ select public.claim_next_notification_event('', 300) $$,
  '%worker id is required%',
  'claim rejects an empty worker id'
);
select lives_ok(
  $$ select public.claim_next_notification_event('worker-a', 300) $$,
  'worker-a claims the (only) pending notification'
);
reset role;

select results_eq(
  $$ select status, claimed_by, attempt_count from public.notification_events
       where tenant_id = (select id from pgtap_tenant_p) and event_type = 'import_review_requested'
         and subject_id = (select id from pgtap_batch1) $$,
  $$ values ('processing'::public.notification_status, 'worker-a'::text, 1) $$,
  'claim sets processing/claimed_by/attempt_count=1 on the claimed row'
);

-- A second claim call must find nothing — the only row in the outbox is
-- now 'processing' with a live lease, so the claim query's WHERE clause
-- excludes it entirely (this is the sequential, single-connection proof;
-- true concurrent-claim racing is proven with real parallel HTTP calls in
-- the integration test).
set local role service_role;
select lives_ok($$ select public.claim_next_notification_event('worker-b', 300) $$, 'worker-b finds nothing to claim');
reset role;

select results_eq(
  $$ select claimed_by from public.notification_events
       where tenant_id = (select id from pgtap_tenant_p) and event_type = 'import_review_requested'
         and subject_id = (select id from pgtap_batch1) $$,
  $$ values ('worker-a'::text) $$,
  'worker-b did not steal worker-a''s still-leased claim'
);

-- notification_events grants nothing directly, not even to service_role
-- (§7 below) — resolve the row id once at default (table-owner) role and
-- reuse it, since a plain subquery on the table would itself fail with
-- permission denied while running under `set local role service_role`.
create temporary table pgtap_claimed1 as
  select id from public.notification_events
  where tenant_id = (select id from pgtap_tenant_p) and event_type = 'import_review_requested'
    and subject_id = (select id from pgtap_batch1);
grant select on pgtap_claimed1 to service_role;

set local role service_role;
-- Wrong worker cannot complete someone else's claim.
select throws_like(
  $$ select public.complete_notification_event((select id from pgtap_claimed1), 'worker-b', 'msg-wrong') $$,
  '%NOTIFICATION_CLAIM_MISMATCH%',
  'a worker that does not hold the claim cannot complete it'
);
-- The actual claim holder can complete it.
select lives_ok(
  $$ select public.complete_notification_event((select id from pgtap_claimed1), 'worker-a', 'fonnte-msg-123') $$,
  'worker-a completes its own claim'
);
reset role;

select results_eq(
  $$ select status, provider_message_id, sent_at is not null from public.notification_events
       where id = (select id from pgtap_claimed1) $$,
  $$ values ('sent'::public.notification_status, 'fonnte-msg-123'::text, true) $$,
  'completed notification is sent with provider_message_id and sent_at recorded'
);

-- Completing (or failing) an already-sent row is rejected — it is no longer
-- 'processing' claimed by anyone.
set local role service_role;
select throws_like(
  $$ select public.complete_notification_event((select id from pgtap_claimed1), 'worker-a', 'again') $$,
  '%NOTIFICATION_CLAIM_MISMATCH%',
  'completing an already-sent notification is rejected'
);
reset role;

-- The outbox is empty of pending rows again — safe to create the next one.

-- =============================================================================
-- 4. Reject does not enqueue anything, and a legitimate resubmit does.
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ select public.reject_cash_import_batch((select id from pgtap_batch1), 'perlu revisi mapping') $$,
  'owner rejects the batch'
);

reset role;
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$ select count(*)::int from public.notification_events
       where subject_id = (select id from pgtap_batch1) and event_type = 'import_approved' $$,
  $$ values (0) $$,
  'rejection never enqueues an import_approved (or any) notification'
);

-- Re-submit for a real approval below — this is a legitimate second
-- ready_for_review transition (mapping_required -> ready_for_review again
-- after the reject folded it back), and per the design SHOULD enqueue a
-- fresh notification (a new cash_import_events row backs it), proving retry
-- suppression is about literal retries, not legitimate resubmits.
select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000002', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select lives_ok(
  $$ select public.mark_cash_import_batch_ready_for_review((select id from pgtap_batch1)) $$,
  'batch re-submitted for review after reject'
);
reset role;
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$ select count(*)::int from public.notification_events
       where tenant_id = (select id from pgtap_tenant_p) and event_type = 'import_review_requested'
         and subject_id = (select id from pgtap_batch1) $$,
  $$ values (2) $$,
  'a legitimate resubmit after reject enqueues its own new notification (2 total)'
);

-- =============================================================================
-- 5. Bounded retry via fail_notification_event — default max_attempts=5.
--    The resubmit notification from §4 is again the ONLY pending row in the
--    outbox (the first one was driven to 'sent' in §3), so claim/fail calls
--    below are unambiguous. Drives the row to terminal 'failed'.
-- =============================================================================

create temporary table pgtap_claimed2 as
  select id from public.notification_events
  where tenant_id = (select id from pgtap_tenant_p) and event_type = 'import_review_requested'
    and status = 'pending';
grant select on pgtap_claimed2 to service_role;

select results_eq(
  $$ select count(*)::int, max(max_attempts) from pgtap_claimed2 join public.notification_events using (id) $$,
  $$ values (1, 5) $$,
  'exactly one pending notification remains, defaulting to max_attempts=5'
);

set local role service_role;
do $$
declare
  i integer;
  v_status public.notification_status;
begin
  for i in 1..4 loop
    perform public.claim_next_notification_event('worker-retry', 300);
    select status into v_status from public.fail_notification_event(
      (select id from pgtap_claimed2), 'worker-retry', 'fonnte timeout ' || i
    );
    if v_status <> 'pending' then
      raise exception 'expected pending after attempt %, got %', i, v_status;
    end if;
  end loop;
end;
$$;
reset role;

select results_eq(
  $$ select status, attempt_count, last_error from public.notification_events where id = (select id from pgtap_claimed2) $$,
  $$ values ('pending'::public.notification_status, 4, 'fonnte timeout 4'::text) $$,
  'four failures stay retryable (pending) with attempt_count=4'
);

set local role service_role;
select lives_ok(
  $$ select public.claim_next_notification_event('worker-retry', 300) $$,
  'fifth claim succeeds'
);
select lives_ok(
  $$ select public.fail_notification_event((select id from pgtap_claimed2), 'worker-retry', 'fonnte timeout 5') $$,
  'fifth failure recorded'
);
reset role;

select results_eq(
  $$ select status, attempt_count from public.notification_events where id = (select id from pgtap_claimed2) $$,
  $$ values ('failed'::public.notification_status, 5) $$,
  'the fifth failure at attempt_count=max_attempts becomes terminal failed'
);

-- A terminal 'failed' row is never claimable again — nothing else is
-- pending either, so this claim must find nothing at all.
set local role service_role;
select lives_ok($$ select public.claim_next_notification_event('worker-sweep', 300) $$, 'sweep claim after exhaustion');
reset role;

select results_eq(
  $$ select claimed_by from public.notification_events where id = (select id from pgtap_claimed2) $$,
  $$ values ('worker-retry'::text) $$,
  'a terminal failed row keeps its last claimant — it is never claimed again'
);

-- =============================================================================
-- 6. approve_and_commit_cash_import_batch enqueues exactly one
--    import_approved notification with the fixed confirmation message and
--    no link_path. The outbox is empty of pending rows again at this point.
-- =============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select lives_ok(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch1)) $$,
  'owner approves and commits the batch'
);

reset role;
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$ select count(*)::int from public.notification_events
       where tenant_id = (select id from pgtap_tenant_p) and event_type = 'import_approved'
         and subject_id = (select id from pgtap_batch1) $$,
  $$ values (1) $$,
  'exactly one import_approved notification was enqueued'
);

select results_eq(
  $$ select status, payload ->> 'message_line1', payload ? 'link_path'
       from public.notification_events
       where tenant_id = (select id from pgtap_tenant_p) and event_type = 'import_approved'
         and subject_id = (select id from pgtap_batch1) $$,
  $$ values (
       'pending'::public.notification_status,
       'Pak Hanafi, hasil import telah disetujui dan berhasil dicatat di ADOP.'::text,
       false
     ) $$,
  'confirmation payload matches the LOCKed message and carries no link/amount'
);

-- Retry approval does not duplicate either — already-committed batches
-- reject a second approve call outright.
select set_config('request.jwt.claims', json_build_object('sub', 'e1000000-0000-4000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);
select throws_like(
  $$ select public.approve_and_commit_cash_import_batch((select id from pgtap_batch1)) $$,
  '%BATCH_ALREADY_COMMITTED%',
  'retrying approve on an already-committed batch is rejected'
);
reset role;
select set_config('request.jwt.claims', '', true);

select results_eq(
  $$ select count(*)::int from public.notification_events
       where tenant_id = (select id from pgtap_tenant_p) and event_type = 'import_approved'
         and subject_id = (select id from pgtap_batch1) $$,
  $$ values (1) $$,
  'retrying approve did not create a second confirmation notification'
);

-- =============================================================================
-- 7. Tenant-safe grants — nobody but service_role can reach the outbox at
--    all, from any tenant role, and not even by direct table access.
-- =============================================================================

select ok(
  not has_table_privilege('authenticated', 'public.notification_events', 'SELECT'),
  'authenticated has no SELECT on notification_events'
);
select ok(
  not has_table_privilege('authenticated', 'public.notification_events', 'INSERT'),
  'authenticated has no INSERT on notification_events'
);
select ok(
  not has_table_privilege('authenticated', 'public.notification_events', 'UPDATE'),
  'authenticated has no UPDATE on notification_events'
);
select ok(
  not has_table_privilege('service_role', 'public.notification_events', 'UPDATE'),
  'service_role has no direct UPDATE on notification_events either — mutation is RPC-only'
);
select ok(
  not has_function_privilege('authenticated', 'public.claim_next_notification_event(text, integer)', 'EXECUTE'),
  'authenticated cannot call claim_next_notification_event'
);
select ok(
  has_function_privilege('service_role', 'public.claim_next_notification_event(text, integer)', 'EXECUTE'),
  'service_role can call claim_next_notification_event'
);
select ok(
  not has_function_privilege('authenticated', 'public.complete_notification_event(uuid, text, text)', 'EXECUTE'),
  'authenticated cannot call complete_notification_event'
);
select ok(
  not has_function_privilege('authenticated', 'public.fail_notification_event(uuid, text, text)', 'EXECUTE'),
  'authenticated cannot call fail_notification_event'
);

-- =============================================================================
-- 8. Append-only — DELETE is blocked at the trigger level, role-independent.
--    service_role already cannot even attempt this (no grant at all, §7);
--    the meaningful proof is that the table OWNER — who bypasses every
--    GRANT/REVOKE and would otherwise be able to delete anything — is still
--    blocked, because private.block_notification_event_delete fires
--    regardless of who issues the DELETE.
-- =============================================================================

select throws_like(
  $$ delete from public.notification_events where id = (select id from pgtap_claimed1) $$,
  '%cannot be deleted%',
  'not even the table owner can delete a notification_events row'
);

-- =============================================================================
-- 9. private.enqueue_notification_event is idempotent on its own (defense in
--    depth beyond the state machine already proven in §1-6) — called twice
--    with the identical (tenant, event_type, source_event_id) inserts only
--    once. Runs as the pgTAP superuser session role, which — like every
--    SECURITY DEFINER function owner in this schema — always has implicit
--    execute rights on a function it owns, mirroring how the RPCs in §8a/8b
--    of the migration reach it without any authenticated-facing grant.
-- =============================================================================

select lives_ok(
  $$ select private.enqueue_notification_event(
       (select id from pgtap_tenant_p), 'import_approved', 'pgtap_probe', gen_random_uuid(),
       '00000000-0000-4000-8000-000000000001', jsonb_build_object('message_line1', 'probe one')
     ) $$,
  'first enqueue with a fixed source_event_id succeeds'
);
select lives_ok(
  $$ select private.enqueue_notification_event(
       (select id from pgtap_tenant_p), 'import_approved', 'pgtap_probe', gen_random_uuid(),
       '00000000-0000-4000-8000-000000000001', jsonb_build_object('message_line1', 'probe two — should be dropped')
     ) $$,
  'second enqueue with the SAME source_event_id is a no-op, not an error'
);

select results_eq(
  $$ select count(*)::int, min(payload ->> 'message_line1')
       from public.notification_events
       where source_event_id = '00000000-0000-4000-8000-000000000001'::uuid $$,
  $$ values (1, 'probe one'::text) $$,
  'only the first enqueue''s row exists — the duplicate call was dropped by the unique constraint'
);

select * from finish();
rollback;
