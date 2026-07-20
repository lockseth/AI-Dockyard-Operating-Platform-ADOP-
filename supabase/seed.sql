-- ADOP local dev seed data. Neutral, non-production placeholder data only.
-- Runs automatically after migrations during `supabase db reset`.
--
-- Only tenant/legal-entity rows are seeded here (plain public-schema data,
-- safe to insert directly). Test users (owner/admin/viewer/suspended) are
-- NOT created here — application code and pgTAP fixtures must never insert
-- into auth.users directly outside of a dedicated test context. Ephemeral
-- users for manual/local exploration should be created via the local Auth
-- Admin API (see supabase/tests/integration for the reproducible pattern).

-- Tenant IDs are RFC4122-valid (version 4, variant 10xx) so they pass the
-- app's shared idSchema (z.string().uuid()) — a vanity ID with an invalid
-- version/variant nibble parses as a UUID-shaped string but fails Zod's
-- stricter RFC4122 check, breaking any *ForActiveTenant server action that
-- validates a client-supplied tenantId against one of these seeded tenants.
insert into public.tenants (id, slug, display_name, status)
values
  ('a1111111-1111-4111-8111-111111111111', 'tenant-a', 'Tenant A', 'active'),
  ('b2222222-2222-4222-8222-222222222222', 'tenant-b', 'Tenant B', 'active')
on conflict (id) do nothing;

-- legal_name is intentionally null — Pak Hanafi's final legal entity name is
-- not locked yet. Never hardcode "PT Gamatara" or any other legal name here.
insert into public.legal_entities (id, tenant_id, legal_name, display_name, status)
values
  ('a1111111-e1e1-e1e1-e1e1-e1e1e1e1e1e1', 'a1111111-1111-4111-8111-111111111111', null, 'Legal Entity A — TBD', 'active'),
  ('b2222222-e2e2-e2e2-e2e2-e2e2e2e2e2e2', 'b2222222-2222-4222-8222-222222222222', null, 'Legal Entity B — TBD', 'active')
on conflict (id) do nothing;

-- Gate 1A — initial service type configuration, seeded per tenant (tenant-safe,
-- not a shared row). Emergency/Standard/Docking/PLTU are a starting point;
-- tenants may add further service types later via the master-data UI.
insert into public.service_types (tenant_id, code, name, sort_order, status)
values
  ('a1111111-1111-4111-8111-111111111111', 'emergency', 'Emergency', 1, 'active'),
  ('a1111111-1111-4111-8111-111111111111', 'standard', 'Standard', 2, 'active'),
  ('a1111111-1111-4111-8111-111111111111', 'docking', 'Docking', 3, 'active'),
  ('a1111111-1111-4111-8111-111111111111', 'pltu', 'PLTU', 4, 'active'),
  ('b2222222-2222-4222-8222-222222222222', 'emergency', 'Emergency', 1, 'active'),
  ('b2222222-2222-4222-8222-222222222222', 'standard', 'Standard', 2, 'active'),
  ('b2222222-2222-4222-8222-222222222222', 'docking', 'Docking', 3, 'active'),
  ('b2222222-2222-4222-8222-222222222222', 'pltu', 'PLTU', 4, 'active')
on conflict (tenant_id, code) do nothing;
