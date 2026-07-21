import { notFound, redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/auth/tenant";
import { canAccessOwnerControl } from "@/lib/owner-control/access";
import { getCashImportBatchDetailForActiveTenant } from "@/lib/cash-import-staging/service";

// The only page the Gate 1L WhatsApp review link points to. It renders
// nothing itself — it is purely an owner-only, tenant-safe gate that
// redirects into the EXISTING approve flow (/operations/import/[batchId],
// Gate 1J-C's OwnerApprovalControl). No new approval UI is built here.
//
// requireTenantContext() redirects an unauthenticated visitor to /login
// (still requires login, per LOCK). canAccessOwnerControl() re-checks the
// Owner role server-side — an authenticated non-owner (e.g. Admin) gets
// notFound(), never an access-denied page that would confirm the batch
// exists. getCashImportBatchDetailForActiveTenant() is already tenant-
// scoped (requireTenantContext inside it) — a batch belonging to another
// tenant returns null, so a cross-tenant owner also gets notFound(). Either
// way the response is indistinguishable from "this id does not exist".
export default async function OwnerCashImportReviewGatePage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const context = await requireTenantContext();
  if (!canAccessOwnerControl(context.roles)) {
    notFound();
  }

  const { batchId } = await params;
  const detail = await getCashImportBatchDetailForActiveTenant({ batchId });
  if (!detail) {
    notFound();
  }

  redirect(`/operations/import/${batchId}`);
}
