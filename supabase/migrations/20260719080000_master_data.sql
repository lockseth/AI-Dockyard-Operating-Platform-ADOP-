-- ADOP Phase 1 Gate 1A — Trusted Master Data
--
-- Establishes trusted master data as the direct-UI-entry target for the
-- next gate: clients, client contacts (PIC), vessels, vendors, service
-- types, facility locations, expense categories, and an append-only
-- master-data audit trail. No Project Kapal, importer, or cost ledger
-- tables are created here — this migration only builds the reference
-- data those later gates will point at.
--
-- Does not edit 20260719070115_foundation_tenant_isolation.sql — reuses
-- its private RLS helpers and private.set_updated_at() trigger function.

-- =============================================================================
-- 1. Enums
-- =============================================================================

create type public.record_status as enum ('active', 'inactive');

-- =============================================================================
-- 2. Tables
-- =============================================================================

-- --- clients -----------------------------------------------------------------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_code text,
  display_name text not null,
  legal_name text,
  address text,
  tax_identifier text,
  status public.record_status not null default 'active',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite target for tenant-safe FKs from client_contacts/vessels below —
  -- structurally impossible for a child row to point at a client in a
  -- different tenant, even via a service-role bug.
  unique (id, tenant_id)
);

create index clients_tenant_id_idx on public.clients (tenant_id);

-- Partial unique index: client_code is optional, but when present it must be
-- unique within the tenant. Two tenants may reuse the same code freely.
create unique index clients_tenant_id_client_code_uidx
  on public.clients (tenant_id, client_code)
  where client_code is not null;

-- --- client_contacts (PIC) ----------------------------------------------------
-- email/whatsapp_number are prepared for future Billing/Collection delivery.
-- No verification or messaging happens at this gate — never fabricate a
-- "verified" status here.

create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null,
  full_name text not null,
  position_department text,
  email text,
  whatsapp_number text,
  is_primary boolean not null default false,
  status public.record_status not null default 'active',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Tenant-safe composite FK: client_id must belong to a client in the SAME
  -- tenant_id as this contact row.
  foreign key (client_id, tenant_id) references public.clients (id, tenant_id) on delete cascade
);

create index client_contacts_tenant_id_idx on public.client_contacts (tenant_id);
create index client_contacts_client_id_idx on public.client_contacts (tenant_id, client_id);

-- --- vessels -------------------------------------------------------------------

create table public.vessels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  client_id uuid not null,
  vessel_code text,
  vessel_name text not null,
  registration_number text,
  vessel_type text,
  status public.record_status not null default 'active',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (client_id, tenant_id) references public.clients (id, tenant_id) on delete cascade
);

create index vessels_tenant_id_idx on public.vessels (tenant_id);
create index vessels_client_id_idx on public.vessels (tenant_id, client_id);

create unique index vessels_tenant_id_vessel_code_uidx
  on public.vessels (tenant_id, vessel_code)
  where vessel_code is not null;

-- --- vendors ---------------------------------------------------------------------

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  vendor_code text,
  display_name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  status public.record_status not null default 'active',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendors_tenant_id_idx on public.vendors (tenant_id);

create unique index vendors_tenant_id_vendor_code_uidx
  on public.vendors (tenant_id, vendor_code)
  where vendor_code is not null;

-- --- service_types -----------------------------------------------------------------
-- Emergency/Standard/Docking/PLTU are seeded per-tenant in supabase/seed.sql as
-- INITIAL configuration only — tenants may add further service types later.
-- Never treat this list as a global hardcoded constant elsewhere in the app.

create table public.service_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  status public.record_status not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index service_types_tenant_id_idx on public.service_types (tenant_id);

-- --- facility_locations -----------------------------------------------------------
-- No Gate/Dock/Pelabuhan/PLTU list is fabricated here — remains open
-- discovery/configurable per tenant.

create table public.facility_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text,
  name text not null,
  description text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index facility_locations_tenant_id_idx on public.facility_locations (tenant_id);

create unique index facility_locations_tenant_id_code_uidx
  on public.facility_locations (tenant_id, code)
  where code is not null;

-- --- expense_categories -------------------------------------------------------------

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  parent_id uuid,
  code text not null,
  name text not null,
  description text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code),
  -- Composite self-FK target, mirroring clients' (id, tenant_id) above.
  unique (id, tenant_id),
  -- Tenant-safe composite FK: a category's parent must be in the same tenant.
  -- ON DELETE RESTRICT — a category with children cannot be hard-deleted out
  -- from under them (hard delete is blocked from the app regardless; this is
  -- the service-role-safe backstop).
  foreign key (parent_id, tenant_id) references public.expense_categories (id, tenant_id) on delete restrict
);

create index expense_categories_tenant_id_idx on public.expense_categories (tenant_id);
create index expense_categories_parent_id_idx on public.expense_categories (tenant_id, parent_id);

-- --- master_data_audit_events ----------------------------------------------------
-- Append-only, separate from access_audit_events (Gate 0A) — that table
-- tracks access/session events; this one tracks master-data mutations.
-- Mixing the two would blur what each table means.

create table public.master_data_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('create', 'update', 'activate', 'deactivate')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index master_data_audit_events_tenant_id_idx on public.master_data_audit_events (tenant_id);
create index master_data_audit_events_actor_user_id_idx on public.master_data_audit_events (actor_user_id);
create index master_data_audit_events_entity_idx on public.master_data_audit_events (tenant_id, entity_type, entity_id);
create index master_data_audit_events_created_at_idx on public.master_data_audit_events (created_at);

-- =============================================================================
-- 3. updated_at triggers (reuses private.set_updated_at() from Gate 0A)
-- =============================================================================

create trigger set_updated_at before update on public.clients
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.client_contacts
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.vessels
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.vendors
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.service_types
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.facility_locations
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.expense_categories
  for each row execute function private.set_updated_at();

-- Append-only guarantee for master_data_audit_events — role-independent,
-- identical shape to access_audit_events' guard in Gate 0A.
create trigger master_data_audit_events_append_only
  before update or delete on public.master_data_audit_events
  for each row execute function private.block_audit_mutation();

-- =============================================================================
-- 4. Master-data audit logging function
-- =============================================================================
-- authenticated has NO direct INSERT grant on master_data_audit_events (see
-- §6) — the only write path from the browser is this SECURITY DEFINER RPC,
-- which re-derives the actor from auth.uid() (never a caller-supplied id)
-- and independently re-checks owner/admin membership before writing. This
-- keeps master-data writes on the normal authenticated client (no
-- service-role use from application code) while still making the audit
-- table unwritable by a direct PostgREST call.
--
-- Lives in `public` (unlike the Gate 0A private.* RLS helpers) because
-- PostgREST only exposes RPC-callable functions from schemas listed in
-- api.schemas (public, graphql_public) — supabase/config.toml does not
-- expose `private`. It is still locked down like a private helper: no
-- EXECUTE for public/anon, and it is a function (not a table), so it can
-- never be reached via a direct table INSERT.

create function public.log_master_data_audit_event(
  p_tenant_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_before_data jsonb,
  p_after_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not private.current_user_has_tenant_role(p_tenant_id, array['owner', 'admin']::public.tenant_role[]) then
    raise exception 'not authorized to write master data audit event';
  end if;

  insert into public.master_data_audit_events (
    tenant_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    p_tenant_id, auth.uid(), p_entity_type, p_entity_id, p_action, p_before_data, p_after_data
  );
end;
$$;

revoke execute on function public.log_master_data_audit_event(uuid, text, uuid, text, jsonb, jsonb) from public;
grant execute on function public.log_master_data_audit_event(uuid, text, uuid, text, jsonb, jsonb) to authenticated;

-- =============================================================================
-- 5. RLS & Grants
-- =============================================================================
-- Same posture as Gate 0A: auto_expose_new_tables is off, so these tables
-- start with zero privileges for anon/authenticated/service_role. The
-- REVOKE below is defensive belt-and-suspenders on top of that.
--
-- Column-level INSERT/UPDATE grants are the immutability guard: tenant_id,
-- created_by, created_at, id, and the FK anchors that define a row's
-- identity (client_contacts.client_id, vessels.client_id,
-- expense_categories.parent_id) are never in a grant list, so authenticated
-- cannot include them in an INSERT/UPDATE statement at all — this is
-- stronger than a trigger check and mirrors tenants_update_owner_display's
-- `grant update (display_name)` pattern from Gate 0A. Re-parenting a
-- contact/vessel to a different client, or moving a category to a new
-- parent, is out of scope for this gate.
--
-- INSERT WITH CHECK additionally enforces created_by = auth.uid() (where the
-- column exists) so an owner/admin cannot forge another user as the actor.
-- No DELETE grant exists anywhere below — hard delete from the app is
-- structurally impossible; deactivation is the only "removal" path.

alter table public.clients enable row level security;
alter table public.client_contacts enable row level security;
alter table public.vessels enable row level security;
alter table public.vendors enable row level security;
alter table public.service_types enable row level security;
alter table public.facility_locations enable row level security;
alter table public.expense_categories enable row level security;
alter table public.master_data_audit_events enable row level security;

revoke all on public.clients from public;
revoke all on public.client_contacts from public;
revoke all on public.vessels from public;
revoke all on public.vendors from public;
revoke all on public.service_types from public;
revoke all on public.facility_locations from public;
revoke all on public.expense_categories from public;
revoke all on public.master_data_audit_events from public;

-- --- clients ---------------------------------------------------------------

create policy clients_select_member
  on public.clients for select
  to authenticated
  using (private.current_user_is_active_tenant_member (tenant_id));

create policy clients_insert_owner_admin
  on public.clients for insert
  to authenticated
  with check (
    private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[])
    and created_by = auth.uid()
  );

create policy clients_update_owner_admin
  on public.clients for update
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]))
  with check (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]));

grant select on public.clients to authenticated;
grant insert (tenant_id, client_code, display_name, legal_name, address, tax_identifier, status, created_by)
  on public.clients to authenticated;
grant update (client_code, display_name, legal_name, address, tax_identifier, status)
  on public.clients to authenticated;
grant all on public.clients to service_role;

-- --- client_contacts ---------------------------------------------------------

create policy client_contacts_select_member
  on public.client_contacts for select
  to authenticated
  using (private.current_user_is_active_tenant_member (tenant_id));

create policy client_contacts_insert_owner_admin
  on public.client_contacts for insert
  to authenticated
  with check (
    private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[])
    and created_by = auth.uid()
  );

create policy client_contacts_update_owner_admin
  on public.client_contacts for update
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]))
  with check (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]));

grant select on public.client_contacts to authenticated;
grant insert (tenant_id, client_id, full_name, position_department, email, whatsapp_number, is_primary, status, created_by)
  on public.client_contacts to authenticated;
grant update (full_name, position_department, email, whatsapp_number, is_primary, status)
  on public.client_contacts to authenticated;
grant all on public.client_contacts to service_role;

-- --- vessels -------------------------------------------------------------------

create policy vessels_select_member
  on public.vessels for select
  to authenticated
  using (private.current_user_is_active_tenant_member (tenant_id));

create policy vessels_insert_owner_admin
  on public.vessels for insert
  to authenticated
  with check (
    private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[])
    and created_by = auth.uid()
  );

create policy vessels_update_owner_admin
  on public.vessels for update
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]))
  with check (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]));

grant select on public.vessels to authenticated;
grant insert (tenant_id, client_id, vessel_code, vessel_name, registration_number, vessel_type, status, created_by)
  on public.vessels to authenticated;
grant update (vessel_code, vessel_name, registration_number, vessel_type, status)
  on public.vessels to authenticated;
grant all on public.vessels to service_role;

-- --- vendors ---------------------------------------------------------------------

create policy vendors_select_member
  on public.vendors for select
  to authenticated
  using (private.current_user_is_active_tenant_member (tenant_id));

create policy vendors_insert_owner_admin
  on public.vendors for insert
  to authenticated
  with check (
    private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[])
    and created_by = auth.uid()
  );

create policy vendors_update_owner_admin
  on public.vendors for update
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]))
  with check (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]));

grant select on public.vendors to authenticated;
grant insert (tenant_id, vendor_code, display_name, contact_name, email, phone, address, status, created_by)
  on public.vendors to authenticated;
grant update (vendor_code, display_name, contact_name, email, phone, address, status)
  on public.vendors to authenticated;
grant all on public.vendors to service_role;

-- --- service_types -----------------------------------------------------------------

create policy service_types_select_member
  on public.service_types for select
  to authenticated
  using (private.current_user_is_active_tenant_member (tenant_id));

create policy service_types_insert_owner_admin
  on public.service_types for insert
  to authenticated
  with check (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]));

create policy service_types_update_owner_admin
  on public.service_types for update
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]))
  with check (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]));

grant select on public.service_types to authenticated;
grant insert (tenant_id, code, name, description, status, sort_order)
  on public.service_types to authenticated;
grant update (code, name, description, status, sort_order)
  on public.service_types to authenticated;
grant all on public.service_types to service_role;

-- --- facility_locations -----------------------------------------------------------

create policy facility_locations_select_member
  on public.facility_locations for select
  to authenticated
  using (private.current_user_is_active_tenant_member (tenant_id));

create policy facility_locations_insert_owner_admin
  on public.facility_locations for insert
  to authenticated
  with check (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]));

create policy facility_locations_update_owner_admin
  on public.facility_locations for update
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]))
  with check (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]));

grant select on public.facility_locations to authenticated;
grant insert (tenant_id, code, name, description, status)
  on public.facility_locations to authenticated;
grant update (code, name, description, status)
  on public.facility_locations to authenticated;
grant all on public.facility_locations to service_role;

-- --- expense_categories -------------------------------------------------------------

create policy expense_categories_select_member
  on public.expense_categories for select
  to authenticated
  using (private.current_user_is_active_tenant_member (tenant_id));

create policy expense_categories_insert_owner_admin
  on public.expense_categories for insert
  to authenticated
  with check (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]));

create policy expense_categories_update_owner_admin
  on public.expense_categories for update
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]))
  with check (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[]));

grant select on public.expense_categories to authenticated;
grant insert (tenant_id, parent_id, code, name, description, status)
  on public.expense_categories to authenticated;
grant update (code, name, description, status)
  on public.expense_categories to authenticated;
grant all on public.expense_categories to service_role;

-- --- master_data_audit_events ----------------------------------------------------
-- owner/admin/reviewer can read their tenant's audit trail; viewer cannot.
-- No INSERT/UPDATE/DELETE grant for authenticated at all — the only write
-- path is private.log_master_data_audit_event() above. service_role gets
-- SELECT/INSERT only (for any future background writer), never
-- UPDATE/DELETE — append-only end to end, same posture as
-- access_audit_events in Gate 0A.

create policy master_data_audit_events_select_owner_admin_reviewer
  on public.master_data_audit_events for select
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner', 'admin', 'reviewer']::public.tenant_role[]));

grant select on public.master_data_audit_events to authenticated;
grant select, insert on public.master_data_audit_events to service_role;
