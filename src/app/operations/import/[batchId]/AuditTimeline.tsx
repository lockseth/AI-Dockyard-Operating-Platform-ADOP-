import type { CashImportEventRow } from "@/lib/cash-import-staging/repository";

const EVENT_LABEL: Record<string, string> = {
  batch_created: "Batch dibuat",
  batch_reopened: "Batch dibuka kembali (upload ulang file yang sama)",
  label_mapping_set: "Mapping label diperbarui",
  row_disposition_set: "Disposisi baris diperbarui",
  ready_for_review: "Ditandai siap untuk review",
  owner_approved_and_committed: "Disetujui Owner & dimasukkan ke kas/biaya operasional",
  owner_rejected: "Ditolak Owner, dikembalikan ke Admin",
  owner_rolled_back_import: "Dibatalkan Owner (rollback) — transaksi pembalik dibuat",
};

export function AuditTimeline({ events }: { events: CashImportEventRow[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-neutral-500">Belum ada aktivitas.</p>;
  }

  return (
    <ol className="flex flex-col gap-2">
      {events.map((event) => (
        <li key={event.id} className="rounded-md border border-neutral-200 p-2 text-xs dark:border-neutral-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{EVENT_LABEL[event.event_type] ?? event.event_type}</span>
            <span className="text-neutral-500">{new Date(event.created_at).toLocaleString("id-ID")}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
