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
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
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

  // Collapsed-row summary — identity + the data an owner needs to decide
  // whether to open this row at all, mirroring the always-visible fields
  // the row used to show before it was wrapped in a Disclosure.
  const summary = [
    `${categoryLabel}${vendorLabel ? ` — ${vendorLabel}` : ""}`,
    formatRupiah(submission.amount),
    `${getExpenseSubmissionStatusLabel(submission.status ?? "draft")} · Revisi ${submission.revision_number}`,
    businessDate ? formatBusinessDateLabel(businessDate) : "-",
  ].join(" · ");

  return (
    <li>
      <Disclosure title={projectLabel} summary={summary} hasError={hasPendingDuplicate} errorLabel="Cek Duplikasi Dulu">
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
          className="mt-3 rounded text-xs text-neutral-500 underline underline-offset-4 outline-none transition-colors hover:text-neutral-800 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:hover:text-neutral-100"
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
            <Button type="submit" variant="primary" size="sm" loading={isApproving} disabled={hasPendingDuplicate || isApproving}>
              {isApproving ? "Memproses..." : "Setujui"}
            </Button>
          </form>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              setIsRejecting((prev) => !prev);
              setIsCorrecting(false);
            }}
          >
            {isRejecting ? "Batal" : "Tolak"}
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setIsCorrecting((prev) => !prev);
              setIsRejecting(false);
            }}
          >
            {isCorrecting ? "Batal" : "Minta Koreksi"}
          </Button>
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
              <Button type="submit" variant="destructive" loading={isRejectingRequest} disabled={isRejectingRequest}>
                {isRejectingRequest ? "Menolak..." : "Konfirmasi Tolak"}
              </Button>
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
              <Button type="submit" variant="secondary" loading={isCorrectingRequest} disabled={isCorrectingRequest}>
                {isCorrectingRequest ? "Mengirim..." : "Konfirmasi Minta Koreksi"}
              </Button>
            </div>
          </form>
        ) : null}
      </Disclosure>
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
