import { requireTenantContext } from "@/lib/auth/tenant";
import { AppShell } from "@/components/shell/AppShell";
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
import { listTrustedTransactionsForActiveTenant } from "@/lib/transaction-history/service";
import { listVesselProjectsForActiveTenant } from "@/lib/vessel-projects/service";
import { listVesselsForActiveTenant } from "@/lib/master-data/vessels/service";
import { listExpenseCategoriesForActiveTenant } from "@/lib/master-data/expense-categories/service";
import { listVendorsForActiveTenant } from "@/lib/master-data/vendors/service";
import { listFacilityLocationsForActiveTenant } from "@/lib/master-data/facility-locations/service";
import { AccessDenied } from "./AccessDenied";
import { OpenCashSection } from "./OpenCashSection";
import { DailyOperationsBody } from "./DailyOperationsBody";
import { SubmissionStatusSection } from "./SubmissionStatusSection";
import { EodCloseSection } from "./EodCloseSection";

const REASON_REQUIRED_STATUSES = ["needs_correction", "rejected"] as const;

export default async function DailyOperationsPage() {
  const context = await requireTenantContext();

  if (!canAccessDailyOperations(context.roles)) {
    return (
      <AppShell title="Operasional Harian Admin" sectionLabel="Operasional">
        <AccessDenied />
      </AppShell>
    );
  }

  const businessDate = getJakartaBusinessDate(new Date());
  const pool = await getDailyCashPoolForActiveTenant(businessDate);

  const [
    summary,
    projects,
    vessels,
    categories,
    vendors,
    facilityLocations,
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
    listFacilityLocationsForActiveTenant(),
    listExpenseSubmissionsForActiveTenant(),
    listPendingExpenseDuplicateCandidatesForActiveTenant(),
    pool ? getCashPoolReconciliationForActiveTenant(pool.id) : Promise.resolve(null),
    pool ? getUnresolvedExpenseCountForActiveTenant(pool.id) : Promise.resolve(0),
  ]);

  // Reuses the exact same trusted-ledger read Riwayat Transaksi uses,
  // narrowed to today — no new aggregation or query shape.
  const todayTransactionPage = pool
    ? await listTrustedTransactionsForActiveTenant({ dateFrom: businessDate, dateTo: businessDate, limit: 200 })
    : null;
  const todayTransactions = todayTransactionPage?.transactions ?? [];
  const largestExpense = todayTransactions
    .filter((row) => row.transaction_type === "project_expense" && (row.signed_cash_effect ?? 0) < 0)
    .reduce<{ label: string; amount: number } | null>((largest, row) => {
      const amount = Math.abs(row.signed_cash_effect ?? 0);
      if (largest && largest.amount >= amount) return largest;
      return { label: row.vessel_name ?? row.project_code ?? "Project tidak dikenal", amount };
    }, null);

  const submissions = pool ? allSubmissions.filter((submission) => submission.pool_id === pool.id) : [];
  const pendingReviewCount = submissions.filter((submission) => submission.status === "submitted").length;
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
  const facilityOptions = facilityLocations
    .filter((facility) => facility.status === "active")
    .map((facility) => ({ value: facility.id, label: facility.name }));

  const canSubmitExpense = isCashPoolOpenForMutation(pool);

  return (
    <AppShell
      title="Operasional Harian Admin"
      sectionLabel="Operasional"
      operationalDateLabel={formatBusinessDateLabel(businessDate)}
      showMobileTitle={false}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col px-6 py-10">
        <main className="flex flex-1 flex-col gap-8 pb-16">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Operasional Harian Admin</h1>
            <p className="mt-1 text-sm font-medium text-neutral-600 dark:text-neutral-300">
              {formatBusinessDateLabel(businessDate)}
            </p>
          </div>

          {!pool ? (
            <OpenCashSection businessDate={businessDate} pool={pool} summary={summary} />
          ) : (
            <DailyOperationsBody
              pool={pool}
              summary={summary}
              mutationOpen={canSubmitExpense}
              todayTransactions={todayTransactions}
              pendingReviewCount={pendingReviewCount}
              duplicateCandidateCount={duplicateCandidates.length}
              largestExpense={largestExpense}
              projectOptions={projectOptions}
              categoryOptions={categoryOptions}
              vendorOptions={vendorOptions}
              facilityOptions={facilityOptions}
            />
          )}

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
            facilityOptions={facilityOptions}
          />

          <EodCloseSection
            pool={pool}
            summary={summary}
            reconciliation={reconciliation}
            unresolvedExpenseCount={unresolvedExpenseCount}
          />
        </main>
      </div>
    </AppShell>
  );
}
