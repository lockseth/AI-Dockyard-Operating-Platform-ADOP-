import { Disclosure } from "@/components/ui/Disclosure";
import { TextLink } from "@/components/ui/TextLink";
import { DocumentStatusBadge, InvoiceStatusBadge } from "@/app/billing/invoices/InvoiceStatusBadge";
import { OpenDocumentButton } from "@/app/billing/invoices/OpenDocumentButton";
import { formatRupiah } from "@/lib/operations-daily/format";
import type { TransactionInvoiceBindingRow } from "@/lib/invoice-evidence/types";

// Riwayat Transaksi's "which invoice(s) has this transaction ever been part
// of" lookup (task instruction H) — deliberately renders EVERY binding, not
// just the currently-active one: a void invoice's binding still appears, so
// the chain/history is never erased by a void (Gate 4A Contract §6 step 6).
export function InvoiceBindingsDisclosure({ bindings }: { bindings: TransactionInvoiceBindingRow[] }) {
  if (bindings.length === 0) {
    return null;
  }

  return (
    <Disclosure title="Invoice & Evidence" defaultOpen summary={`${bindings.length} invoice`}>
      <div className="flex flex-col gap-3">
        {bindings.map((binding) => (
          <div key={binding.binding_id} className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {binding.invoice_status ? <InvoiceStatusBadge status={binding.invoice_status} /> : null}
                <DocumentStatusBadge currentVersionStatus={binding.current_version_status} isFinalDocument={binding.is_final_document} />
              </div>
              {binding.invoice_id ? (
                <TextLink href={`/billing/invoices/${binding.invoice_id}`}>Lihat Invoice</TextLink>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Terikat sejak {binding.bound_at ? new Date(binding.bound_at).toLocaleString("id-ID") : "-"} — snapshot nominal{" "}
              {formatRupiah(binding.amount)}
            </p>
            {binding.invoice_status === "void" && binding.void_reason ? (
              <p className="mt-1 text-xs text-neutral-500">Alasan void: {binding.void_reason}</p>
            ) : null}
            {binding.is_final_document && binding.current_version_id ? (
              <div className="mt-2 flex justify-end">
                <OpenDocumentButton versionId={binding.current_version_id} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Disclosure>
  );
}
