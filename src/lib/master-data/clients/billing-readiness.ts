import type { ClientRow } from "./repository";
import type { ClientContactRow } from "../client-contacts/repository";

export type BillingReadinessStatus = "READY" | "INCOMPLETE" | "BLOCKED";

export interface BillingReadiness {
  status: BillingReadinessStatus;
  missing: string[];
}

function hasValidInvoiceChannel(contact: ClientContactRow): boolean {
  return (
    contact.receives_invoice_whatsapp ||
    contact.receives_invoice_email ||
    Boolean(contact.whatsapp_number) ||
    Boolean(contact.email)
  );
}

// Pure — every input is already-loaded rows, nothing here queries or
// mutates. BLOCKED is checked first and short-circuits everything else: an
// inactive client is never "READY" or "INCOMPLETE" regardless of how
// complete its billing fields are (LOCK F.5 lists READY/INCOMPLETE/BLOCKED
// as mutually exclusive, and an inactive client cannot legitimately be
// billed at all).
export function computeClientBillingReadiness(client: ClientRow, contacts: ClientContactRow[]): BillingReadiness {
  if (client.status === "inactive") {
    return { status: "BLOCKED", missing: ["Client berstatus nonaktif."] };
  }

  const missing: string[] = [];

  if (!client.legal_name) {
    missing.push("Nama legal client belum diisi.");
  }
  if (!client.address) {
    missing.push("Alamat billing belum diisi.");
  }

  const activeBillingContacts = contacts.filter(
    (contact) => contact.status === "active" && contact.role === "billing",
  );
  if (activeBillingContacts.length === 0) {
    missing.push("Belum ada PIC billing aktif.");
  } else if (!activeBillingContacts.some(hasValidInvoiceChannel)) {
    missing.push("PIC billing aktif belum memiliki kanal invoice yang valid (WhatsApp/email).");
  }

  return { status: missing.length === 0 ? "READY" : "INCOMPLETE", missing };
}
