-- ADOP Gate 1L-R2 — pgTAP proof for
-- public.resolve_verified_owner_recipient (20260811000000_notification_
-- recipient_resolution.sql): exactly-one-verified-owner resolves, zero or
-- ambiguous candidates fail closed (never guess, never fall back), a
-- verified non-owner or an inactive/pending/revoked identity is never
-- treated as a valid recipient, cross-tenant isolation, and the RPC is
-- service_role-only.
--
-- Self-contained: creates its own fixtures (tenant prefix f9f9f9f9-, user
-- prefix f9000000-, identity prefix f9500000-, not used by any other pgTAP
-- file in this directory) and rolls back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- =============================================================================
-- Fixtures — two tenants, so cross-tenant leakage is provable.
-- =============================================================================

insert into public.tenants (id, slug, display_name, status) values
  ('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1', 'pgtap-notif-recipient-tenant-p', 'PgTAP Notif Recipient Tenant P', 'active'),
  ('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f2', 'pgtap-notif-recipient-tenant-q', 'PgTAP Notif Recipient Tenant Q', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-4000-0000-000000000001', 'authenticated', 'authenticated', 'owner-p@pgtap-notif-recipient.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-4000-0000-000000000002', 'authenticated', 'authenticated', 'admin-p@pgtap-notif-recipient.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-4000-0000-000000000003', 'authenticated', 'authenticated', 'owner2-p@pgtap-notif-recipient.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-4000-0000-000000000004', 'authenticated', 'authenticated', 'owner-suspended-p@pgtap-notif-recipient.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-4000-0000-000000000005', 'authenticated', 'authenticated', 'owner-pending-p@pgtap-notif-recipient.local', 'x', now(), now(), now(), '{}', '{}', false, false),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-4000-0000-000000000006', 'authenticated', 'authenticated', 'owner-q@pgtap-notif-recipient.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('f9500000-4000-0000-0000-000000000001', 'f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1', 'f9000000-0000-4000-0000-000000000001', 'active'),
  ('f9500000-4000-0000-0000-000000000002', 'f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1', 'f9000000-0000-4000-0000-000000000002', 'active'),
  ('f9500000-4000-0000-0000-000000000003', 'f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1', 'f9000000-0000-4000-0000-000000000003', 'active'),
  ('f9500000-4000-0000-0000-000000000004', 'f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1', 'f9000000-0000-4000-0000-000000000004', 'suspended'),
  ('f9500000-4000-0000-0000-000000000005', 'f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1', 'f9000000-0000-4000-0000-000000000005', 'active'),
  ('f9500000-4000-0000-0000-000000000006', 'f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f2', 'f9000000-0000-4000-0000-000000000006', 'active');

insert into public.membership_roles (membership_id, role) values
  ('f9500000-4000-0000-0000-000000000001', 'owner'),
  ('f9500000-4000-0000-0000-000000000002', 'admin'),
  ('f9500000-4000-0000-0000-000000000003', 'owner'),
  ('f9500000-4000-0000-0000-000000000004', 'owner'),
  ('f9500000-4000-0000-0000-000000000005', 'owner'),
  ('f9500000-4000-0000-0000-000000000006', 'owner');

-- =============================================================================
-- 1. No verified identity at all yet — fail closed, not an error.
-- =============================================================================

select is(
  public.resolve_verified_owner_recipient('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1'),
  null::text,
  'no candidates yet: resolves to NULL, not an error'
);

select is(
  public.resolve_verified_owner_recipient(null),
  null::text,
  'a null tenant id resolves to NULL, never a fallback number'
);

-- =============================================================================
-- 2. A verified identity that is NOT the tenant's owner (admin) never
--    qualifies as a recipient.
-- =============================================================================

insert into public.assistant_channel_identities (tenant_id, user_id, channel, normalized_address, status, verified_at)
values ('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1', 'f9000000-0000-4000-0000-000000000002', 'whatsapp', '+628110000002', 'verified', now());

select is(
  public.resolve_verified_owner_recipient('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1'),
  null::text,
  'a verified admin identity is never treated as the owner recipient'
);

-- =============================================================================
-- 3. A verified identity belonging to a SUSPENDED owner membership never
--    qualifies (role alone is not enough — membership must be active too).
-- =============================================================================

insert into public.assistant_channel_identities (tenant_id, user_id, channel, normalized_address, status, verified_at)
values ('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1', 'f9000000-0000-4000-0000-000000000004', 'whatsapp', '+628110000004', 'verified', now());

select is(
  public.resolve_verified_owner_recipient('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1'),
  null::text,
  'a verified owner identity with a suspended membership is never a valid recipient'
);

-- =============================================================================
-- 4. A PENDING (not yet verified) owner identity never qualifies.
-- =============================================================================

insert into public.assistant_channel_identities (tenant_id, user_id, channel, normalized_address, status, challenge_digest, challenge_expires_at)
values ('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1', 'f9000000-0000-4000-0000-000000000005', 'whatsapp', '+628110000005', 'pending', 'x', now() + interval '10 minutes');

select is(
  public.resolve_verified_owner_recipient('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1'),
  null::text,
  'a pending (unverified) owner identity is never a valid recipient'
);

-- =============================================================================
-- 4b. A REVOKED owner identity never qualifies — status <> 'verified' is
--     sufficient by construction, but Gate 1L-R3 requires this proven
--     explicitly rather than left implicit in the status filter.
-- =============================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
) values
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-4000-0000-000000000007', 'authenticated', 'authenticated', 'owner-revoked-p@pgtap-notif-recipient.local', 'x', now(), now(), now(), '{}', '{}', false, false);

insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('f9500000-4000-0000-0000-000000000007', 'f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1', 'f9000000-0000-4000-0000-000000000007', 'active');

insert into public.membership_roles (membership_id, role) values
  ('f9500000-4000-0000-0000-000000000007', 'owner');

insert into public.assistant_channel_identities (tenant_id, user_id, channel, normalized_address, status, verified_at, revoked_at, revoked_reason)
values ('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1', 'f9000000-0000-4000-0000-000000000007', 'whatsapp', '+628110000007', 'revoked', now(), now(), 'pgtap fixture');

select is(
  public.resolve_verified_owner_recipient('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1'),
  null::text,
  'a revoked owner identity (previously verified, now revoked) is never a valid recipient'
);

-- =============================================================================
-- 5. Exactly one verified, active owner identity — the happy path.
-- =============================================================================

insert into public.assistant_channel_identities (tenant_id, user_id, channel, normalized_address, status, verified_at)
values ('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1', 'f9000000-0000-4000-0000-000000000001', 'whatsapp', '+628110000001', 'verified', now());

select is(
  public.resolve_verified_owner_recipient('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1'),
  '+628110000001'::text,
  'the single verified active owner identity resolves as the recipient'
);

-- =============================================================================
-- 5b. Retry / re-claim proof: calling the resolver again for the SAME
--     tenant while the canonical state is unchanged must return the exact
--     same recipient every time — a retry never drifts to a different
--     number on its own.
-- =============================================================================

select is(
  public.resolve_verified_owner_recipient('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1'),
  '+628110000001'::text,
  'a repeated call (simulating a delivery retry) with unchanged state resolves the identical recipient'
);

select is(
  public.resolve_verified_owner_recipient('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1'),
  public.resolve_verified_owner_recipient('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1'),
  'two consecutive calls agree with each other — no non-determinism to drift on'
);

-- =============================================================================
-- 6. A second, DIFFERENT verified owner identity makes it ambiguous — fail
--    closed rather than picking either number.
-- =============================================================================

insert into public.assistant_channel_identities (tenant_id, user_id, channel, normalized_address, status, verified_at)
values ('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1', 'f9000000-0000-4000-0000-000000000003', 'whatsapp', '+628110000003', 'verified', now());

select is(
  public.resolve_verified_owner_recipient('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1'),
  null::text,
  'two distinct verified owner numbers for the same tenant resolve to NULL — never guessed'
);

-- Remove the second owner identity so tenant P is back to exactly one
-- verified owner for the cross-tenant check below.
delete from public.assistant_channel_identities
  where tenant_id = 'f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1'
    and normalized_address = '+628110000003';

-- =============================================================================
-- 7. Cross-tenant isolation — tenant Q has its own, DIFFERENT verified owner
--    number. Resolving tenant P must never return tenant Q's number (or
--    vice versa), even though both are verified owners at the same instant.
-- =============================================================================

insert into public.assistant_channel_identities (tenant_id, user_id, channel, normalized_address, status, verified_at)
values ('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f2', 'f9000000-0000-4000-0000-000000000006', 'whatsapp', '+628110000006', 'verified', now());

select is(
  public.resolve_verified_owner_recipient('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f1'),
  '+628110000001'::text,
  'tenant P still resolves to its own owner number, not tenant Q''s'
);

select is(
  public.resolve_verified_owner_recipient('f9f9f9f9-f9f9-4f9f-8f9f-f9f9f9f9f9f2'),
  '+628110000006'::text,
  'tenant Q resolves to its own owner number, not tenant P''s'
);

-- =============================================================================
-- 8. Grants — service_role only, same posture as every other
--    tenant-crossing / recipient-bearing RPC in this schema.
-- =============================================================================

select ok(
  not has_function_privilege('authenticated', 'public.resolve_verified_owner_recipient(uuid)', 'EXECUTE'),
  'authenticated cannot call resolve_verified_owner_recipient'
);
select ok(
  not has_function_privilege('anon', 'public.resolve_verified_owner_recipient(uuid)', 'EXECUTE'),
  'anon cannot call resolve_verified_owner_recipient'
);
select ok(
  has_function_privilege('service_role', 'public.resolve_verified_owner_recipient(uuid)', 'EXECUTE'),
  'service_role can call resolve_verified_owner_recipient'
);

select * from finish();
rollback;
