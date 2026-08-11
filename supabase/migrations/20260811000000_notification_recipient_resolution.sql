-- ADOP Gate 1L-R2 — Authorized Recipient Claim Contract
--
-- Closes the recipient gap left open by Gate 1L-R1
-- (owner-control-whatsapp-notification.credential-based.proposal.json's
-- Fonnte `target` parameter): the n8n candidate cannot be told which phone
-- number to send to without either a literal hard-coded number (locked out)
-- or an env/vars mechanism the hosted instance does not offer (also locked
-- out). This migration adds exactly one new, minimal, read-only, fail-closed
-- resolution path, reusing existing configuration as the source of truth —
-- no new table, no new column, no change to notification_events or any of
-- its three existing RPCs.
--
-- Source of truth: public.assistant_channel_identities (Gate 6J-B,
-- 20260729030000_assistant_identity_pairing.sql) already records, per
-- tenant, which WhatsApp number belongs to which user and whether that
-- pairing is currently 'verified'. Combined with public.tenant_memberships /
-- public.membership_roles (Gate 0A) to find which of those verified users
-- currently holds the 'owner' role with an 'active' membership, this is
-- already the authoritative, human-controlled, revocable record of "who is
-- allowed to receive this tenant's owner WhatsApp notifications" — the same
-- table Founder/Pak Hanafi's own pairing already lives in. No second
-- "recipient config" source is introduced.
--
-- public.resolve_verified_owner_recipient(p_tenant_id) is the only new
-- object: a SECURITY DEFINER, service_role-only function that returns the
-- single verified owner WhatsApp number for a tenant, or NULL when zero or
-- more than one candidate exists (fail closed — never guesses, never falls
-- back to any other number). It takes tenant_id as an argument rather than
-- being folded into claim_next_notification_event's own return row on
-- purpose: recipient is a property of the tenant's CURRENT pairing state at
-- delivery time, not of the notification_events row itself (a stale
-- recipient baked in at enqueue time could point at a number that was
-- revoked hours later) — so it is resolved fresh on every claim, by the
-- application layer, using the tenant_id the claim RPC already returns.
-- src/lib/notification-outbox/service.ts is the only caller; it never
-- accepts a recipient (or tenant_id) from n8n's request body.

create function public.resolve_verified_owner_recipient(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_candidates text[];
begin
  if p_tenant_id is null then
    return null;
  end if;

  -- Exactly one distinct verified WhatsApp number, belonging to a user who
  -- currently holds an active 'owner' membership in this tenant. Zero
  -- matches (nobody paired yet) or more than one distinct number (two
  -- different owner users both verified, or a data anomaly) both resolve to
  -- NULL — ambiguity is never guessed away.
  select array_agg(distinct aci.normalized_address)
  into v_candidates
  from public.assistant_channel_identities aci
  join public.tenant_memberships tm
    on tm.tenant_id = aci.tenant_id
   and tm.user_id = aci.user_id
   and tm.status = 'active'
  join public.membership_roles mr
    on mr.membership_id = tm.id
   and mr.role = 'owner'
  where aci.tenant_id = p_tenant_id
    and aci.channel = 'whatsapp'
    and aci.status = 'verified';

  if array_length(v_candidates, 1) = 1 then
    return v_candidates[1];
  end if;

  return null;
end;
$$;

-- Named explicitly (not just `from public`) — this project carries default
-- privileges that grant directly to anon/authenticated at object-creation
-- time, bypassing the PUBLIC pseudo-role entirely (root cause documented in
-- 20260729040000_assistant_identity_privilege_hardening.sql §Gate 6J-B1).
-- Naming both roles here is the corrective pattern from that gate, applied
-- to this brand-new RPC so it does not reintroduce the same gap.
revoke execute on function public.resolve_verified_owner_recipient(uuid) from public, anon, authenticated;
grant execute on function public.resolve_verified_owner_recipient(uuid) to service_role;
