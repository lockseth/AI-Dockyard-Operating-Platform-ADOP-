import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import { requireTenantContext } from "@/lib/auth/tenant";
import { branding } from "@/lib/branding";
import { canAccessDailyOperations } from "@/lib/operations-daily/access";
import { formatBusinessDateLabel, getJakartaBusinessDate } from "@/lib/operations-daily/format";
import {
  buildActiveVesselProjectOptions,
  buildVesselProjectLabelMap,
  getLatestReasonForStatus,
  getSubmissionIdsWithPendingDuplicates,
  isCashPoolOpenForMutation,
} from "@/lib/operations-daily/view-model";
import {
  getDailyCashPoolForActiveTenant,
  getDailyCashPoolSummaryForActiveTenant,
} from "@/lib/cash-pool/service";
import {
  getCashPoolReconciliationForActiveTenant,
  getUnresolvedExpenseCountForActiveTenant,
} from "@/lib/cash-reconciliation/service";
import {
  listExpenseSubmissionsForActiveTenant,
  listExpenseSubmissionStatusEventsForActiveTenant,
} from "@/lib/expense-approvals/service";
import { listPendingExpenseDuplicateCandidatesForActiveTenant } from "@/lib/expense-duplicate-detection/service";
import { listVesselProjectsForActiveTenant } from "@/lib/vessel-projects/service";
import { listVesselsForActiveTenant } from "@/lib/master-data/vessels/service";
import { listExpenseCategoriesForActiveTenant } from "@/lib/master-data/expense-categories/service";
import { listVendorsForActiveTenant } from "@/lib/master-data/vendors/service";
import { AccessDenied } from "./AccessDenied";
import { OpenCashSection } from "./OpenCashSection";
import { ExpenseFormSection } from "./ExpenseFormSection";
import { SubmissionStatusSection } from "./SubmissionStatusSection";
import { EodCloseSection } from "./EodCloseSection";

const REASON_REQUIRED_STATUSES = ["needs_correction", "rejected"] as const;

export default async function DailyOperationsPage() {
  const context = await requireTenantContext();

  if (!canAccessDailyOperations(context.roles)) {
    return <AccessDenied />;
  }

  const businessDate = getJakartaBusinessDate(new Date());
  const pool = await getDailyCashPoolForActiveTenant(businessDate);

  const [
    summary,
    projects,
    vessels,
    categories,
    vendors,
    allSubmissions,
    duplicateCandidates,
    reconciliation,
    unresolvedExpenseCount,
  ] = await Promise.all([
    pool ? getDailyCashPoolSummaryForActiveTenant(businessDate) : Promise.resolve(null),
    listVesselProjectsForActiveTenant(),
    listVesselsForActiveTenant(),
    listExpenseCategoriesForActiveTenant(),
    listVendorsForActiveTenant(),
    listExpenseSubmissionsForActiveTenant(),
    listPendingExpenseDuplicateCandidatesForActiveTenant(),
    pool ? getCashPoolReconciliationForActiveTenant(pool.id) : Promise.resolve(null),
    pool ? getUnresolvedExpenseCountForActiveTenant(pool.id) : Promise.resolve(0),
  ]);

  const submissions = pool ? allSubmissions.filter((submission) => submission.pool_id === pool.id) : [];
  const duplicateSubmissionIds = getSubmissionIdsWithPendingDuplicates(duplicateCandidates);

  const reasonEntries = await Promise.all(
    submissions
      .filter((submission) =>
        REASON_REQUIRED_STATUSES.includes(submission.status as (typeof REASON_REQUIRED_STATUSES)[number]),
      )
      .map(async (submission) => {
        const events = await listExpenseSubmissionStatusEventsForActiveTenant(submission.submission_id ?? "");
        return [submission.submission_id ?? "", getLatestReasonForStatus(events, submission.status!)] as const;
      }),
  );
  const decisionReasonBySubmissionId = new Map(reasonEntries);

  const projectOptions = buildActiveVesselProjectOptions(projects, vessels);
  const projectLabelById = buildVesselProjectLabelMap(projects, vessels);
  const categoryLabelById = new Map(categories.map((category) => [category.id, category.name]));
  const vendorLabelById = new Map(vendors.map((vendor) => [vendor.id, vendor.display_name]));
  const categoryOptions = categories
    .filter((category) => category.status === "active")
    .map((category) => ({ value: category.id, label: category.name }));
  const vendorOptions = vendors
    .filter((vendor) => vendor.status === "active")
    .map((vendor) => ({ value: vendor.id, label: vendor.display_name }));

  const canSubmitExpense = isCashPoolOpenForMutation(pool);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-6 dark:border-neutral-800">
        <div>
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            {branding.productName} {branding.brandedBy}
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Operasional Harian Admin</h1>
          <p className="text-sm text-neutral-500">{formatBusinessDateLabel(businessDate)}</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-right">
            <div className="font-medium">{context.tenantDisplayName}</div>
            <div className="text-xs text-neutral-500">{context.roles.join(", ") || "-"}</div>
          </div>
          <Link
            href="/app"
            className="text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Workspace
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              Keluar
            </button>
          </form>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 pb-16">
        <OpenCashSection businessDate={businessDate} pool={pool} summary={summary} />

        <ExpenseFormSection
          poolId={pool?.id ?? null}
          projectOptions={projectOptions}
          categoryOptions={categoryOptions}
          vendorOptions={vendorOptions}
        />

        <SubmissionStatusSection
          submissions={submissions}
          duplicateSubmissionIds={duplicateSubmissionIds}
          decisionReasonBySubmissionId={decisionReasonBySubmissionId}
          projectLabelById={projectLabelById}
          categoryLabelById={categoryLabelById}
          vendorLabelById={vendorLabelById}
          canSubmit={canSubmitExpense}
          projectOptions={projectOptions}
          categoryOptions={categoryOptions}
          vendorOptions={vendorOptions}
        />

        <EodCloseSection
          pool={pool}
          summary={summary}
          reconciliation={reconciliation}
          unresolvedExpenseCount={unresolvedExpenseCount}
        />
      </main>
    </div>
  );
}
