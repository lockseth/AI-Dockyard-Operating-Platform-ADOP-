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

-- Tenant A's legal entity is now locked to Pak Hanafi's real legal name and
-- logo (design partner: PT PELAYARAN GEMA BAHARI — a different concept from
-- this legal entity, which is the tenant/customer identity shown in the
-- product UI).
-- Tenant B stays an unbranded placeholder on purpose: it exists only to
-- prove tenant isolation in tests, never to be shown to a real user.
insert into public.legal_entities (id, tenant_id, legal_name, display_name, logo_path, status)
values
  ('a1111111-e1e1-e1e1-e1e1-e1e1e1e1e1e1', 'a1111111-1111-4111-8111-111111111111', 'PT PELAYARAN GEMA BAHARI', 'Legal Entity A', '/branding/pt-pelayaran-gema-bahari-logo.png', 'active'),
  ('b2222222-e2e2-e2e2-e2e2-e2e2e2e2e2e2', 'b2222222-2222-4222-8222-222222222222', null, 'Legal Entity B — TBD', null, 'active')
on conflict (id) do nothing;

-- Gate 1A — initial service type configuration, seeded per tenant (tenant-safe,
-- not a shared row). Emergency/Standard/PLTU are redefined as Project
-- Priority / Facility Location concepts (Locked UI & Operational Safety
-- Revision, Gate 3) and seeded inactive from the start; Docking remains the
-- only active starting Service Type. Tenants may add further service types
-- later via the master-data UI.
insert into public.service_types (tenant_id, code, name, sort_order, status)
values
  ('a1111111-1111-4111-8111-111111111111', 'emergency', 'Emergency', 1, 'inactive'),
  ('a1111111-1111-4111-8111-111111111111', 'standard', 'Standard', 2, 'inactive'),
  ('a1111111-1111-4111-8111-111111111111', 'docking', 'Docking', 3, 'active'),
  ('a1111111-1111-4111-8111-111111111111', 'pltu', 'PLTU', 4, 'inactive'),
  ('b2222222-2222-4222-8222-222222222222', 'emergency', 'Emergency', 1, 'inactive'),
  ('b2222222-2222-4222-8222-222222222222', 'standard', 'Standard', 2, 'inactive'),
  ('b2222222-2222-4222-8222-222222222222', 'docking', 'Docking', 3, 'active'),
  ('b2222222-2222-4222-8222-222222222222', 'pltu', 'PLTU', 4, 'inactive')
on conflict (tenant_id, code) do nothing;
