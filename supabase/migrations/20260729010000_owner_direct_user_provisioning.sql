-- ADOP — Owner Direct Internal User Provisioning & Temporary Password Reset
-- (Gate 6G-H, continued)
--
-- Replaces the email-invitation UX for internal users (Admin/Viewer) with a
-- direct-creation flow: the owner types a name/email/role and a temporary
-- password, and the membership exists immediately — no invite email, no
-- accept step. The email-invitation machinery from 20260722030000 and the
-- stuck-invitation recovery RPC from 20260729000000 are both left
-- completely untouched; this migration only adds the additional path.
--
-- Creating a brand-new auth.users row is only reachable via the service-role
-- Admin API (auth.admin.createUser), never from SQL — so, like
-- owner_provision_invited_member before it, this flow is split across two
-- RPCs with the TypeScript-side Admin API call sandwiched between them:
--
--   1. owner_resolve_provision_target(tenant, email) — read-only. Tells the
--      caller whether an auth.users row already exists for this email, what
--      this tenant's existing membership (if any) looks like, whether the
--      target has an active/suspended membership in a DIFFERENT tenant, and
--      whether a pending invitation for this exact (tenant, email) is
--      sitting around from the old invite flow.
--   2. (TypeScript) creates a brand-new auth.users row via the Admin API
--      (email doesn't exist yet) or does nothing here (email already
--      exists — the temporary password is set on the existing account
--      afterward, in step 3, exactly like owner_provision_invited_member's
--      "membership first, password second" order).
--   3. owner_finalize_member_provisioning(...) — re-validates every
--      condition against current state (closing the race window between
--      steps 1 and 2) and, only if still safe, atomically activates the
--      membership + sets the role + resolves any pending invitation for
--      this (tenant, email) + writes an explicit audit event.
--
-- Reset Password Sementara for an already-active member is a separate,
-- single RPC (owner_authorize_member_password_reset) since it never touches
-- tenant_memberships/membership_roles at all — it only authorizes the
-- caller and target, then writes the audit event; the TypeScript layer
-- performs the actual password set via the Admin API afterward, reusing
-- admin-repository.ts's existing setTemporaryPasswordAndConfirm.

-- =============================================================================
-- 1. owner_resolve_provision_target — read-only lookup
-- =============================================================================

create function public.owner_resolve_provision_target(p_tenant_id uuid, p_email text)
returns table (
  target_user_id uuid,
  same_tenant_membership_id uuid,
  same_tenant_status public.membership_status,
  cross_tenant_conflict boolean,
  pending_invitation_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(trim(p_email));
  v_target_user_id uuid;
  v_target_match_count int;
  v_same_tenant_membership_id uuid;
  v_same_tenant_status public.membership_status;
  v_cross_tenant_conflict boolean := false;
  v_pending_invitation_id uuid;
begin
  if not private.current_user_has_tenant_role(p_tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'Not authorized to provision members for this tenant' using errcode = '42501';
  end if;

  -- Same defensive ambiguity guard as owner_provision_invited_member: email
  -- uniqueness in auth.users is a GoTrue-enforced invariant, not a database
  -- constraint this migration can see, so this treats more-than-one match
  -- as a hard stop rather than silently picking one.
  select count(*) into v_target_match_count from auth.users where lower(email) = v_email;
  if v_target_match_count > 1 then
    raise exception 'Target identity is ambiguous' using errcode = 'P000D';
  end if;

  if v_target_match_count = 1 then
    select id into v_target_user_id from auth.users where lower(email) = v_email;

    select tm.id, tm.status into v_same_tenant_membership_id, v_same_tenant_status
      from public.tenant_memberships tm
      where tm.tenant_id = p_tenant_id and tm.user_id = v_target_user_id;

    select exists (
      select 1 from public.tenant_memberships tm
      where tm.user_id = v_target_user_id
        and tm.tenant_id <> p_tenant_id
        and tm.status in ('active', 'suspended')
    ) into v_cross_tenant_conflict;
  end if;

  select ti.id into v_pending_invitation_id
    from public.tenant_invitations ti
    where ti.tenant_id = p_tenant_id and ti.email = v_email and ti.status = 'pending'
    limit 1;

  return query select v_target_user_id, v_same_tenant_membership_id, v_same_tenant_status, v_cross_tenant_conflict, v_pending_invitation_id;
end;
$$;

revoke execute on function public.owner_resolve_provision_target(uuid, text) from public;
grant execute on function public.owner_resolve_provision_target(uuid, text) to authenticated;

-- =============================================================================
-- 2. owner_finalize_member_provisioning — the atomic write, re-validates
--    everything from scratch instead of trusting the resolve step's answer
--    (closes the TOCTOU window a service-role Admin API call in between
--    necessarily opens)
-- =============================================================================

create function public.owner_finalize_member_provisioning(
  p_tenant_id uuid,
  p_target_user_id uuid,
  p_role public.tenant_role,
  p_pending_invitation_id uuid,
  p_new_auth_account boolean
)
returns table (membership_id uuid, reactivated boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing_membership_id uuid;
  v_existing_status public.membership_status;
  v_membership_id uuid;
  v_reactivated boolean;
begin
  if not private.current_user_has_tenant_role(p_tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'Not authorized to provision members for this tenant' using errcode = '42501';
  end if;

  if not exists (select 1 from auth.users where id = p_target_user_id) then
    raise exception 'Target identity is ambiguous' using errcode = 'P000D';
  end if;

  if exists (
    select 1 from public.tenant_memberships tm
    where tm.user_id = p_target_user_id
      and tm.tenant_id <> p_tenant_id
      and tm.status in ('active', 'suspended')
  ) then
    raise exception 'Target has membership in another tenant' using errcode = 'P000E';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));

  select tm.id, tm.status into v_existing_membership_id, v_existing_status
    from public.tenant_memberships tm
    where tm.tenant_id = p_tenant_id and tm.user_id = p_target_user_id
    for update;

  -- Covers both "same-tenant active member already" (STOP duplicate) and a
  -- retry of this exact call after it already succeeded once — retrying a
  -- successful provisioning is not idempotent here by design: a second
  -- temporary password issuance for an already-provisioned member goes
  -- through Reset Password Sementara (owner_authorize_member_password_reset)
  -- instead, not back through this function.
  if v_existing_status = 'active' then
    raise exception 'This user is already an active member of this tenant' using errcode = 'P0005';
  end if;

  -- A pre-existing (non-active) row means this is a reactivation of a
  -- previously suspended membership; no pre-existing row means a brand-new
  -- membership, regardless of whether the auth.users account itself was
  -- just created or already existed elsewhere with no membership at all.
  v_reactivated := (v_existing_membership_id is not null);

  insert into public.tenant_memberships (tenant_id, user_id, status)
  values (p_tenant_id, p_target_user_id, 'active')
  on conflict (tenant_id, user_id) do update set status = 'active'
  returning id into v_membership_id;

  -- Same "replace the entire role set with exactly one role" contract as
  -- set_membership_role — verified safe against this codebase's actual data
  -- shape there (see that function's migration comment); unaffected by this
  -- addition.
  -- Qualified with the table name (not just "membership_id = v_membership_id")
  -- because this function's own RETURNS TABLE declares an OUT column also
  -- named membership_id, which plpgsql otherwise treats as a same-scope
  -- variable and reports as "column reference is ambiguous" against
  -- membership_roles.membership_id.
  delete from public.membership_roles where public.membership_roles.membership_id = v_membership_id;
  insert into public.membership_roles (membership_id, role) values (v_membership_id, p_role);

  -- Best-effort cleanup, not a hard requirement: if the pending invitation
  -- no longer matches (already resolved by something else, wrong tenant,
  -- concurrently modified), this simply updates zero rows rather than
  -- failing the whole provisioning attempt over a stale cleanup target.
  if p_pending_invitation_id is not null then
    update public.tenant_invitations
    set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
    where id = p_pending_invitation_id
      and tenant_id = p_tenant_id
      and status = 'pending';
  end if;

  insert into public.access_audit_events (
    tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    p_tenant_id,
    auth.uid(),
    'tenant_membership',
    v_membership_id,
    case when v_reactivated then 'member_direct_reactivated' else 'member_direct_created' end,
    null,
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'role', p_role,
      'new_auth_account', p_new_auth_account,
      'pending_invitation_id', p_pending_invitation_id
    )
  );

  return query select v_membership_id, v_reactivated;
end;
$$;

revoke execute on function public.owner_finalize_member_provisioning(uuid, uuid, public.tenant_role, uuid, boolean) from public;
grant execute on function public.owner_finalize_member_provisioning(uuid, uuid, public.tenant_role, uuid, boolean) to authenticated;

-- =============================================================================
-- 3. owner_authorize_member_password_reset — authorization + audit only;
--    never touches auth.users (that step is TS-side, via the Admin API,
--    exactly like the temporary-password step in Gate 6G-H's original
--    owner_provision_invited_member flow)
-- =============================================================================

create function public.owner_authorize_member_password_reset(p_membership_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_user_id uuid;
  v_status public.membership_status;
begin
  select tenant_id, user_id, status into v_tenant_id, v_user_id, v_status
    from public.tenant_memberships where id = p_membership_id;

  if v_tenant_id is null then
    raise exception 'Membership not found' using errcode = 'P0002';
  end if;

  if not private.current_user_has_tenant_role(v_tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if v_user_id = auth.uid() then
    raise exception 'Cannot reset your own temporary password' using errcode = '42501';
  end if;

  if v_status <> 'active' then
    raise exception 'Membership is not active' using errcode = 'P000I';
  end if;

  insert into public.access_audit_events (
    tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    v_tenant_id, auth.uid(), 'tenant_membership', p_membership_id, 'member_temporary_password_reset', null,
    jsonb_build_object('target_user_id', v_user_id)
  );

  return v_user_id;
end;
$$;

revoke execute on function public.owner_authorize_member_password_reset(uuid) from public;
grant execute on function public.owner_authorize_member_password_reset(uuid) to authenticated;
