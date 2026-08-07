-- Gate 6J-E2-C0 — Real Design-Partner Tenant Preparation
--
-- The hosted ADOP Demo project has exactly one tenant, created by the
-- Founder-only internal demo harness (Gate 6G-B,
-- src/lib/demo-owner-bootstrap/identity.ts) with slug
-- `pt-pelayaran-gema-bahari-demo` and display_name "PT PELAYARAN GEMA
-- BAHARI" — identical to the real design partner's name. Gate 6J-E2-C
-- (Supervised First Owner Bootstrap UAT) found this ambiguous and already
-- owned, and stopped before any mutation.
--
-- This migration disambiguates the two identities without touching the
-- internal tenant's id, membership, or role data, and provisions a second,
-- empty tenant for the real design partner so a later, separately
-- authorized gate can run First Owner Bootstrap against it. No auth user,
-- membership, role, or bootstrap token is created here.
--
-- Guarded by exact id+slug+display_name match against the verified hosted
-- snapshot, so it fails loudly on drift but is a silent no-op wherever that
-- specific tenant does not exist (local dev, CI, fresh resets — this
-- project's seed data uses unrelated tenant-a/tenant-b fixtures, see
-- supabase/seed.sql) — matching the id-based idempotency convention already
-- used for local-only fixtures such as tenant-a/tenant-b in seed.sql.

do $$
declare
  v_internal_tenant_id constant uuid := '389660a7-4f57-4741-9ee3-be50219f35f2';
  v_internal_slug constant text := 'pt-pelayaran-gema-bahari-demo';
  v_display_before constant text := 'PT PELAYARAN GEMA BAHARI';
  v_display_after constant text := 'INTERNAL DEMO — PT PELAYARAN GEMA BAHARI';
  v_partner_slug constant text := 'pt-pelayaran-gema-bahari';
  v_partner_display constant text := 'PT PELAYARAN GEMA BAHARI';
  v_row public.tenants%rowtype;
  v_partner_id uuid;
begin
  select * into v_row from public.tenants where id = v_internal_tenant_id;

  if not found then
    raise notice 'Gate 6J-E2-C0: tenant % not present — skipping (not the hosted ADOP Demo project)', v_internal_tenant_id;
    return;
  end if;

  if v_row.slug <> v_internal_slug
     or v_row.display_name not in (v_display_before, v_display_after) then
    raise exception 'Gate 6J-E2-C0: internal tenant % drifted from the verified snapshot (slug=%, display_name=%) — refusing to proceed',
      v_internal_tenant_id, v_row.slug, v_row.display_name;
  end if;

  -- 1) Relabel the internal demo tenant's display name only. Idempotent: a
  --    second run finds display_name already equal to v_display_after and
  --    skips the update.
  if v_row.display_name = v_display_before then
    update public.tenants set display_name = v_display_after where id = v_internal_tenant_id;

    insert into public.access_audit_events
      (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
    values
      (v_internal_tenant_id, null, 'tenant', v_internal_tenant_id, 'display_name_relabeled',
       jsonb_build_object('display_name', v_display_before),
       jsonb_build_object('display_name', v_display_after));
  end if;

  -- 2) Provision the real design-partner tenant, empty. Idempotent via a
  --    slug lookup (tenants.slug is unique) rather than ON CONFLICT so the
  --    audit event is only written on the run that actually creates it.
  select id into v_partner_id from public.tenants where slug = v_partner_slug;
  if v_partner_id is null then
    insert into public.tenants (slug, display_name)
    values (v_partner_slug, v_partner_display)
    returning id into v_partner_id;

    insert into public.access_audit_events
      (tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
    values
      (v_partner_id, null, 'tenant', v_partner_id, 'create', null,
       jsonb_build_object('slug', v_partner_slug, 'display_name', v_partner_display,
                           'reason', 'gate_6j_e2_c0_design_partner_provisioning'));
  end if;
end $$;
