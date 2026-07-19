import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  createEphemeralMember as createEphemeralMemberBase,
  signInAsMember as signInAsMemberBase,
  type EphemeralMember,
} from "./support/members";

// Real local Supabase only — never point this at demo/production.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "tenant-isolation.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in " +
      ".env.local — run `pnpm supabase:start` first.",
  );
}

// Seeded by supabase/seed.sql.
const TENANT_A_ID = "a1111111-1111-1111-1111-111111111111";
const TENANT_B_ID = "b2222222-2222-2222-2222-222222222222";

const admin: SupabaseClient = createAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function createEphemeralMember(params: {
  emailPrefix: string;
  tenantId: string;
  role: "owner" | "admin" | "reviewer" | "viewer";
}): Promise<EphemeralMember> {
  return createEphemeralMemberBase(admin, {
    emailPrefix: params.emailPrefix,
    memberships: [{ tenantId: params.tenantId, role: params.role }],
  });
}

async function signInAsMember(email: string): Promise<SupabaseClient> {
  return signInAsMemberBase(SUPABASE_URL!, ANON_KEY!, email);
}

describe("tenant isolation — real local Supabase", () => {
  const createdUserIds: string[] = [];
  let ownerA: EphemeralMember;
  let ownerB: EphemeralMember;

  beforeAll(async () => {
    ownerA = await createEphemeralMember({ emailPrefix: "owner-a", tenantId: TENANT_A_ID, role: "owner" });
    createdUserIds.push(ownerA.id);
    ownerB = await createEphemeralMember({ emailPrefix: "owner-b", tenantId: TENANT_B_ID, role: "owner" });
    createdUserIds.push(ownerB.id);
  });

  afterAll(async () => {
    // Deleting the auth user cascades to profiles/tenant_memberships/
    // membership_roles — cleans up everything this test created.
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("owner A can read Tenant A through the normal authenticated client", async () => {
    const clientA = await signInAsMember(ownerA.email);
    const { data, error } = await clientA.from("tenants").select("id").eq("id", TENANT_A_ID);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("owner A cannot read Tenant B — cross-tenant read denied", async () => {
    const clientA = await signInAsMember(ownerA.email);
    const { data, error } = await clientA.from("tenants").select("id").eq("id", TENANT_B_ID);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("owner B cannot read Tenant A — cross-tenant read denied", async () => {
    const clientB = await signInAsMember(ownerB.email);
    const { data, error } = await clientB.from("tenants").select("id").eq("id", TENANT_A_ID);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("owner A cannot write to Tenant B — cross-tenant write denied", async () => {
    const clientA = await signInAsMember(ownerA.email);
    const { data, error } = await clientA
      .from("tenants")
      .update({ display_name: "hacked-by-owner-a" })
      .eq("id", TENANT_B_ID)
      .select();

    // RLS filters the row out of the update target — no error, zero rows.
    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    const { data: unchanged } = await admin
      .from("tenants")
      .select("display_name")
      .eq("id", TENANT_B_ID)
      .single();
    expect(unchanged?.display_name).not.toBe("hacked-by-owner-a");
  });

  it("anonymous client cannot read any tenant data", async () => {
    const anonClient = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await anonClient.from("tenants").select("id");
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});
