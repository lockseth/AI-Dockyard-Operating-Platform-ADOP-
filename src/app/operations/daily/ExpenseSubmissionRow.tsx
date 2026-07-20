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
import { ExpenseFormFields } from "./ExpenseFormFields";
import type { ExpenseSubmissionCurrentRow } from "@/lib/expense-approvals/repository";
import type { ExpenseSubmissionActionResult } from "@/lib/expense-approvals/service";
import type { VesselProjectOption } from "@/lib/operations-daily/view-model";

const initialReviseState: ExpenseSubmissionActionResult = {};
const initialSubmitState: ExpenseSubmissionActionResult = {};
const initialCancelState: ExpenseSubmissionActionResult = {};

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
          <p className="text-sm text-neutral-500">
            {categoryLabel}
            {vendorLabel ? ` — ${vendorLabel}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="font-medium">{formatRupiah(submission.amount)}</p>
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            {getExpenseSubmissionStatusLabel(status ?? "draft")} · Revisi {submission.revision_number}
          </span>
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
          <button
            type="button"
            onClick={() => setIsEditing((prev) => !prev)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:border-neutral-400 dark:border-neutral-700"
          >
            {isEditing ? "Batal Edit" : "Edit"}
          </button>

          <form
            action={submitFormAction}
            onSubmit={(event) => {
              if (!window.confirm("Kirim pengajuan biaya ini untuk direview Pak Hanafi?")) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="submissionId" value={submissionId} />
            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {isSubmitting ? "Mengirim..." : "Kirim"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setIsCancelling((prev) => !prev)}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:border-red-400 dark:border-red-800 dark:text-red-400"
          >
            {isCancelling ? "Batal" : "Batalkan"}
          </button>
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
          <ExpenseFormFields
            projectOptions={projectOptions}
            categoryOptions={categoryOptions}
            vendorOptions={vendorOptions}
            defaultValues={{
              projectId: submission.project_id,
              categoryId: submission.category_id,
              vendorId: submission.vendor_id,
              amount: submission.amount,
              referenceNumber: submission.reference_number,
              description: submission.description,
            }}
            fieldErrors={reviseState.fieldErrors}
          />
          <FormError error={reviseState.error} />
          <div>
            <button
              type="submit"
              disabled={isRevising}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {isRevising ? "Menyimpan..." : "Simpan Revisi"}
            </button>
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
            className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
          <FieldError messages={cancelState.fieldErrors?.reason} />
          <FormError error={cancelState.error} />
          <div>
            <button
              type="submit"
              disabled={isCancellingRequest}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {isCancellingRequest ? "Membatalkan..." : "Konfirmasi Batalkan"}
            </button>
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
