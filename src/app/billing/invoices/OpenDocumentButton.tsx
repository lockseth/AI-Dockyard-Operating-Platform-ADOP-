"use client";

import { useState } from "react";
import { getInvoiceEvidenceSignedUrlAction } from "@/lib/invoice-evidence/actions";
import { FormError } from "@/components/master-data/FormError";

// Shared "Buka Dokumen" control — used from both the invoice detail page's
// evidence version history and Riwayat Transaksi's invoice/evidence
// disclosure (task instruction H), so both surfaces mint the same
// short-lived, server-authorized signed URL through the identical path.
export function OpenDocumentButton({ versionId }: { versionId: string }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleOpen() {
    setIsPending(true);
    setError(undefined);
    const result = await getInvoiceEvidenceSignedUrlAction(versionId);
    setIsPending(false);
    if (result.url) {
      window.open(result.url, "_blank", "noopener,noreferrer");
    } else {
      setError(result.error ?? "Gagal membuka dokumen.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleOpen}
        disabled={isPending}
        className="text-xs text-blue-700 underline underline-offset-4 disabled:opacity-50 dark:text-blue-300"
      >
        {isPending ? "Membuka..." : "Buka Dokumen"}
      </button>
      <FormError error={error} />
    </div>
  );
}
