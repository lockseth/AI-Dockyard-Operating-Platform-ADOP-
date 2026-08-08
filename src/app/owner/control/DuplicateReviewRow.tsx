"use client";

import { useActionState, useState } from "react";
import { resolveExpenseDuplicateCandidateOwnerAction } from "@/lib/owner-control/actions";
import { formatBusinessDateLabel, formatRupiah } from "@/lib/operations-daily/format";
import { getExpenseDuplicateReasonLabel } from "@/lib/owner-control/labels";
import { FieldError, FormError } from "@/components/master-data/FormError";
import { Disclosure } from "@/components/ui/Disclosure";
import type { ExpenseDuplicateCandidateActionResult } from "@/lib/expense-duplicate-detection/service";
import type { DuplicateReviewItem } from "./DuplicateReviewSection";

const initialState: ExpenseDuplicateCandidateActionResult = {};

function renderEvidence(evidence: unknown): string {
  if (!evidence || typeof evidence !== "object") return "-";
  return Object.entries(evidence as Record<string, unknown>)
    .map(([key, value]) => `${key}: ${value === null || value === undefined ? "-" : String(value)}`)
    .join(" · ");
}

export function DuplicateReviewRow({ item }: { item: DuplicateReviewItem }) {
  const {
    candidate,
    businessDate1,
    businessDate2,
    projectLabel1,
    projectLabel2,
    categoryLabel1,
    categoryLabel2,
    vendorLabel1,
    vendorLabel2,
  } = item;
  const candidateId = candidate.candidate_id ?? "";

  const [pendingResolution, setPendingResolution] = useState<"not_duplicate" | "confirmed_duplicate" | null>(null);
  const [state, formAction, isSubmitting] = useActionState(resolveExpenseDuplicateCandidateOwnerAction, initialState);

  const isResolved = candidate.status !== "pending";

  // Collapsed-row summary — identity + the data an owner needs to decide
  // whether to open this row at all, mirroring the always-visible fields
  // the row used to show before it was wrapped in a Disclosure.
  const summary = [
    `${projectLabel1} vs ${projectLabel2}`,
    `${formatRupiah(candidate.amount_1)} / ${formatRupiah(candidate.amount_2)}`,
    candidate.status,
    businessDate1 ? formatBusinessDateLabel(businessDate1) : "-",
  ].join(" · ");

  return (
    <li>
      <Disclosure
        title={candidate.reason_code ? getExpenseDuplicateReasonLabel(candidate.reason_code) : "-"}
        summary={summary}
      >
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
            <p className="font-medium">Sisi 1 · {projectLabel1}</p>
            <p className="text-xs text-neutral-500">{businessDate1 ? formatBusinessDateLabel(businessDate1) : "-"}</p>
            <p className="mt-1">{formatRupiah(candidate.amount_1)}</p>
            <p className="text-xs text-neutral-500">
              {categoryLabel1}
              {vendorLabel1 ? ` — ${vendorLabel1}` : ""}
            </p>
            <p className="mt-1 text-xs">{candidate.description_1 ?? "-"}</p>
            <p className="text-xs text-neutral-400">Referensi: {candidate.reference_number_1 ?? "-"}</p>
            <p className="text-xs text-neutral-400">Status: {candidate.submission_status_1 ?? "-"}</p>
          </div>
          <div className="rounded-md bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
            <p className="font-medium">Sisi 2 · {projectLabel2}</p>
            <p className="text-xs text-neutral-500">{businessDate2 ? formatBusinessDateLabel(businessDate2) : "-"}</p>
            <p className="mt-1">{formatRupiah(candidate.amount_2)}</p>
            <p className="text-xs text-neutral-500">
              {categoryLabel2}
              {vendorLabel2 ? ` — ${vendorLabel2}` : ""}
            </p>
            <p className="mt-1 text-xs">{candidate.description_2 ?? "-"}</p>
            <p className="text-xs text-neutral-400">Referensi: {candidate.reference_number_2 ?? "-"}</p>
            <p className="text-xs text-neutral-400">Status: {candidate.submission_status_2 ?? "-"}</p>
          </div>
        </div>

        <p className="mt-2 text-xs text-neutral-500">Bukti kecocokan: {renderEvidence(candidate.match_evidence)}</p>

        {isResolved ? (
          <div className="mt-3 border-t border-neutral-200 pt-3 text-sm dark:border-neutral-800">
            <p>
              <span className="font-medium">Keputusan:</span>{" "}
              {candidate.status === "not_duplicate" ? "Bukan Duplikat" : "Terkonfirmasi Duplikat"}
            </p>
            {candidate.resolved_reason ? (
              <p className="text-neutral-500">
                <span className="font-medium">Alasan:</span> {candidate.resolved_reason}
              </p>
            ) : null}
            {candidate.status === "not_duplicate" ? (
              <p className="mt-1 text-xs text-neutral-500">
                Submission dapat dilanjutkan ke{" "}
                <a href="#tinjauan-biaya" className="underline underline-offset-4">
                  Tinjauan Pengajuan Biaya
                </a>
                .
              </p>
            ) : (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Submission terkonfirmasi duplikat dan harus ditolak — buka{" "}
                <a href="#tinjauan-biaya" className="underline underline-offset-4">
                  Tinjauan Pengajuan Biaya
                </a>
                .
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setPendingResolution((prev) => (prev === "not_duplicate" ? null : "not_duplicate"))}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:border-neutral-400 dark:border-neutral-700"
            >
              {pendingResolution === "not_duplicate" ? "Batal" : "Bukan Duplikat"}
            </button>
            <button
              type="button"
              onClick={() =>
                setPendingResolution((prev) => (prev === "confirmed_duplicate" ? null : "confirmed_duplicate"))
              }
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:border-red-400 dark:border-red-800 dark:text-red-400"
            >
              {pendingResolution === "confirmed_duplicate" ? "Batal" : "Terkonfirmasi Duplikat"}
            </button>
          </div>
        )}

        {pendingResolution ? (
          <form
            action={formAction}
            onSubmit={(event) => {
              const reason = (new FormData(event.currentTarget).get("reason") as string | null)?.trim();
              if (!reason) {
                event.preventDefault();
                return;
              }
              const confirmMessage =
                pendingResolution === "not_duplicate"
                  ? "Tandai kandidat ini sebagai bukan duplikat?"
                  : "Tandai kandidat ini sebagai terkonfirmasi duplikat?";
              if (!window.confirm(confirmMessage)) {
                event.preventDefault();
              }
            }}
            className="mt-3 flex flex-col gap-2"
          >
            <input type="hidden" name="candidateId" value={candidateId} />
            <input type="hidden" name="resolution" value={pendingResolution} />
            <label htmlFor={`duplicate-reason-${candidateId}`} className="text-sm font-medium">
              Alasan Keputusan
            </label>
            <textarea
              id={`duplicate-reason-${candidateId}`}
              name="reason"
              required
              rows={2}
              className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
            />
            <FieldError messages={state.fieldErrors?.reason} />
            <FormError error={state.error} />
            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
              >
                {isSubmitting ? "Menyimpan..." : "Konfirmasi Keputusan"}
              </button>
            </div>
          </form>
        ) : null}
      </Disclosure>
    </li>
  );
}
