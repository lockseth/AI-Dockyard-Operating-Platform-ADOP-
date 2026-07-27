"use client";

import { useActionState, useRef, useState } from "react";
import {
  finalizeInvoiceEvidenceVersionAction,
  rejectInvoiceEvidenceVersionAction,
  verifyInvoiceEvidenceVersionAction,
} from "@/lib/invoice-evidence/actions";
import { OpenDocumentButton } from "../OpenDocumentButton";
import type { InvoiceEvidenceActionResult } from "@/lib/invoice-evidence/service";
import {
  EVIDENCE_ALLOWED_MIME_TYPES,
  EVIDENCE_MAX_SIZE_BYTES,
  type EvidenceMimeType,
  type InvoiceEvidenceVersionRow,
  type InvoiceStatus,
} from "@/lib/invoice-evidence/types";
import { buildInvoiceEvidenceStoragePath } from "@/lib/invoice-evidence/storage-path";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { EVIDENCE_VERSION_STATUS_LABEL, EVIDENCE_VERSION_STATUS_TONE } from "@/lib/invoice-evidence/labels";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { FormError } from "@/components/master-data/FormError";

const initialActionState: InvoiceEvidenceActionResult = {};

function isAllowedMimeType(value: string): value is EvidenceMimeType {
  return (EVIDENCE_ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function EvidenceSection({
  invoiceId,
  tenantId,
  invoiceStatus,
  versions,
}: {
  invoiceId: string;
  tenantId: string;
  invoiceStatus: InvoiceStatus | null;
  versions: InvoiceEvidenceVersionRow[];
}) {
  const currentVersionId = versions[0]?.id ?? null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-neutral-500">Dokumen Evidence (Bertanda Tangan &amp; Cap)</h2>

      {versions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          Belum ada dokumen diunggah untuk invoice ini.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {versions.map((version) => (
            <VersionCard key={version.id} invoiceId={invoiceId} version={version} isCurrent={version.id === currentVersionId} />
          ))}
        </ul>
      )}

      {invoiceStatus === "issued" ? (
        <EvidenceUploadForm invoiceId={invoiceId} tenantId={tenantId} />
      ) : (
        <p className="text-xs text-neutral-500">
          Unggah dokumen hanya dapat dilakukan setelah invoice diterbitkan (issued).
        </p>
      )}
    </section>
  );
}

function VersionCard({
  invoiceId,
  version,
  isCurrent,
}: {
  invoiceId: string;
  version: InvoiceEvidenceVersionRow;
  isCurrent: boolean;
}) {
  const isFinal = isCurrent && version.status === "verified";

  return (
    <li className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Versi {version.version_number}</span>
          {isCurrent ? <Badge tone="info">Current</Badge> : null}
          {isFinal ? <Badge tone="success" dot>Dokumen Final Sah</Badge> : (
            <Badge tone={EVIDENCE_VERSION_STATUS_TONE[version.status]}>{EVIDENCE_VERSION_STATUS_LABEL[version.status]}</Badge>
          )}
        </div>
        <OpenDocumentButton versionId={version.id} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-neutral-500 sm:grid-cols-4">
        <div>
          <dt>Diunggah</dt>
          <dd className="font-mono text-neutral-700 dark:text-neutral-300">{new Date(version.uploaded_at).toLocaleString("id-ID")}</dd>
        </div>
        <div>
          <dt>Ukuran</dt>
          <dd className="text-neutral-700 dark:text-neutral-300">{(version.size_bytes / 1024).toFixed(0)} KB</dd>
        </div>
        <div>
          <dt>Tipe File</dt>
          <dd className="text-neutral-700 dark:text-neutral-300">{version.mime_type}</dd>
        </div>
        <div>
          <dt>SHA-256</dt>
          <dd className="truncate font-mono text-neutral-700 dark:text-neutral-300" title={version.sha256}>
            {version.sha256.slice(0, 12)}...
          </dd>
        </div>
      </dl>
      {version.status === "rejected" && version.rejected_reason ? (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          Alasan ditolak: {version.rejected_reason}
        </p>
      ) : null}
      {isCurrent && version.status === "pending" ? (
        <div className="mt-3">
          <VerifyRejectControls invoiceId={invoiceId} versionId={version.id} />
        </div>
      ) : null}
    </li>
  );
}

function VerifyRejectControls({ invoiceId, versionId }: { invoiceId: string; versionId: string }) {
  const [verifyState, verifyFormAction, isVerifying] = useActionState(verifyInvoiceEvidenceVersionAction, initialActionState);
  const [rejectState, rejectFormAction, isRejecting] = useActionState(rejectInvoiceEvidenceVersionAction, initialActionState);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={verifyFormAction}>
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <input type="hidden" name="versionId" value={versionId} />
          <Button type="submit" variant="primary" size="sm" loading={isVerifying} disabled={showRejectConfirm}>
            {isVerifying ? "Memverifikasi..." : "Verifikasi Dokumen"}
          </Button>
        </form>
        {!showRejectConfirm ? (
          <button
            type="button"
            onClick={() => setShowRejectConfirm(true)}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 dark:border-red-800 dark:text-red-300"
          >
            Tolak Dokumen
          </button>
        ) : null}
      </div>
      <FormError error={verifyState.error} />

      {showRejectConfirm ? (
        <Callout tone="danger" title="Konfirmasi Penolakan Dokumen" className="flex flex-col gap-2">
          <form action={rejectFormAction} className="flex flex-col gap-2">
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <input type="hidden" name="versionId" value={versionId} />
            <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
              Alasan penolakan (wajib diisi)
              <textarea
                name="reason"
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
                className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
              />
            </label>
            <FormError error={rejectState.error} />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isRejecting || reason.trim().length === 0}
                className="w-fit rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isRejecting ? "Memproses..." : "Konfirmasi Tolak"}
              </button>
              <button
                type="button"
                onClick={() => setShowRejectConfirm(false)}
                disabled={isRejecting}
                className="w-fit rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
              >
                Batal
              </button>
            </div>
          </form>
        </Callout>
      ) : null}
    </div>
  );
}

// Uploads directly to Supabase Storage's private `invoice-evidence` bucket
// from the browser (RLS-gated — Gate 4A Contract §5 "server-authorized
// access", satisfied here by the storage policy re-checking tenant+role+
// issued-invoice on every INSERT, not by routing bytes through a server
// action), then hands only the resulting path/hash/size/mime — never the
// file itself — to finalizeInvoiceEvidenceVersionAction.
function EvidenceUploadForm({ invoiceId, tenantId }: { invoiceId: string; tenantId: string }) {
  // Selection is tracked in state (not just read off the ref at submit time)
  // so the button's enabled/disabled state and the "file dipilih"/"pilih
  // file dulu" hint can react the instant the user picks or clears a file —
  // not only once they attempt to submit.
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setNotice(undefined);

    if (!file) {
      setSelectedFile(null);
      setError(undefined);
      return;
    }
    if (!isAllowedMimeType(file.type)) {
      setSelectedFile(null);
      setError("Format file tidak didukung — gunakan PDF, JPEG, atau PNG.");
      return;
    }
    if (file.size > EVIDENCE_MAX_SIZE_BYTES || file.size === 0) {
      setSelectedFile(null);
      setError("Ukuran file harus antara 1 byte hingga 50MB.");
      return;
    }
    setSelectedFile(file);
    setError(undefined);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isUploading) {
      return; // guards against a double submit racing in before the button re-renders disabled
    }
    const file = selectedFile;
    if (!file) {
      setError("Pilih file terlebih dahulu.");
      return;
    }
    // Defense in depth — re-validates the exact bytes about to be uploaded
    // rather than trusting state set by an earlier, possibly stale, change event.
    if (!isAllowedMimeType(file.type)) {
      setError("Format file tidak didukung — gunakan PDF, JPEG, atau PNG.");
      return;
    }
    if (file.size > EVIDENCE_MAX_SIZE_BYTES || file.size === 0) {
      setError("Ukuran file harus antara 1 byte hingga 50MB.");
      return;
    }

    setIsUploading(true);
    setError(undefined);
    setNotice(undefined);

    try {
      const sha256 = await sha256Hex(file);
      const storagePath = buildInvoiceEvidenceStoragePath(tenantId, invoiceId, file.name);
      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from("invoice-evidence")
        .upload(storagePath, file, { contentType: file.type });

      if (uploadError) {
        setError("Gagal mengunggah file ke storage. Silakan coba lagi.");
        return;
      }

      const result = await finalizeInvoiceEvidenceVersionAction({
        invoiceId,
        storagePath,
        sha256,
        sizeBytes: file.size,
        mimeType: file.type,
      });

      if (result.error) {
        // The object above is now an orphan in private storage — it can
        // never be overwritten/deleted/read by anyone (Gate 4B's storage
        // policies grant no UPDATE/DELETE at all, and SELECT only matches a
        // registered invoice_evidence_versions row), so it is inert and
        // harmless; documented limitation per task instruction E, not a
        // silent inconsistency.
        setError(result.error);
        return;
      }

      // finalizeInvoiceEvidenceVersionForActiveTenant always inserts the new
      // version as status "pending" (Gate 4B) — this UI never marks it
      // verified/final itself, that stays VerifyRejectControls' job.
      if (result.alreadyCurrent) {
        setNotice("Konten file identik dengan versi saat ini — tidak dibuat versi baru.");
      } else {
        setNotice("Dokumen berhasil diunggah sebagai versi baru. Menunggu verifikasi.");
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setSelectedFile(null);
    } finally {
      setIsUploading(false);
    }
  }

  const canSubmit = selectedFile !== null && !isUploading;

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Unggah Dokumen Bertanda Tangan &amp; Cap
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          disabled={isUploading}
          onChange={handleFileChange}
          className="text-sm"
        />
      </label>
      <Button type="submit" loading={isUploading} disabled={!canSubmit}>
        {isUploading ? "Mengunggah..." : "Unggah Versi Baru"}
      </Button>
      <div className="flex flex-col gap-1">
        {!error && !selectedFile ? (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Pilih file terlebih dahulu.</p>
        ) : null}
        {!error && selectedFile ? (
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            File dipilih: <span className="font-medium">{selectedFile.name}</span> (
            {(selectedFile.size / 1024).toFixed(0)} KB)
          </p>
        ) : null}
        <FormError error={error} />
        {notice ? <p className="text-xs text-emerald-700 dark:text-emerald-400">{notice}</p> : null}
      </div>
    </form>
  );
}
