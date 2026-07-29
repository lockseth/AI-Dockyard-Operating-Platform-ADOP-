-- ADOP — Gate 6J-B1: Assistant Identity Cloud Privilege Corrective
--
-- Root cause (found during Gate 6J-B cloud verification against ADOP Demo,
-- ref lgdxxntwpdrlzyhysuzu): this project carries a default privilege on
-- schema `public` (pg_default_acl, role postgres, objtype relation/routine)
-- that grants directly to `anon`/`authenticated`/`service_role` at
-- object-creation time — not via the `PUBLIC` pseudo-role. `revoke ... from
-- public`, as 20260729030000 used for assistant_channel_identities (§7) and
-- every RPC (§4/§5/§6/§9/§10/§11), never touches a grant already made
-- directly to `anon`/`authenticated` by name, so those statements were a
-- no-op against this project's actual configuration: anon/authenticated
-- could execute every RPC including the two service_role-only completion
-- RPCs, and assistant_channel_identities carried full table-level
-- INSERT/UPDATE/DELETE/SELECT (including challenge_digest) for both roles.
-- client_contacts §12 of that same migration already used the pattern that
-- actually works (`revoke select on client_contacts from authenticated` —
-- naming the role directly) and was verified unaffected.
--
-- This migration is purely additive REVOKE/GRANT hardening, by role name, on
-- the exact objects 20260729030000 created. No DDL on tables/columns, no RPC
-- body change, no RLS policy change, no data mutation. Schema-wide default
-- privileges on `public` are intentionally NOT touched here (out of scope
-- per task instruction) — that is a separate, broader security-audit
-- backlog item, since it also affects claim_next_notification_event /
-- complete_notification_event from 20260721000000, pre-dating this gate.

-- =============================================================================
-- 1. Completion RPCs — service_role only (the WhatsApp-reply side of the
--    channel; never a browser session, never anonymous, never a member of
--    `authenticated` calling directly).
-- =============================================================================

revoke execute on function public.assistant_complete_pairing(text, text, text) from public, anon, authenticated;
grant execute on function public.assistant_complete_pairing(text, text, text) to service_role;

revoke execute on function public.assistant_complete_client_verification(uuid, text, text) from public, anon, authenticated;
grant execute on function public.assistant_complete_client_verification(uuid, text, text) to service_role;

-- =============================================================================
-- 2. Browser-session RPCs — authenticated (+ service_role), never anon or
--    PUBLIC. Internal authorization inside each RPC (current_user_has_
--    tenant_role, self/owner checks) is unchanged.
-- =============================================================================

revoke execute on function public.assistant_issue_pairing_challenge(uuid, text, text) from public, anon;
grant execute on function public.assistant_issue_pairing_challenge(uuid, text, text) to authenticated, service_role;

revoke execute on function public.assistant_revoke_pairing(uuid, text) from public, anon;
grant execute on function public.assistant_revoke_pairing(uuid, text) to authenticated, service_role;

revoke execute on function public.assistant_issue_client_verification_challenge(uuid) from public, anon;
grant execute on function public.assistant_issue_client_verification_challenge(uuid) to authenticated, service_role;

revoke execute on function public.assistant_reset_client_verification(uuid, text) from public, anon;
grant execute on function public.assistant_reset_client_verification(uuid, text) to authenticated, service_role;

-- =============================================================================
-- 3. assistant_channel_identities — table privileges revoked/re-granted by
--    role name. Re-states the exact same safe column list as
--    20260729030000 §7 (challenge_digest excluded); no INSERT/UPDATE/DELETE
--    grant to authenticated or anon.
-- =============================================================================

revoke all on public.assistant_channel_identities from public, anon, authenticated;

grant select (
  id, tenant_id, user_id, channel, normalized_address, status,
  challenge_expires_at, challenge_attempt_count, verified_at,
  revoked_at, revoked_by, revoked_reason, created_by, created_at, updated_at
) on public.assistant_channel_identities to authenticated;

grant all on public.assistant_channel_identities to service_role;

-- =============================================================================
-- 4. client_contacts verification fields — verified correct, no change.
-- =============================================================================
-- 20260729030000 §12 already revoked table-level SELECT from `authenticated`
-- BY NAME (not from PUBLIC) before re-granting an explicit column list that
-- excludes whatsapp_verification_digest — the pattern that is actually
-- effective against this project's default privileges. Confirmed against a
-- live copy of this schema: has_column_privilege('authenticated',
-- 'client_contacts', 'whatsapp_verification_digest', 'SELECT') = false.
-- No statement needed here. `anon`'s standing on client_contacts (never
-- explicitly revoked, same default-privilege root cause, pre-dates this
-- gate) is intentionally out of scope for this corrective — no RLS policy on
-- client_contacts targets `anon` (all three policies in 20260719080000 are
-- `to authenticated` only), so it is a defense-in-depth backlog item for a
-- separate, broader security audit, not a live read path today.
