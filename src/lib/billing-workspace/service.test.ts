import { beforeEach, describe, expect, it, vi } from "vitest";

const requireTenantContext = vi.fn();
vi.mock("@/lib/auth/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/tenant")>();
  return { ...actual, requireTenantContext };
});

const listInvoices = vi.fn();
const listInvoiceTransactionLines = vi.fn();
const listUnbilledVesselProjects = vi.fn();
vi.mock("@/lib/invoice-evidence/repository", () => ({
  listInvoices,
  listInvoiceTransactionLines,
  listUnbilledVesselProjects,
}));

const listClients = vi.fn();
vi.mock("@/lib/master-data/clients/repository", () => ({ listClients }));

const listVessels = vi.fn();
vi.mock("@/lib/master-data/vessels/repository", () => ({ listVessels }));

const listVesselProjects = vi.fn();
const getVesselProjectById = vi.fn();
vi.mock("@/lib/vessel-projects/repository", () => ({ listVesselProjects, getVesselProjectById }));

const OWNER_CONTEXT = {
  userId: "owner-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  tenantDisplayName: "Tenant One",
  membershipId: "membership-owner",
  roles: ["owner"] as const,
  legalEntities: [],
};
const REVIEWER_CONTEXT = { ...OWNER_CONTEXT, roles: ["reviewer"] as const };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listBillingWorkspaceForActiveTenant", () => {
  it("rejects reviewer before ever calling any repository read", async () => {
    requireTenantContext.mockResolvedValue(REVIEWER_CONTEXT);
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    const { listBillingWorkspaceForActiveTenant } = await import("./service");

    await expect(listBillingWorkspaceForActiveTenant()).rejects.toThrow(UnauthorizedTenantRoleError);
    expect(listVesselProjects).not.toHaveBeenCalled();
  });

  it("composes projects/vessels/clients/invoices/unbilled into workspace rows for the active tenant", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    listVesselProjects.mockResolvedValue([
      { id: "project-1", vessel_id: "vessel-1", client_id: "client-1", lifecycle_status: "closed", closed_at: null, project_code: "PRJ-1" },
    ]);
    listVessels.mockResolvedValue([{ id: "vessel-1", vessel_name: "KM Uji" }]);
    listClients.mockResolvedValue([{ id: "client-1", display_name: "PT Uji" }]);
    listInvoices.mockResolvedValue([]);
    listUnbilledVesselProjects.mockResolvedValue([
      { project_id: "project-1", unbilled_transaction_count: 1, unbilled_amount_total: 100_000 },
    ]);
    const { listBillingWorkspaceForActiveTenant } = await import("./service");

    const rows = await listBillingWorkspaceForActiveTenant();

    expect(listVesselProjects).toHaveBeenCalledWith("tenant-1");
    expect(listUnbilledVesselProjects).toHaveBeenCalledWith("tenant-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("NO_INVOICE");
    expect(rows[0].isUnbilledAlert).toBe(true);
    expect(rows[0].vesselName).toBe("KM Uji");
    expect(rows[0].clientName).toBe("PT Uji");
  });
});

describe("getBillingRecordDetailForActiveTenant", () => {
  it("rejects reviewer before ever looking up the project", async () => {
    requireTenantContext.mockResolvedValue(REVIEWER_CONTEXT);
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    const { getBillingRecordDetailForActiveTenant } = await import("./service");

    await expect(getBillingRecordDetailForActiveTenant("project-1")).rejects.toThrow(UnauthorizedTenantRoleError);
    expect(getVesselProjectById).not.toHaveBeenCalled();
  });

  it("returns null when the project does not exist for this tenant", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    getVesselProjectById.mockResolvedValue(null);
    const { getBillingRecordDetailForActiveTenant } = await import("./service");

    const result = await getBillingRecordDetailForActiveTenant("missing-project");

    expect(result).toBeNull();
    expect(listInvoices).not.toHaveBeenCalled();
  });

  it("picks the single active (draft/issued) invoice for the project and loads its lines, ignoring void invoices", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    getVesselProjectById.mockResolvedValue({
      id: "project-1",
      vessel_id: "vessel-1",
      client_id: "client-1",
      lifecycle_status: "closed",
      start_date: "2026-01-01",
      closed_at: "2026-02-01T00:00:00Z",
    });
    listVessels.mockResolvedValue([{ id: "vessel-1", vessel_name: "KM Uji" }]);
    listClients.mockResolvedValue([{ id: "client-1", display_name: "PT Uji", legal_name: "PT Uji Legal", address: "Jl. Uji" }]);
    listInvoices.mockResolvedValue([
      { id: "invoice-void", project_id: "project-1", status: "void", void_at: "2026-02-02T00:00:00Z" },
      { id: "invoice-draft", project_id: "project-1", status: "draft", created_at: "2026-02-03T00:00:00Z" },
      { id: "invoice-other-project", project_id: "project-2", status: "draft" },
    ]);
    listInvoiceTransactionLines.mockResolvedValue([{ id: "line-1", amount: 100_000, description: "Biaya" }]);
    const { getBillingRecordDetailForActiveTenant } = await import("./service");

    const result = await getBillingRecordDetailForActiveTenant("project-1");

    expect(result?.activeInvoice?.id).toBe("invoice-draft");
    expect(result?.voidInvoices.map((i) => i.id)).toEqual(["invoice-void"]);
    expect(listInvoiceTransactionLines).toHaveBeenCalledWith("tenant-1", "invoice-draft");
    expect(result?.lines).toEqual([{ id: "line-1", amount: 100_000, description: "Biaya" }]);
    expect(result?.completeness.result).toBeDefined();
  });
});
