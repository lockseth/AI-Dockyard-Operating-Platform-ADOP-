import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { ACTIVE_TENANT_COOKIE, activeTenantCookieOptions } from "@/lib/auth/cookies";

export type TenantRole = Enums<"tenant_role">;

export interface TenantMembership {
  membershipId: string;
  tenantId: string;
  tenantDisplayName: string;
  roles: TenantRole[];
}

export interface LegalEntitySummary {
  id: string;
  displayName: string;
}

export interface TenantContext {
  userId: string;
  email: string | null;
  tenantId: string;
  tenantDisplayName: string;
  membershipId: string;
  roles: TenantRole[];
  legalEntities: LegalEntitySummary[];
}

export class UnauthorizedTenantRoleError extends Error {
  constructor() {
    super("Current tenant role does not permit this action.");
    this.name = "UnauthorizedTenantRoleError";
  }
}

// Three flat, explicitly-typed queries instead of a nested PostgREST embed —
// keeps the return shape unambiguous under strict typing and avoids relying
// on embed-cardinality inference. RLS still scopes every query to rows the
// caller's own membership makes visible; the `.eq("user_id", userId)` below
// additionally narrows "accessible" to the caller's own memberships (not
// every member of a tenant they own/admin).
export async function listActiveMemberships(
  userId: string,
): Promise<TenantMembership[]> {
  const supabase = await createSupabaseServerClient();

  const { data: memberships, error: membershipError } = await supabase
    .from("tenant_memberships")
    .select("id, tenant_id")
    .eq("user_id", userId)
    .eq("status", "active");

  if (membershipError || !memberships || memberships.length === 0) {
    return [];
  }

  const tenantIds = [...new Set(memberships.map((m) => m.tenant_id))];
  const membershipIds = memberships.map((m) => m.id);

  const [{ data: tenants }, { data: roleRows }] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, display_name, status")
      .in("id", tenantIds),
    supabase
      .from("membership_roles")
      .select("membership_id, role")
      .in("membership_id", membershipIds),
  ]);

  const tenantById = new Map((tenants ?? []).map((t) => [t.id, t]));
  const rolesByMembership = new Map<string, TenantRole[]>();
  for (const row of roleRows ?? []) {
    const list = rolesByMembership.get(row.membership_id) ?? [];
    list.push(row.role);
    rolesByMembership.set(row.membership_id, list);
  }

  return memberships
    .map((m) => {
      const tenant = tenantById.get(m.tenant_id);
      if (!tenant || tenant.status !== "active") {
        return null;
      }
      return {
        membershipId: m.id,
        tenantId: m.tenant_id,
        tenantDisplayName: tenant.display_name,
        roles: rolesByMembership.get(m.id) ?? [],
      };
    })
    .filter((m): m is TenantMembership => m !== null);
}

export async function getAccessibleTenants(): Promise<TenantMembership[]> {
  const user = await requireAuthenticatedUser();
  return listActiveMemberships(user.userId);
}

async function getLegalEntitiesForTenant(
  tenantId: string,
): Promise<LegalEntitySummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("legal_entities")
    .select("id, display_name")
    .eq("tenant_id", tenantId)
    .eq("status", "active");

  return (data ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
  }));
}

// Only callable from a Server Action or Route Handler (Next.js enforces this
// at runtime) — never from a Server Component render. Re-validates tenantId
// against the caller's own active memberships every time; a forged/foreign
// tenantId is rejected regardless of what the cookie previously held.
export async function applyActiveTenantSelection(
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const memberships = await listActiveMemberships(userId);
  const match = memberships.find((m) => m.tenantId === tenantId);
  if (!match) {
    return false;
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TENANT_COOKIE, match.tenantId, activeTenantCookieOptions());
  return true;
}

export async function clearActiveTenantCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TENANT_COOKIE, "", {
    ...activeTenantCookieOptions(),
    maxAge: 0,
  });
}

// Server Component-safe: never mutates cookies. When the active-tenant
// cookie is missing, forged, or points at a tenant the caller no longer has
// active access to, this redirects to a route that CAN set cookies
// (/tenant/resolve for the single-membership case, /select-tenant for
// multiple) rather than guessing here.
export async function requireTenantContext(): Promise<TenantContext> {
  const user = await requireAuthenticatedUser();
  const memberships = await listActiveMemberships(user.userId);

  if (memberships.length === 0) {
    redirect("/no-access");
  }

  const cookieStore = await cookies();
  const cookieTenantId = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value;
  const selected = memberships.find((m) => m.tenantId === cookieTenantId);

  if (!selected) {
    redirect(memberships.length === 1 ? "/tenant/resolve" : "/select-tenant");
  }

  const legalEntities = await getLegalEntitiesForTenant(selected.tenantId);

  return {
    userId: user.userId,
    email: user.email,
    tenantId: selected.tenantId,
    tenantDisplayName: selected.tenantDisplayName,
    membershipId: selected.membershipId,
    roles: selected.roles,
    legalEntities,
  };
}

// UX/early-rejection only — RLS remains the final enforcement layer for any
// query this gate or a later one performs.
export function requireTenantRole(
  context: Pick<TenantContext, "roles">,
  allowed: TenantRole[],
): void {
  if (!context.roles.some((role) => allowed.includes(role))) {
    throw new UnauthorizedTenantRoleError();
  }
}
