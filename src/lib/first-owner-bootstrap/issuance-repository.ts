import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@/types/database";
import { generateBootstrapToken, hashBootstrapToken } from "./token";
import type { IssuanceInput, IssuedBootstrapLink, ResolvedIssuanceState } from "./types";

// Service-role boundary for this module — plain Node CLI context, so this
// deliberately does NOT import @/lib/supabase/admin (that module imports
// "server-only", which throws outside Next.js's server bundler). Mirrors
// demo-owner-bootstrap/repository.ts's own createAdminClient for the exact
// same reason; not a parallel source of truth for business logic, only for
// client construction.
export function createAdminClient(url: string, serviceRoleKey: string): SupabaseClient<Database> {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveIssuanceState(
  client: SupabaseClient<Database>,
  tenantSlug: string,
): Promise<ResolvedIssuanceState> {
  const { data: tenantRow, error: tenantError } = await client
    .from("tenants")
    .select("id, display_name")
    .eq("slug", tenantSlug)
    .maybeSingle();
  if (tenantError) {
    throw new Error(`Failed to resolve tenant: ${tenantError.message}`);
  }

  if (!tenantRow) {
    return { tenant: null, tenantHasActiveOwner: false, pendingTokenId: null };
  }

  // Two-step lookup (not an embedded PostgREST join) — mirrors
  // demo-owner-bootstrap/repository.ts's existingOwners resolution, which
  // takes the same approach for the same reason: membership_roles has no
  // tenant_id column of its own to filter on directly.
  const { data: activeMemberships, error: activeError } = await client
    .from("tenant_memberships")
    .select("id")
    .eq("tenant_id", tenantRow.id)
    .eq("status", "active");
  if (activeError) {
    throw new Error(`Failed to resolve active memberships: ${activeError.message}`);
  }

  let hasActiveOwner = false;
  const membershipIds = (activeMemberships ?? []).map((row) => row.id);
  if (membershipIds.length > 0) {
    const { data: ownerRoleRows, error: ownerError } = await client
      .from("membership_roles")
      .select("membership_id")
      .in("membership_id", membershipIds)
      .eq("role", "owner")
      .limit(1);
    if (ownerError) {
      throw new Error(`Failed to resolve existing owners: ${ownerError.message}`);
    }
    hasActiveOwner = (ownerRoleRows ?? []).length > 0;
  }

  const { data: pendingTokenRow, error: pendingError } = await client
    .from("first_owner_bootstrap_tokens")
    .select("id")
    .eq("tenant_id", tenantRow.id)
    .eq("status", "pending")
    .maybeSingle();
  if (pendingError) {
    throw new Error(`Failed to resolve pending bootstrap token: ${pendingError.message}`);
  }

  return {
    tenant: { id: tenantRow.id, displayName: tenantRow.display_name },
    tenantHasActiveOwner: hasActiveOwner,
    pendingTokenId: pendingTokenRow?.id ?? null,
  };
}

export interface IssuanceRepository {
  resolveState(tenantSlug: string): Promise<ResolvedIssuanceState>;
  createTenant(input: IssuanceInput): Promise<{ id: string }>;
  revokeToken(tokenId: string): Promise<void>;
  issueToken(tenantId: string, email: string, expiresAt: Date): Promise<IssuedBootstrapLink>;
  writeIssuedAuditEvent(tenantId: string, tokenId: string, email: string): Promise<void>;
}

export function createIssuanceRepository(client: SupabaseClient<Database>): IssuanceRepository {
  return {
    resolveState: (tenantSlug) => resolveIssuanceState(client, tenantSlug),

    async createTenant(input) {
      const { data, error } = await client
        .from("tenants")
        .insert({ slug: input.tenantSlug, display_name: input.tenantDisplayName })
        .select("id")
        .single();
      if (error || !data) {
        throw new Error(`Failed to create tenant: ${error?.message}`);
      }
      return { id: data.id };
    },

    async revokeToken(tokenId) {
      const { error } = await client
        .from("first_owner_bootstrap_tokens")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", tokenId)
        .eq("status", "pending");
      if (error) {
        throw new Error(`Failed to revoke previous bootstrap token: ${error.message}`);
      }
    },

    async issueToken(tenantId, email, expiresAt) {
      const rawToken = generateBootstrapToken();
      const tokenHash = hashBootstrapToken(rawToken);
      const { data, error } = await client
        .from("first_owner_bootstrap_tokens")
        .insert({
          tenant_id: tenantId,
          email,
          token_hash: tokenHash,
          expires_at: expiresAt.toISOString(),
        })
        .select("id")
        .single();
      if (error || !data) {
        throw new Error(`Failed to issue bootstrap token: ${error?.message}`);
      }
      return { tenantId, tokenId: data.id, rawToken, expiresAt: expiresAt.toISOString() };
    },

    async writeIssuedAuditEvent(tenantId, tokenId, email) {
      const event: TablesInsert<"access_audit_events"> = {
        tenant_id: tenantId,
        actor_user_id: null,
        entity_type: "tenant",
        entity_id: tenantId,
        action: "first_owner_bootstrap_issued",
        before_data: null,
        // The token id and target email are safe to store (same convention
        // as tenant_invitations' own audit trail) — the raw token and its
        // hash are never included here or anywhere else.
        after_data: { token_id: tokenId, target_email: email },
      };
      const { error } = await client.from("access_audit_events").insert(event);
      if (error) {
        throw new Error(`Failed to write issuance audit evidence: ${error.message}`);
      }
    },
  };
}
