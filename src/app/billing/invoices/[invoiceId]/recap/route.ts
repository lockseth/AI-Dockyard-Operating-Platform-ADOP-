import { NextResponse } from "next/server";
import { UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import { buildInvoiceCostRecapFilename, buildInvoiceCostRecapWorkbook } from "@/lib/invoice-evidence/cost-recap";
import { getInvoiceCostRecapForActiveTenant } from "@/lib/invoice-evidence/service";

// GET-only, read-only export of the invoice's cost recap (PRD.md §7.12
// "export cost recap XLSX" step). Never mutates ledger/invoice/evidence/
// cash-day state — every downstream call is a `.select()`, so repeated
// requests are trivially idempotent and safe to retry.
export async function GET(_request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await context.params;

  let recap;
  try {
    recap = await getInvoiceCostRecapForActiveTenant(invoiceId);
  } catch (error) {
    if (error instanceof UnauthorizedTenantRoleError) {
      return NextResponse.json({ error: "Anda tidak memiliki izin untuk mengekspor rekap biaya invoice ini." }, { status: 403 });
    }
    throw error;
  }

  if (!recap) {
    return NextResponse.json({ error: "Invoice tidak ditemukan." }, { status: 404 });
  }

  const now = new Date();
  const buffer = buildInvoiceCostRecapWorkbook(recap, now);
  const filename = buildInvoiceCostRecapFilename(recap.invoice, now);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
