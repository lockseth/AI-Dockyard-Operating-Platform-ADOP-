import { Table, TableHead, TableRow, Th, Td } from "@/components/ui/Table";
import { TextLink } from "@/components/ui/TextLink";
import { formatRupiah } from "@/lib/operations-daily/format";
import type { InvoiceBillingSummaryRow } from "@/lib/invoice-evidence/types";
import { DocumentStatusBadge, InvoiceStatusBadge } from "./InvoiceStatusBadge";

export function InvoiceTable({ invoices }: { invoices: InvoiceBillingSummaryRow[] }) {
  if (invoices.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
        Belum ada invoice. Buat draft invoice untuk mulai menagihkan transaksi Project Kapal yang sudah closed.
      </div>
    );
  }

  return (
    <Table minWidth="720px">
      <TableHead>
        <TableRow>
          <Th>Invoice</Th>
          <Th>Status</Th>
          <Th align="right">Jumlah Transaksi</Th>
          <Th align="right">Total Snapshot</Th>
          <Th>Dokumen</Th>
          <Th>Dibuat</Th>
        </TableRow>
      </TableHead>
      <tbody>
        {invoices.map((invoice) => (
          <TableRow key={invoice.id}>
            <Td>
              <TextLink href={`/billing/invoices/${invoice.id}`} className="font-mono text-xs">
                {invoice.id?.slice(0, 8)}
              </TextLink>
              {invoice.predecessor_invoice_id ? (
                <div className="mt-0.5 text-[11px] text-neutral-500">Reissue dari invoice sebelumnya</div>
              ) : null}
              {invoice.successor_invoice_id ? (
                <div className="mt-0.5 text-[11px] text-neutral-500">Sudah di-reissue</div>
              ) : null}
            </Td>
            <Td>{invoice.status ? <InvoiceStatusBadge status={invoice.status} /> : "-"}</Td>
            <Td align="right">{invoice.line_count ?? 0}</Td>
            <Td align="right">{formatRupiah(invoice.total_amount)}</Td>
            <Td>
              <DocumentStatusBadge currentVersionStatus={invoice.current_version_status} isFinalDocument={invoice.is_final_document} />
            </Td>
            <Td className="text-xs text-neutral-500">
              {invoice.created_at ? new Date(invoice.created_at).toLocaleString("id-ID") : "-"}
            </Td>
          </TableRow>
        ))}
      </tbody>
    </Table>
  );
}
