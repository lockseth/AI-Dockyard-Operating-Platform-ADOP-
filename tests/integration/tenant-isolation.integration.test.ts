import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

// Local-only ephemeral test credential — never a real password, never reused
// outside this Docker-local Supabase instance.
const EPHEMERAL_PASSWORD = "adop-integration-test-P4ssword!";

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface EphemeralMember {
  id: string;
  email: string;
}

async function createEphemeralMember(params: {
  emailPrefix: string;
  tenantId: string;
  role: "owner" | "admin" | "reviewer" | "viewer";
}): Promise<EphemeralMember> {
  const email = `${params.emailPrefix}-${crypto.randomUUID()}@adop-integration.local`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: EPHEMERAL_PASSWORD,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`createUser failed: ${createError?.message}`);
  }

  const { data: membership, error: membershipError } = await admin
    .from("tenant_memberships")
    .insert({ tenant_id: params.tenantId, user_id: created.user.id, status: "active" })
    .select("id")
    .single();
  if (membershipError || !membership) {
    throw new Error(`membership insert failed: ${membershipError?.message}`);
  }

  const { error: roleError } = await admin
    .from("membership_roles")
    .insert({ membership_id: membership.id, role: params.role });
  if (roleError) {
    throw new Error(`role insert failed: ${roleError.message}`);
  }

  return { id: created.user.id, email };
}

async function signInAsMember(email: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: EPHEMERAL_PASSWORD,
  });
  if (error || !data.session) {
    throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  }
  return client;
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
