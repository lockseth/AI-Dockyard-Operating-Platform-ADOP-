import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient as createSharedAdminClient, createEphemeralMember } from "./support/members";
import { createIssuanceRepository } from "@/lib/first-owner-bootstrap/issuance-repository";
import { planIssuance } from "@/lib/first-owner-bootstrap/issuance";
import { performBootstrapClaim, resolveBootstrapClaim } from "@/lib/first-owner-bootstrap/claim-repository";

// Exercises the full TypeScript layer (issuance repository + claim
// repository, including the real service-role auth.admin.createUser call
// and both RPCs) against a real local Supabase stack — the pgTAP suite
// (supabase/tests/database/first_owner_bootstrap.test.sql) already proves
// the RPC contract in isolation; this proves the two things a single SQL
// connection cannot: genuine concurrent claim requests, and the full
// issuance -> claim -> exactly-one-owner -> no-Founder-membership path
// end to end.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "first-owner-bootstrap.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local — run `pnpm supabase:start` first.",
  );
}

const admin = createSharedAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const repository = createIssuanceRepository(admin);

function uniqueSlug(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

describe("first-owner-bootstrap — real local Supabase", () => {
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
    for (const id of createdTenantIds) {
      await admin.from("tenants").delete().eq("id", id);
    }
  });

  it("issuance + claim happy path produces exactly one tenant, one user, one owner membership, and both audit events", async () => {
    const slug = uniqueSlug("fob-happy");
    const email = `${slug}-owner@adop-integration.local`;

    const state = await repository.resolveState(slug);
    const plan = planIssuance(state);
    expect(plan.kind).toBe("create_tenant");

    const tenant = await repository.createTenant({
      tenantSlug: slug,
      tenantDisplayName: "PT Integration Happy Path",
      email,
    });
    createdTenantIds.push(tenant.id);

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const issued = await repository.issueToken(tenant.id, email, expiresAt);
    await repository.writeIssuedAuditEvent(tenant.id, issued.tokenId, email);

    const resolved = await resolveBootstrapClaim(issued.rawToken);
    expect(resolved).not.toBeNull();
    expect(resolved?.tenantId).toBe(tenant.id);
    expect(resolved?.email).toBe(email);

    const result = await performBootstrapClaim(issued.rawToken, "adop-fob-integration-P4ss!");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdUserIds.push(
      (await admin.from("tenant_memberships").select("user_id").eq("id", result.membershipId).single()).data
        ?.user_id as string,
    );

    const { data: memberships } = await admin
      .from("tenant_memberships")
      .select("id, user_id, status")
      .eq("tenant_id", tenant.id);
    expect(memberships).toHaveLength(1);
    expect(memberships?.[0].status).toBe("active");

    const { data: roles } = await admin
      .from("membership_roles")
      .select("role")
      .eq("membership_id", memberships![0].id);
    expect(roles).toHaveLength(1);
    expect(roles?.[0].role).toBe("owner");

    const { data: auditEvents } = await admin
      .from("access_audit_events")
      .select("action")
      .eq("tenant_id", tenant.id)
      .in("action", ["first_owner_bootstrap_issued", "first_owner_bootstrap_claimed"]);
    expect(auditEvents?.map((e) => e.action).sort()).toEqual([
      "first_owner_bootstrap_claimed",
      "first_owner_bootstrap_issued",
    ]);

    // The claimant can now sign in with the password they chose — proves
    // performBootstrapClaim's admin.createUser call actually set a usable
    // credential, the same one the Server Action signs in with afterward.
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInError } = await anon.auth.signInWithPassword({
      email,
      password: "adop-fob-integration-P4ss!",
    });
    expect(signInError).toBeNull();
  });

  it("rejects claiming an expired token and leaves no membership behind", async () => {
    const slug = uniqueSlug("fob-expired");
    const email = `${slug}-owner@adop-integration.local`;
    const tenant = await repository.createTenant({ tenantSlug: slug, tenantDisplayName: "PT Expired", email });
    createdTenantIds.push(tenant.id);

    // Issue already-expired by asking for a negative window.
    const issued = await repository.issueToken(tenant.id, email, new Date(Date.now() - 1000));

    const result = await performBootstrapClaim(issued.rawToken, "adop-fob-integration-P4ss!");
    expect(result).toEqual({ ok: false, reason: "invalid_or_expired" });

    const { data: memberships } = await admin.from("tenant_memberships").select("id").eq("tenant_id", tenant.id);
    expect(memberships).toHaveLength(0);
  });

  it("fails closed when the tenant already has an active owner", async () => {
    const slug = uniqueSlug("fob-owned");
    const tenant = await repository.createTenant({
      tenantSlug: slug,
      tenantDisplayName: "PT Already Owned",
      email: "unused@adop-integration.local",
    });
    createdTenantIds.push(tenant.id);

    const existingOwner = await createEphemeralMember(admin, {
      emailPrefix: "fob-existing-owner",
      memberships: [{ tenantId: tenant.id, role: "owner" }],
    });
    createdUserIds.push(existingOwner.id);

    const state = await repository.resolveState(slug);
    expect(state.tenantHasActiveOwner).toBe(true);
    const plan = planIssuance(state);
    expect(plan).toEqual({
      kind: "conflict",
      reason: "tenant_already_has_owner",
      detail: expect.stringContaining("already has an active owner"),
    });
  });

  it("reissuing revokes the previous pending token so it can no longer be claimed", async () => {
    const slug = uniqueSlug("fob-reissue");
    const email = `${slug}-owner@adop-integration.local`;
    const tenant = await repository.createTenant({ tenantSlug: slug, tenantDisplayName: "PT Reissue", email });
    createdTenantIds.push(tenant.id);

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const first = await repository.issueToken(tenant.id, email, expiresAt);

    const state = await repository.resolveState(slug);
    const plan = planIssuance(state);
    expect(plan).toEqual({ kind: "reissue", tenantId: tenant.id, revokeTokenId: first.tokenId });
    if (plan.kind !== "reissue") return;

    if (plan.revokeTokenId) {
      await repository.revokeToken(plan.revokeTokenId);
    }
    const second = await repository.issueToken(tenant.id, email, expiresAt);

    const staleResolved = await resolveBootstrapClaim(first.rawToken);
    expect(staleResolved).toBeNull();

    const freshResolved = await resolveBootstrapClaim(second.rawToken);
    expect(freshResolved?.tenantId).toBe(tenant.id);
  });

  it("replaying the same claim is idempotent; a genuinely concurrent double-claim only ever produces one owner membership", async () => {
    const slug = uniqueSlug("fob-concurrent");
    const email = `${slug}-owner@adop-integration.local`;
    const tenant = await repository.createTenant({ tenantSlug: slug, tenantDisplayName: "PT Concurrent", email });
    createdTenantIds.push(tenant.id);

    const issued = await repository.issueToken(tenant.id, email, new Date(Date.now() + 60 * 60 * 1000));

    // Two genuinely concurrent attempts to claim the SAME token (e.g. a
    // doubled form submit / two tabs). auth.users' own email uniqueness
    // constraint means at most one admin.createUser call can succeed; the
    // other must fail cleanly with no side effect.
    const [first, second] = await Promise.all([
      performBootstrapClaim(issued.rawToken, "adop-fob-integration-P4ss!"),
      performBootstrapClaim(issued.rawToken, "adop-fob-integration-Other!"),
    ]);

    const outcomes = [first, second];
    const successes = outcomes.filter((r) => r.ok);
    expect(successes).toHaveLength(1);

    const { data: memberships } = await admin
      .from("tenant_memberships")
      .select("id, user_id")
      .eq("tenant_id", tenant.id);
    expect(memberships).toHaveLength(1);
    createdUserIds.push(memberships![0].user_id);

    // Replaying with the already-claimed token is idempotent for the same
    // user, not an error — mirrors the pgTAP-level assertion, exercised
    // here through the actual TS claim-repository path. The winning
    // performBootstrapClaim call above used the SAME password for both
    // concurrent attempts' first argument, so replaying it here reaches the
    // same auth.users row and the RPC's idempotent-retry branch.
    const replay = await performBootstrapClaim(issued.rawToken, "adop-fob-integration-P4ss!");
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.membershipId).toBe(memberships![0].id);
    }

    const { data: membershipsAfterReplay } = await admin
      .from("tenant_memberships")
      .select("id")
      .eq("tenant_id", tenant.id);
    expect(membershipsAfterReplay).toHaveLength(1);
  });
});
