import { Badge } from "@/components/ui/Badge";
import { Table, TableHead, TableRow, Th, Td } from "@/components/ui/Table";
import { TextLink } from "@/components/ui/TextLink";
import { BILLING_WORKSPACE_STATUS_LABEL, BILLING_WORKSPACE_STATUS_TONE } from "@/lib/billing-workspace/labels";
import type { BillingWorkspaceRow } from "@/lib/billing-workspace/types";
import { formatRupiah } from "@/lib/operations-daily/format";
import { getVesselProjectLifecycleStatusLabel } from "@/lib/vessel-projects/labels";

export function WorkspaceTable({ rows }: { rows: BillingWorkspaceRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
        Tidak ada Project Kapal yang cocok dengan filter saat ini.
      </div>
    );
  }

  return (
    <Table minWidth="880px">
      <TableHead>
        <TableRow>
          <Th>Kapal / Project</Th>
          <Th>Customer</Th>
          <Th>Status Proyek</Th>
          <Th>Status Billing</Th>
          <Th align="right">Nilai Tagihan</Th>
          <Th>Invoice Terkait</Th>
          <Th />
        </TableRow>
      </TableHead>
      <tbody>
        {rows.map((row) => (
          <TableRow key={row.projectId}>
            <Td>
              <p className="font-semibold text-neutral-900 dark:text-neutral-100">{row.vesselName}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{row.projectCode ?? "-"}</p>
            </Td>
            <Td>{row.clientName}</Td>
            <Td>{getVesselProjectLifecycleStatusLabel(row.lifecycleStatus)}</Td>
            <Td>
              <Badge tone={BILLING_WORKSPACE_STATUS_TONE[row.status]}>{BILLING_WORKSPACE_STATUS_LABEL[row.status]}</Badge>
            </Td>
            <Td align="right">{row.activeInvoice ? formatRupiah(row.activeInvoice.total_amount) : "-"}</Td>
            <Td>
              {row.activeInvoice?.id ? (
                <TextLink href={`/billing/invoices/${row.activeInvoice.id}`} className="font-mono text-xs">
                  {row.activeInvoice.id.slice(0, 8)}
                </TextLink>
              ) : (
                <span className="text-xs text-neutral-500">-</span>
              )}
            </Td>
            <Td align="right">
              <TextLink href={`/billing/workspace/${row.projectId}`} className="text-xs font-medium">
                Lihat detail
              </TextLink>
            </Td>
          </TableRow>
        ))}
      </tbody>
    </Table>
  );
}
