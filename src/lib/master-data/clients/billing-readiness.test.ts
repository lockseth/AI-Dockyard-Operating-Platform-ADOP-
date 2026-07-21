import { describe, expect, it } from "vitest";
import { computeClientBillingReadiness } from "./billing-readiness";
import type { ClientRow } from "./repository";
import type { ClientContactRow } from "../client-contacts/repository";

function client(overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    id: "client-1",
    tenant_id: "tenant-1",
    client_code: null,
    display_name: "PT Contoh",
    legal_name: "PT Contoh Sejahtera",
    address: "Jl. Contoh No. 1",
    tax_identifier: null,
    default_payment_term_days: null,
    invoice_delivery_preference: null,
    status: "active",
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as ClientRow;
}

function contact(overrides: Partial<ClientContactRow> = {}): ClientContactRow {
  return {
    id: "contact-1",
    tenant_id: "tenant-1",
    client_id: "client-1",
    full_name: "Budi",
    position_department: null,
    email: "budi@contoh.co.id",
    whatsapp_number: null,
    is_primary: false,
    role: "billing",
    receives_invoice_whatsapp: false,
    receives_invoice_email: true,
    receives_collection_reminder: false,
    status: "active",
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as ClientContactRow;
}

describe("computeClientBillingReadiness", () => {
  it("is BLOCKED when the client is inactive, regardless of how complete its fields are", () => {
    const readiness = computeClientBillingReadiness(client({ status: "inactive" }), [contact()]);
    expect(readiness.status).toBe("BLOCKED");
  });

  it("is READY when legal name, address, and an active billing PIC with a valid channel are all present", () => {
    const readiness = computeClientBillingReadiness(client(), [contact()]);
    expect(readiness.status).toBe("READY");
    expect(readiness.missing).toEqual([]);
  });

  it("is INCOMPLETE and explains what's missing when legal_name is not set", () => {
    const readiness = computeClientBillingReadiness(client({ legal_name: null }), [contact()]);
    expect(readiness.status).toBe("INCOMPLETE");
    expect(readiness.missing).toContain("Nama legal client belum diisi.");
  });

  it("is INCOMPLETE and explains what's missing when address is not set", () => {
    const readiness = computeClientBillingReadiness(client({ address: null }), [contact()]);
    expect(readiness.status).toBe("INCOMPLETE");
    expect(readiness.missing).toContain("Alamat billing belum diisi.");
  });

  it("is INCOMPLETE when there is no active billing-role PIC", () => {
    const readiness = computeClientBillingReadiness(client(), [contact({ role: "operational" })]);
    expect(readiness.status).toBe("INCOMPLETE");
    expect(readiness.missing).toContain("Belum ada PIC billing aktif.");
  });

  it("is INCOMPLETE when the only billing PIC is inactive", () => {
    const readiness = computeClientBillingReadiness(client(), [contact({ status: "inactive" })]);
    expect(readiness.status).toBe("INCOMPLETE");
    expect(readiness.missing).toContain("Belum ada PIC billing aktif.");
  });

  it("is INCOMPLETE when the active billing PIC has no valid invoice channel", () => {
    const readiness = computeClientBillingReadiness(
      client(),
      [contact({ email: null, whatsapp_number: null, receives_invoice_email: false, receives_invoice_whatsapp: false })],
    );
    expect(readiness.status).toBe("INCOMPLETE");
    expect(readiness.missing).toContain("PIC billing aktif belum memiliki kanal invoice yang valid (WhatsApp/email).");
  });

  it("accepts a whatsapp_number as a valid channel even without the explicit receives_invoice_whatsapp flag", () => {
    const readiness = computeClientBillingReadiness(
      client(),
      [contact({ email: null, receives_invoice_email: false, whatsapp_number: "6281234567890" })],
    );
    expect(readiness.status).toBe("READY");
  });
});
