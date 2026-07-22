"use client";

import { useActionState, useState } from "react";
import {
  cancelExpenseSubmissionAction,
  reviseExpenseDraftAction,
  submitExpenseAction,
} from "@/lib/operations-daily/actions";
import { formatRupiah } from "@/lib/operations-daily/format";
import { getExpenseSubmissionStatusLabel } from "@/lib/operations-daily/labels";
import { FieldError, FormError } from "@/components/master-data/FormError";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { inputClassName } from "@/components/master-data/fields";
import { ExpenseFormFields } from "./ExpenseFormFields";
import type { Tone } from "@/components/ui/tone";
import type { ExpenseSubmissionCurrentRow } from "@/lib/expense-approvals/repository";
import type { ExpenseSubmissionActionResult } from "@/lib/expense-approvals/service";
import type { VesselProjectOption } from "@/lib/operations-daily/view-model";

const initialReviseState: ExpenseSubmissionActionResult = {};
const initialSubmitState: ExpenseSubmissionActionResult = {};
const initialCancelState: ExpenseSubmissionActionResult = {};

const STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  submitted: "warning",
  needs_correction: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};

export function ExpenseSubmissionRow({
  submission,
  hasPendingDuplicate,
  decisionReason,
  projectLabel,
  categoryLabel,
  vendorLabel,
  canSubmit,
  projectOptions,
  categoryOptions,
  vendorOptions,
  facilityOptions,
}: {
  submission: ExpenseSubmissionCurrentRow;
  hasPendingDuplicate: boolean;
  decisionReason: string | null;
  projectLabel: string;
  categoryLabel: string;
  vendorLabel: string | null;
  canSubmit: boolean;
  projectOptions: VesselProjectOption[];
  categoryOptions: VesselProjectOption[];
  vendorOptions: VesselProjectOption[];
  facilityOptions: VesselProjectOption[];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const [reviseState, reviseFormAction, isRevising] = useActionState(reviseExpenseDraftAction, initialReviseState);
  const [submitState, submitFormAction, isSubmitting] = useActionState(submitExpenseAction, initialSubmitState);
  const [cancelState, cancelFormAction, isCancellingRequest] = useActionState(
    cancelExpenseSubmissionAction,
    initialCancelState,
  );

  const status = submission.status;
  const canMutate = status === "draft" || status === "needs_correction";
  const submissionId = submission.submission_id ?? "";
  const poolId = submission.pool_id ?? "";

  return (
    <li className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{projectLabel}</p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {categoryLabel}
            {vendorLabel ? ` — ${vendorLabel}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="font-medium">{formatRupiah(submission.amount)}</p>
          <Badge tone={STATUS_TONE[status ?? "draft"] ?? "neutral"} dot className="mt-1">
            {getExpenseSubmissionStatusLabel(status ?? "draft")} · Revisi {submission.revision_number}
          </Badge>
        </div>
      </div>

      {submission.description ? <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{submission.description}</p> : null}

      <p className="mt-2 text-xs text-neutral-400">
        Waktu submit: {status === "draft" ? "-" : formatTimestamp(submission.updated_at)}
      </p>

      {hasPendingDuplicate ? (
        <p role="alert" className="mt-2 text-sm font-medium text-amber-600 dark:text-amber-400">
          Perlu pemeriksaan duplikasi oleh Pak Hanafi
        </p>
      ) : null}

      {decisionReason ? (
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          <span className="font-medium">Catatan Pak Hanafi:</span> {decisionReason}
        </p>
      ) : null}

      {canMutate ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setIsEditing((prev) => !prev)}>
            {isEditing ? "Batal Edit" : "Edit"}
          </Button>

          <form
            action={submitFormAction}
            onSubmit={(event) => {
              if (!window.confirm("Kirim pengajuan biaya ini untuk direview Pak Hanafi?")) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="submissionId" value={submissionId} />
            <Button type="submit" variant="primary" size="sm" disabled={!canSubmit} loading={isSubmitting}>
              {isSubmitting ? "Mengirim..." : "Kirim"}
            </Button>
          </form>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsCancelling((prev) => !prev)}
            className="!border-red-300 !text-red-600 hover:!bg-red-50 dark:!border-red-800 dark:!text-red-400"
          >
            {isCancelling ? "Batal" : "Batalkan"}
          </Button>
        </div>
      ) : null}

      <FormError error={submitState.error} />

      {!canSubmit && canMutate ? (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          Kas hari ini tidak sedang open — pengiriman pengajuan biaya dikunci.
        </p>
      ) : null}

      {canMutate && isEditing ? (
        <form action={reviseFormAction} className="mt-4 flex flex-col gap-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <input type="hidden" name="submissionId" value={submissionId} />
          <input type="hidden" name="poolId" value={poolId} />
          <input type="hidden" name="entryScope" value={submission.entry_scope ?? "project"} />
          <ExpenseFormFields
            entryScope={submission.entry_scope ?? "project"}
            projectOptions={projectOptions}
            categoryOptions={categoryOptions}
            vendorOptions={vendorOptions}
            facilityOptions={facilityOptions}
            defaultValues={{
              projectId: submission.project_id,
              categoryId: submission.category_id,
              vendorId: submission.vendor_id,
              facilityLocationId: submission.facility_location_id,
              amount: submission.amount,
              referenceNumber: submission.reference_number,
              description: submission.description,
            }}
            fieldErrors={reviseState.fieldErrors}
          />
          <FormError error={reviseState.error} />
          <div>
            <Button type="submit" variant="primary" loading={isRevising}>
              {isRevising ? "Menyimpan..." : "Simpan Revisi"}
            </Button>
          </div>
        </form>
      ) : null}

      {canMutate && isCancelling ? (
        <form
          action={cancelFormAction}
          onSubmit={(event) => {
            const form = event.currentTarget;
            const reason = (new FormData(form).get("reason") as string | null)?.trim();
            if (!reason) {
              event.preventDefault();
              return;
            }
            if (!window.confirm("Batalkan pengajuan biaya ini? Tindakan ini akan tercatat pada riwayat.")) {
              event.preventDefault();
            }
          }}
          className="mt-4 flex flex-col gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800"
        >
          <input type="hidden" name="submissionId" value={submissionId} />
          <label htmlFor={`cancel-reason-${submissionId}`} className="text-sm font-medium">
            Alasan Pembatalan
          </label>
          <textarea
            id={`cancel-reason-${submissionId}`}
            name="reason"
            required
            rows={2}
            className={inputClassName}
          />
          <FieldError messages={cancelState.fieldErrors?.reason} />
          <FormError error={cancelState.error} />
          <div>
            <Button type="submit" variant="destructive" loading={isCancellingRequest}>
              {isCancellingRequest ? "Membatalkan..." : "Konfirmasi Batalkan"}
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

function formatTimestamp(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
