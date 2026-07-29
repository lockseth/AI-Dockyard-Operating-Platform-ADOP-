-- ADOP — Gate 6J-B: Assistant Identity Pairing & Client Verification Foundation
--
-- Schema + RPC foundation only, per ADOP_GATE_6J_A_AI_HELP_EXECUTIVE_ASSISTANT_CONTRACT_v1.0.md
-- §9 (identity/pairing lifecycle, Lampiran §21 — proposal, names finalized
-- here). No webhook, no n8n, no AI, no WhatsApp send. Two independent
-- identity lifecycles, deliberately kept in separate tables (contract §19.3):
--
--   A. Owner/Admin channel identity — brand-new table
--      public.assistant_channel_identities, one row per pairing attempt.
--   B. External Client (PIC) verification — new columns on the EXISTING
--      public.client_contacts (no second "candidate number" source, per
--      task instruction and contract §9.2's "candidate identity only").
--
-- Shared security posture for both:
--   - Plaintext challenge codes are NEVER stored — only a sha256 hex digest
--     (pgcrypto, already enabled with schema `extensions` by
--     20260719070115_foundation_tenant_isolation.sql). The plaintext code is
--     returned exactly once, by the issue RPC, to its caller.
--   - TTL is exactly 10 minutes, matching contract §9.1/§9.2/§15.
--   - A per-challenge attempt counter enforces a lockout after 5 wrong
--     guesses (contract §15 "percobaan gagal berulang wajib rate-limited").
--   - Mutation is SECURITY DEFINER RPC-only — no direct INSERT/UPDATE/DELETE
--     grant to `authenticated` on any new column. Every RPC re-derives
--     tenant/user/membership/role at write time, never trusts a caller
--     supplied value beyond an opaque id.
--   - "Issue" and "revoke/reset" RPCs are called by an already-authenticated
--     browser session (granted to `authenticated`) — the actor proves who
--     they are via their own Supabase Auth JWT.
--   - "Complete" RPCs model the OTHER side of the channel: a WhatsApp reply
--     is not a browser session at all. They take channel/address/code as
--     input (the code IS the proof of possession) and are granted to
--     `service_role` only — mirroring claim_next_notification_event /
--     complete_notification_event from 20260721000000. The only caller in
--     this gate is this migration's own pgTAP suite; the real caller (an
--     internal inbound endpoint using the service-role admin client) is
--     Gate 6J-C, not built here.

-- =============================================================================
-- 1. Enums
-- =============================================================================

create type public.assistant_channel_identity_status as enum ('pending', 'verified', 'revoked');

-- Distinct from assistant_channel_identity_status: client_contacts rows
-- pre-exist (created by master data, Gate 1A) independently of any
-- verification attempt, so there is a real "nothing has ever happened yet"
-- state (unverified) as well as an explicit "was verified, now revoked" one
-- — contract task explicitly lists all four.
create type public.client_whatsapp_verification_status as enum ('unverified', 'pending', 'verified', 'revoked');

-- =============================================================================
-- 2. private.generate_assistant_challenge — single source of the random
--    code + digest, reused by both issue RPCs below. Cryptographically
--    random (pgcrypto gen_random_bytes, not random()/pgcrypto's weaker
--    cousins). 6 characters from a 32-symbol alphabet that excludes visually
--    ambiguous characters (0/O, 1/I/L) since a human retypes this over
--    WhatsApp — ~30 bits of entropy, which combined with the 10-minute TTL
--    and the 5-attempt lockout below is the same order of protection as a
--    typical 6-digit SMS OTP (~20 bits) with room to spare.
-- =============================================================================

create function private.generate_assistant_challenge()
returns table (code text, digest text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text := '';
begin
  v_bytes := extensions.gen_random_bytes(6);
  for i in 0..5 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
  end loop;
  return query select v_code, encode(extensions.digest(v_code, 'sha256'), 'hex');
end;
$$;

revoke execute on function private.generate_assistant_challenge() from public;

-- =============================================================================
-- 3. assistant_channel_identities (persona A/B — Owner/Admin)
-- =============================================================================

create table public.assistant_channel_identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null default 'whatsapp' check (channel = 'whatsapp'),
  -- E.164: '+' then 7-15 digits, first digit non-zero.
  normalized_address text not null check (normalized_address ~ '^\+[1-9][0-9]{6,14}$'),
  status public.assistant_channel_identity_status not null default 'pending',
  challenge_digest text,
  challenge_expires_at timestamptz,
  challenge_attempt_count int not null default 0,
  verified_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  revoked_reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Tenant-safe composite FK: user_id must belong to a membership in the
  -- SAME tenant_id as this identity row (mirrors client_contacts.client_id
  -- pattern from 20260719080000_master_data.sql). Any membership status is
  -- accepted here — "active" is re-checked by every RPC at write time, not
  -- baked into the FK, since a membership can be suspended after the row
  -- already exists.
  foreign key (tenant_id, user_id) references public.tenant_memberships (tenant_id, user_id) on delete cascade,
  -- The challenge digest exists exactly while status = 'pending', never
  -- otherwise — cleared the instant a row transitions to verified/revoked so
  -- a stale digest can never be compared against again.
  constraint assistant_channel_identities_challenge_state_chk check (
    (status = 'pending' and challenge_digest is not null and challenge_expires_at is not null)
    or (status <> 'pending' and challenge_digest is null)
  )
);

create index assistant_channel_identities_tenant_id_idx on public.assistant_channel_identities (tenant_id);
create index assistant_channel_identities_user_id_idx on public.assistant_channel_identities (tenant_id, user_id);
create index assistant_channel_identities_pending_lookup_idx
  on public.assistant_channel_identities (channel, normalized_address)
  where status = 'pending';

-- One active verified binding per tenant+channel+normalized_address, and one
-- per tenant+user+channel — both LOCKed by the task. A revoked row is never
-- reusable: it simply falls outside these partial indexes, so a fresh
-- pairing (a brand-new row) is the only way back to verified.
create unique index assistant_channel_identities_verified_address_uidx
  on public.assistant_channel_identities (tenant_id, channel, normalized_address)
  where status = 'verified';
create unique index assistant_channel_identities_verified_user_uidx
  on public.assistant_channel_identities (tenant_id, user_id, channel)
  where status = 'verified';

create trigger set_updated_at before update on public.assistant_channel_identities
  for each row execute function private.set_updated_at();

-- =============================================================================
-- 4. assistant_issue_pairing_challenge — authenticated, self-service only
-- =============================================================================

create function public.assistant_issue_pairing_challenge(
  p_tenant_id uuid,
  p_channel text,
  p_normalized_address text
)
returns table (identity_id uuid, challenge_code text, challenge_expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text;
  v_digest text;
  v_expires_at timestamptz := now() + interval '10 minutes';
  v_identity_id uuid;
begin
  if not private.current_user_has_tenant_role(p_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'Not authorized to pair an assistant channel identity for this tenant' using errcode = '42501';
  end if;

  if p_channel is distinct from 'whatsapp' then
    raise exception 'Unsupported assistant channel: %', p_channel using errcode = '22023';
  end if;

  if p_normalized_address !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'normalized_address must be E.164 (+countrycode...)' using errcode = '22023';
  end if;

  -- Serializes concurrent issue calls for the same (tenant, user, channel)
  -- so the "invalidate old pending" step below can never race with a second
  -- issue call inserting its own pending row first.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || v_user_id::text || ':' || p_channel, 0));

  -- Invalidate any pending challenge already outstanding for this identity
  -- (same tenant+user+channel, regardless of address) — only one live
  -- challenge code should ever be guessable at a time.
  update public.assistant_channel_identities
  set status = 'revoked',
      revoked_at = now(),
      revoked_by = v_user_id,
      revoked_reason = 'superseded_by_new_challenge',
      challenge_digest = null,
      challenge_expires_at = null
  where tenant_id = p_tenant_id
    and user_id = v_user_id
    and channel = p_channel
    and status = 'pending';

  select code, digest into v_code, v_digest from private.generate_assistant_challenge();

  insert into public.assistant_channel_identities (
    tenant_id, user_id, channel, normalized_address, status,
    challenge_digest, challenge_expires_at, created_by
  ) values (
    p_tenant_id, v_user_id, p_channel, p_normalized_address, 'pending',
    v_digest, v_expires_at, v_user_id
  )
  returning id into v_identity_id;

  insert into public.access_audit_events (
    tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    p_tenant_id, v_user_id, 'assistant_channel_identity', v_identity_id, 'pairing_challenge_issued', null,
    jsonb_build_object('channel', p_channel, 'normalized_address', p_normalized_address, 'challenge_expires_at', v_expires_at)
  );

  return query select v_identity_id, v_code, v_expires_at;
end;
$$;

revoke execute on function public.assistant_issue_pairing_challenge(uuid, text, text) from public;
grant execute on function public.assistant_issue_pairing_challenge(uuid, text, text) to authenticated;

-- =============================================================================
-- 5. assistant_complete_pairing — service_role only (the WhatsApp-reply
--    side, not a browser session; see header). Resolves purely by
--    channel+address+code — the code is the proof of possession, so a
--    tenant_id is deliberately NOT an input (n8n never knows it either, per
--    contract §7).
-- =============================================================================

-- Returns a structured `outcome` instead of raising for every failure case
-- — deliberately, not a style choice: a wrong-code attempt must durably
-- persist its attempt-count increment even though the overall call
-- "fails," and in PL/pgSQL a `raise exception` aborts the ENTIRE current
-- statement, rolling back every write that same function call made
-- earlier — including an increment or audit row it just wrote moments
-- before. Only truly write-nothing/input-validation failures (blank code)
-- still raise; every branch that needs a write to survive (wrong-code
-- attempt count, membership-invalid revoke, ambiguous-binding audit)
-- returns normally instead so the write is part of a successful statement.
create function public.assistant_complete_pairing(
  p_channel text,
  p_normalized_address text,
  p_code text
)
returns table (outcome text, identity_id uuid, tenant_id uuid, user_id uuid, verified_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.assistant_channel_identities%rowtype;
  v_matched_id uuid;
  v_digest text;
  v_has_role boolean;
  v_now timestamptz := now();
  v_candidate_count int;
begin
  if p_code is null or btrim(p_code) = '' then
    raise exception 'code is required' using errcode = '22023';
  end if;
  v_digest := encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex');

  select count(*) into v_candidate_count
  from public.assistant_channel_identities
  where channel = p_channel and normalized_address = p_normalized_address and status = 'pending';

  if v_candidate_count = 0 then
    return query select 'not_found'::text, null::uuid, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  -- All still-pending candidates for this exact channel+address, locked so a
  -- concurrent duplicate reply cannot double-complete the same row. Usually
  -- exactly one row (a single user pairing once); more than one can only
  -- happen if the same phone number has outstanding pending pairings in
  -- more than one tenant at once — the digest match below disambiguates,
  -- since each row has its own independently random code.
  for v_row in
    select * from public.assistant_channel_identities
    where channel = p_channel and normalized_address = p_normalized_address and status = 'pending'
    order by created_at asc
    for update
  loop
    if v_row.challenge_digest = v_digest then
      v_matched_id := v_row.id;
      exit;
    end if;
  end loop;

  if v_matched_id is null then
    -- No row matched this code at all: conservatively count the attempt
    -- against every still-pending candidate for this address, since we
    -- cannot tell which one the sender meant to target — errs toward extra
    -- lockout protection rather than none. No raise — this UPDATE must
    -- survive as part of a normal (non-erroring) return, see header note.
    update public.assistant_channel_identities
    set challenge_attempt_count = challenge_attempt_count + 1
    where channel = p_channel and normalized_address = p_normalized_address and status = 'pending';

    return query select 'invalid_code'::text, null::uuid, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  -- Re-fetch the matched row's current attempt count for the lockout check
  -- (v_row still holds it from the loop above, but re-select for clarity).
  select * into v_row from public.assistant_channel_identities where id = v_matched_id for update;

  if v_row.challenge_attempt_count >= 5 then
    return query select 'locked'::text, v_matched_id, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  if v_row.challenge_expires_at < v_now then
    return query select 'expired'::text, v_matched_id, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  -- Re-derive tenant/user/membership/role from scratch — never trust that
  -- the conditions at issue time still hold.
  select exists (
    select 1
    from public.tenant_memberships tm
    join public.membership_roles mr on mr.membership_id = tm.id
    where tm.tenant_id = v_row.tenant_id
      and tm.user_id = v_row.user_id
      and tm.status = 'active'
      and mr.role = any (array['owner', 'admin']::public.tenant_role[])
  ) into v_has_role;

  if not v_has_role then
    update public.assistant_channel_identities
    set status = 'revoked', revoked_at = v_now, revoked_reason = 'membership_or_role_no_longer_valid',
        challenge_digest = null, challenge_expires_at = null
    where id = v_matched_id;

    insert into public.access_audit_events (
      tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
    ) values (
      v_row.tenant_id, v_row.user_id, 'assistant_channel_identity', v_matched_id, 'pairing_failed', null,
      jsonb_build_object('reason', 'membership_or_role_no_longer_valid')
    );

    return query select 'membership_invalid'::text, v_matched_id, v_row.tenant_id, v_row.user_id, null::timestamptz;
    return;
  end if;

  -- Fail closed on ambiguity: this identity (or this exact address, within
  -- the tenant) already has a different active verified binding. Table
  -- alias `aci` is required — this function's own RETURNS TABLE declares an
  -- OUT column also named tenant_id, which plpgsql otherwise treats as a
  -- same-scope variable and reports "column reference is ambiguous"
  -- (mirrors owner_finalize_member_provisioning's membership_id comment).
  if exists (
    select 1 from public.assistant_channel_identities aci
    where aci.tenant_id = v_row.tenant_id and aci.user_id = v_row.user_id and aci.channel = v_row.channel
      and aci.status = 'verified' and aci.id <> v_matched_id
  ) or exists (
    select 1 from public.assistant_channel_identities aci
    where aci.tenant_id = v_row.tenant_id and aci.channel = v_row.channel and aci.normalized_address = v_row.normalized_address
      and aci.status = 'verified' and aci.id <> v_matched_id
  ) then
    insert into public.access_audit_events (
      tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
    ) values (
      v_row.tenant_id, v_row.user_id, 'assistant_channel_identity', v_matched_id, 'pairing_failed', null,
      jsonb_build_object('reason', 'ambiguous_active_verified_binding')
    );

    return query select 'ambiguous_binding'::text, v_matched_id, v_row.tenant_id, v_row.user_id, null::timestamptz;
    return;
  end if;

  update public.assistant_channel_identities
  set status = 'verified', verified_at = v_now, challenge_digest = null, challenge_expires_at = null
  where id = v_matched_id;

  insert into public.access_audit_events (
    tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    v_row.tenant_id, v_row.user_id, 'assistant_channel_identity', v_matched_id, 'pairing_completed', null,
    jsonb_build_object('channel', v_row.channel, 'normalized_address', v_row.normalized_address)
  );

  return query select 'verified'::text, v_matched_id, v_row.tenant_id, v_row.user_id, v_now;
end;
$$;

revoke execute on function public.assistant_complete_pairing(text, text, text) from public;
grant execute on function public.assistant_complete_pairing(text, text, text) to service_role;

-- =============================================================================
-- 6. assistant_revoke_pairing — authenticated: self, or owner within the
--    same tenant. Idempotent (revoking an already-revoked row is a no-op,
--    not an error).
-- =============================================================================

create function public.assistant_revoke_pairing(
  p_identity_id uuid,
  p_reason text default null
)
returns public.assistant_channel_identities
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.assistant_channel_identities%rowtype;
begin
  select * into v_row from public.assistant_channel_identities where id = p_identity_id for update;

  if v_row.id is null then
    raise exception 'Assistant channel identity not found' using errcode = 'P0002';
  end if;

  if not (
    v_row.user_id = auth.uid()
    or private.current_user_has_tenant_role(v_row.tenant_id, array['owner']::public.tenant_role[])
  ) then
    raise exception 'Not authorized to revoke this assistant channel identity' using errcode = '42501';
  end if;

  if v_row.status = 'revoked' then
    return v_row;
  end if;

  update public.assistant_channel_identities
  set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), revoked_reason = p_reason,
      challenge_digest = null, challenge_expires_at = null
  where id = p_identity_id
  returning * into v_row;

  insert into public.access_audit_events (
    tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    v_row.tenant_id, auth.uid(), 'assistant_channel_identity', p_identity_id, 'pairing_revoked', null,
    jsonb_build_object('reason', p_reason)
  );

  return v_row;
end;
$$;

revoke execute on function public.assistant_revoke_pairing(uuid, text) from public;
grant execute on function public.assistant_revoke_pairing(uuid, text) to authenticated;

-- =============================================================================
-- 7. RLS & grants — assistant_channel_identities
-- =============================================================================
-- Same posture as every other tenant table: auto_expose_new_tables is off,
-- so this starts with zero grants; the revoke below is defensive
-- belt-and-suspenders. No INSERT/UPDATE/DELETE grant exists for
-- `authenticated` at all — every mutation above goes through a SECURITY
-- DEFINER RPC. challenge_digest is deliberately excluded from the SELECT
-- column list — even the row's own owner/tenant owner can see everything
-- else about their pairing attempt, never the digest.

alter table public.assistant_channel_identities enable row level security;
revoke all on public.assistant_channel_identities from public;

create policy assistant_channel_identities_select_self_or_owner_admin
  on public.assistant_channel_identities for select
  to authenticated
  using (
    user_id = auth.uid()
    or private.current_user_has_tenant_role(tenant_id, array['owner', 'admin']::public.tenant_role[])
  );

grant select (
  id, tenant_id, user_id, channel, normalized_address, status,
  challenge_expires_at, challenge_attempt_count, verified_at,
  revoked_at, revoked_by, revoked_reason, created_by, created_at, updated_at
) on public.assistant_channel_identities to authenticated;
grant all on public.assistant_channel_identities to service_role;

-- =============================================================================
-- 8. client_contacts — WhatsApp verification lifecycle (persona C candidate
--    identity). Reuses the existing whatsapp_number column as the only
--    number source (contract §9.2, task instruction) — no second table.
-- =============================================================================

alter table public.client_contacts
  add column whatsapp_verification_status public.client_whatsapp_verification_status not null default 'unverified',
  add column whatsapp_verification_digest text,
  add column whatsapp_verification_expires_at timestamptz,
  add column whatsapp_verification_attempt_count int not null default 0,
  add column whatsapp_verified_at timestamptz;

alter table public.client_contacts
  add constraint client_contacts_verification_digest_state_chk check (
    (whatsapp_verification_status = 'pending' and whatsapp_verification_digest is not null and whatsapp_verification_expires_at is not null)
    or (whatsapp_verification_status <> 'pending' and whatsapp_verification_digest is null)
  );

-- Duplicate/ambiguous verified number within one tenant fails closed at the
-- constraint level — a second contact can never become 'verified' while
-- another verified contact in the same tenant already holds this number.
-- Multiple unverified/pending contacts sharing a number are still allowed
-- (contract §9.2 "Never merge clients automatically by phone").
create unique index client_contacts_verified_whatsapp_uidx
  on public.client_contacts (tenant_id, whatsapp_number)
  where whatsapp_verification_status = 'verified';

-- Fires on every UPDATE regardless of caller (RPC or the existing direct
-- PostgREST grant on client_contacts.whatsapp_number) — the number-change
-- reset is a hard invariant, not something a caller can bypass by skipping
-- an RPC. Mirrors the evidence-version-resets-to-pending pattern referenced
-- in the contract (§9.2, ADOP_GATE_4A_CONTRACT_v1.0.md §5).
create function private.reset_client_contact_verification_on_number_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.whatsapp_number is distinct from old.whatsapp_number then
    new.whatsapp_verification_status := 'unverified';
    new.whatsapp_verification_digest := null;
    new.whatsapp_verification_expires_at := null;
    new.whatsapp_verification_attempt_count := 0;
    new.whatsapp_verified_at := null;
  end if;
  return new;
end;
$$;

revoke execute on function private.reset_client_contact_verification_on_number_change() from public;
grant execute on function private.reset_client_contact_verification_on_number_change() to authenticated, service_role;

create trigger reset_verification_on_number_change
  before update on public.client_contacts
  for each row execute function private.reset_client_contact_verification_on_number_change();

-- =============================================================================
-- 9. assistant_issue_client_verification_challenge — authenticated
--    owner/admin of the contact's own tenant.
-- =============================================================================

create function public.assistant_issue_client_verification_challenge(p_contact_id uuid)
returns table (challenge_code text, challenge_expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contact public.client_contacts%rowtype;
  v_code text;
  v_digest text;
  v_expires_at timestamptz := now() + interval '10 minutes';
begin
  select * into v_contact from public.client_contacts where id = p_contact_id for update;

  if v_contact.id is null then
    raise exception 'Client contact not found' using errcode = 'P0002';
  end if;

  if not private.current_user_has_tenant_role(v_contact.tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'Not authorized to verify contacts for this tenant' using errcode = '42501';
  end if;

  if v_contact.status <> 'active' then
    raise exception 'Client contact is not active' using errcode = 'P000I';
  end if;

  if v_contact.whatsapp_number is null or btrim(v_contact.whatsapp_number) = '' then
    raise exception 'Client contact has no WhatsApp number to verify' using errcode = '22023';
  end if;

  if v_contact.whatsapp_number !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'whatsapp_number must be E.164 (+countrycode...) before verification' using errcode = '22023';
  end if;

  select code, digest into v_code, v_digest from private.generate_assistant_challenge();

  update public.client_contacts
  set whatsapp_verification_status = 'pending',
      whatsapp_verification_digest = v_digest,
      whatsapp_verification_expires_at = v_expires_at,
      whatsapp_verification_attempt_count = 0
  where id = p_contact_id;

  insert into public.access_audit_events (
    tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    v_contact.tenant_id, auth.uid(), 'client_contact_verification', p_contact_id, 'client_verification_challenge_issued', null,
    jsonb_build_object('whatsapp_number', v_contact.whatsapp_number, 'challenge_expires_at', v_expires_at)
  );

  return query select v_code, v_expires_at;
end;
$$;

revoke execute on function public.assistant_issue_client_verification_challenge(uuid) from public;
grant execute on function public.assistant_issue_client_verification_challenge(uuid) to authenticated;

-- =============================================================================
-- 10. assistant_complete_client_verification — service_role only (the
--     WhatsApp-reply side). Unlike assistant_complete_pairing, tenant_id IS
--     a required input here per task instruction — client_contacts rows are
--     tenant-scoped master data with no cross-tenant resolution contract in
--     this gate (that remains a Gate 6J-C webhook-resolution concern).
-- =============================================================================

-- Returns a structured `outcome` instead of raising for every failure case
-- — same reasoning as assistant_complete_pairing above: a wrong-code
-- attempt must durably persist its attempt-count increment, which a
-- `raise exception` in the same call would otherwise roll back. Only the
-- write-nothing blank-code check still raises.
create function public.assistant_complete_client_verification(
  p_tenant_id uuid,
  p_whatsapp_number text,
  p_code text
)
returns table (outcome text, contact_id uuid, tenant_id uuid, verified_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
  v_row public.client_contacts%rowtype;
  v_digest text;
  v_now timestamptz := now();
begin
  if p_code is null or btrim(p_code) = '' then
    raise exception 'code is required' using errcode = '22023';
  end if;

  -- Table alias `cc` is required throughout this function — its own
  -- RETURNS TABLE declares an OUT column also named tenant_id, which
  -- plpgsql otherwise treats as a same-scope variable and reports "column
  -- reference is ambiguous" (mirrors assistant_complete_pairing above).
  select count(*) into v_count
  from public.client_contacts cc
  where cc.tenant_id = p_tenant_id and cc.whatsapp_number = p_whatsapp_number and cc.whatsapp_verification_status = 'pending';

  if v_count = 0 then
    return query select 'not_found'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  if v_count > 1 then
    -- Fail closed on ambiguity — exactly one pending candidate is required
    -- (task instruction). More than one pending contact sharing a number is
    -- a legitimate data state (no uniqueness constraint blocks it), but
    -- resolving a verification against it is refused rather than guessed.
    insert into public.access_audit_events (
      tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
    ) values (
      p_tenant_id, null, 'client_contact_verification', p_tenant_id, 'client_verification_failed', null,
      jsonb_build_object('reason', 'ambiguous_pending_candidates', 'whatsapp_number', p_whatsapp_number)
    );

    return query select 'ambiguous'::text, null::uuid, p_tenant_id, null::timestamptz;
    return;
  end if;

  select cc.* into v_row
  from public.client_contacts cc
  where cc.tenant_id = p_tenant_id and cc.whatsapp_number = p_whatsapp_number and cc.whatsapp_verification_status = 'pending'
  for update;

  if v_row.whatsapp_verification_attempt_count >= 5 then
    return query select 'locked'::text, v_row.id, p_tenant_id, null::timestamptz;
    return;
  end if;

  if v_row.whatsapp_verification_expires_at < v_now then
    return query select 'expired'::text, v_row.id, p_tenant_id, null::timestamptz;
    return;
  end if;

  v_digest := encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex');

  if v_digest <> v_row.whatsapp_verification_digest then
    -- No raise here — this UPDATE must survive as part of a normal
    -- (non-erroring) return, see function header note.
    update public.client_contacts
    set whatsapp_verification_attempt_count = whatsapp_verification_attempt_count + 1
    where id = v_row.id;

    return query select 'invalid_code'::text, v_row.id, p_tenant_id, null::timestamptz;
    return;
  end if;

  if v_row.status <> 'active' then
    return query select 'contact_inactive'::text, v_row.id, p_tenant_id, null::timestamptz;
    return;
  end if;

  if exists (
    select 1 from public.client_contacts cc
    where cc.tenant_id = p_tenant_id and cc.whatsapp_number = p_whatsapp_number
      and cc.whatsapp_verification_status = 'verified' and cc.id <> v_row.id
  ) then
    insert into public.access_audit_events (
      tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
    ) values (
      p_tenant_id, null, 'client_contact_verification', v_row.id, 'client_verification_failed', null,
      jsonb_build_object('reason', 'number_already_verified_on_another_contact')
    );

    return query select 'duplicate_number'::text, v_row.id, p_tenant_id, null::timestamptz;
    return;
  end if;

  update public.client_contacts
  set whatsapp_verification_status = 'verified',
      whatsapp_verified_at = v_now,
      whatsapp_verification_digest = null,
      whatsapp_verification_expires_at = null
  where id = v_row.id;

  insert into public.access_audit_events (
    tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    p_tenant_id, null, 'client_contact_verification', v_row.id, 'client_verification_completed', null,
    jsonb_build_object('whatsapp_number', p_whatsapp_number)
  );

  return query select 'verified'::text, v_row.id, p_tenant_id, v_now;
end;
$$;

revoke execute on function public.assistant_complete_client_verification(uuid, text, text) from public;
grant execute on function public.assistant_complete_client_verification(uuid, text, text) to service_role;

-- =============================================================================
-- 11. assistant_reset_client_verification — authenticated owner/admin of the
--     contact's tenant. Idempotent. Branches on current state: a 'pending'
--     challenge is simply cancelled back to 'unverified' (nothing was ever
--     confirmed); a 'verified' contact is explicitly moved to 'revoked' so
--     the audit trail preserves that it WAS verified before this action.
-- =============================================================================

create function public.assistant_reset_client_verification(
  p_contact_id uuid,
  p_reason text default null
)
returns public.client_contacts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.client_contacts%rowtype;
  v_next_status public.client_whatsapp_verification_status;
begin
  select * into v_row from public.client_contacts where id = p_contact_id for update;

  if v_row.id is null then
    raise exception 'Client contact not found' using errcode = 'P0002';
  end if;

  if not private.current_user_has_tenant_role(v_row.tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'Not authorized to reset verification for this tenant' using errcode = '42501';
  end if;

  if v_row.whatsapp_verification_status in ('unverified', 'revoked') then
    return v_row;
  end if;

  v_next_status := case when v_row.whatsapp_verification_status = 'verified'
    then 'revoked'::public.client_whatsapp_verification_status
    else 'unverified'::public.client_whatsapp_verification_status
  end;

  update public.client_contacts
  set whatsapp_verification_status = v_next_status,
      whatsapp_verification_digest = null,
      whatsapp_verification_expires_at = null,
      whatsapp_verification_attempt_count = 0,
      whatsapp_verified_at = null
  where id = p_contact_id
  returning * into v_row;

  insert into public.access_audit_events (
    tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    v_row.tenant_id, auth.uid(), 'client_contact_verification', p_contact_id, 'client_verification_reset', null,
    jsonb_build_object('next_status', v_next_status, 'reason', p_reason)
  );

  return v_row;
end;
$$;

revoke execute on function public.assistant_reset_client_verification(uuid, text) from public;
grant execute on function public.assistant_reset_client_verification(uuid, text) to authenticated;

-- =============================================================================
-- 12. client_contacts grants — restrict SELECT to exclude the new digest
--     column (defense-in-depth: RPCs never return it either, but a raw
--     PostgREST select must not be able to read it). All previously granted
--     columns are re-granted unchanged; only whatsapp_verification_digest is
--     newly excluded. INSERT/UPDATE column grants are untouched — none of
--     the five new columns are added to them, so the browser can never write
--     verification state directly, only via the RPCs above.
-- =============================================================================

-- Full previous column list per 20260719080000_master_data.sql AND
-- 20260721030000_client_billing_profile_and_pic_roles.sql (role,
-- receives_invoice_whatsapp, receives_invoice_email,
-- receives_collection_reminder) — verified against the live schema
-- (`\d public.client_contacts`), not just the original migration, since a
-- whole-table `grant select` silently covers every column added since and
-- a narrower explicit list must not regress any of them.
revoke select on public.client_contacts from authenticated;
grant select (
  id, tenant_id, client_id, full_name, position_department, email, whatsapp_number,
  is_primary, status, created_by, created_at, updated_at,
  role, receives_invoice_whatsapp, receives_invoice_email, receives_collection_reminder,
  whatsapp_verification_status, whatsapp_verification_expires_at, whatsapp_verification_attempt_count,
  whatsapp_verified_at
) on public.client_contacts to authenticated;
