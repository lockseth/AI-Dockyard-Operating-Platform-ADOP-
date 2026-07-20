import { afterAll, describe, expect, it } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  createEphemeralMember,
  signInAsMember,
} from "./support/members";

// Real local Supabase only — never point this at demo/production. These
// tests exercise the exact DB contract Gate 0B's data-access layer
// (listActiveMemberships/applyActiveTenantSelection/getAccessibleTenants)
// relies on, at the query level — the HTTP/cookie/redirect behavior built
// on top of it (proxy redirect, forged-cookie rejection, tenant switching,
// logout) was verified end-to-end against the running app via Browser UAT.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "tenant-context.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in " +
      ".env.local — run `pnpm supabase:start` first.",
  );
}

const TENANT_A_ID = "a1111111-1111-4111-8111-111111111111";
const TENANT_B_ID = "b2222222-2222-4222-8222-222222222222";
const LEGAL_ENTITY_A_ID = "a1111111-e1e1-e1e1-e1e1-e1e1e1e1e1e1";
const LEGAL_ENTITY_B_ID = "b2222222-e2e2-e2e2-e2e2-e2e2e2e2e2e2";

const admin: SupabaseClient = createAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Mirrors listActiveMemberships()'s three-query fetch, using the caller's
// own authenticated client (RLS-scoped) — not the admin client.
async function fetchActiveMemberships(client: SupabaseClient, userId: string) {
  const { data: memberships } = await client
    .from("tenant_memberships")
    .select("id, tenant_id")
    .eq("user_id", userId)
    .eq("status", "active");
  return memberships ?? [];
}

describe("tenant context — real local Supabase", () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("a single-tenant owner resolves to exactly one active membership with the owner role", async () => {
    const ownerA = await createEphemeralMember(admin, {
      emailPrefix: "single-owner",
      memberships: [{ tenantId: TENANT_A_ID, role: "owner" }],
    });
    createdUserIds.push(ownerA.id);
    const client = await signInAsMember(SUPABASE_URL!, ANON_KEY!, ownerA.email);

    const memberships = await fetchActiveMemberships(client, ownerA.id);
    expect(memberships).toHaveLength(1);
    expect(memberships[0].tenant_id).toBe(TENANT_A_ID);

    const { data: roles } = await client
      .from("membership_roles")
      .select("role")
      .eq("membership_id", memberships[0].id);
    expect(roles?.map((r) => r.role)).toEqual(["owner"]);
  });

  it("a multi-tenant user resolves both active memberships with their distinct roles", async () => {
    const multi = await createEphemeralMember(admin, {
      emailPrefix: "multi-tenant",
      memberships: [
        { tenantId: TENANT_A_ID, role: "viewer" },
        { tenantId: TENANT_B_ID, role: "admin" },
      ],
    });
    createdUserIds.push(multi.id);
    const client = await signInAsMember(SUPABASE_URL!, ANON_KEY!, multi.email);

    const memberships = await fetchActiveMemberships(client, multi.id);
    expect(memberships).toHaveLength(2);
    expect(memberships.map((m) => m.tenant_id).sort()).toEqual(
      [TENANT_A_ID, TENANT_B_ID].sort(),
    );
  });

  it("a suspended membership is excluded by the status='active' filter", async () => {
    const suspended = await createEphemeralMember(admin, {
      emailPrefix: "suspended",
      memberships: [{ tenantId: TENANT_A_ID, role: "viewer", status: "suspended" }],
    });
    createdUserIds.push(suspended.id);
    const client = await signInAsMember(SUPABASE_URL!, ANON_KEY!, suspended.email);

    const memberships = await fetchActiveMemberships(client, suspended.id);
    expect(memberships).toHaveLength(0);
  });

  it("a user with no membership rows resolves to zero accessible tenants", async () => {
    const noMembership = await createEphemeralMember(admin, {
      emailPrefix: "no-membership",
      memberships: [],
    });
    createdUserIds.push(noMembership.id);
    const client = await signInAsMember(SUPABASE_URL!, ANON_KEY!, noMembership.email);

    const memberships = await fetchActiveMemberships(client, noMembership.id);
    expect(memberships).toHaveLength(0);
  });

  it("a member of Tenant A cannot select a forged Tenant B id — no matching membership row exists", async () => {
    const ownerA = await createEphemeralMember(admin, {
      emailPrefix: "forged-cookie-owner",
      memberships: [{ tenantId: TENANT_A_ID, role: "owner" }],
    });
    createdUserIds.push(ownerA.id);
    const client = await signInAsMember(SUPABASE_URL!, ANON_KEY!, ownerA.email);

    // This is exactly the check applyActiveTenantSelection() performs before
    // ever writing the active-tenant cookie: a forged/foreign tenantId finds
    // no matching row and is rejected.
    const { data: forged } = await client
      .from("tenant_memberships")
      .select("id")
      .eq("user_id", ownerA.id)
      .eq("tenant_id", TENANT_B_ID)
      .eq("status", "active");
    expect(forged).toHaveLength(0);
  });

  it("legal entities are only readable for the caller's own accessible tenant", async () => {
    const ownerA = await createEphemeralMember(admin, {
      emailPrefix: "legal-entity-owner",
      memberships: [{ tenantId: TENANT_A_ID, role: "owner" }],
    });
    createdUserIds.push(ownerA.id);
    const client = await signInAsMember(SUPABASE_URL!, ANON_KEY!, ownerA.email);

    const { data: ownLegalEntity, error: ownError } = await client
      .from("legal_entities")
      .select("id")
      .eq("id", LEGAL_ENTITY_A_ID);
    expect(ownError).toBeNull();
    expect(ownLegalEntity).toHaveLength(1);

    const { data: foreignLegalEntity, error: foreignError } = await client
      .from("legal_entities")
      .select("id")
      .eq("id", LEGAL_ENTITY_B_ID);
    expect(foreignError).toBeNull();
    expect(foreignLegalEntity).toHaveLength(0);
  });
});
