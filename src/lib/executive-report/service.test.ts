import { beforeEach, describe, expect, it, vi } from "vitest";

const requireTenantContext = vi.fn();
vi.mock("@/lib/auth/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/tenant")>();
  return { ...actual, requireTenantContext };
});

const listBillingWorkspaceForActiveTenant = vi.fn();
vi.mock("@/lib/billing-workspace/service", () => ({ listBillingWorkspaceForActiveTenant }));

const getLatestInvoiceDeliveryEventForActiveTenant = vi.fn();
vi.mock("@/lib/invoice-delivery/service", () => ({ getLatestInvoiceDeliveryEventForActiveTenant }));

const listVesselsForActiveTenant = vi.fn();
vi.mock("@/lib/master-data/vessels/service", () => ({ listVesselsForActiveTenant }));

const listVesselProjectsForActiveTenant = vi.fn();
const listVesselProjectCostSummaryForActiveTenant = vi.fn();
vi.mock("@/lib/vessel-projects/service", () => ({
  listVesselProjectsForActiveTenant,
  listVesselProjectCostSummaryForActiveTenant,
}));

const OWNER_CONTEXT = {
  userId: "owner-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  tenantDisplayName: "Tenant One",
  membershipId: "membership-owner",
  roles: ["owner"] as const,
  legalEntities: [],
};
const ADMIN_CONTEXT = { ...OWNER_CONTEXT, roles: ["admin"] as const };
const REVIEWER_CONTEXT = { ...OWNER_CONTEXT, roles: ["reviewer"] as const };
const VIEWER_CONTEXT = { ...OWNER_CONTEXT, roles: ["viewer"] as const };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getExecutiveReportForActiveTenant", () => {
  it("rejects reviewer before calling any canonical read (own-tenant or otherwise)", async () => {
    requireTenantContext.mockResolvedValue(REVIEWER_CONTEXT);
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    const { getExecutiveReportForActiveTenant } = await import("./service");

    await expect(getExecutiveReportForActiveTenant()).rejects.toThrow(UnauthorizedTenantRoleError);
    expect(listBillingWorkspaceForActiveTenant).not.toHaveBeenCalled();
    expect(listVesselProjectsForActiveTenant).not.toHaveBeenCalled();
    expect(listVesselsForActiveTenant).not.toHaveBeenCalled();
    expect(listVesselProjectCostSummaryForActiveTenant).not.toHaveBeenCalled();
  });

  it("rejects viewer the same way", async () => {
    requireTenantContext.mockResolvedValue(VIEWER_CONTEXT);
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    const { getExecutiveReportForActiveTenant } = await import("./service");

    await expect(getExecutiveReportForActiveTenant()).rejects.toThrow(UnauthorizedTenantRoleError);
  });

  it("allows owner and composes canonical *ForActiveTenant reads — no tenantId is threaded manually, each read resolves it from the active tenant context", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    listVesselProjectsForActiveTenant.mockResolvedValue([
      { id: "project-1", vessel_id: "vessel-1", lifecycle_status: "active", project_code: "PRJ-1" },
    ]);
    listVesselsForActiveTenant.mockResolvedValue([{ id: "vessel-1", vessel_name: "KM Uji" }]);
    listVesselProjectCostSummaryForActiveTenant.mockResolvedValue([{ project_id: "project-1", total_cost: 1_000_000 }]);
    listBillingWorkspaceForActiveTenant.mockResolvedValue([
      {
        projectId: "project-1",
        vesselName: "KM Uji",
        projectCode: "PRJ-1",
        status: "READY_TO_SEND",
        activeInvoice: { id: "invoice-1", status: "issued", total_amount: 2_000_000 },
        isUnbilledAlert: false,
        unbilledAmountTotal: 0,
      },
    ]);
    getLatestInvoiceDeliveryEventForActiveTenant.mockResolvedValue({ event_type: "acknowledged", event_seq: 5 });
    const { getExecutiveReportForActiveTenant } = await import("./service");

    const summary = await getExecutiveReportForActiveTenant();

    expect(listVesselProjectsForActiveTenant).toHaveBeenCalledWith();
    expect(listVesselsForActiveTenant).toHaveBeenCalledWith();
    expect(listVesselProjectCostSummaryForActiveTenant).toHaveBeenCalledWith();
    expect(listBillingWorkspaceForActiveTenant).toHaveBeenCalledWith();
    expect(summary.activeProjectCount).toBe(1);
    expect(summary.costRunningTotal).toBe(1_000_000);
    expect(summary.issuedInvoices).toEqual({ count: 1, valueTotal: 2_000_000 });
    expect(summary.attentionTotalCount).toBe(0);
  });

  it("allows admin", async () => {
    requireTenantContext.mockResolvedValue(ADMIN_CONTEXT);
    listVesselProjectsForActiveTenant.mockResolvedValue([]);
    listVesselsForActiveTenant.mockResolvedValue([]);
    listVesselProjectCostSummaryForActiveTenant.mockResolvedValue([]);
    listBillingWorkspaceForActiveTenant.mockResolvedValue([]);
    const { getExecutiveReportForActiveTenant } = await import("./service");

    await expect(getExecutiveReportForActiveTenant()).resolves.toBeDefined();
  });

  it("only looks up the latest delivery event for issued invoices — never for draft/unbilled projects with no active invoice", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    listVesselProjectsForActiveTenant.mockResolvedValue([]);
    listVesselsForActiveTenant.mockResolvedValue([]);
    listVesselProjectCostSummaryForActiveTenant.mockResolvedValue([]);
    listBillingWorkspaceForActiveTenant.mockResolvedValue([
      { projectId: "p1", vesselName: "KM A", projectCode: null, status: "NO_INVOICE", activeInvoice: null, isUnbilledAlert: true, unbilledAmountTotal: 100_000 },
      {
        projectId: "p2",
        vesselName: "KM B",
        projectCode: null,
        status: "DRAFT_INCOMPLETE",
        activeInvoice: { id: "invoice-draft", status: "draft", total_amount: 50_000 },
        isUnbilledAlert: false,
        unbilledAmountTotal: 0,
      },
      {
        projectId: "p3",
        vesselName: "KM C",
        projectCode: null,
        status: "READY_TO_SEND",
        activeInvoice: { id: "invoice-issued", status: "issued", total_amount: 250_000 },
        isUnbilledAlert: false,
        unbilledAmountTotal: 0,
      },
    ]);
    getLatestInvoiceDeliveryEventForActiveTenant.mockResolvedValue(null);
    const { getExecutiveReportForActiveTenant } = await import("./service");

    await getExecutiveReportForActiveTenant();

    expect(getLatestInvoiceDeliveryEventForActiveTenant).toHaveBeenCalledTimes(1);
    expect(getLatestInvoiceDeliveryEventForActiveTenant).toHaveBeenCalledWith({ invoiceId: "invoice-issued" });
  });
});
