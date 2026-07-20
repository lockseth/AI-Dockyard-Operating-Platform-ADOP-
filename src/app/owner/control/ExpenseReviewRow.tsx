"use client";

import { useActionState, useState } from "react";
import {
  approveExpenseSubmissionOwnerAction,
  rejectExpenseSubmissionOwnerAction,
  requestExpenseCorrectionOwnerAction,
} from "@/lib/owner-control/actions";
import { formatBusinessDateLabel, formatRupiah } from "@/lib/operations-daily/format";
import { getExpenseSubmissionStatusLabel } from "@/lib/operations-daily/labels";
import { FieldError, FormError } from "@/components/master-data/FormError";
import type { ExpenseSubmissionActionResult } from "@/lib/expense-approvals/service";
import type { ExpenseReviewItem } from "./ExpenseReviewSection";

const initialApproveState: ExpenseSubmissionActionResult = {};
const initialRejectState: ExpenseSubmissionActionResult = {};
const initialCorrectionState: ExpenseSubmissionActionResult = {};

export function ExpenseReviewRow({ item }: { item: ExpenseReviewItem }) {
  const { submission, businessDate, projectLabel, categoryLabel, vendorLabel, revisionHistory, duplicateCandidates } =
    item;
  const submissionId = submission.submission_id ?? "";
  const hasPendingDuplicate = duplicateCandidates.some((candidate) => candidate.status === "pending");

  const [showRevisions, setShowRevisions] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isCorrecting, setIsCorrecting] = useState(false);

  const [approveState, approveFormAction, isApproving] = useActionState(
    approveExpenseSubmissionOwnerAction,
    initialApproveState,
  );
  const [rejectState, rejectFormAction, isRejectingRequest] = useActionState(
    rejectExpenseSubmissionOwnerAction,
    initialRejectState,
  );
  const [correctionState, correctionFormAction, isCorrectingRequest] = useActionState(
    requestExpenseCorrectionOwnerAction,
    initialCorrectionState,
  );

  return (
    <li className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{projectLabel}</p>
          <p className="text-sm text-neutral-500">
            {categoryLabel}
            {vendorLabel ? ` — ${vendorLabel}` : ""}
          </p>
          <p className="text-xs text-neutral-400">{businessDate ? formatBusinessDateLabel(businessDate) : "-"}</p>
        </div>
        <div className="text-right">
          <p className="font-medium">{formatRupiah(submission.amount)}</p>
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            {getExpenseSubmissionStatusLabel(submission.status ?? "draft")} · Revisi {submission.revision_number}
          </span>
        </div>
      </div>

      {submission.description ? (
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{submission.description}</p>
      ) : null}

      <dl className="mt-2 grid gap-1 text-xs text-neutral-500 sm:grid-cols-2">
        <div>
          <dt className="inline font-medium">Referensi:</dt> <dd className="inline">{submission.reference_number ?? "-"}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Pengaju (User ID):</dt> <dd className="inline">{submission.created_by ?? "-"}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Waktu Submit:</dt> <dd className="inline">{formatTimestamp(submission.updated_at)}</dd>
        </div>
      </dl>

      {hasPendingDuplicate ? (
        <p role="alert" className="mt-2 text-sm font-medium text-amber-600 dark:text-amber-400">
          Perlu pemeriksaan duplikasi terlebih dahulu — lihat{" "}
          <a href="#tinjauan-duplikasi" className="underline underline-offset-4">
            Tinjauan Duplikasi
          </a>{" "}
          sebelum approve.
        </p>
      ) : null}

      {duplicateCandidates.length > 0 ? (
        <p className="mt-2 text-xs text-neutral-500">
          Status duplikasi: {duplicateCandidates.map((c) => c.status).join(", ")}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setShowRevisions((prev) => !prev)}
        className="mt-3 text-xs text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
      >
        {showRevisions ? "Sembunyikan riwayat revisi" : `Lihat riwayat revisi (${revisionHistory.length})`}
      </button>

      {showRevisions ? (
        <ul className="mt-2 flex flex-col gap-1 border-t border-neutral-200 pt-2 text-xs text-neutral-500 dark:border-neutral-800">
          {revisionHistory.map((revision) => (
            <li key={revision.id}>
              Revisi {revision.revision_number}: {formatRupiah(revision.amount)} — {revision.description}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <form
          action={approveFormAction}
          onSubmit={(event) => {
            if (!window.confirm("Setujui pengajuan biaya ini?")) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="submissionId" value={submissionId} />
          <button
            type="submit"
            disabled={hasPendingDuplicate || isApproving}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {isApproving ? "Memproses..." : "Setujui"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setIsRejecting((prev) => !prev);
            setIsCorrecting(false);
          }}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:border-red-400 dark:border-red-800 dark:text-red-400"
        >
          {isRejecting ? "Batal" : "Tolak"}
        </button>

        <button
          type="button"
          onClick={() => {
            setIsCorrecting((prev) => !prev);
            setIsRejecting(false);
          }}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:border-neutral-400 dark:border-neutral-700"
        >
          {isCorrecting ? "Batal" : "Minta Koreksi"}
        </button>
      </div>

      <FormError error={approveState.error} />

      {isRejecting ? (
        <form
          action={rejectFormAction}
          onSubmit={(event) => {
            const reason = (new FormData(event.currentTarget).get("reason") as string | null)?.trim();
            if (!reason) {
              event.preventDefault();
              return;
            }
            if (!window.confirm("Tolak pengajuan biaya ini?")) {
              event.preventDefault();
            }
          }}
          className="mt-3 flex flex-col gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800"
        >
          <input type="hidden" name="submissionId" value={submissionId} />
          <label htmlFor={`reject-reason-${submissionId}`} className="text-sm font-medium">
            Alasan Penolakan
          </label>
          <textarea
            id={`reject-reason-${submissionId}`}
            name="reason"
            required
            rows={2}
            className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
          <FieldError messages={rejectState.fieldErrors?.reason} />
          <FormError error={rejectState.error} />
          <div>
            <button
              type="submit"
              disabled={isRejectingRequest}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {isRejectingRequest ? "Menolak..." : "Konfirmasi Tolak"}
            </button>
          </div>
        </form>
      ) : null}

      {isCorrecting ? (
        <form
          action={correctionFormAction}
          onSubmit={(event) => {
            const reason = (new FormData(event.currentTarget).get("reason") as string | null)?.trim();
            if (!reason) {
              event.preventDefault();
              return;
            }
            if (!window.confirm("Minta koreksi untuk pengajuan biaya ini?")) {
              event.preventDefault();
            }
          }}
          className="mt-3 flex flex-col gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800"
        >
          <input type="hidden" name="submissionId" value={submissionId} />
          <label htmlFor={`correction-reason-${submissionId}`} className="text-sm font-medium">
            Alasan Koreksi
          </label>
          <textarea
            id={`correction-reason-${submissionId}`}
            name="reason"
            required
            rows={2}
            className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
          />
          <FieldError messages={correctionState.fieldErrors?.reason} />
          <FormError error={correctionState.error} />
          <div>
            <button
              type="submit"
              disabled={isCorrectingRequest}
              className="rounded-md border border-neutral-400 px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {isCorrectingRequest ? "Mengirim..." : "Konfirmasi Minta Koreksi"}
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
