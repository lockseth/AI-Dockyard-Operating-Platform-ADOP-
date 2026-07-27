"use client";

import { useActionState, useState } from "react";
import { recordInvoiceAcknowledgmentAction, recordInvoiceDeliveryAction } from "@/lib/invoice-delivery/actions";
import type { InvoiceDeliveryActionResult } from "@/lib/invoice-delivery/service";
import {
  INVOICE_DELIVERY_EVENT_CHANNELS,
  INVOICE_DELIVERY_SEND_EVENT_TYPES,
  type InvoiceDeliveryEventRow,
} from "@/lib/invoice-delivery/types";
import { DELIVERY_CHANNEL_LABEL, DELIVERY_EVENT_TYPE_LABEL, DELIVERY_EVENT_TYPE_TONE } from "@/lib/invoice-delivery/labels";
import type { InvoiceStatus } from "@/lib/invoice-evidence/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { FieldError, FormError } from "@/components/master-data/FormError";

const initialState: InvoiceDeliveryActionResult = {};

export function DeliverySection({
  invoiceId,
  invoiceStatus,
  events,
  loadError,
}: {
  invoiceId: string;
  invoiceStatus: InvoiceStatus | null;
  events: InvoiceDeliveryEventRow[];
  loadError?: boolean;
}) {
  const latest = events[0] ?? null;
  const hasSentOrDelivered = events.some((event) => event.event_type === "sent" || event.event_type === "delivered");
  const isAcknowledged = latest?.event_type === "acknowledged";
  const canRecordDelivery = invoiceStatus === "issued" && !isAcknowledged;
  const canRecordAcknowledgment = invoiceStatus === "issued" && hasSentOrDelivered && !isAcknowledged;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-neutral-500">Pengiriman &amp; Pengakuan Invoice</h2>

      {loadError ? (
        <Callout tone="danger" role="alert" className="text-sm">
          Gagal memuat riwayat pengiriman invoice ini. Silakan muat ulang halaman.
        </Callout>
      ) : (
        <>
          {latest ? (
            <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-neutral-500">Status Terbaru:</span>
                <Badge tone={DELIVERY_EVENT_TYPE_TONE[latest.event_type]}>{DELIVERY_EVENT_TYPE_LABEL[latest.event_type]}</Badge>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-500 sm:grid-cols-4">
                <div>
                  <dt>Kanal</dt>
                  <dd className="text-neutral-700 dark:text-neutral-300">{DELIVERY_CHANNEL_LABEL[latest.channel]}</dd>
                </div>
                <div>
                  <dt>Penerima</dt>
                  <dd className="text-neutral-700 dark:text-neutral-300">{latest.recipient_snapshot}</dd>
                </div>
                <div>
                  <dt>Waktu</dt>
                  <dd className="text-neutral-700 dark:text-neutral-300">{new Date(latest.created_at).toLocaleString("id-ID")}</dd>
                </div>
                <div>
                  <dt>Dicatat Oleh (User ID)</dt>
                  <dd className="truncate font-mono text-neutral-700 dark:text-neutral-300" title={latest.recorded_by ?? undefined}>
                    {latest.recorded_by ?? "-"}
                  </dd>
                </div>
              </dl>
              {latest.event_type === "failed" && latest.failure_reason ? (
                <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  Alasan gagal: {latest.failure_reason}
                </p>
              ) : null}
              {latest.event_type === "acknowledged" && latest.acknowledgment_note ? (
                <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                  Catatan penerimaan: {latest.acknowledgment_note}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
              Belum ada pengiriman yang tercatat untuk invoice ini.
            </div>
          )}

          {invoiceStatus === "issued" ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <RecordDeliveryForm invoiceId={invoiceId} disabled={!canRecordDelivery} />
              <RecordAcknowledgmentForm invoiceId={invoiceId} disabled={!canRecordAcknowledgment} />
            </div>
          ) : (
            <p className="text-xs text-neutral-500">
              Pengiriman hanya dapat dicatat setelah invoice diterbitkan (issued).
            </p>
          )}

          {isAcknowledged ? (
            <p className="text-xs text-neutral-500">
              Invoice ini sudah tercatat diterima — tidak ada aksi pengiriman/penerimaan lanjutan yang dapat dicatat.
            </p>
          ) : null}

          {events.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-neutral-500">Riwayat Pengiriman</h3>
              <ul className="flex flex-col gap-2">
                {events.map((event) => (
                  <li
                    key={event.id}
                    className="rounded-md border border-neutral-200 p-3 text-xs dark:border-neutral-800"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={DELIVERY_EVENT_TYPE_TONE[event.event_type]}>{DELIVERY_EVENT_TYPE_LABEL[event.event_type]}</Badge>
                      <span className="text-neutral-500">{DELIVERY_CHANNEL_LABEL[event.channel]}</span>
                      <span className="text-neutral-500">&middot;</span>
                      <span className="text-neutral-500">{new Date(event.created_at).toLocaleString("id-ID")}</span>
                    </div>
                    <p className="mt-1 text-neutral-700 dark:text-neutral-300">Penerima: {event.recipient_snapshot}</p>
                    {event.failure_reason ? <p className="mt-1 text-red-700 dark:text-red-400">Alasan gagal: {event.failure_reason}</p> : null}
                    {event.acknowledgment_note ? (
                      <p className="mt-1 text-emerald-700 dark:text-emerald-400">Catatan: {event.acknowledgment_note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function RecordDeliveryForm({ invoiceId, disabled }: { invoiceId: string; disabled: boolean }) {
  const [state, formAction, isPending] = useActionState(recordInvoiceDeliveryAction, initialState);
  const [eventType, setEventType] = useState<(typeof INVOICE_DELIVERY_SEND_EVENT_TYPES)[number]>("sent");

  if (disabled) {
    return null;
  }

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-sm font-medium">Catat Pengiriman</h3>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
        Kanal
        <select name="channel" required className="rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700">
          {INVOICE_DELIVERY_EVENT_CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {DELIVERY_CHANNEL_LABEL[channel]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
        Status
        <select
          name="eventType"
          required
          value={eventType}
          onChange={(event) => setEventType(event.target.value as (typeof INVOICE_DELIVERY_SEND_EVENT_TYPES)[number])}
          className="rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
        >
          {INVOICE_DELIVERY_SEND_EVENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {DELIVERY_EVENT_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
        Penerima
        <input
          type="text"
          name="recipientSnapshot"
          required
          maxLength={300}
          placeholder="mis. nama PIC / email / nomor WhatsApp"
          className="rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
        />
      </label>
      <FieldError messages={state.fieldErrors?.recipientSnapshot} />
      <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
        Referensi Provider (opsional)
        <input
          type="text"
          name="providerReference"
          maxLength={200}
          className="rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
        />
      </label>
      {eventType === "failed" ? (
        <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
          Alasan Gagal (wajib)
          <textarea
            name="failureReason"
            required
            rows={2}
            className="rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
          />
        </label>
      ) : null}
      <FieldError messages={state.fieldErrors?.failureReason} />
      <FormError error={state.error} />
      <Button type="submit" size="sm" loading={isPending}>
        {isPending ? "Menyimpan..." : "Catat Pengiriman"}
      </Button>
    </form>
  );
}

function RecordAcknowledgmentForm({ invoiceId, disabled }: { invoiceId: string; disabled: boolean }) {
  const [state, formAction, isPending] = useActionState(recordInvoiceAcknowledgmentAction, initialState);

  if (disabled) {
    return null;
  }

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-sm font-medium">Catat Diterima</h3>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
        Kanal
        <select name="channel" required className="rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700">
          {INVOICE_DELIVERY_EVENT_CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {DELIVERY_CHANNEL_LABEL[channel]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
        Penerima
        <input
          type="text"
          name="recipientSnapshot"
          required
          maxLength={300}
          placeholder="mis. nama PIC / email / nomor WhatsApp"
          className="rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
        />
      </label>
      <FieldError messages={state.fieldErrors?.recipientSnapshot} />
      <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
        Catatan Penerimaan (opsional)
        <textarea
          name="acknowledgmentNote"
          rows={2}
          className="rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
        />
      </label>
      <FormError error={state.error} />
      <Button type="submit" variant="brand" size="sm" loading={isPending}>
        {isPending ? "Menyimpan..." : "Catat Diterima"}
      </Button>
    </form>
  );
}
