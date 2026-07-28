import { describe, expect, it } from "vitest";
import { DEMO_TENANT_IDENTITY } from "./identity";
import { ALLOWED_TARGET } from "./target";
import { buildExpectedConfirmationToken, runBootstrap } from "./executor";
import type {
  BootstrapRepository,
  OwnerBootstrapIdentity,
  OwnerIdentityFields,
  ResolvedLegalEntityRow,
  ResolvedMembershipRow,
  ResolvedState,
  ResolvedTenantRow,
  StepId,
  TenantRole,
} from "./types";
import type { TablesInsert } from "@/types/database";

const IDENTITY: OwnerIdentityFields = {
  email: "founder-demo@example.test",
  displayName: "Founder Demo Owner",
};

const PASSWORD = "Correct-Horse-9";

// In-memory fake standing in for a real Supabase project. Never touches the
// network — this is what requirement §"mocks/local-safe fixtures" refers
// to. Its resolveState() mirrors repository.ts's real query logic closely
// enough to exercise the planner/executor faithfully.
class FakeRepository implements BootstrapRepository {
  tenant: ResolvedTenantRow | null = null;
  legalEntities: ResolvedLegalEntityRow[] = [];
  authUsers: Array<{ id: string; email: string }> = [];
  memberships: ResolvedMembershipRow[] = [];
  auditEvents: TablesInsert<"access_audit_events">[] = [];
  calls: string[] = [];
  failStepOnce: StepId | null = null;
  private nextId = 1;

  private id(prefix: string): string {
    return `${prefix}-${this.nextId++}`;
  }

  private maybeFail(step: StepId): void {
    if (this.failStepOnce === step) {
      this.failStepOnce = null;
      throw new Error(`simulated failure at ${step}`);
    }
  }

  async resolveState(input: { email: string; tenantSlug: string }): Promise<ResolvedState> {
    this.calls.push("resolveState");
    const authUser = this.authUsers.find((u) => u.email === input.email) ?? null;
    const membershipForUser =
      authUser && this.tenant
        ? this.memberships.find((m) => m.userId === authUser.id && m.tenantId === this.tenant!.id) ?? null
        : null;
    const otherActive = authUser
      ? this.memberships.find(
          (m) => m.userId === authUser.id && m.tenantId !== this.tenant?.id && m.status === "active",
        )
      : undefined;
    const existingOwners = this.tenant
      ? this.memberships
          .filter((m) => m.tenantId === this.tenant!.id && m.status === "active" && m.roles.includes("owner"))
          .map((m) => ({ userId: m.userId, membershipId: m.id }))
      : [];
    return {
      tenant: this.tenant,
      legalEntities: this.tenant
        ? this.legalEntities.filter((le) => le.tenantId === this.tenant!.id && le.status === "active")
        : [],
      authUser,
      membershipForUser,
      otherActiveTenantIdForUser: otherActive?.tenantId ?? null,
      existingOwners,
    };
  }

  async createTenant(identity: { slug: string; displayName: string }): Promise<ResolvedTenantRow> {
    this.calls.push("createTenant");
    this.maybeFail("resolve_or_create_tenant");
    this.tenant = { id: this.id("tenant"), slug: identity.slug, displayName: identity.displayName, status: "active" };
    return this.tenant;
  }

  async updateTenantDisplayName(tenantId: string, displayName: string): Promise<void> {
    this.calls.push("updateTenantDisplayName");
    if (this.tenant?.id === tenantId) {
      this.tenant.displayName = displayName;
    }
  }

  async createLegalEntity(
    tenantId: string,
    identity: { legalName: string; legalDisplayName: string },
  ): Promise<ResolvedLegalEntityRow> {
    this.calls.push("createLegalEntity");
    this.maybeFail("resolve_or_create_legal_entity");
    const legalEntity: ResolvedLegalEntityRow = {
      id: this.id("legal"),
      tenantId,
      legalName: identity.legalName,
      displayName: identity.legalDisplayName,
      status: "active",
    };
    this.legalEntities.push(legalEntity);
    return legalEntity;
  }

  async updateLegalEntity(
    legalEntityId: string,
    patch: { legalName?: string; displayName?: string },
  ): Promise<void> {
    this.calls.push("updateLegalEntity");
    const legalEntity = this.legalEntities.find((le) => le.id === legalEntityId);
    if (!legalEntity) return;
    if (patch.legalName !== undefined) legalEntity.legalName = patch.legalName;
    if (patch.displayName !== undefined) legalEntity.displayName = patch.displayName;
  }

  async createAuthUser(input: OwnerBootstrapIdentity): Promise<{ id: string; email: string }> {
    this.calls.push("createAuthUser");
    this.maybeFail("resolve_or_create_auth_user");
    const user = { id: this.id("user"), email: input.email };
    this.authUsers.push(user);
    return user;
  }

  async createMembership(tenantId: string, userId: string): Promise<ResolvedMembershipRow> {
    this.calls.push("createMembership");
    this.maybeFail("ensure_active_membership");
    const membership: ResolvedMembershipRow = {
      id: this.id("membership"),
      tenantId,
      userId,
      status: "active",
      roles: [],
    };
    this.memberships.push(membership);
    return membership;
  }

  async activateMembership(membershipId: string): Promise<void> {
    this.calls.push("activateMembership");
    const membership = this.memberships.find((m) => m.id === membershipId);
    if (membership) membership.status = "active";
  }

  async addOwnerRole(membershipId: string): Promise<void> {
    this.calls.push("addOwnerRole");
    this.maybeFail("ensure_owner_role");
    const membership = this.memberships.find((m) => m.id === membershipId);
    if (membership && !membership.roles.includes("owner" as TenantRole)) {
      membership.roles.push("owner" as TenantRole);
    }
  }

  async writeAuditEvents(events: TablesInsert<"access_audit_events">[]): Promise<void> {
    this.calls.push("writeAuditEvents");
    this.maybeFail("write_bootstrap_audit_evidence");
    this.auditEvents.push(...events);
  }
}

const MUTATING_CALLS = [
  "createTenant",
  "updateTenantDisplayName",
  "createLegalEntity",
  "updateLegalEntity",
  "createAuthUser",
  "createMembership",
  "activateMembership",
  "addOwnerRole",
  "writeAuditEvents",
];

describe("runBootstrap — target guard", () => {
  it("rejects a mismatched target before doing any I/O", async () => {
    const repo = new FakeRepository();
    const report = await runBootstrap({
      repository: repo,
      target: { ref: "some-other-ref", url: "https://some-other-ref.supabase.co" },
      tenantIdentity: DEMO_TENANT_IDENTITY,
      identity: IDENTITY,
      apply: false,
    });
    expect(report.kind).toBe("target_rejected");
    expect(repo.calls).toEqual([]);
  });

  it("rejects a localhost target before doing any I/O", async () => {
    const repo = new FakeRepository();
    const report = await runBootstrap({
      repository: repo,
      target: { ref: "localhost", url: "http://localhost:54321" },
      tenantIdentity: DEMO_TENANT_IDENTITY,
      identity: IDENTITY,
      apply: false,
    });
    expect(report.kind).toBe("target_rejected");
    expect(repo.calls).toEqual([]);
  });
});

describe("runBootstrap — dry-run is the default", () => {
  it("never calls a mutating repository method when apply is not set", async () => {
    const repo = new FakeRepository();
    const report = await runBootstrap({
      repository: repo,
      target: ALLOWED_TARGET,
      tenantIdentity: DEMO_TENANT_IDENTITY,
      identity: IDENTITY,
      apply: false,
    });
    expect(report.kind).toBe("dry_run");
    expect(repo.calls).toEqual(["resolveState"]);
  });

  it("never needs a password — the options object has no password field at all", async () => {
    const repo = new FakeRepository();
    // No `password` key exists on this literal; TypeScript enforces that a
    // dry-run RunBootstrapOptions cannot carry one (see executor.ts).
    const report = await runBootstrap({
      repository: repo,
      target: ALLOWED_TARGET,
      tenantIdentity: DEMO_TENANT_IDENTITY,
      identity: IDENTITY,
      apply: false,
    });
    expect(report.kind).toBe("dry_run");
  });
});

describe("runBootstrap — apply requires explicit confirmation", () => {
  it("refuses to apply without a confirmation token", async () => {
    const repo = new FakeRepository();
    const report = await runBootstrap({
      repository: repo,
      target: ALLOWED_TARGET,
      tenantIdentity: DEMO_TENANT_IDENTITY,
      identity: IDENTITY,
      apply: true,
      password: PASSWORD,
    });
    expect(report.kind).toBe("confirmation_required");
    expect(repo.calls.some((c) => MUTATING_CALLS.includes(c))).toBe(false);
  });

  it("refuses to apply with a wrong confirmation token", async () => {
    const repo = new FakeRepository();
    const report = await runBootstrap({
      repository: repo,
      target: ALLOWED_TARGET,
      tenantIdentity: DEMO_TENANT_IDENTITY,
      identity: IDENTITY,
      apply: true,
      password: PASSWORD,
      confirmationToken: "wrong token",
    });
    expect(report.kind).toBe("confirmation_required");
    expect(repo.calls.some((c) => MUTATING_CALLS.includes(c))).toBe(false);
  });

  it("applies once the exact confirmation token is provided", async () => {
    const repo = new FakeRepository();
    const token = buildExpectedConfirmationToken(ALLOWED_TARGET, DEMO_TENANT_IDENTITY.slug);
    const report = await runBootstrap({
      repository: repo,
      target: ALLOWED_TARGET,
      tenantIdentity: DEMO_TENANT_IDENTITY,
      identity: IDENTITY,
      apply: true,
      password: PASSWORD,
      confirmationToken: token,
    });
    expect(report.kind).toBe("applied");
    if (report.kind === "applied") {
      expect(report.success).toBe(true);
    }
  });
});

describe("runBootstrap — new tenant provisioning + audit evidence", () => {
  it("creates tenant, legal entity, user, membership, owner role, and writes audit evidence", async () => {
    const repo = new FakeRepository();
    const token = buildExpectedConfirmationToken(ALLOWED_TARGET, DEMO_TENANT_IDENTITY.slug);
    const report = await runBootstrap({
      repository: repo,
      target: ALLOWED_TARGET,
      tenantIdentity: DEMO_TENANT_IDENTITY,
      identity: IDENTITY,
      apply: true,
      password: PASSWORD,
      confirmationToken: token,
    });
    expect(report.kind).toBe("applied");
    expect(repo.tenant).not.toBeNull();
    expect(repo.legalEntities).toHaveLength(1);
    expect(repo.authUsers).toHaveLength(1);
    expect(repo.memberships).toHaveLength(1);
    expect(repo.memberships[0].roles).toContain("owner");
    expect(repo.auditEvents.length).toBeGreaterThan(0);
    expect(repo.auditEvents.some((e) => e.action === "privileged_bootstrap_run")).toBe(true);
  });
});

describe("runBootstrap — idempotent rerun", () => {
  it("makes no further mutating calls on a second run once everything is provisioned", async () => {
    const repo = new FakeRepository();
    const token = buildExpectedConfirmationToken(ALLOWED_TARGET, DEMO_TENANT_IDENTITY.slug);
    const options = {
      repository: repo,
      target: ALLOWED_TARGET,
      tenantIdentity: DEMO_TENANT_IDENTITY,
      identity: IDENTITY,
      apply: true as const,
      password: PASSWORD,
      confirmationToken: token,
    };

    const first = await runBootstrap(options);
    expect(first.kind).toBe("applied");

    repo.calls = [];
    const second = await runBootstrap(options);
    expect(second.kind).toBe("applied");
    if (second.kind === "applied") {
      expect(second.success).toBe(true);
    }
    expect(repo.calls).toEqual(["resolveState"]);
    expect(repo.legalEntities).toHaveLength(1);
    expect(repo.authUsers).toHaveLength(1);
    expect(repo.memberships).toHaveLength(1);
  });
});

describe("runBootstrap — partial failure reporting", () => {
  it("stops at the failing step and reports completed/pending accurately", async () => {
    const repo = new FakeRepository();
    repo.failStepOnce = "resolve_or_create_auth_user";
    const token = buildExpectedConfirmationToken(ALLOWED_TARGET, DEMO_TENANT_IDENTITY.slug);
    const report = await runBootstrap({
      repository: repo,
      target: ALLOWED_TARGET,
      tenantIdentity: DEMO_TENANT_IDENTITY,
      identity: IDENTITY,
      apply: true,
      password: PASSWORD,
      confirmationToken: token,
    });
    expect(report.kind).toBe("applied");
    if (report.kind !== "applied") return;
    expect(report.success).toBe(false);
    expect(report.failedAt).toBe("resolve_or_create_auth_user");
    expect(report.completed).toEqual(["resolve_or_create_tenant", "resolve_or_create_legal_entity"]);
    expect(report.pending).toEqual([
      "ensure_active_membership",
      "ensure_owner_role",
      "write_bootstrap_audit_evidence",
    ]);
    // No membership/role/audit call was ever attempted once auth-user creation failed.
    expect(repo.calls).not.toContain("createMembership");
    expect(repo.calls).not.toContain("addOwnerRole");
    expect(repo.calls).not.toContain("writeAuditEvents");
  });

  it("rerun after a partial failure completes only the pending steps, without duplicating prior ones", async () => {
    const repo = new FakeRepository();
    repo.failStepOnce = "resolve_or_create_auth_user";
    const token = buildExpectedConfirmationToken(ALLOWED_TARGET, DEMO_TENANT_IDENTITY.slug);
    const options = {
      repository: repo,
      target: ALLOWED_TARGET,
      tenantIdentity: DEMO_TENANT_IDENTITY,
      identity: IDENTITY,
      apply: true as const,
      password: PASSWORD,
      confirmationToken: token,
    };

    const first = await runBootstrap(options);
    expect(first.kind).toBe("applied");
    if (first.kind === "applied") {
      expect(first.success).toBe(false);
    }

    repo.calls = [];
    const second = await runBootstrap(options);
    expect(second.kind).toBe("applied");
    if (second.kind === "applied") {
      expect(second.success).toBe(true);
    }
    // Tenant and legal entity were already created on the first (failed) run
    // — the second run must not create them again.
    expect(repo.calls).not.toContain("createTenant");
    expect(repo.calls).not.toContain("createLegalEntity");
    expect(repo.calls).toContain("createAuthUser");
    expect(repo.calls).toContain("createMembership");
    expect(repo.calls).toContain("addOwnerRole");
    expect(repo.tenant).not.toBeNull();
    expect(repo.legalEntities).toHaveLength(1);
    expect(repo.authUsers).toHaveLength(1);
  });
});

describe("runBootstrap — audit evidence not written when nothing changed", () => {
  it("skips writeAuditEvents on a fully no-op rerun", async () => {
    const repo = new FakeRepository();
    const token = buildExpectedConfirmationToken(ALLOWED_TARGET, DEMO_TENANT_IDENTITY.slug);
    const options = {
      repository: repo,
      target: ALLOWED_TARGET,
      tenantIdentity: DEMO_TENANT_IDENTITY,
      identity: IDENTITY,
      apply: true as const,
      password: PASSWORD,
      confirmationToken: token,
    };
    await runBootstrap(options);
    repo.calls = [];
    await runBootstrap(options);
    expect(repo.calls).not.toContain("writeAuditEvents");
  });
});

describe("runBootstrap — no delete/reset operations", () => {
  it("never touches any repository property outside the declared BootstrapRepository interface", async () => {
    const repo = new FakeRepository();
    const knownMethods = new Set([
      "resolveState",
      "createTenant",
      "updateTenantDisplayName",
      "createLegalEntity",
      "updateLegalEntity",
      "createAuthUser",
      "createMembership",
      "activateMembership",
      "addOwnerRole",
      "writeAuditEvents",
    ]);
    // Methods bind to the raw `repo`, not the proxy, so FakeRepository's own
    // internal helper calls (this.id(), this.maybeFail()) bypass this trap
    // entirely — it only ever sees property access made by the executor.
    const guarded = new Proxy(repo, {
      get(target, prop) {
        if (typeof prop === "string" && !knownMethods.has(prop)) {
          throw new Error(`unexpected access to repository.${prop}`);
        }
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as unknown as BootstrapRepository;

    const token = buildExpectedConfirmationToken(ALLOWED_TARGET, DEMO_TENANT_IDENTITY.slug);
    const report = await runBootstrap({
      repository: guarded,
      target: ALLOWED_TARGET,
      tenantIdentity: DEMO_TENANT_IDENTITY,
      identity: IDENTITY,
      apply: true,
      password: PASSWORD,
      confirmationToken: token,
    });
    expect(report.kind).toBe("applied");
  });
});

describe("runBootstrap — no credential logging", () => {
  it("never carries the raw password into any RunReport, dry-run or applied", async () => {
    const repo = new FakeRepository();
    const dryRun = await runBootstrap({
      repository: repo,
      target: ALLOWED_TARGET,
      tenantIdentity: DEMO_TENANT_IDENTITY,
      identity: IDENTITY,
      apply: false,
    });
    expect(JSON.stringify(dryRun)).not.toContain(PASSWORD);

    const token = buildExpectedConfirmationToken(ALLOWED_TARGET, DEMO_TENANT_IDENTITY.slug);
    const applied = await runBootstrap({
      repository: repo,
      target: ALLOWED_TARGET,
      tenantIdentity: DEMO_TENANT_IDENTITY,
      identity: IDENTITY,
      apply: true,
      password: PASSWORD,
      confirmationToken: token,
    });
    expect(JSON.stringify(applied)).not.toContain(PASSWORD);
    expect(JSON.stringify(applied)).not.toMatch(/password/i);
  });
});
