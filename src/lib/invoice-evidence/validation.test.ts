import { describe, expect, it } from "vitest";
import {
  finalizeInvoiceEvidenceVersionInputSchema,
  rejectInvoiceEvidenceVersionInputSchema,
  updateInvoiceBillingMetadataInputSchema,
  voidInvoiceInputSchema,
} from "./validation";
import { EVIDENCE_MAX_SIZE_BYTES } from "./types";

const VALID_INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const VALID_HASH = "a".repeat(64);

describe("finalizeInvoiceEvidenceVersionInputSchema", () => {
  const base = {
    invoiceId: VALID_INVOICE_ID,
    storagePath: `${VALID_INVOICE_ID}/${VALID_INVOICE_ID}/file.pdf`,
    sha256: VALID_HASH,
    sizeBytes: 1024,
    mimeType: "application/pdf",
  };

  it("accepts a valid PDF payload", () => {
    expect(finalizeInvoiceEvidenceVersionInputSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an unsupported mime type — client-side mirror of F6/bucket allowed_mime_types", () => {
    const result = finalizeInvoiceEvidenceVersionInputSchema.safeParse({ ...base, mimeType: "text/plain" });
    expect(result.success).toBe(false);
  });

  it("rejects a sha256 that is not 64 lowercase hex characters", () => {
    expect(finalizeInvoiceEvidenceVersionInputSchema.safeParse({ ...base, sha256: "not-a-hash" }).success).toBe(false);
    expect(finalizeInvoiceEvidenceVersionInputSchema.safeParse({ ...base, sha256: "A".repeat(64) }).success).toBe(false);
  });

  it("rejects size_bytes over the 50MiB bucket limit", () => {
    const result = finalizeInvoiceEvidenceVersionInputSchema.safeParse({
      ...base,
      sizeBytes: EVIDENCE_MAX_SIZE_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a zero or negative size_bytes", () => {
    expect(finalizeInvoiceEvidenceVersionInputSchema.safeParse({ ...base, sizeBytes: 0 }).success).toBe(false);
    expect(finalizeInvoiceEvidenceVersionInputSchema.safeParse({ ...base, sizeBytes: -5 }).success).toBe(false);
  });

  it("accepts the exact boundary size_bytes", () => {
    expect(
      finalizeInvoiceEvidenceVersionInputSchema.safeParse({ ...base, sizeBytes: EVIDENCE_MAX_SIZE_BYTES }).success,
    ).toBe(true);
  });
});

describe("voidInvoiceInputSchema", () => {
  it("requires a non-empty reason", () => {
    expect(voidInvoiceInputSchema.safeParse({ invoiceId: VALID_INVOICE_ID, reason: "" }).success).toBe(false);
    expect(voidInvoiceInputSchema.safeParse({ invoiceId: VALID_INVOICE_ID, reason: "   " }).success).toBe(false);
  });

  it("accepts a real reason", () => {
    expect(
      voidInvoiceInputSchema.safeParse({ invoiceId: VALID_INVOICE_ID, reason: "salah nominal" }).success,
    ).toBe(true);
  });
});

describe("rejectInvoiceEvidenceVersionInputSchema", () => {
  it("requires a non-empty reason", () => {
    expect(
      rejectInvoiceEvidenceVersionInputSchema.safeParse({ versionId: VALID_INVOICE_ID, reason: "" }).success,
    ).toBe(false);
  });
});

describe("updateInvoiceBillingMetadataInputSchema — Gate 4E", () => {
  const VALID_LEGAL_ENTITY_ID = "22222222-2222-4222-8222-222222222222";
  const base = {
    invoiceId: VALID_INVOICE_ID,
    legalEntityId: VALID_LEGAL_ENTITY_ID,
    invoiceNumber: "INV-2029-001",
    invoiceDate: "2029-01-01",
    dueDate: "2029-01-31",
  };

  it("accepts a complete, valid payload", () => {
    expect(updateInvoiceBillingMetadataInputSchema.safeParse(base).success).toBe(true);
  });

  it("accepts due_date equal to invoice_date (boundary, not strictly after)", () => {
    expect(
      updateInvoiceBillingMetadataInputSchema.safeParse({ ...base, dueDate: base.invoiceDate }).success,
    ).toBe(true);
  });

  it("rejects due_date before invoice_date with a field-attributed error", () => {
    const result = updateInvoiceBillingMetadataInputSchema.safeParse({ ...base, dueDate: "2028-12-31" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.dueDate).toBeTruthy();
    }
  });

  it("rejects a blank invoice number", () => {
    expect(updateInvoiceBillingMetadataInputSchema.safeParse({ ...base, invoiceNumber: "   " }).success).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(updateInvoiceBillingMetadataInputSchema.safeParse({ ...base, invoiceDate: "01/01/2029" }).success).toBe(false);
  });

  it("rejects a non-uuid legal entity id", () => {
    expect(updateInvoiceBillingMetadataInputSchema.safeParse({ ...base, legalEntityId: "not-a-uuid" }).success).toBe(false);
  });
});
