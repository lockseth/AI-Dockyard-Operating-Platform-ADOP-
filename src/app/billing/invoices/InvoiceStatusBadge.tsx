import { Badge } from "@/components/ui/Badge";
import {
  EVIDENCE_DOCUMENT_STATUS_LABEL_FINAL,
  EVIDENCE_DOCUMENT_STATUS_LABEL_NOT_UPLOADED,
  EVIDENCE_VERSION_STATUS_LABEL,
  EVIDENCE_VERSION_STATUS_TONE,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TONE,
} from "@/lib/invoice-evidence/labels";
import type { InvoiceEvidenceVersionStatus, InvoiceStatus } from "@/lib/invoice-evidence/types";

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge tone={INVOICE_STATUS_TONE[status]}>{INVOICE_STATUS_LABEL[status]}</Badge>;
}

// Distinguishes "no document at all" (neutral) from every real version
// status, and separately flags "current + verified" as the final signed
// document — Gate 4A Contract §5: pending/rejected stay visible, just not
// labeled final.
export function DocumentStatusBadge({
  currentVersionStatus,
  isFinalDocument,
}: {
  currentVersionStatus: InvoiceEvidenceVersionStatus | null;
  isFinalDocument: boolean | null;
}) {
  if (!currentVersionStatus) {
    return <Badge tone="neutral">{EVIDENCE_DOCUMENT_STATUS_LABEL_NOT_UPLOADED}</Badge>;
  }
  if (isFinalDocument) {
    return (
      <Badge tone="success" dot>
        {EVIDENCE_DOCUMENT_STATUS_LABEL_FINAL}
      </Badge>
    );
  }
  return <Badge tone={EVIDENCE_VERSION_STATUS_TONE[currentVersionStatus]}>{EVIDENCE_VERSION_STATUS_LABEL[currentVersionStatus]}</Badge>;
}
