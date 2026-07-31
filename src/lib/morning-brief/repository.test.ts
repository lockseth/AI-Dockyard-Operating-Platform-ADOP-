import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const eqTenants = vi.fn(() => ({ maybeSingle }));
const selectTenants = vi.fn(() => ({ eq: eqTenants }));

const tableQueries = new Map<string, { data: unknown[] | null; error: unknown }>();
function makeTableQuery(table: string) {
  return {
    select: () => ({
      eq: () => Promise.resolve(tableQueries.get(table) ?? { data: [], error: null }),
    }),
  };
}

const from = vi.fn((table: string) => {
  if (table === "tenants") {
    return { select: selectTenants };
  }
  return makeTableQuery(table);
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from }),
}));

describe("resolvePilotTenant", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    maybeSingle.mockReset();
  });

  it("returns null when MORNING_BRIEF_PILOT_TENANT_SLUG is unconfigured — fails closed, never queries", async () => {
    vi.stubEnv("MORNING_BRIEF_PILOT_TENANT_SLUG", "");
    const { resolvePilotTenant } = await import("./repository");

    await expect(resolvePilotTenant()).resolves.toBeNull();
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it("returns null when the slug matches no tenant", async () => {
    vi.stubEnv("MORNING_BRIEF_PILOT_TENANT_SLUG", "gema-bahari");
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { resolvePilotTenant } = await import("./repository");

    await expect(resolvePilotTenant()).resolves.toBeNull();
  });

  it("returns null when the tenant is suspended, not active", async () => {
    vi.stubEnv("MORNING_BRIEF_PILOT_TENANT_SLUG", "gema-bahari");
    maybeSingle.mockResolvedValue({ data: { id: "tenant-1", status: "suspended" }, error: null });
    const { resolvePilotTenant } = await import("./repository");

    await expect(resolvePilotTenant()).resolves.toBeNull();
  });

  it("resolves the tenant id when the slug matches an active tenant", async () => {
    vi.stubEnv("MORNING_BRIEF_PILOT_TENANT_SLUG", "gema-bahari");
    maybeSingle.mockResolvedValue({ data: { id: "tenant-1", status: "active" }, error: null });
    const { resolvePilotTenant } = await import("./repository");

    await expect(resolvePilotTenant()).resolves.toEqual({ tenantId: "tenant-1" });
  });

  it("throws on a query error rather than silently resolving null", async () => {
    vi.stubEnv("MORNING_BRIEF_PILOT_TENANT_SLUG", "gema-bahari");
    maybeSingle.mockResolvedValue({ data: null, error: new Error("db unavailable") });
    const { resolvePilotTenant } = await import("./repository");

    await expect(resolvePilotTenant()).rejects.toThrow("db unavailable");
  });
});

describe("getMorningBriefSourceRows", () => {
  beforeEach(() => {
    vi.resetModules();
    tableQueries.clear();
  });

  it("returns an empty array per source when no rows exist for the tenant", async () => {
    const { getMorningBriefSourceRows } = await import("./repository");

    await expect(getMorningBriefSourceRows("tenant-1")).resolves.toEqual({
      projects: [],
      vessels: [],
      costSummaries: [],
      clients: [],
      invoices: [],
      unbilled: [],
      deliveryEvents: [],
    });
  });

  it("throws if any one of the parallel reads errors", async () => {
    tableQueries.set("vessels", { data: null, error: new Error("vessels read failed") });
    const { getMorningBriefSourceRows } = await import("./repository");

    await expect(getMorningBriefSourceRows("tenant-1")).rejects.toThrow("vessels read failed");
  });
});
