-- ADOP — Owner Direct Provisioning for stuck pending invitations (Gate 6G-H)
--
-- Some pending admin invitations point at an email that already has an
-- auth.users row, but the person never got a working accept link (broken
-- default email templates / implicit-flow fragments — the exact failure
-- class Gates 6G-F/6G-G exist to fix). They cannot self-serve
-- accept_tenant_invitation() because that RPC requires the CALLER's own
-- session to match the invitation's email — there is no such session here.
--
-- This migration adds exactly one additional, narrowly-scoped RPC for that
-- recovery case: the owner picks one of their own tenant's pending
-- invitations, and — only if every safety condition below holds — the
-- membership/role/invitation-state changes happen here, atomically. The
-- temporary password itself is never handled in SQL (Supabase Auth's
-- password hashing is only reachable via the service-role Admin API, from
-- TypeScript) — this RPC only ever returns the resolved target_user_id so
-- the caller can perform that step next.
--
-- accept_tenant_invitation() itself is completely untouched: this is an
-- additional path, not a replacement.

create function public.owner_provision_invited_member(p_invitation_id uuid, p_expected_role public.tenant_role)
returns table (membership_id uuid, target_user_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitation public.tenant_invitations%rowtype;
  v_target_user_id uuid;
  v_target_match_count int;
  v_membership_id uuid;
  v_existing_membership_id uuid;
  v_existing_status public.membership_status;
  v_existing_role public.tenant_role;
  v_cross_tenant_conflict boolean;
  v_pending_count_this_tenant int;
begin
  select * into v_invitation from public.tenant_invitations where id = p_invitation_id for update;

  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;

  if not private.current_user_has_tenant_role(v_invitation.tenant_id, array['owner']::public.tenant_role[]) then
    raise exception 'Not authorized to provision members for this tenant' using errcode = '42501';
  end if;

  -- Idempotent retry: if a previous call already accepted this invitation
  -- and the resulting membership still exactly matches what this call would
  -- produce, return that same outcome instead of erroring. Anything else
  -- (accepted but a different/missing/mismatched membership) is a genuine
  -- conflict, not a safe retry.
  if v_invitation.status = 'accepted' then
    select u.id into v_target_user_id from auth.users u where lower(u.email) = v_invitation.email;

    select tm.id, tm.status, mr.role
      into v_existing_membership_id, v_existing_status, v_existing_role
      from public.tenant_memberships tm
      join public.membership_roles mr on mr.membership_id = tm.id
      where tm.tenant_id = v_invitation.tenant_id
        and tm.user_id = v_target_user_id
      limit 1;

    if v_existing_membership_id is not null
      and v_existing_status = 'active'
      and v_existing_role = v_invitation.role
      and v_invitation.role = p_expected_role
    then
      return query select v_existing_membership_id, v_target_user_id;
      return;
    end if;

    raise exception 'Invitation already accepted with a different outcome' using errcode = 'P000B';
  end if;

  if v_invitation.status = 'expired' then
    raise exception 'Invitation is not pending' using errcode = 'P0004';
  end if;

  -- v_invitation.status = 'pending' from here on. Lazily expire it exactly
  -- like accept_tenant_invitation does, for the same reason: raising after
  -- this UPDATE in the same statement would roll the UPDATE back too, so a
  -- non-error NULL-row return is how the durable status change survives.
  -- Returns exactly one (null, null) row — not zero rows — so that a
  -- PostgREST `.single()` call on this table-returning function still gets
  -- one row instead of a "no rows" error.
  if v_invitation.expires_at < now() then
    update public.tenant_invitations set status = 'expired' where id = p_invitation_id and status = 'pending';
    return query select null::uuid, null::uuid;
    return;
  end if;

  if p_expected_role <> v_invitation.role then
    raise exception 'Role mismatch with pending invitation' using errcode = 'P000C';
  end if;

  select count(*) into v_target_match_count
    from auth.users where lower(email) = v_invitation.email;

  if v_target_match_count <> 1 then
    raise exception 'Target identity is ambiguous' using errcode = 'P000D';
  end if;

  select id into v_target_user_id
    from auth.users where lower(email) = v_invitation.email
    limit 1;

  if exists (
    select 1 from public.tenant_memberships tm
    where tm.user_id = v_target_user_id
      and tm.tenant_id <> v_invitation.tenant_id
      and tm.status in ('active', 'suspended')
  ) then
    raise exception 'Target has membership in another tenant' using errcode = 'P000E';
  end if;

  select exists (
    select 1 from public.tenant_invitations ti
    where ti.email = v_invitation.email
      and ti.tenant_id <> v_invitation.tenant_id
      and ti.status = 'pending'
  ) into v_cross_tenant_conflict;

  if v_cross_tenant_conflict then
    raise exception 'cross_tenant_pending_invitation_conflict' using errcode = 'P000F';
  end if;

  -- Defensive re-check: tenant_invitations_pending_unique already guarantees
  -- this is 1, but this RPC re-verifies it explicitly rather than trusting
  -- the index to never change underneath it.
  select count(*) into v_pending_count_this_tenant
    from public.tenant_invitations
    where tenant_id = v_invitation.tenant_id and email = v_invitation.email and status = 'pending';

  if v_pending_count_this_tenant <> 1 then
    raise exception 'Invitation state conflict' using errcode = 'P000G';
  end if;

  if exists (
    select 1 from public.tenant_memberships tm
    where tm.tenant_id = v_invitation.tenant_id and tm.user_id = v_target_user_id
  ) then
    raise exception 'Target already has a membership in this tenant' using errcode = 'P000H';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_invitation.tenant_id::text, 0));

  insert into public.tenant_memberships (tenant_id, user_id, status)
  values (v_invitation.tenant_id, v_target_user_id, 'active')
  on conflict (tenant_id, user_id) do update set status = 'active'
  returning id into v_membership_id;

  insert into public.membership_roles (membership_id, role)
  values (v_membership_id, v_invitation.role)
  on conflict on constraint membership_roles_pkey do nothing;

  -- accepted_by intentionally records the OWNER performing this recovery
  -- action (auth.uid() here is the owner, not the target — unlike
  -- accept_tenant_invitation where auth.uid() is inherently the invited
  -- user), so the invitation/audit trail correctly shows who authorized
  -- bypassing the normal self-service accept.
  update public.tenant_invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
  where id = p_invitation_id;

  insert into public.access_audit_events (
    tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    v_invitation.tenant_id,
    auth.uid(),
    'tenant_membership',
    v_membership_id,
    'member_direct_provisioned',
    null,
    jsonb_build_object('invitation_id', p_invitation_id, 'target_user_id', v_target_user_id, 'role', v_invitation.role)
  );

  return query select v_membership_id, v_target_user_id;
end;
$$;

revoke execute on function public.owner_provision_invited_member(uuid, public.tenant_role) from public;
grant execute on function public.owner_provision_invited_member(uuid, public.tenant_role) to authenticated;
