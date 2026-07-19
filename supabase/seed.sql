-- ADOP local dev seed data. Neutral, non-production placeholder data only.
-- Runs automatically after migrations during `supabase db reset`.
--
-- Only tenant/legal-entity rows are seeded here (plain public-schema data,
-- safe to insert directly). Test users (owner/admin/viewer/suspended) are
-- NOT created here — application code and pgTAP fixtures must never insert
-- into auth.users directly outside of a dedicated test context. Ephemeral
-- users for manual/local exploration should be created via the local Auth
-- Admin API (see supabase/tests/integration for the reproducible pattern).

insert into public.tenants (id, slug, display_name, status)
values
  ('a1111111-1111-1111-1111-111111111111', 'tenant-a', 'Tenant A', 'active'),
  ('b2222222-2222-2222-2222-222222222222', 'tenant-b', 'Tenant B', 'active')
on conflict (id) do nothing;

-- legal_name is intentionally null — Pak Hanafi's final legal entity name is
-- not locked yet. Never hardcode "PT Gamatara" or any other legal name here.
insert into public.legal_entities (id, tenant_id, legal_name, display_name, status)
values
  ('a1111111-e1e1-e1e1-e1e1-e1e1e1e1e1e1', 'a1111111-1111-1111-1111-111111111111', null, 'Legal Entity A — TBD', 'active'),
  ('b2222222-e2e2-e2e2-e2e2-e2e2e2e2e2e2', 'b2222222-2222-2222-2222-222222222222', null, 'Legal Entity B — TBD', 'active')
on conflict (id) do nothing;
