import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { BillingWorkspaceRow } from "@/lib/billing-workspace/types";
import { formatRupiah } from "@/lib/operations-daily/format";

// Days-since-closed is presentation only (Contract §23 #4 leaves any grace
// period/delay rule OPEN) — computed at render time from `closedAt`, which
// itself comes straight from `unbilled_vessel_projects.closed_at`.
function elapsedDaysLabel(closedAt: string | null): string | null {
  if (!closedAt) return null;
  const closedMs = new Date(closedAt).getTime();
  if (Number.isNaN(closedMs)) return null;
  const days = Math.max(0, Math.floor((Date.now() - closedMs) / (1000 * 60 * 60 * 24)));
  return `${days} hari sejak ditutup`;
}

export function UnbilledAlertSection({ rows }: { rows: BillingWorkspaceRow[] }) {
  if (rows.length === 0) {
    return (
      <Card tone="success" className="text-sm text-neutral-600 dark:text-neutral-300">
        Tidak ada kapal yang belum ditagihkan saat ini.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => {
        const elapsed = elapsedDaysLabel(row.closedAt);
        return (
          <Link key={row.projectId} href={`/billing/workspace/${row.projectId}`} className="block">
            <Card
              tone="danger"
              className="flex flex-wrap items-center justify-between gap-3 transition-colors hover:brightness-[0.98]"
            >
              <div>
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {row.vesselName} {row.projectCode ? `(${row.projectCode})` : ""}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {row.clientName} &middot; {row.unbilledTransactionCount} transaksi belum ditagihkan
                  {elapsed ? ` · ${elapsed}` : ""}
                </p>
                {row.lastVoidedInvoiceId ? (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    Invoice sebelumnya di-void{row.lastVoidReason ? `: ${row.lastVoidReason}` : ""} — belum ada
                    pengganti aktif.
                  </p>
                ) : null}
              </div>
              <Badge tone="danger">{formatRupiah(row.unbilledAmountTotal)}</Badge>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
