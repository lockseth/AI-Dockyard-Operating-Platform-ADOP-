"use client";

import { useActionState, useState } from "react";
import { issueInvoiceAction, reissueInvoiceAction, voidInvoiceAction } from "@/lib/invoice-evidence/actions";
import type { InvoiceEvidenceActionResult, ReissueInvoiceResult } from "@/lib/invoice-evidence/service";
import type { InvoiceStatus } from "@/lib/invoice-evidence/types";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { FormError } from "@/components/master-data/FormError";

const initialState: InvoiceEvidenceActionResult = {};
const initialReissueState: ReissueInvoiceResult = {};

export function LifecycleControls({
  invoiceId,
  invoiceStatus,
  lineCount,
  metadataComplete,
  hasSuccessor,
}: {
  invoiceId: string;
  invoiceStatus: InvoiceStatus | null;
  lineCount: number;
  metadataComplete: boolean;
  hasSuccessor: boolean;
}) {
  if (invoiceStatus === "draft") {
    const hasNoLines = lineCount === 0;
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-neutral-500">Lifecycle</h2>
        <div className="flex flex-wrap items-start gap-3">
          <IssueButton invoiceId={invoiceId} disabled={hasNoLines || !metadataComplete} />
          <VoidControl invoiceId={invoiceId} triggerLabel="Batalkan Draft" />
        </div>
        {hasNoLines ? (
          <p className="text-xs text-neutral-500">Ikat minimal satu transaksi sebelum invoice dapat diterbitkan.</p>
        ) : null}
        {!hasNoLines && !metadataComplete ? (
          <p className="text-xs text-neutral-500">
            Lengkapi legal entity, nomor invoice, tanggal invoice, dan tanggal jatuh tempo sebelum invoice dapat
            diterbitkan.
          </p>
        ) : null}
      </section>
    );
  }

  if (invoiceStatus === "issued") {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-neutral-500">Lifecycle</h2>
        <VoidControl invoiceId={invoiceId} triggerLabel="Void Invoice" />
      </section>
    );
  }

  if (invoiceStatus === "void" && !hasSuccessor) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-neutral-500">Lifecycle</h2>
        <ReissueButton predecessorInvoiceId={invoiceId} />
      </section>
    );
  }

  return null;
}

function IssueButton({ invoiceId, disabled }: { invoiceId: string; disabled: boolean }) {
  const [state, formAction, isPending] = useActionState(issueInvoiceAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Button type="submit" disabled={disabled} loading={isPending}>
        {isPending ? "Menerbitkan..." : "Terbitkan Invoice"}
      </Button>
      <FormError error={state.error} />
    </form>
  );
}

function VoidControl({ invoiceId, triggerLabel }: { invoiceId: string; triggerLabel: string }) {
  const [state, formAction, isPending] = useActionState(voidInvoiceAction, initialState);
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState("");

  if (!showConfirm) {
    return (
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="w-fit rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 dark:border-red-800 dark:text-red-300"
      >
        {triggerLabel}
      </button>
    );
  }

  return (
    <Callout tone="danger" title="Konfirmasi Void Invoice" className="flex flex-col gap-3">
      <p className="text-xs">
        Invoice yang di-void tidak dapat diubah kembali. Koreksi lebih lanjut hanya bisa melalui reissue (invoice baru).
      </p>
      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
          Alasan void (wajib diisi)
          <textarea
            name="reason"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
          />
        </label>
        <FormError error={state.error} />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending || reason.trim().length === 0}
            className="w-fit rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isPending ? "Memproses..." : "Konfirmasi Void"}
          </button>
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            disabled={isPending}
            className="w-fit rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
          >
            Batal
          </button>
        </div>
      </form>
    </Callout>
  );
}

function ReissueButton({ predecessorInvoiceId }: { predecessorInvoiceId: string }) {
  const [state, formAction, isPending] = useActionState(reissueInvoiceAction, initialReissueState);

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="predecessorInvoiceId" value={predecessorInvoiceId} />
      <Button type="submit" loading={isPending}>
        {isPending ? "Membuat Reissue..." : "Reissue Invoice"}
      </Button>
      <FormError error={state.error} />
    </form>
  );
}
