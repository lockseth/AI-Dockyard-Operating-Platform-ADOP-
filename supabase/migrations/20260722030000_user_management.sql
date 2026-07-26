-- ADOP — Tenant User, Invitation & Password Foundation
--
-- Closes the "server-side only until a later phase" gap left open in Gate 0A
-- (20260719070115_foundation_tenant_isolation.sql §6: no INSERT/UPDATE/DELETE
-- grant existed for `authenticated` on tenant_memberships/membership_roles).
--
-- Every member — including a person who already has an ADOP account in a
-- different tenant — must explicitly accept a tenant invitation before a
-- tenant_memberships row is ever created for them. Membership creation is
-- never a side effect of the owner submitting the invite form; it only ever
-- happens inside accept_tenant_invitation(), atomically with role
-- assignment, for the exact one invitation being accepted (never a mass
-- "activate everything invited" operation).
--
-- Sending the invitation email cannot be made atomic with the database (an
-- email either goes out or it doesn't, independent of any transaction), so
-- the pending public.tenant_invitations row is created FIRST and is safe to
-- retry: create_tenant_invitation() reuses an existing still-pending,
-- non-expired row for the same (tenant, email) instead of erroring, so a
-- retried invite action after an email-send failure never creates a
-- duplicate row and — critically — never creates an active membership on
-- its own.
--
-- All membership/role mutations go through narrow, explicitly-authorized
-- SECURITY DEFINER RPCs in the `public` schema (PostgREST only exposes
-- RPC-callable functions from schemas listed in api.schemas — `private` is
-- never reachable via .rpc()). There are deliberately NO raw INSERT/UPDATE/
-- DELETE grants for `authenticated` on tenant_memberships or membership_
-- roles: a raw grant plus an RLS policy is a second, independent
-- authorization surface that could be called directly via PostgREST and
-- bypass whatever invariant the RPC enforces (e.g. the last-owner guard) —
-- collapsing everything onto one reviewable RPC per operation avoids that.
-- RLS stays enabled on both tables as defense-in-depth for reads.
--
-- Also adds profiles.email (denormalized from auth.users, set only by the
-- existing signup trigger) so an owner/admin can see teammates' email/name
-- without any application code ever reading auth.users directly.

-- =============================================================================
-- 1. profiles.email + cross-member visibility + current-user-email helper
-- =============================================================================

alter table public.profiles add column email text;

comment on column public.profiles.email is
  'Denormalized cache of auth.users.email, set only by private.handle_new_user() at signup. Not kept in sync with later email changes in this gate — there is no self-service email-change feature yet.';

-- One-time backfill for rows created before this column existed. Runs as the
-- migration role (has access to auth.users) — never done from app code.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.user_id
  and p.email is null;

-- display_name is read from raw_user_meta_data here purely for a non-
-- authorization display field (the name an owner types in at invite time,
-- passed as auth.admin.inviteUserByEmail(email, { data: { display_name } })).
-- No authorization decision anywhere in this codebase derives from user
-- metadata — that rule is unchanged.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (user_id, email, display_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'display_name')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Case-insensitive: every email comparison in this migration (invitation
-- lookups, acceptance ownership check, duplicate detection) goes through
-- lower() on both sides so "Budi@Example.com" and "budi@example.com" are
-- always treated as the same address.
create function private.current_user_email()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select lower(email) from auth.users where id = auth.uid();
$$;

revoke execute on function private.current_user_email() from public;
grant execute on function private.current_user_email() to authenticated;

-- Lets an owner/admin see the name/email of anyone who shares an active
-- tenant membership with them, in any tenant where the caller holds
-- owner/admin — additive alongside profiles_select_own (permissive SELECT
-- policies OR together, so this only ever widens visibility, never narrows
-- the existing self-select policy).
create function private.current_user_can_view_profile(p_target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tenant_memberships caller_tm
    join public.membership_roles caller_mr on caller_mr.membership_id = caller_tm.id
    join public.tenant_memberships target_tm
      on target_tm.tenant_id = caller_tm.tenant_id
     and target_tm.user_id = p_target_user_id
    where caller_tm.user_id = auth.uid()
      and caller_tm.status = 'active'
      and caller_mr.role = any (array['owner', 'admin']::public.tenant_role[])
  );
$$;

revoke execute on function private.current_user_can_view_profile(uuid) from public;
grant execute on function private.current_user_can_view_profile(uuid) to authenticated;

create policy profiles_select_tenant_owner_admin
  on public.profiles for select
  to authenticated
  using (private.current_user_can_view_profile (user_id));

-- =============================================================================
-- 2. tenant_invitations — the invitation foundation (not a password store)
-- =============================================================================
-- Deliberately minimal: tenant_id, normalized email, intended role, who
-- invited them, lifecycle status + expiry, and who/when it was accepted.
-- No token/password column — acceptance is authorized by comparing the
-- authenticated caller's own verified email (private.current_user_email())
-- against this row, never by a bearer token in a URL.

create type public.tenant_invitation_status as enum ('pending', 'accepted', 'expired');

create table public.tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null,
  role public.tenant_role not null,
  invited_by uuid references auth.users (id) on delete set null,
  status public.tenant_invitation_status not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tenant_invitations_tenant_id_idx on public.tenant_invitations (tenant_id);
create index tenant_invitations_email_idx on public.tenant_invitations (email);

-- Only one pending invitation per (tenant, email) — create_tenant_invitation
-- reuses this row on retry instead of erroring. A new pending row can still
-- be created later once this one is accepted or expired.
create unique index tenant_invitations_pending_unique
  on public.tenant_invitations (tenant_id, email)
  where status = 'pending';

create trigger set_updated_at before update on public.tenant_invitations
  for each row execute function private.set_updated_at();

alter table public.tenant_invitations enable row level security;
revoke all on public.tenant_invitations from public;

-- Owner can see every invitation for their own tenant (to know what's
-- pending) — read-only from the browser; every write goes through the RPCs
-- in §4 below.
create policy tenant_invitations_select_owner
  on public.tenant_invitations for select
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner']::public.tenant_role[]));

-- A user can see their OWN pending invitations, in any tenant, regardless of
-- whether they hold any role there yet — this is what /invite/accept and
-- /select-tenant list to offer an Accept action.
create policy tenant_invitations_select_own_email
  on public.tenant_invitations for select
  to authenticated
  using (email = private.current_user_email ());

grant select on public.tenant_invitations to authenticated;
grant all on public.tenant_invitations to service_role;

-- Lets someone with a pending invitation see the inviting tenant's display
-- name before they are a member of it (tenants_select_member alone would
-- not cover this — they aren't an active member yet).
create policy tenants_select_pending_invitee
  on public.tenants for select
  to authenticated
  using (
    exists (
      select 1 from public.tenant_invitations ti
      where ti.tenant_id = tenants.id
        and ti.status = 'pending'
        and ti.email = private.current_user_email ()
    )
  );

-- =============================================================================
-- 3. Last-owner guards — role-independent, concurrency-safe via an advisory
--    lock keyed by tenant_id (acquired before the count check so two
--    concurrent transactions touching the same tenant's owner-count
--    serialize instead of both reading a stale pre-commit count)
-- =============================================================================

create function private.guard_last_owner_on_membership_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_remaining_owners int;
begin
  -- Only relevant when an active membership is leaving 'active'.
  if new.status = 'active' or old.status <> 'active' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(old.tenant_id::text, 0));

  if not exists (
    select 1 from public.membership_roles mr
    where mr.membership_id = old.id and mr.role = 'owner'
  ) then
    return new;
  end if;

  select count(*) into v_remaining_owners
    from public.tenant_memberships tm
    join public.membership_roles mr on mr.membership_id = tm.id
    where tm.tenant_id = old.tenant_id
      and tm.status = 'active'
      and mr.role = 'owner'
      and tm.id <> old.id;

  if v_remaining_owners = 0 then
    raise exception 'Cannot deactivate the last active owner of a tenant';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_last_owner_on_membership_status() from public;

drop trigger if exists guard_last_owner_on_membership_status on public.tenant_memberships;
create trigger guard_last_owner_on_membership_status
  before update on public.tenant_memberships
  for each row execute function private.guard_last_owner_on_membership_status();

create function private.guard_last_owner_on_role_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_remaining_owners int;
begin
  if old.role <> 'owner' then
    return old;
  end if;

  select tm.tenant_id into v_tenant_id
    from public.tenant_memberships tm
    where tm.id = old.membership_id;

  perform pg_advisory_xact_lock(hashtextextended(v_tenant_id::text, 0));

  select count(*) into v_remaining_owners
    from public.membership_roles mr
    join public.tenant_memberships tm on tm.id = mr.membership_id
    where tm.tenant_id = v_tenant_id
      and mr.role = 'owner'
      and mr.membership_id <> old.membership_id;

  if v_remaining_owners = 0 then
    raise exception 'Cannot remove the last owner role of a tenant';
  end if;

  return old;
end;
$$;

revoke execute on function private.guard_last_owner_on_role_delete() from public;

drop trigger if exists guard_last_owner_on_role_delete on public.membership_roles;
create trigger guard_last_owner_on_role_delete
  before delete on public.membership_roles
  for each row execute function private.guard_last_owner_on_role_delete();

-- =============================================================================
-- 4. RPCs — the only write path for invitations/memberships/roles
-- =============================================================================
-- All live in `public` (PostgREST-exposed), all SECURITY DEFINER (there are
-- no grants for `authenticated` on the underlying tables at all — see the
-- header comment), and each re-derives/re-checks authorization from
-- auth.uid() internally rather than trusting the caller or the app layer.

-- Idempotent by design: retrying with the same (tenant, email) while a
-- pending, non-expired invitation already exists reuses that row (updating
-- the role if it changed) instead of raising a duplicate error — this is
-- what makes "create the invitation, then best-effort send the email"
-- retry-safe (see header comment). Returns whether an auth.users account
-- already exists for this email so the caller knows whether to send a real
-- Supabase invite-by-email (brand new account) or nothing at all (existing
-- account — they will see this invitation next time they sign in).
create function public.create_tenant_invitation(p_tenant_id uuid, p_email text, p_role public.tenant_role)
returns table (invitation_id uuid, target_user_exists boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(trim(p_email));
  v_target_user_id uuid;
  v_invitation_id uuid;
begin
  if not private.current_user_has_tenant_role(p_tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'Not authorized to invite members to this tenant' using errcode = '42501';
  end if;

  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Invalid email' using errcode = '22000';
  end if;

  select u.id into v_target_user_id from auth.users u where lower(u.email) = v_email;

  if v_target_user_id is not null and exists (
    select 1 from public.tenant_memberships tm
    where tm.tenant_id = p_tenant_id and tm.user_id = v_target_user_id and tm.status = 'active'
  ) then
    raise exception 'This user is already an active member of this tenant' using errcode = 'P0005';
  end if;

  select id into v_invitation_id
    from public.tenant_invitations
    where tenant_id = p_tenant_id and email = v_email and status = 'pending' and expires_at > now();

  if v_invitation_id is not null then
    update public.tenant_invitations set role = p_role where id = v_invitation_id and role <> p_role;
  else
    insert into public.tenant_invitations (tenant_id, email, role, invited_by)
    values (p_tenant_id, v_email, p_role, auth.uid())
    returning id into v_invitation_id;
  end if;

  return query select v_invitation_id, (v_target_user_id is not null);
end;
$$;

revoke execute on function public.create_tenant_invitation(uuid, text, public.tenant_role) from public;
grant execute on function public.create_tenant_invitation(uuid, text, public.tenant_role) to authenticated;

-- Acceptance + membership creation/activation + role assignment happen in
-- one atomic transaction, scoped to exactly this one invitation — never a
-- mass "activate everything invited for this user" operation. `for update`
-- on the invitation row serializes concurrent accept attempts on the same
-- invitation; the advisory lock additionally serializes against any
-- concurrent last-owner-affecting mutation on the same tenant.
--
-- Returns NULL (not an exception) for the expired-but-still-pending case,
-- specifically so the status='expired' update just before it durably
-- commits: raising an exception afterward in the same statement would roll
-- back everything back to the caller's savepoint, including that UPDATE —
-- there is no way to keep a side effect and still signal failure via
-- exception in the same statement. The not-found/wrong-user/already-
-- accepted cases have no preceding side effect to lose, so they still raise
-- immediately.
create function public.accept_tenant_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitation public.tenant_invitations%rowtype;
  v_membership_id uuid;
begin
  select * into v_invitation from public.tenant_invitations where id = p_invitation_id for update;

  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;

  if v_invitation.email <> private.current_user_email() then
    raise exception 'This invitation does not belong to the current user' using errcode = '42501';
  end if;

  if v_invitation.status = 'accepted' then
    raise exception 'Invitation already accepted' using errcode = 'P0003';
  end if;

  if v_invitation.status <> 'pending' or v_invitation.expires_at < now() then
    update public.tenant_invitations set status = 'expired' where id = p_invitation_id and status = 'pending';
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_invitation.tenant_id::text, 0));

  insert into public.tenant_memberships (tenant_id, user_id, status)
  values (v_invitation.tenant_id, auth.uid(), 'active')
  on conflict (tenant_id, user_id) do update set status = 'active'
  returning id into v_membership_id;

  insert into public.membership_roles (membership_id, role)
  values (v_membership_id, v_invitation.role)
  on conflict (membership_id, role) do nothing;

  update public.tenant_invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
  where id = p_invitation_id;

  return v_membership_id;
end;
$$;

revoke execute on function public.accept_tenant_invitation(uuid) from public;
grant execute on function public.accept_tenant_invitation(uuid) to authenticated;

-- "Change role" replaces the membership's entire role set with exactly one
-- role. Verified safe against this codebase's actual data shape before
-- writing this: every fixture/seed/pgTAP row in the repository assigns
-- exactly one role per membership_id (grep for "membership_roles" — no
-- membership_id ever appears twice), and the UI only ever offers a single
-- role picker per person — there is no existing multi-role-per-membership
-- usage this would destroy. The last-owner delete guard above still applies
-- mid-replacement (it fires on the delete before the insert), so this can
-- never leave a tenant without an owner even momentarily.
create function public.set_membership_role(p_membership_id uuid, p_role public.tenant_role)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_user_id uuid;
begin
  select tenant_id, user_id into v_tenant_id, v_user_id
    from public.tenant_memberships where id = p_membership_id;

  if v_tenant_id is null then
    raise exception 'Membership not found' using errcode = 'P0002';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if v_user_id = auth.uid() then
    raise exception 'Cannot change your own role' using errcode = '42501';
  end if;

  delete from public.membership_roles where membership_id = p_membership_id;
  insert into public.membership_roles (membership_id, role) values (p_membership_id, p_role);
end;
$$;

revoke execute on function public.set_membership_role(uuid, public.tenant_role) from public;
grant execute on function public.set_membership_role(uuid, public.tenant_role) to authenticated;

-- Activate/deactivate an existing member. Self-target and non-owner callers
-- are rejected inside the function itself (not merely by an RLS policy),
-- consistent with there being no raw UPDATE grant on tenant_memberships at
-- all.
create function public.set_membership_status(p_membership_id uuid, p_status public.membership_status)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_user_id uuid;
begin
  if p_status not in ('active', 'suspended') then
    raise exception 'Invalid target status' using errcode = '22000';
  end if;

  select tenant_id, user_id into v_tenant_id, v_user_id
    from public.tenant_memberships where id = p_membership_id;

  if v_tenant_id is null then
    raise exception 'Membership not found' using errcode = 'P0002';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if v_user_id = auth.uid() then
    raise exception 'Cannot change your own membership status' using errcode = '42501';
  end if;

  update public.tenant_memberships set status = p_status where id = p_membership_id;
end;
$$;

revoke execute on function public.set_membership_status(uuid, public.membership_status) from public;
grant execute on function public.set_membership_status(uuid, public.membership_status) to authenticated;

-- Covers the "password successfully updated" audit requirement for a plain
-- recovery flow (no membership row changes in that case, so there is
-- nothing for record_membership_audit's triggers to hang an event off).
-- Takes no parameters, only ever reads auth.uid(), and never stores a
-- password or token value. There is no equivalent function for "password
-- reset requested": that step is pre-authentication, so there is no
-- auth.uid() and no safe way to resolve a tenant to scope the row to
-- without either fabricating an actor/tenant or re-introducing an
-- email-enumeration signal — this is a deliberate, documented gap, not an
-- oversight.
create function public.log_own_password_reset_completed()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.access_audit_events (
    tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  )
  select tm.tenant_id, auth.uid(), 'user', auth.uid(), 'password_reset_completed', null, null
  from public.tenant_memberships tm
  where tm.user_id = auth.uid();
end;
$$;

revoke execute on function public.log_own_password_reset_completed() from public;
grant execute on function public.log_own_password_reset_completed() to authenticated;

-- =============================================================================
-- 5. Audit trail — automatic, same transaction as the mutation
-- =============================================================================
-- Mirrors private.log_master_data_mutation() from Gate 1A.1: SECURITY
-- DEFINER (authenticated has no INSERT grant on access_audit_events — Gate
-- 0A §6), fixed search_path, actor from auth.uid() and action from TG_OP/
-- column deltas only — never from caller input. auth.uid() still resolves
-- correctly here even though every mutation above happens inside another
-- SECURITY DEFINER function: it reads the request.jwt.claims GUC, which is
-- session-scoped and unaffected by SECURITY DEFINER's privilege-role
-- switch, so the real invoking user is always the recorded actor.

create function private.record_membership_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_entity_id uuid;
  v_action text;
  v_before jsonb;
  v_after jsonb;
begin
  if tg_table_name = 'tenant_memberships' then
    v_entity_id := coalesce(new.id, old.id);
    if tg_op = 'INSERT' then
      v_tenant_id := new.tenant_id;
      v_action := 'member_joined';
      v_before := null;
      v_after := to_jsonb(new);
    else
      v_tenant_id := new.tenant_id;
      v_before := to_jsonb(old);
      v_after := to_jsonb(new);
      if old.status is distinct from new.status and new.status = 'active' then
        v_action := 'membership_activated';
      elsif old.status is distinct from new.status then
        v_action := 'membership_deactivated';
      else
        v_action := 'membership_updated';
      end if;
    end if;
  else
    -- membership_roles: INSERT or DELETE only (no UPDATE path is ever used).
    if tg_op = 'INSERT' then
      select tm.tenant_id into v_tenant_id from public.tenant_memberships tm where tm.id = new.membership_id;
      v_entity_id := new.membership_id;
      v_action := 'role_assigned';
      v_before := null;
      v_after := to_jsonb(new);
    else
      select tm.tenant_id into v_tenant_id from public.tenant_memberships tm where tm.id = old.membership_id;
      v_entity_id := old.membership_id;
      v_action := 'role_removed';
      v_before := to_jsonb(old);
      v_after := null;
    end if;
  end if;

  -- A membership_roles DELETE reaching here via the FK's own ON DELETE
  -- CASCADE (tenant_memberships row deleted first, e.g. auth.users being
  -- removed) finds no parent row left to resolve tenant_id from — there is
  -- no tenant left to attribute the event to, and the membership itself is
  -- being torn down anyway, so skip the audit insert rather than violating
  -- access_audit_events' NOT NULL tenant_id and aborting the whole delete.
  if v_tenant_id is not null then
    insert into public.access_audit_events (
      tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
    ) values (
      v_tenant_id, auth.uid(), 'tenant_membership', v_entity_id, v_action, v_before, v_after
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function private.record_membership_audit() from public;

drop trigger if exists membership_audit_log on public.tenant_memberships;
create trigger membership_audit_log
  after insert or update on public.tenant_memberships
  for each row execute function private.record_membership_audit();

drop trigger if exists membership_audit_log on public.membership_roles;
create trigger membership_audit_log
  after insert or delete on public.membership_roles
  for each row execute function private.record_membership_audit();

-- Invitation lifecycle gets its own audit trail (created/accepted/expired),
-- separate from the membership trail above — same SECURITY DEFINER/actor/
-- fixed-search_path shape, no sensitive data (no token/password column
-- exists on tenant_invitations to leak in the first place).
create function private.record_invitation_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'invitation_created';
  elsif old.status is distinct from new.status and new.status = 'accepted' then
    v_action := 'invitation_accepted';
  elsif old.status is distinct from new.status and new.status = 'expired' then
    v_action := 'invitation_expired';
  else
    v_action := 'invitation_updated';
  end if;

  insert into public.access_audit_events (
    tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    new.tenant_id,
    coalesce(new.accepted_by, new.invited_by, auth.uid()),
    'tenant_invitation',
    new.id,
    v_action,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );

  return new;
end;
$$;

revoke execute on function private.record_invitation_audit() from public;

drop trigger if exists invitation_audit_log on public.tenant_invitations;
create trigger invitation_audit_log
  after insert or update on public.tenant_invitations
  for each row execute function private.record_invitation_audit();
