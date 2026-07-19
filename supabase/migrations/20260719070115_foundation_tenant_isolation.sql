-- ADOP Foundation Gate 0A — Tenant Isolation & Role Model
--
-- Establishes: profiles, tenants, legal entities, tenant membership/roles,
-- append-only access audit, private RLS helper schema, and RLS policies
-- proving two-tenant isolation. No business tables (Project Kapal, cost
-- ledger, importer, etc.) are created here.

create extension if not exists pgcrypto with schema extensions;

-- =============================================================================
-- 1. Enums
-- =============================================================================
-- Tenant roles are business-facing only. platform_admin/founder/superadmin
-- are NOT tenant roles — service_role is the only privileged, server-side
-- identity and is never assigned as a membership role.

create type public.tenant_status as enum ('active', 'suspended');
create type public.membership_status as enum ('invited', 'active', 'suspended');
create type public.tenant_role as enum ('owner', 'admin', 'reviewer', 'viewer');
create type public.legal_entity_status as enum ('active', 'inactive');

-- =============================================================================
-- 2. Tables
-- =============================================================================

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  status public.tenant_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- legal_name is nullable: Pak Hanafi's final legal entity name is not
-- locked yet (see ADOP_WORKFLOW_ROADMAP_v1.0.md §1). Never hardcode
-- "PT Gamatara" or any other legal entity name here or in application code.
create table public.legal_entities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  legal_name text,
  display_name text not null,
  status public.legal_entity_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index legal_entities_tenant_id_idx on public.legal_entities (tenant_id);

create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.membership_status not null default 'invited',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index tenant_memberships_user_id_idx on public.tenant_memberships (user_id);

create table public.membership_roles (
  membership_id uuid not null references public.tenant_memberships (id) on delete cascade,
  role public.tenant_role not null,
  created_at timestamptz not null default now(),
  primary key (membership_id, role)
);

-- Append-only. No UPDATE/DELETE grant exists for any role, and the trigger
-- in §4 below blocks mutation at the database level regardless of grants.
create table public.access_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index access_audit_events_tenant_id_idx on public.access_audit_events (tenant_id);
create index access_audit_events_actor_user_id_idx on public.access_audit_events (actor_user_id);
create index access_audit_events_created_at_idx on public.access_audit_events (created_at);

-- =============================================================================
-- 3. private schema — non-exposed (not in api.schemas), for privileged helpers
-- =============================================================================

create schema private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role, supabase_auth_admin;

-- updated_at trigger helper (not privileged, but kept out of the exposed
-- public schema to keep public.* limited to tables).
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public;
grant execute on function private.set_updated_at() to authenticated, service_role;

create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.tenants
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.legal_entities
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.tenant_memberships
  for each row execute function private.set_updated_at();

-- Hard, role-independent append-only guarantee for the audit table.
create function private.block_audit_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'access_audit_events is append-only: % not allowed', tg_op;
end;
$$;

revoke execute on function private.block_audit_mutation() from public;

create trigger access_audit_events_append_only
  before update or delete on public.access_audit_events
  for each row execute function private.block_audit_mutation();

-- =============================================================================
-- 4. Auth profile foundation
-- =============================================================================
-- SECURITY DEFINER is required so the trigger (fired by supabase_auth_admin
-- inserting into auth.users) can insert into public.profiles regardless of
-- that table's RLS policies. Fixed search_path + schema-qualified refs
-- prevent search_path hijacking. No user metadata is read — authorization
-- never derives from auth.users metadata, only from membership/roles.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public;
grant execute on function private.handle_new_user() to supabase_auth_admin;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- =============================================================================
-- 5. Private RLS helpers
-- =============================================================================
-- Both helpers read auth.uid() only — never a caller-supplied user_id — and
-- run SECURITY DEFINER (owned by the migration role, which bypasses RLS on
-- tables it owns) so they can evaluate membership without recursing back
-- through tenant_memberships'/membership_roles' own RLS policies.

create function private.current_user_is_active_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  );
$$;

revoke execute on function private.current_user_is_active_tenant_member(uuid) from public;
grant execute on function private.current_user_is_active_tenant_member(uuid) to authenticated;

create function private.current_user_has_tenant_role(p_tenant_id uuid, p_roles public.tenant_role[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    join public.membership_roles mr on mr.membership_id = tm.id
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and mr.role = any (p_roles)
  );
$$;

revoke execute on function private.current_user_has_tenant_role(uuid, public.tenant_role[]) from public;
grant execute on function private.current_user_has_tenant_role(uuid, public.tenant_role[]) to authenticated;

-- =============================================================================
-- 6. RLS & Grants
-- =============================================================================
-- auto_expose_new_tables is off (see supabase/config.toml) so anon/
-- authenticated/service_role start with NO privileges on these tables.
-- The explicit REVOKE below is defensive belt-and-suspenders on top of that.
-- RLS is the access-control layer for `authenticated`; anon gets no grants
-- at all, which blocks it before RLS is even evaluated.

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.legal_entities enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.membership_roles enable row level security;
alter table public.access_audit_events enable row level security;

revoke all on public.profiles from public;
revoke all on public.tenants from public;
revoke all on public.legal_entities from public;
revoke all on public.tenant_memberships from public;
revoke all on public.membership_roles from public;
revoke all on public.access_audit_events from public;

-- --- profiles ---------------------------------------------------------------

create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using (user_id = auth.uid());

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- --- tenants ------------------------------------------------------------------
-- Members (any active role) can read their tenant. Only owner can update,
-- and only the display_name column — status/slug changes are out of scope
-- for this gate (no privilege-escalation surface via this policy).

create policy tenants_select_member
  on public.tenants for select
  to authenticated
  using (private.current_user_is_active_tenant_member (id));

create policy tenants_update_owner_display
  on public.tenants for update
  to authenticated
  using (private.current_user_has_tenant_role (id, array['owner']::public.tenant_role[]))
  with check (private.current_user_has_tenant_role (id, array['owner']::public.tenant_role[]));

grant select on public.tenants to authenticated;
grant update (display_name) on public.tenants to authenticated;
grant all on public.tenants to service_role;

-- --- legal_entities -----------------------------------------------------------

create policy legal_entities_select_member
  on public.legal_entities for select
  to authenticated
  using (private.current_user_is_active_tenant_member (tenant_id));

create policy legal_entities_update_owner_display
  on public.legal_entities for update
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner']::public.tenant_role[]))
  with check (private.current_user_has_tenant_role (tenant_id, array['owner']::public.tenant_role[]));

grant select on public.legal_entities to authenticated;
grant update (display_name) on public.legal_entities to authenticated;
grant all on public.legal_entities to service_role;

-- --- tenant_memberships --------------------------------------------------------
-- Read-only from the browser at this gate: a member can see their own
-- membership row, and owner/admin can see all members of their tenant.
-- No INSERT/UPDATE/DELETE grant exists for `authenticated` — membership
-- and role mutation is server-side only until a later phase.

create policy tenant_memberships_select_self_or_owner_admin
  on public.tenant_memberships for select
  to authenticated
  using (
    user_id = auth.uid()
    or private.current_user_has_tenant_role (tenant_id, array['owner', 'admin']::public.tenant_role[])
  );

grant select on public.tenant_memberships to authenticated;
grant all on public.tenant_memberships to service_role;

-- --- membership_roles -----------------------------------------------------------
-- Same visibility rule as tenant_memberships, joined through the membership
-- row since membership_roles has no tenant_id column of its own. No write
-- grant for `authenticated` — role assignment is server-side only.

create policy membership_roles_select_via_membership
  on public.membership_roles for select
  to authenticated
  using (
    exists (
      select 1
      from public.tenant_memberships tm
      where tm.id = membership_roles.membership_id
        and (
          tm.user_id = auth.uid()
          or private.current_user_has_tenant_role (tm.tenant_id, array['owner', 'admin']::public.tenant_role[])
        )
    )
  );

grant select on public.membership_roles to authenticated;
grant all on public.membership_roles to service_role;

-- --- access_audit_events ---------------------------------------------------------
-- Owner-only read within their own tenant. service_role may INSERT (server
-- provisioning/audit writers) but never UPDATE/DELETE — enforced both by
-- the absence of that grant and by the append-only trigger in §3.

create policy access_audit_events_select_owner
  on public.access_audit_events for select
  to authenticated
  using (private.current_user_has_tenant_role (tenant_id, array['owner']::public.tenant_role[]));

grant select on public.access_audit_events to authenticated;
grant select, insert on public.access_audit_events to service_role;
