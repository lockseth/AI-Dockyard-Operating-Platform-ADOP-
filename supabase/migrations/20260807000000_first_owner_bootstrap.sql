-- ADOP — Controlled First-Owner Onboarding (Gate: Controlled First-Owner
-- Onboarding Pak Hanafi)
--
-- Adds the one legitimate path for a brand-new tenant's very first Owner to
-- be provisioned WITHOUT the Founder ever becoming a member of that tenant
-- and WITHOUT public self-signup. `demo-owner-bootstrap` (Gate 6G-B) stays
-- completely untouched — it remains locked to the internal Founder demo
-- tenant and must never be pointed at Pak Hanafi's identity; this is a
-- separate, general-purpose mechanism.
--
-- Design (see chat design report for full rationale):
--   1. An authorized operator/platform CLI creates the target tenant (with
--      zero members — an "ownerless draft" in practice, not a new
--      tenant_status) and a single-use bootstrap token, entirely via the
--      service-role key (no authenticated caller exists yet). Only a sha256
--      hex digest of the opaque token is ever stored; the raw token exists
--      only in the one-time link handed to the operator.
--   2. The claimant (Pak Hanafi) opens the link. The claim UI validates the
--      token server-side (read-only RPC), lets him choose his own password,
--      and a Server Action creates his auth.users row via the Admin API
--      (there is no session yet — this cannot go through the normal
--      supabase.auth.updateUser() self-service path) and then calls the
--      atomic claim RPC below, which re-validates everything from scratch
--      and produces exactly one membership with exactly one role: owner.
--
-- Both RPCs are granted to `service_role` ONLY — never `authenticated` or
-- `anon` — because the entire flow runs pre-session (no auth.uid() exists
-- to authorize against), unlike every other RPC in this codebase. This
-- table therefore carries no RLS policy at all (fail-closed default deny);
-- the two RPCs are the sole access path, both server-side only.

create type public.first_owner_bootstrap_status as enum ('pending', 'claimed', 'revoked');

create table public.first_owner_bootstrap_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- Normalized (lower+trim) at issuance time in TypeScript, never here.
  email text not null,
  -- sha256 hex digest of the opaque token. The raw token is never stored,
  -- logged, or returned by any RPC — it exists only in the one-time link.
  token_hash text not null unique,
  status public.first_owner_bootstrap_status not null default 'pending',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);

create index first_owner_bootstrap_tokens_tenant_id_idx on public.first_owner_bootstrap_tokens (tenant_id);

-- At most one pending bootstrap in flight per tenant — a reissue must
-- explicitly revoke the previous pending row first (see the issuance
-- repository), so a retry can never leave two live claim links for the same
-- tenant.
create unique index first_owner_bootstrap_tokens_pending_tenant_unique
  on public.first_owner_bootstrap_tokens (tenant_id)
  where status = 'pending';

alter table public.first_owner_bootstrap_tokens enable row level security;
revoke all on public.first_owner_bootstrap_tokens from public;
-- No policy is created for `authenticated`/`anon` — RLS with zero policies
-- denies everything by default. service_role bypasses RLS entirely and is
-- the only role the issuance CLI and claim RPCs ever run as.
grant all on public.first_owner_bootstrap_tokens to service_role;

-- =============================================================================
-- 1. resolve_first_owner_bootstrap_token — read-only validation for the
--    claim page's initial render. Never locks a row (plain read), never
--    mutates. Deliberately does not distinguish "expired" vs "claimed" vs
--    "revoked" vs "never existed" in its error — all collapse to the same
--    generic p0002, mirroring this codebase's existing "tautan tidak valid
--    atau sudah kedaluwarsa" convention (implicit-confirm, SetPasswordForm)
--    so the claim page can never be used to enumerate which tokens exist.
-- =============================================================================

create function public.resolve_first_owner_bootstrap_token(p_token_hash text)
returns table (token_id uuid, tenant_id uuid, tenant_display_name text, email text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.first_owner_bootstrap_tokens%rowtype;
  v_tenant_display_name text;
  v_has_owner boolean;
begin
  select * into v_row from public.first_owner_bootstrap_tokens where token_hash = p_token_hash;

  if not found or v_row.status <> 'pending' or v_row.expires_at < now() then
    raise exception 'invalid_or_expired' using errcode = 'P0002';
  end if;

  select exists (
    select 1
    from public.tenant_memberships tm
    join public.membership_roles mr on mr.membership_id = tm.id
    where tm.tenant_id = v_row.tenant_id
      and tm.status = 'active'
      and mr.role = 'owner'
  ) into v_has_owner;

  if v_has_owner then
    raise exception 'tenant_already_has_owner' using errcode = 'P0010';
  end if;

  select display_name into v_tenant_display_name from public.tenants where id = v_row.tenant_id;

  return query select v_row.id, v_row.tenant_id, v_tenant_display_name, v_row.email;
end;
$$;

revoke execute on function public.resolve_first_owner_bootstrap_token(text) from public;
grant execute on function public.resolve_first_owner_bootstrap_token(text) to service_role;

-- =============================================================================
-- 2. claim_first_owner_bootstrap — the atomic write. Called once the Server
--    Action has already created (via the Admin API) the auth.users row for
--    the token's email — p_user_id is that id, passed explicitly because
--    this runs with the service-role key, not a user session: there is no
--    auth.uid() to derive it from. Re-validates every condition from
--    scratch (never trusts the earlier resolve call — closes the TOCTOU
--    window the Admin API call in between necessarily opens), exactly like
--    owner_finalize_member_provisioning (20260729010000).
-- =============================================================================

create function public.claim_first_owner_bootstrap(p_token_hash text, p_user_id uuid)
returns table (tenant_id uuid, membership_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.first_owner_bootstrap_tokens%rowtype;
  v_user_email text;
  v_membership_id uuid;
  v_has_owner boolean;
begin
  select * into v_row from public.first_owner_bootstrap_tokens where token_hash = p_token_hash for update;

  if not found then
    raise exception 'invalid_or_expired' using errcode = 'P0002';
  end if;

  -- Idempotent retry: the exact same already-completed claim (e.g. a
  -- doubled form submit or a client that never saw the first response)
  -- returns the same outcome instead of erroring. A claim already completed
  -- by a DIFFERENT user id is a genuine conflict, not a safe retry — this
  -- should be structurally unreachable (the token is single-use and the
  -- email/token pair is 1:1), but fails closed rather than silently no-op.
  if v_row.status = 'claimed' then
    if v_row.claimed_by = p_user_id then
      select tm.id into v_membership_id
        from public.tenant_memberships tm
        where tm.tenant_id = v_row.tenant_id and tm.user_id = p_user_id;
      return query select v_row.tenant_id, v_membership_id;
      return;
    end if;
    raise exception 'token_already_claimed' using errcode = 'P0012';
  end if;

  if v_row.status = 'revoked' or v_row.expires_at < now() then
    raise exception 'invalid_or_expired' using errcode = 'P0002';
  end if;

  -- v_row.status = 'pending' and not expired from here on.

  select lower(email) into v_user_email from auth.users where id = p_user_id;
  if v_user_email is null or v_user_email <> v_row.email then
    raise exception 'email_mismatch' using errcode = 'P0011';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_row.tenant_id::text, 0));

  select exists (
    select 1
    from public.tenant_memberships tm
    join public.membership_roles mr on mr.membership_id = tm.id
    where tm.tenant_id = v_row.tenant_id
      and tm.status = 'active'
      and mr.role = 'owner'
  ) into v_has_owner;

  if v_has_owner then
    raise exception 'tenant_already_has_owner' using errcode = 'P0010';
  end if;

  if exists (
    select 1 from public.tenant_memberships tm
    where tm.tenant_id = v_row.tenant_id and tm.user_id = p_user_id
  ) then
    raise exception 'partial_state_conflict' using errcode = 'P0013';
  end if;

  insert into public.tenant_memberships (tenant_id, user_id, status)
  values (v_row.tenant_id, p_user_id, 'active')
  returning id into v_membership_id;

  insert into public.membership_roles (membership_id, role)
  values (v_membership_id, 'owner');

  update public.first_owner_bootstrap_tokens
  set status = 'claimed', claimed_at = now(), claimed_by = p_user_id
  where id = v_row.id;

  -- actor_user_id = p_user_id: this is Pak Hanafi's own claim action, even
  -- though it runs with the service-role key and has no auth.uid() session
  -- to derive it from automatically (unlike private.record_membership_audit,
  -- which fires on the inserts above and correctly records actor_user_id =
  -- auth.uid() = null for this same service-role context — that automatic
  -- trail covers "membership/role created"; this event covers the
  -- bootstrap-specific fact of which token authorized it).
  insert into public.access_audit_events (
    tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    v_row.tenant_id, p_user_id, 'tenant', v_row.tenant_id, 'first_owner_bootstrap_claimed',
    null, jsonb_build_object('token_id', v_row.id)
  );

  return query select v_row.tenant_id, v_membership_id;
end;
$$;

revoke execute on function public.claim_first_owner_bootstrap(text, uuid) from public;
grant execute on function public.claim_first_owner_bootstrap(text, uuid) to service_role;
