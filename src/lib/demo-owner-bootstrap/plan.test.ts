import { describe, expect, it } from "vitest";
import { DEMO_TENANT_IDENTITY } from "./identity";
import { buildPlan } from "./plan";
import type { OwnerBootstrapIdentity, ResolvedState } from "./types";

const IDENTITY = DEMO_TENANT_IDENTITY;

const INPUT: OwnerBootstrapIdentity = {
  email: "founder-demo@example.test",
  displayName: "Founder Demo Owner",
  password: "Correct-Horse-9",
};

const EMPTY_STATE: ResolvedState = {
  tenant: null,
  legalEntities: [],
  authUser: null,
  membershipForUser: null,
  otherActiveTenantIdForUser: null,
  existingOwners: [],
};

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const LEGAL_ENTITY_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_USER_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_TENANT_ID = "66666666-6666-4666-8666-666666666666";

function stepById(steps: ReturnType<typeof buildPlan>, id: string) {
  if (steps.kind !== "plan") {
    throw new Error("expected a plan, got a conflict");
  }
  const step = steps.steps.find((s) => s.id === id);
  if (!step) {
    throw new Error(`no step ${id}`);
  }
  return step;
}

describe("buildPlan — new tenant", () => {
  it("plans create for every step from a fully empty state", () => {
    const result = buildPlan(EMPTY_STATE, INPUT, IDENTITY);
    expect(result.kind).toBe("plan");
    if (result.kind !== "plan") return;
    expect(result.allNoop).toBe(false);
    expect(stepById(result, "resolve_or_create_tenant").action).toBe("create");
    expect(stepById(result, "resolve_or_create_legal_entity").action).toBe("create");
    expect(stepById(result, "resolve_or_create_auth_user").action).toBe("create");
    expect(stepById(result, "ensure_active_membership").action).toBe("create");
    expect(stepById(result, "ensure_owner_role").action).toBe("create");
    expect(stepById(result, "write_bootstrap_audit_evidence").action).toBe("create");
  });
});

describe("buildPlan — existing-correct state", () => {
  const CORRECT_STATE: ResolvedState = {
    tenant: { id: TENANT_ID, slug: IDENTITY.slug, displayName: IDENTITY.displayName, status: "active" },
    legalEntities: [
      {
        id: LEGAL_ENTITY_ID,
        tenantId: TENANT_ID,
        legalName: IDENTITY.legalName,
        displayName: IDENTITY.legalDisplayName,
        status: "active",
      },
    ],
    authUser: { id: USER_ID, email: INPUT.email },
    membershipForUser: {
      id: MEMBERSHIP_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      status: "active",
      roles: ["owner"],
    },
    otherActiveTenantIdForUser: null,
    existingOwners: [{ userId: USER_ID, membershipId: MEMBERSHIP_ID }],
  };

  it("is a full no-op when everything already matches", () => {
    const result = buildPlan(CORRECT_STATE, INPUT, IDENTITY);
    expect(result.kind).toBe("plan");
    if (result.kind !== "plan") return;
    expect(result.allNoop).toBe(true);
    expect(result.steps.every((s) => s.action === "noop")).toBe(true);
  });

  it("is idempotent across repeated calls with the same resolved state", () => {
    const first = buildPlan(CORRECT_STATE, INPUT, IDENTITY);
    const second = buildPlan(CORRECT_STATE, INPUT, IDENTITY);
    expect(second).toEqual(first);
  });
});

describe("buildPlan — conflicts", () => {
  it("STOPs when the email is already active in a different tenant", () => {
    const state: ResolvedState = {
      ...EMPTY_STATE,
      authUser: { id: USER_ID, email: INPUT.email },
      otherActiveTenantIdForUser: OTHER_TENANT_ID,
    };
    const result = buildPlan(state, INPUT, IDENTITY);
    expect(result).toMatchObject({ kind: "conflict", reason: "email_bound_to_other_tenant" });
  });

  it("STOPs when the tenant already has a different active owner", () => {
    const state: ResolvedState = {
      ...EMPTY_STATE,
      tenant: { id: TENANT_ID, slug: IDENTITY.slug, displayName: IDENTITY.displayName, status: "active" },
      existingOwners: [{ userId: OTHER_USER_ID, membershipId: "77777777-7777-4777-8777-777777777777" }],
    };
    const result = buildPlan(state, INPUT, IDENTITY);
    expect(result).toMatchObject({ kind: "conflict", reason: "membership_role_conflict" });
  });

  it("STOPs when the existing membership for this email is suspended", () => {
    const state: ResolvedState = {
      ...EMPTY_STATE,
      tenant: { id: TENANT_ID, slug: IDENTITY.slug, displayName: IDENTITY.displayName, status: "active" },
      authUser: { id: USER_ID, email: INPUT.email },
      membershipForUser: {
        id: MEMBERSHIP_ID,
        tenantId: TENANT_ID,
        userId: USER_ID,
        status: "suspended",
        roles: [],
      },
    };
    const result = buildPlan(state, INPUT, IDENTITY);
    expect(result).toMatchObject({ kind: "conflict", reason: "membership_role_conflict" });
  });

  it("STOPs on a legal entity name mismatch", () => {
    const state: ResolvedState = {
      ...EMPTY_STATE,
      tenant: { id: TENANT_ID, slug: IDENTITY.slug, displayName: IDENTITY.displayName, status: "active" },
      legalEntities: [
        {
          id: LEGAL_ENTITY_ID,
          tenantId: TENANT_ID,
          legalName: "Some Other Legal Name",
          displayName: "Some Other Legal Name",
          status: "active",
        },
      ],
    };
    const result = buildPlan(state, INPUT, IDENTITY);
    expect(result).toMatchObject({ kind: "conflict", reason: "legal_entity_mismatch" });
  });

  it("STOPs when tenant state is ambiguous (multiple active legal entities)", () => {
    const state: ResolvedState = {
      ...EMPTY_STATE,
      tenant: { id: TENANT_ID, slug: IDENTITY.slug, displayName: IDENTITY.displayName, status: "active" },
      legalEntities: [
        {
          id: LEGAL_ENTITY_ID,
          tenantId: TENANT_ID,
          legalName: IDENTITY.legalName,
          displayName: IDENTITY.legalDisplayName,
          status: "active",
        },
        {
          id: "88888888-8888-4888-8888-888888888888",
          tenantId: TENANT_ID,
          legalName: IDENTITY.legalName,
          displayName: IDENTITY.legalDisplayName,
          status: "active",
        },
      ],
    };
    const result = buildPlan(state, INPUT, IDENTITY);
    expect(result).toMatchObject({ kind: "conflict", reason: "ambiguous_multiple_matches" });
  });

  it("does not STOP when the existing owner is the same user being bootstrapped", () => {
    const state: ResolvedState = {
      ...EMPTY_STATE,
      tenant: { id: TENANT_ID, slug: IDENTITY.slug, displayName: IDENTITY.displayName, status: "active" },
      authUser: { id: USER_ID, email: INPUT.email },
      membershipForUser: {
        id: MEMBERSHIP_ID,
        tenantId: TENANT_ID,
        userId: USER_ID,
        status: "active",
        roles: ["owner"],
      },
      existingOwners: [{ userId: USER_ID, membershipId: MEMBERSHIP_ID }],
    };
    const result = buildPlan(state, INPUT, IDENTITY);
    expect(result.kind).toBe("plan");
  });
});

describe("buildPlan — owner membership/role plan", () => {
  it("plans membership + owner role creation when tenant exists but user does not", () => {
    const state: ResolvedState = {
      ...EMPTY_STATE,
      tenant: { id: TENANT_ID, slug: IDENTITY.slug, displayName: IDENTITY.displayName, status: "active" },
      legalEntities: [
        {
          id: LEGAL_ENTITY_ID,
          tenantId: TENANT_ID,
          legalName: IDENTITY.legalName,
          displayName: IDENTITY.legalDisplayName,
          status: "active",
        },
      ],
    };
    const result = buildPlan(state, INPUT, IDENTITY);
    expect(result.kind).toBe("plan");
    if (result.kind !== "plan") return;
    expect(stepById(result, "resolve_or_create_auth_user").action).toBe("create");
    expect(stepById(result, "ensure_active_membership").action).toBe("create");
    expect(stepById(result, "ensure_owner_role").action).toBe("create");
  });

  it("activates an invited membership and adds the missing owner role", () => {
    const state: ResolvedState = {
      ...EMPTY_STATE,
      tenant: { id: TENANT_ID, slug: IDENTITY.slug, displayName: IDENTITY.displayName, status: "active" },
      legalEntities: [
        {
          id: LEGAL_ENTITY_ID,
          tenantId: TENANT_ID,
          legalName: IDENTITY.legalName,
          displayName: IDENTITY.legalDisplayName,
          status: "active",
        },
      ],
      authUser: { id: USER_ID, email: INPUT.email },
      membershipForUser: {
        id: MEMBERSHIP_ID,
        tenantId: TENANT_ID,
        userId: USER_ID,
        status: "invited",
        roles: ["viewer"],
      },
    };
    const result = buildPlan(state, INPUT, IDENTITY);
    expect(result.kind).toBe("plan");
    if (result.kind !== "plan") return;
    expect(stepById(result, "ensure_active_membership").action).toBe("update");
    expect(stepById(result, "ensure_owner_role").action).toBe("create");
  });
});
