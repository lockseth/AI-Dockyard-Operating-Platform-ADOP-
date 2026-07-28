import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/types/database";
import type {
  BootstrapRepository,
  DemoTenantIdentity,
  OwnerBootstrapIdentity,
  ResolvedAuthUserRow,
  ResolvedLegalEntityRow,
  ResolvedMembershipRow,
  ResolvedOwnerRow,
  ResolvedState,
  ResolvedTenantRow,
} from "./types";

// The ONLY file in this module allowed to hold a service-role Supabase
// client or perform network I/O — enforced by admin-client-only.test.ts.
// Deliberately NOT @/lib/supabase/admin: that module imports "server-only",
// which throws when loaded outside Next.js's server bundler (see that
// file's own comment). tests/integration/support/members.ts already
// establishes the same workaround for the same reason — a plain Node CLI
// context needs its own createClient() call, not the Next-server-only-
// guarded one. This is not a parallel source of truth for *business*
// logic — it only mirrors the client-construction shape.
//
// No delete/truncate/reset call exists anywhere in this file, and
// BootstrapRepository (types.ts) declares no such method — the executor is
// structurally unable to issue one even if a step handler tried to.

export function createAdminClient(url: string, serviceRoleKey: string): SupabaseClient<Database> {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const AUTH_USER_SCAN_PAGE_SIZE = 200;
// 10k users — generous headroom for a single demo tenant bootstrap.
const AUTH_USER_SCAN_MAX_PAGES = 50;

// supabase-js v2's admin API has no getUserByEmail; the only way to resolve
// an existing auth user from an email is to page through listUsers() and
// match client-side. Bounded and read-only — acceptable for a bootstrap
// harness against a small demo project, not a general-purpose lookup.
async function findAuthUserByEmail(
  client: SupabaseClient<Database>,
  email: string,
): Promise<ResolvedAuthUserRow | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= AUTH_USER_SCAN_MAX_PAGES; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: AUTH_USER_SCAN_PAGE_SIZE,
    });
    if (error) {
      throw new Error(`listUsers failed while resolving existing owner: ${error.message}`);
    }
    const match = data.users.find((user) => (user.email ?? "").toLowerCase() === target);
    if (match) {
      return { id: match.id, email: target };
    }
    if (data.users.length < AUTH_USER_SCAN_PAGE_SIZE) {
      break;
    }
  }
  return null;
}

async function resolveState(
  client: SupabaseClient<Database>,
  input: { email: string; tenantSlug: string },
): Promise<ResolvedState> {
  const { data: tenantRow, error: tenantError } = await client
    .from("tenants")
    .select("id, slug, display_name, status")
    .eq("slug", input.tenantSlug)
    .maybeSingle();
  if (tenantError) {
    throw new Error(`Failed to resolve tenant: ${tenantError.message}`);
  }

  const tenant: ResolvedTenantRow | null = tenantRow
    ? {
        id: tenantRow.id,
        slug: tenantRow.slug,
        displayName: tenantRow.display_name,
        status: tenantRow.status,
      }
    : null;

  let legalEntities: ResolvedLegalEntityRow[] = [];
  if (tenant) {
    const { data: legalRows, error: legalError } = await client
      .from("legal_entities")
      .select("id, tenant_id, legal_name, display_name, status")
      .eq("tenant_id", tenant.id)
      .eq("status", "active");
    if (legalError) {
      throw new Error(`Failed to resolve legal entities: ${legalError.message}`);
    }
    legalEntities = (legalRows ?? []).map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      legalName: row.legal_name,
      displayName: row.display_name,
      status: row.status,
    }));
  }

  const authUser = await findAuthUserByEmail(client, input.email);

  let membershipForUser: ResolvedMembershipRow | null = null;
  let otherActiveTenantIdForUser: string | null = null;

  if (authUser) {
    const { data: membershipRows, error: membershipError } = await client
      .from("tenant_memberships")
      .select("id, tenant_id, user_id, status")
      .eq("user_id", authUser.id);
    if (membershipError) {
      throw new Error(`Failed to resolve memberships: ${membershipError.message}`);
    }

    const ownRow = (membershipRows ?? []).find((row) => row.tenant_id === tenant?.id);
    const otherActiveRow = (membershipRows ?? []).find(
      (row) => row.tenant_id !== tenant?.id && row.status === "active",
    );
    otherActiveTenantIdForUser = otherActiveRow?.tenant_id ?? null;

    if (ownRow) {
      const { data: roleRows, error: roleError } = await client
        .from("membership_roles")
        .select("role")
        .eq("membership_id", ownRow.id);
      if (roleError) {
        throw new Error(`Failed to resolve membership roles: ${roleError.message}`);
      }
      membershipForUser = {
        id: ownRow.id,
        tenantId: ownRow.tenant_id,
        userId: ownRow.user_id,
        status: ownRow.status,
        roles: (roleRows ?? []).map((row) => row.role),
      };
    }
  }

  let existingOwners: ResolvedOwnerRow[] = [];
  if (tenant) {
    const { data: activeMemberships, error: activeError } = await client
      .from("tenant_memberships")
      .select("id, user_id")
      .eq("tenant_id", tenant.id)
      .eq("status", "active");
    if (activeError) {
      throw new Error(`Failed to resolve active memberships: ${activeError.message}`);
    }
    const membershipIds = (activeMemberships ?? []).map((row) => row.id);
    if (membershipIds.length > 0) {
      const { data: ownerRoleRows, error: ownerRoleError } = await client
        .from("membership_roles")
        .select("membership_id, role")
        .in("membership_id", membershipIds)
        .eq("role", "owner");
      if (ownerRoleError) {
        throw new Error(`Failed to resolve owner roles: ${ownerRoleError.message}`);
      }
      const userIdByMembershipId = new Map((activeMemberships ?? []).map((row) => [row.id, row.user_id]));
      existingOwners = (ownerRoleRows ?? [])
        .map((row) => {
          const userId = userIdByMembershipId.get(row.membership_id);
          return userId ? { userId, membershipId: row.membership_id } : null;
        })
        .filter((row): row is ResolvedOwnerRow => row !== null);
    }
  }

  return {
    tenant,
    legalEntities,
    authUser,
    membershipForUser,
    otherActiveTenantIdForUser,
    existingOwners,
  };
}

export function createSupabaseRepository(client: SupabaseClient<Database>): BootstrapRepository {
  return {
    resolveState: (input) => resolveState(client, input),

    async createTenant(identity: DemoTenantIdentity): Promise<ResolvedTenantRow> {
      const { data, error } = await client
        .from("tenants")
        .insert({ slug: identity.slug, display_name: identity.displayName })
        .select("id, slug, display_name, status")
        .single();
      if (error || !data) {
        throw new Error(`Failed to create tenant: ${error?.message}`);
      }
      return { id: data.id, slug: data.slug, displayName: data.display_name, status: data.status };
    },

    async updateTenantDisplayName(tenantId, displayName) {
      const { error } = await client
        .from("tenants")
        .update({ display_name: displayName })
        .eq("id", tenantId);
      if (error) {
        throw new Error(`Failed to update tenant: ${error.message}`);
      }
    },

    async createLegalEntity(tenantId, identity) {
      const { data, error } = await client
        .from("legal_entities")
        .insert({
          tenant_id: tenantId,
          legal_name: identity.legalName,
          display_name: identity.legalDisplayName,
        })
        .select("id, tenant_id, legal_name, display_name, status")
        .single();
      if (error || !data) {
        throw new Error(`Failed to create legal entity: ${error?.message}`);
      }
      return {
        id: data.id,
        tenantId: data.tenant_id,
        legalName: data.legal_name,
        displayName: data.display_name,
        status: data.status,
      };
    },

    async updateLegalEntity(legalEntityId, patch) {
      const update: { legal_name?: string; display_name?: string } = {};
      if (patch.legalName !== undefined) {
        update.legal_name = patch.legalName;
      }
      if (patch.displayName !== undefined) {
        update.display_name = patch.displayName;
      }
      const { error } = await client.from("legal_entities").update(update).eq("id", legalEntityId);
      if (error) {
        throw new Error(`Failed to update legal entity: ${error.message}`);
      }
    },

    async createAuthUser(input: OwnerBootstrapIdentity) {
      const { data, error } = await client.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: { display_name: input.displayName },
      });
      if (error || !data.user) {
        throw new Error(`Failed to create auth user: ${error?.message}`);
      }
      return { id: data.user.id, email: input.email };
    },

    async createMembership(tenantId, userId) {
      const { data, error } = await client
        .from("tenant_memberships")
        .insert({ tenant_id: tenantId, user_id: userId, status: "active" })
        .select("id, tenant_id, user_id, status")
        .single();
      if (error || !data) {
        throw new Error(`Failed to create membership: ${error?.message}`);
      }
      return {
        id: data.id,
        tenantId: data.tenant_id,
        userId: data.user_id,
        status: data.status,
        roles: [],
      };
    },

    async activateMembership(membershipId) {
      const { error } = await client
        .from("tenant_memberships")
        .update({ status: "active" })
        .eq("id", membershipId);
      if (error) {
        throw new Error(`Failed to activate membership: ${error.message}`);
      }
    },

    async addOwnerRole(membershipId) {
      const { error } = await client
        .from("membership_roles")
        .upsert({ membership_id: membershipId, role: "owner" }, { onConflict: "membership_id,role" });
      if (error) {
        throw new Error(`Failed to assign owner role: ${error.message}`);
      }
    },

    async writeAuditEvents(events: TablesInsert<"access_audit_events">[]) {
      if (events.length === 0) {
        return;
      }
      const { error } = await client.from("access_audit_events").insert(events);
      if (error) {
        throw new Error(`Failed to write audit evidence: ${error.message}`);
      }
    },
  };
}
