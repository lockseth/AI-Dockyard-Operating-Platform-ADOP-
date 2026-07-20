import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const approveExpenseSubmissionForActiveTenant = vi.fn();
const rejectExpenseSubmissionForActiveTenant = vi.fn();
const requestExpenseCorrectionForActiveTenant = vi.fn();
vi.mock("@/lib/expense-approvals/service", () => ({
  approveExpenseSubmissionForActiveTenant,
  rejectExpenseSubmissionForActiveTenant,
  requestExpenseCorrectionForActiveTenant,
}));

const resolveExpenseDuplicateCandidateForActiveTenant = vi.fn();
vi.mock("@/lib/expense-duplicate-detection/service", () => ({
  resolveExpenseDuplicateCandidateForActiveTenant,
}));

const approveCashReconciliationForActiveTenant = vi.fn();
const rejectCashReconciliationForActiveTenant = vi.fn();
const requestCashReconciliationCorrectionForActiveTenant = vi.fn();
const reopenCashPoolForActiveTenant = vi.fn();
vi.mock("@/lib/cash-reconciliation/service", () => ({
  approveCashReconciliationForActiveTenant,
  rejectCashReconciliationForActiveTenant,
  requestCashReconciliationCorrectionForActiveTenant,
  reopenCashPoolForActiveTenant,
}));

// Regression guard: source-level checks that the owner-control action layer
// never reads tenant/actor/status straight from client input, and never
// mutates a table directly — every mutation must flow through a
// *ForActiveTenant domain service (owner-only, re-checked server-side).
describe("owner-control actions source", () => {
  const source = readFileSync(path.resolve(__dirname, "actions.ts"), "utf8");

  it("never reads tenantId, actor, or status from client FormData", () => {
    expect(source).not.toMatch(/formData\.get\(\s*["']tenantId["']/);
    expect(source).not.toMatch(/formData\.get\(\s*["']actor["']/);
    expect(source).not.toMatch(/formData\.get\(\s*["']status["']/);
    expect(source).not.toMatch(/formData\.get\(\s*["']decidedBy["']/);
  });

  it("never queries a table directly or uses the service-role admin client", () => {
    expect(source).not.toMatch(/\.from\(/);
    expect(source).not.toMatch(/supabase\/admin/);
    expect(source).not.toMatch(/createSupabaseAdminClient/);
  });
});

describe("owner-control actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps UnauthorizedTenantRoleError to an Indonesian permission message and skips revalidation", async () => {
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    approveExpenseSubmissionForActiveTenant.mockRejectedValueOnce(new UnauthorizedTenantRoleError());

    const { approveExpenseSubmissionOwnerAction } = await import("./actions");
    const formData = new FormData();
    formData.set("submissionId", "sub-1");

    const result = await approveExpenseSubmissionOwnerAction({}, formData);

    expect(result).toEqual({ error: "Anda tidak memiliki izin untuk melakukan aksi ini." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates the owner control page after a successful approval", async () => {
    approveExpenseSubmissionForActiveTenant.mockResolvedValueOnce({ submission: { id: "sub-1" } });

    const { approveExpenseSubmissionOwnerAction } = await import("./actions");
    const formData = new FormData();
    formData.set("submissionId", "sub-1");

    const result = await approveExpenseSubmissionOwnerAction({}, formData);

    expect(result).toEqual({ submission: { id: "sub-1" } });
    expect(revalidatePath).toHaveBeenCalledWith("/owner/control");
  });

  it("forwards only submissionId and reason to rejectExpenseSubmissionForActiveTenant", async () => {
    rejectExpenseSubmissionForActiveTenant.mockResolvedValueOnce({ submission: { id: "sub-1" } });

    const { rejectExpenseSubmissionOwnerAction } = await import("./actions");
    const formData = new FormData();
    formData.set("submissionId", "sub-1");
    formData.set("reason", "Nota tidak sesuai");
    formData.set("decidedBy", "attacker-supplied-user");

    await rejectExpenseSubmissionOwnerAction({}, formData);

    expect(rejectExpenseSubmissionForActiveTenant).toHaveBeenCalledWith({
      submissionId: "sub-1",
      reason: "Nota tidak sesuai",
    });
  });

  it("forwards candidateId, resolution, and reason to resolveExpenseDuplicateCandidateForActiveTenant", async () => {
    resolveExpenseDuplicateCandidateForActiveTenant.mockResolvedValueOnce({ candidate: { id: "candidate-1" } });

    const { resolveExpenseDuplicateCandidateOwnerAction } = await import("./actions");
    const formData = new FormData();
    formData.set("candidateId", "candidate-1");
    formData.set("resolution", "not_duplicate");
    formData.set("reason", "Nomor referensi berbeda proyek");

    await resolveExpenseDuplicateCandidateOwnerAction({}, formData);

    expect(resolveExpenseDuplicateCandidateForActiveTenant).toHaveBeenCalledWith({
      candidateId: "candidate-1",
      resolution: "not_duplicate",
      reason: "Nomor referensi berbeda proyek",
    });
  });

  it("forwards only poolId and reason to reopenCashPoolForActiveTenant", async () => {
    reopenCashPoolForActiveTenant.mockResolvedValueOnce({ pool: { id: "pool-1" } });

    const { reopenCashPoolOwnerAction } = await import("./actions");
    const formData = new FormData();
    formData.set("poolId", "pool-1");
    formData.set("reason", "Kas fisik belum sesuai, perlu koreksi ulang");
    formData.set("tenantId", "attacker-supplied-tenant");

    await reopenCashPoolOwnerAction({}, formData);

    expect(reopenCashPoolForActiveTenant).toHaveBeenCalledWith({
      poolId: "pool-1",
      reason: "Kas fisik belum sesuai, perlu koreksi ulang",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/owner/control");
  });

  // Regression test mirroring the Gate 1H bug: a fieldErrors entry on a
  // hidden/server-derived field with no matching UI input must never be
  // silently dropped — it must surface a generic, safe message instead.
  it("surfaces a generic error when validation fails on a hidden/server-derived field", async () => {
    approveCashReconciliationForActiveTenant.mockResolvedValueOnce({
      fieldErrors: { reconciliationId: ["ID tidak valid."] },
    });

    const { approveCashReconciliationOwnerAction } = await import("./actions");
    const formData = new FormData();
    formData.set("reconciliationId", "not-a-uuid");

    const result = await approveCashReconciliationOwnerAction({}, formData);

    expect(result.error).toBeTruthy();
    expect(result.error).not.toMatch(/reconciliationId/i);
    expect(result.error).not.toBe("ID tidak valid.");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps per-field errors on genuinely user-editable fields without adding a generic error", async () => {
    requestCashReconciliationCorrectionForActiveTenant.mockResolvedValueOnce({
      fieldErrors: { reason: ["Alasan koreksi wajib diisi."] },
    });

    const { requestCashReconciliationCorrectionOwnerAction } = await import("./actions");
    const formData = new FormData();
    formData.set("reconciliationId", "recon-1");

    const result = await requestCashReconciliationCorrectionOwnerAction({}, formData);

    expect(result).toEqual({ fieldErrors: { reason: ["Alasan koreksi wajib diisi."] } });
    expect(result.error).toBeUndefined();
  });
});
