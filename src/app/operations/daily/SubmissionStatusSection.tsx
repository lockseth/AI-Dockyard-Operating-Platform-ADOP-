import { ExpenseSubmissionRow } from "./ExpenseSubmissionRow";
import type { ExpenseSubmissionCurrentRow } from "@/lib/expense-approvals/repository";
import type { VesselProjectOption } from "@/lib/operations-daily/view-model";

export function SubmissionStatusSection({
  submissions,
  duplicateSubmissionIds,
  decisionReasonBySubmissionId,
  projectLabelById,
  categoryLabelById,
  vendorLabelById,
  canSubmit,
  projectOptions,
  categoryOptions,
  vendorOptions,
}: {
  submissions: ExpenseSubmissionCurrentRow[];
  duplicateSubmissionIds: Set<string>;
  decisionReasonBySubmissionId: Map<string, string | null>;
  projectLabelById: Map<string, string>;
  categoryLabelById: Map<string, string>;
  vendorLabelById: Map<string, string>;
  canSubmit: boolean;
  projectOptions: VesselProjectOption[];
  categoryOptions: VesselProjectOption[];
  vendorOptions: VesselProjectOption[];
}) {
  return (
    <section id="status-pengajuan" className="rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
      <h2 className="text-lg font-semibold tracking-tight">3. Status Pengajuan</h2>

      {submissions.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">Belum ada pengajuan biaya hari ini.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {submissions.map((submission) => {
            const id = submission.submission_id ?? "";
            return (
              <ExpenseSubmissionRow
                key={id}
                submission={submission}
                hasPendingDuplicate={duplicateSubmissionIds.has(id)}
                decisionReason={decisionReasonBySubmissionId.get(id) ?? null}
                projectLabel={projectLabelById.get(submission.project_id ?? "") ?? "Project tidak dikenal"}
                categoryLabel={categoryLabelById.get(submission.category_id ?? "") ?? "Kategori tidak dikenal"}
                vendorLabel={submission.vendor_id ? (vendorLabelById.get(submission.vendor_id) ?? null) : null}
                canSubmit={canSubmit}
                projectOptions={projectOptions}
                categoryOptions={categoryOptions}
                vendorOptions={vendorOptions}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
