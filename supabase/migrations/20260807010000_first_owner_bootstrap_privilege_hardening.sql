-- ADOP — Gate 6J-E2-B3: First Owner Bootstrap Cloud Privilege Corrective
--
-- Root cause (found during Gate 6J-E2-B2 direct hosted verification against
-- ADOP Demo, ref lgdxxntwpdrlzyhysuzu): this project carries a default
-- privilege on schema `public` (pg_default_acl, role postgres, objtype
-- relation/routine) that grants directly to `anon`/`authenticated`/
-- `service_role` at object-creation time — not via the `PUBLIC` pseudo-role.
-- The `revoke all ... from public` and `revoke execute ... from public`
-- statements in 20260807000000 never touch a grant already made directly to
-- `anon`/`authenticated` by name, so those statements were a no-op against
-- this project's actual configuration: on hosted, `anon`/`authenticated` held
-- full table privileges (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/
-- TRIGGER) on first_owner_bootstrap_tokens, and EXECUTE on both
-- SECURITY DEFINER RPCs — identical root cause and identical fix pattern to
-- 20260729040000 (Gate 6J-B1, assistant identity).
--
-- This migration is purely additive REVOKE/GRANT hardening, by role name, on
-- the exact objects 20260807000000 created. No DDL on the table/columns, no
-- RPC body change, no RLS policy change, no data mutation. Schema-wide
-- default privileges on `public` are intentionally NOT touched here (out of
-- scope per task instruction) — see Gate 6J-E2-B3 audit report for the
-- pg_default_acl root-cause detail; that remains a separate, broader
-- security-audit backlog item.

revoke all privileges
on table public.first_owner_bootstrap_tokens
from public, anon, authenticated;

revoke execute
on function public.resolve_first_owner_bootstrap_token(text)
from public, anon, authenticated;

revoke execute
on function public.claim_first_owner_bootstrap(text, uuid)
from public, anon, authenticated;

grant all privileges
on table public.first_owner_bootstrap_tokens
to service_role;

grant execute
on function public.resolve_first_owner_bootstrap_token(text)
to service_role;

grant execute
on function public.claim_first_owner_bootstrap(text, uuid)
to service_role;
