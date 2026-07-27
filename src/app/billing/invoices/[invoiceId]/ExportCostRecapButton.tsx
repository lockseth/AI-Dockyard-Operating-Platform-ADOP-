"use client";

import { useState } from "react";
import { FormError } from "@/components/master-data/FormError";

// Downloads via fetch+blob (not a plain <a href>) so a 403/404 renders as an
// inline error instead of a browser error page, matching OpenDocumentButton's
// loading/error UX. Read-only — this never touches ledger, evidence, or
// invoice lifecycle state (see the recap route handler).
export function ExportCostRecapButton({ invoiceId }: { invoiceId: string }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleExport() {
    setIsPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/billing/invoices/${invoiceId}/recap`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Gagal mengekspor rekap biaya.");
        return;
      }

      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? `rekap-biaya-invoice-${invoiceId}.xlsx`;

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Gagal mengekspor rekap biaya.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleExport}
        disabled={isPending}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
      >
        {isPending ? "Mengekspor..." : "Export Rekap Biaya (XLSX)"}
      </button>
      <FormError error={error} />
    </div>
  );
}
