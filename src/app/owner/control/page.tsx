import { requireTenantContext } from "@/lib/auth/tenant";
import { AppShell } from "@/components/shell/AppShell";
import { canAccessOwnerControl } from "@/lib/owner-control/access";
import { canApproveCashImportStaging } from "@/lib/cash-import-staging/access";
import { listCashImportBatchesForActiveTenant } from "@/lib/cash-import-staging/service";
import { formatBusinessDateLabel, getJakartaBusinessDate } from "@/lib/operations-daily/format";
import { buildVesselProjectLabelMap } from "@/lib/operations-daily/view-model";
import {
  buildActiveProjectCostRows,
  buildCashPoolBusinessDateMap,
  buildOwnerControlSummary,
  getExpenseSubmissionsPendingReview,
  getLatestReconciliationIdsByPool,
} from "@/lib/owner-control/view-model";
import {
  getDailyCashPoolForActiveTenant,
  getDailyCashPoolSummaryForActiveTenant,
  listCashPoolsForActiveTenant,
} from "@/lib/cash-pool/service";
import {
  getCashPoolReconciliationForActiveTenant,
  getUnresolvedExpenseCountForActiveTenant,
  listCashPoolReconciliationsForActiveTenant,
} from "@/lib/cash-reconciliation/service";
import {
  listExpenseSubmissionRevisionsForActiveTenant,
  listExpenseSubmissionsForActiveTenant,
} from "@/lib/expense-approvals/service";
import {
  listExpenseDuplicateCandidatesForSubmissionForActiveTenant,
  listPendingExpenseDuplicateCandidatesForActiveTenant,
} from "@/lib/expense-duplicate-detection/service";
import { listVesselProjectCostSummaryForActiveTenant, listVesselProjectsForActiveTenant } from "@/lib/vessel-projects/service";
import { listVesselsForActiveTenant } from "@/lib/master-data/vessels/service";
import { listExpenseCategoriesForActiveTenant } from "@/lib/master-data/expense-categories/service";
import { listVendorsForActiveTenant } from "@/lib/master-data/vendors/service";
import { AccessDenied } from "./AccessDenied";
import { CashImportApprovalSection } from "./CashImportApprovalSection";
import { OwnerSummarySection } from "./OwnerSummarySection";
import { ExpenseReviewSection, type ExpenseReviewItem } from "./ExpenseReviewSection";
import { DuplicateReviewSection, type DuplicateReviewItem } from "./DuplicateReviewSection";
import { EodReviewSection, type EodReviewItem } from "./EodReviewSection";

export default async function OwnerControlPage() {
  const context = await requireTenantContext();

  if (!canAccessOwnerControl(context.roles)) {
    return (
      <AppShell title="Owner Control">
        <AccessDenied />
      </AppShell>
    );
  }

  const businessDate = getJakartaBusinessDate(new Date());
  const pool = await getDailyCashPoolForActiveTenant(businessDate);

  const [
    summary,
    todayReconciliation,
    allSubmissions,
    pendingDuplicates,
    allReconciliations,
    allPools,
    projects,
    vessels,
    categories,
    vendors,
    costSummaries,
    cashImportBatches,
  ] = await Promise.all([
    pool ? getDailyCashPoolSummaryForActiveTenant(businessDate) : Promise.resolve(null),
    pool ? getCashPoolReconciliationForActiveTenant(pool.id) : Promise.resolve(null),
    listExpenseSubmissionsForActiveTenant(),
    listPendingExpenseDuplicateCandidatesForActiveTenant(),
    listCashPoolReconciliationsForActiveTenant(),
    listCashPoolsForActiveTenant(),
    listVesselProjectsForActiveTenant(),
    listVesselsForActiveTenant(),
    listExpenseCategoriesForActiveTenant(),
    listVendorsForActiveTenant(),
    listVesselProjectCostSummaryForActiveTenant(),
    canApproveCashImportStaging(context.roles) ? listCashImportBatchesForActiveTenant() : Promise.resolve([]),
  ]);

  const businessDateByPoolId = buildCashPoolBusinessDateMap(allPools);
  const projectLabelById = buildVesselProjectLabelMap(projects, vessels);
  const categoryLabelById = new Map(categories.map((category) => [category.id, category.name]));
  const vendorLabelById = new Map(vendors.map((vendor) => [vendor.id, vendor.display_name]));
  const submissionsById = new Map(allSubmissions.map((submission) => [submission.submission_id, submission]));

  // --- 2. Expense review queue -------------------------------------------
  const pendingReviewSubmissions = getExpenseSubmissionsPendingReview(allSubmissions);
  const expenseReviewItems: ExpenseReviewItem[] = await Promise.all(
    pendingReviewSubmissions.map(async (submission) => {
      const submissionId = submission.submission_id ?? "";
      const [revisionHistory, duplicateCandidates] = await Promise.all([
        listExpenseSubmissionRevisionsForActiveTenant(submissionId),
        listExpenseDuplicateCandidatesForSubmissionForActiveTenant({ submissionId }),
      ]);
      return {
        submission,
        businessDate: submission.pool_id ? (businessDateByPoolId.get(submission.pool_id) ?? null) : null,
        projectLabel: submission.project_id ? (projectLabelById.get(submission.project_id) ?? "-") : "-",
        categoryLabel: submission.category_id ? (categoryLabelById.get(submission.category_id) ?? "-") : "-",
        vendorLabel: submission.vendor_id ? (vendorLabelById.get(submission.vendor_id) ?? null) : null,
        revisionHistory,
        duplicateCandidates,
      };
    }),
  );

  // --- 3. Duplicate review -------------------------------------------------
  const duplicateReviewItems: DuplicateReviewItem[] = pendingDuplicates.map((candidate) => {
    const pool1 = candidate.submission_id_1 ? submissionsById.get(candidate.submission_id_1)?.pool_id : null;
    const pool2 = candidate.submission_id_2 ? submissionsById.get(candidate.submission_id_2)?.pool_id : null;
    return {
      candidate,
      businessDate1: pool1 ? (businessDateByPoolId.get(pool1) ?? null) : null,
      businessDate2: pool2 ? (businessDateByPoolId.get(pool2) ?? null) : null,
      projectLabel1: candidate.project_id_1 ? (projectLabelById.get(candidate.project_id_1) ?? "-") : "-",
      projectLabel2: candidate.project_id_2 ? (projectLabelById.get(candidate.project_id_2) ?? "-") : "-",
      categoryLabel1: candidate.category_id_1 ? (categoryLabelById.get(candidate.category_id_1) ?? "-") : "-",
      categoryLabel2: candidate.category_id_2 ? (categoryLabelById.get(candidate.category_id_2) ?? "-") : "-",
      vendorLabel1: candidate.vendor_id_1 ? (vendorLabelById.get(candidate.vendor_id_1) ?? null) : null,
      vendorLabel2: candidate.vendor_id_2 ? (vendorLabelById.get(candidate.vendor_id_2) ?? null) : null,
    };
  });

  // --- 4. EOD reconciliation review ----------------------------------------
  const latestReconciliationIds = getLatestReconciliationIdsByPool(allReconciliations);
  const eodReviewItems: EodReviewItem[] = await Promise.all(
    allReconciliations.map(async (reconciliation) => {
      const isLatestForPool = reconciliation.reconciliation_id
        ? latestReconciliationIds.has(reconciliation.reconciliation_id)
        : false;
      const needsUnresolvedCount = isLatestForPool && reconciliation.status === "submitted" && !!reconciliation.pool_id;
      const unresolvedExpenseCount = needsUnresolvedCount
        ? await getUnresolvedExpenseCountForActiveTenant(reconciliation.pool_id as string)
        : 0;
      return { reconciliation, isLatestForPool, unresolvedExpenseCount };
    }),
  );

  // --- 1. Summary -----------------------------------------------------------
  const activeProjectCostRows = buildActiveProjectCostRows(projects, vessels, costSummaries);
  const ownerSummary = buildOwnerControlSummary({
    summary,
    pool,
    expensesPendingReviewCount: pendingReviewSubmissions.length,
    duplicateCandidatesPendingCount: pendingDuplicates.length,
    todayReconciliation,
    activeProjectCount: activeProjectCostRows.length,
  });

  return (
    <AppShell title="Owner Control" operationalDateLabel={formatBusinessDateLabel(businessDate)}>
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-10">
      <main className="flex flex-1 flex-col gap-6 pb-16">
        <OwnerSummarySection summary={ownerSummary} activeProjectCostRows={activeProjectCostRows} />
        <CashImportApprovalSection batches={cashImportBatches} />
        <ExpenseReviewSection items={expenseReviewItems} />
        <DuplicateReviewSection items={duplicateReviewItems} />
        <EodReviewSection items={eodReviewItems} />
      </main>
    </div>
    </AppShell>
  );
}
