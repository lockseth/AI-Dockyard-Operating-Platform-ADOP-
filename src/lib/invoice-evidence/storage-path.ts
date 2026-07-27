// No "server-only" import — used from the browser (EvidenceUploadForm,
// before it calls supabase.storage directly) as well as the server. The
// storage INSERT policy in 20260723000000_invoice_evidence_documents.sql
// only requires segments 1/2 to be real uuids for a real, issued, same-
// tenant invoice; the filename segment just needs to be unique per upload
// attempt so two concurrent uploads never collide on the same object key.
export function buildInvoiceEvidenceStoragePath(tenantId: string, invoiceId: string, fileName: string): string {
  const extension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : "";
  return `${tenantId}/${invoiceId}/${crypto.randomUUID()}${extension}`;
}
