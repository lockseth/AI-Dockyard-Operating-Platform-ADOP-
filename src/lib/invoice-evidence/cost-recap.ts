import * as XLSX from "xlsx";
import type { ClientRow } from "@/lib/master-data/clients/repository";
import type { VesselRow } from "@/lib/master-data/vessels/repository";
import type { VesselProjectRow } from "@/lib/vessel-projects/repository";
import { INVOICE_STATUS_LABEL } from "./labels";
import type { InvoiceBillingSummaryRow, InvoiceTransactionLineRow } from "./types";

// Cost recap export — the "export cost recap XLSX" step of PRD.md §7.12's
// locked Assisted Billing workflow (`closed -> export cost recap XLSX ->
// admin prepares Word invoice manually -> ...`). This is a working input for
// the admin to draft the invoice by hand; it is NEVER the final invoice
// document (that role stays with the wet-signed/stamped upload in
// invoice_evidence per Gate 4A Contract §6/§10, which explicitly keeps
// "invoice renderer/export baru" out of scope). Every figure here is a
// direct read of the already-locked snapshot in invoice_transaction_lines —
// nothing is recomputed.

export interface InvoiceCostRecapRow {
  lineId: string;
  projectCode: string | null;
  vesselName: string;
  clientName: string;
  description: string;
  amount: number;
}

export interface InvoiceCostRecap {
  invoice: InvoiceBillingSummaryRow;
  tenantDisplayName: string;
  rows: InvoiceCostRecapRow[];
}

const UNKNOWN_VESSEL_LABEL = "Kapal tidak dikenal";
const UNKNOWN_CLIENT_LABEL = "Klien tidak dikenal";

export function buildInvoiceCostRecapRows(
  lines: InvoiceTransactionLineRow[],
  projects: VesselProjectRow[],
  vessels: VesselRow[],
  clients: ClientRow[],
): InvoiceCostRecapRow[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const vesselById = new Map(vessels.map((vessel) => [vessel.id, vessel]));
  const clientById = new Map(clients.map((client) => [client.id, client]));

  return lines.map((line) => {
    const project = projectById.get(line.project_id);
    const vessel = project ? vesselById.get(project.vessel_id) : undefined;
    const client = project ? clientById.get(project.client_id) : undefined;

    return {
      lineId: line.id,
      projectCode: project?.project_code ?? null,
      vesselName: vessel?.vessel_name ?? UNKNOWN_VESSEL_LABEL,
      clientName: client?.display_name ?? UNKNOWN_CLIENT_LABEL,
      description: line.description,
      amount: line.amount,
    };
  });
}

// Not the invoice's own total_amount snapshot column directly — recomputed
// here from the same rows the sheet renders, so a reader can verify the
// printed rows and the printed total foot the same way (the value is
// identical to invoice.total_amount by construction, since both derive from
// the same invoice_transaction_lines snapshot).
export function sumInvoiceCostRecapRows(rows: InvoiceCostRecapRow[]): number {
  return rows.reduce((total, row) => total + row.amount, 0);
}

function jakartaTimestampLabel(now: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "long",
    timeStyle: "short",
  }).format(now);
}

// draft/void recaps stay clearly labeled as non-final so they can never be
// mistaken for the signed invoice document (instruction: "jangan tampilkan
// sebagai invoice final secara menyesatkan").
function documentStatusNote(invoice: InvoiceBillingSummaryRow): string {
  if (invoice.status === "void") {
    return `INVOICE VOID — bukan dasar penagihan. Alasan: ${invoice.void_reason ?? "-"}`;
  }
  if (invoice.status === "draft") {
    return "DRAFT — binding transaksi masih dapat berubah, bukan dokumen final.";
  }
  return "Rekap kerja untuk penyusunan invoice manual — bukan dokumen invoice final. Dokumen final adalah signed document yang diunggah pada evidence invoice.";
}

export function buildInvoiceCostRecapFilename(invoice: InvoiceBillingSummaryRow, now: Date): string {
  const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now).replaceAll("-", "");
  const invoiceIdPrefix = (invoice.id ?? "invoice").slice(0, 8);
  return `rekap-biaya-invoice-${invoiceIdPrefix}-${dateKey}.xlsx`;
}

export function buildInvoiceCostRecapWorkbook(recap: InvoiceCostRecap, now: Date): Buffer {
  const { invoice, rows, tenantDisplayName } = recap;
  const total = sumInvoiceCostRecapRows(rows);

  const header: (string | number)[][] = [
    [tenantDisplayName],
    ["Rekap Biaya untuk Penyusunan Invoice"],
    [`Invoice: ${invoice.id}`],
    [`Status: ${INVOICE_STATUS_LABEL[invoice.status ?? "draft"]}`],
    [documentStatusNote(invoice)],
    [`Dibuat: ${new Date(invoice.created_at ?? now).toLocaleString("id-ID")}`],
    invoice.issued_at ? [`Diterbitkan: ${new Date(invoice.issued_at).toLocaleString("id-ID")}`] : [],
    [`Diekspor: ${jakartaTimestampLabel(now)}`],
    [],
    ["No", "Kode Proyek", "Kapal", "Klien", "Keterangan", "Jumlah (Rp)"],
  ].filter((row) => row.length > 0);

  const dataRows = rows.map((row, index) => [
    index + 1,
    row.projectCode ?? "-",
    row.vesselName,
    row.clientName,
    row.description,
    row.amount,
  ]);

  const totalRow = ["", "", "", "", "TOTAL", total];

  const sheet = XLSX.utils.aoa_to_sheet([...header, ...dataRows, totalRow]);
  const amountColumn = 5; // zero-indexed column F ("Jumlah (Rp)")
  const firstDataRow = header.length;
  const lastRow = header.length + dataRows.length; // includes the TOTAL row
  for (let rowIndex = firstDataRow; rowIndex <= lastRow; rowIndex++) {
    const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: amountColumn });
    const cell = sheet[cellRef];
    if (cell && typeof cell.v === "number") {
      cell.z = "#,##0";
    }
  }
  sheet["!cols"] = [{ wch: 4 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 40 }, { wch: 16 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Rekap Biaya");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
