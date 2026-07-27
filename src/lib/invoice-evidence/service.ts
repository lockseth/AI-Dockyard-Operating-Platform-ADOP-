import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { listClients } from "@/lib/master-data/clients/repository";
import { listVessels } from "@/lib/master-data/vessels/repository";
import { listVesselProjects } from "@/lib/vessel-projects/repository";
import { buildInvoiceCostRecapRows, type InvoiceCostRecap } from "./cost-recap";
import { mapInvoiceEvidenceError } from "./errors";
import {
  bindInvoiceTransaction,
  createDraftInvoice,
  finalizeInvoiceEvidenceVersion,
  createInvoiceEvidenceSignedUrl,
  getCurrentInvoiceEvidenceVersion,
  getInvoiceSummary,
  issueInvoice,
  listInvoiceEligibleTransactions,
  listInvoiceEvidenceVersions,
  listInvoiceTransactionLines,
  listInvoices,
  listTransactionInvoiceBindings,
  listUnbilledVesselProjects,
  registerInvoiceNumber,
  rejectInvoiceEvidenceVersion,
  reissueInvoice,
  unbindInvoiceTransaction,
  updateInvoiceBillingMetadata,
  verifyInvoiceEvidenceVersion,
  voidInvoice,
} from "./repository";
import type {
  InvoiceBillingSummaryRow,
  InvoiceEligibleTransactionRow,
  InvoiceEvidenceVersionRow,
  InvoiceStatus,
  InvoiceTransactionLineRow,
  TransactionInvoiceBindingRow,
  UnbilledVesselProjectRow,
} from "./types";
import {
  bindInvoiceTransactionInputSchema,
  createDraftInvoiceInputSchema,
  finalizeInvoiceEvidenceVersionInputSchema,
  getInvoiceEvidenceSignedUrlInputSchema,
  issueInvoiceInputSchema,
  reissueInvoiceInputSchema,
  rejectInvoiceEvidenceVersionInputSchema,
  unbindInvoiceTransactionInputSchema,
  updateInvoiceBillingMetadataInputSchema,
  verifyInvoiceEvidenceVersionInputSchema,
  voidInvoiceInputSchema,
} from "./validation";

export interface InvoiceEvidenceActionResult {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export interface InvoiceDetail {
  invoice: InvoiceBillingSummaryRow;
  lines: InvoiceTransactionLineRow[];
  versions: InvoiceEvidenceVersionRow[];
}

const INVOICE_NOT_FOUND_MESSAGES = ["invoice not found", "not authorized to view invoices"];

export async function listInvoicesForActiveTenant(status?: InvoiceStatus): Promise<InvoiceBillingSummaryRow[]> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);
  return listInvoices(context.tenantId, status);
}

// Not-found and cross-tenant-unauthorized both surface as `null` here (the
// RPC itself already distinguishes them by message, but the UI only ever
// needs to render notFound() either way — this does not introduce a new
// leak, get_invoice_summary's own error messages already differ per case).
export async function getInvoiceDetailForActiveTenant(invoiceId: string): Promise<InvoiceDetail | null> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data: invoice, error } = await getInvoiceSummary(invoiceId);
  if (error) {
    if (INVOICE_NOT_FOUND_MESSAGES.some((message) => error.message?.includes(message))) {
      return null;
    }
    throw error;
  }
  if (!invoice || !invoice.id) {
    return null;
  }

  const [lines, versions] = await Promise.all([
    listInvoiceTransactionLines(context.tenantId, invoiceId),
    listInvoiceEvidenceVersions(context.tenantId, invoiceId),
  ]);

  return { invoice, lines, versions };
}

// Read-only composition over already-authorized reads (get_invoice_summary,
// invoice_transaction_lines, and the same master-data tables the vessel
// project picker already reads) — no new RPC/RLS surface, no writes. Powers
// the "export cost recap XLSX" step of PRD.md §7.12's locked workflow; see
// cost-recap.ts for why this is a working recap, not the final invoice.
export async function getInvoiceCostRecapForActiveTenant(invoiceId: string): Promise<InvoiceCostRecap | null> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data: invoice, error } = await getInvoiceSummary(invoiceId);
  if (error) {
    if (INVOICE_NOT_FOUND_MESSAGES.some((message) => error.message?.includes(message))) {
      return null;
    }
    throw error;
  }
  if (!invoice || !invoice.id) {
    return null;
  }

  const [lines, projects, vessels, clients] = await Promise.all([
    listInvoiceTransactionLines(context.tenantId, invoiceId),
    listVesselProjects(context.tenantId),
    listVessels(context.tenantId),
    listClients(context.tenantId),
  ]);

  return {
    invoice,
    tenantDisplayName: context.tenantDisplayName,
    rows: buildInvoiceCostRecapRows(lines, projects, vessels, clients),
  };
}

export async function listInvoiceEligibleTransactionsForActiveTenant(projectId?: string): Promise<InvoiceEligibleTransactionRow[]> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);
  return listInvoiceEligibleTransactions(context.tenantId, projectId);
}

export async function listTransactionInvoiceBindingsForActiveTenant(transactionEntryId: string): Promise<TransactionInvoiceBindingRow[]> {
  const context = await requireTenantContext();
  if (!context.roles.some((role) => role === "owner" || role === "admin")) {
    return [];
  }
  return listTransactionInvoiceBindings(context.tenantId, transactionEntryId);
}

// Phase 2A Contract §13 — Unbilled Vessel Alert. Same owner/admin gate as
// every other invoice read; the RPC itself re-checks role independently.
export async function listUnbilledVesselProjectsForActiveTenant(): Promise<UnbilledVesselProjectRow[]> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);
  return listUnbilledVesselProjects(context.tenantId);
}

export interface CreateDraftInvoiceResult extends InvoiceEvidenceActionResult {
  invoiceId?: string;
}

// Phase 2A Contract §5.1: project_id must be chosen explicitly by the admin
// when a Billing Record is created — never inferred later from whichever
// transaction happens to be bound first.
export async function createDraftInvoiceForActiveTenant(rawInput: unknown): Promise<CreateDraftInvoiceResult> {
  const parsed = createDraftInvoiceInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await createDraftInvoice(context.tenantId, parsed.data.projectId);
  if (error || !data) {
    return { error: mapInvoiceEvidenceError(error) };
  }
  return { invoiceId: data.id };
}

export interface BillableProjectOption {
  id: string;
  label: string;
}

// Backs the project picker on "Buat Draft Invoice" — closed Project Kapal
// only (Contract §8.2 eligibility), the same closed-project source
// invoice_eligible_transactions already restricts to.
export async function listBillableClosedProjectsForActiveTenant(): Promise<BillableProjectOption[]> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const [projects, vessels] = await Promise.all([
    listVesselProjects(context.tenantId),
    listVessels(context.tenantId),
  ]);
  const vesselNameById = new Map(vessels.map((vessel) => [vessel.id, vessel.vessel_name]));

  return projects
    .filter((project) => project.lifecycle_status === "closed")
    .map((project) => ({
      id: project.id,
      label: [vesselNameById.get(project.vessel_id) ?? "Kapal tidak dikenal", project.project_code]
        .filter(Boolean)
        .join(" — "),
    }));
}

export async function bindInvoiceTransactionForActiveTenant(rawInput: unknown): Promise<InvoiceEvidenceActionResult> {
  const parsed = bindInvoiceTransactionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { error } = await bindInvoiceTransaction(parsed.data.invoiceId, parsed.data.transactionEntryId);
  if (error) {
    return { error: mapInvoiceEvidenceError(error) };
  }
  return {};
}

export async function unbindInvoiceTransactionForActiveTenant(rawInput: unknown): Promise<InvoiceEvidenceActionResult> {
  const parsed = unbindInvoiceTransactionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { error } = await unbindInvoiceTransaction(parsed.data.lineId);
  if (error) {
    return { error: mapInvoiceEvidenceError(error) };
  }
  return {};
}

export async function issueInvoiceForActiveTenant(rawInput: unknown): Promise<InvoiceEvidenceActionResult> {
  const parsed = issueInvoiceInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { error } = await issueInvoice(parsed.data.invoiceId);
  if (error) {
    return { error: mapInvoiceEvidenceError(error) };
  }
  return {};
}

export async function voidInvoiceForActiveTenant(rawInput: unknown): Promise<InvoiceEvidenceActionResult> {
  const parsed = voidInvoiceInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { error } = await voidInvoice(parsed.data.invoiceId, parsed.data.reason);
  if (error) {
    return { error: mapInvoiceEvidenceError(error) };
  }
  return {};
}

export interface ReissueInvoiceResult extends InvoiceEvidenceActionResult {
  invoiceId?: string;
}

export async function reissueInvoiceForActiveTenant(rawInput: unknown): Promise<ReissueInvoiceResult> {
  const parsed = reissueInvoiceInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await reissueInvoice(parsed.data.predecessorInvoiceId);
  if (error || !data) {
    return { error: mapInvoiceEvidenceError(error) };
  }
  return { invoiceId: data.id };
}

// Phase 2A Contract §6.1/§7/§10.2 (Gate 4E) — a single form submit closes
// the golden path's metadata step, but it still maps to the two separately
// audited RPCs (invoice.metadata_updated vs invoice.number_registered): the
// legal_entity_id/date pair is written first, then the number. If the
// number registration fails (e.g. duplicate for this legal entity) the
// already-written legal_entity_id/dates are not rolled back — the invoice
// is still `draft`, so the admin corrects the number and resubmits the same
// form; nothing is lost.
export async function updateInvoiceBillingMetadataForActiveTenant(rawInput: unknown): Promise<InvoiceEvidenceActionResult> {
  const parsed = updateInvoiceBillingMetadataInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { error: metadataError } = await updateInvoiceBillingMetadata({
    invoiceId: parsed.data.invoiceId,
    legalEntityId: parsed.data.legalEntityId,
    invoiceDate: parsed.data.invoiceDate,
    dueDate: parsed.data.dueDate,
  });
  if (metadataError) {
    return { error: mapInvoiceEvidenceError(metadataError) };
  }

  const { error: numberError } = await registerInvoiceNumber(parsed.data.invoiceId, parsed.data.invoiceNumber);
  if (numberError) {
    return { error: mapInvoiceEvidenceError(numberError) };
  }

  return {};
}

export interface FinalizeEvidenceResult extends InvoiceEvidenceActionResult {
  versionId?: string;
  alreadyCurrent?: boolean;
}

// E-10 idempotency: if the caller's freshly-uploaded content hashes
// identically to the invoice's CURRENT evidence version, this is a resubmit
// of unchanged content (double submit, retried timeout, etc.) — return the
// existing version instead of asking Gate 4B's RPC to mint a new one. Any
// other sha256 (a genuinely new document) always proceeds to finalize.
export async function finalizeInvoiceEvidenceVersionForActiveTenant(rawInput: unknown): Promise<FinalizeEvidenceResult> {
  const parsed = finalizeInvoiceEvidenceVersionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const current = await getCurrentInvoiceEvidenceVersion(context.tenantId, parsed.data.invoiceId);
  if (current && current.sha256 === parsed.data.sha256) {
    return { versionId: current.id, alreadyCurrent: true };
  }

  const { data, error } = await finalizeInvoiceEvidenceVersion(parsed.data);
  if (error || !data) {
    return { error: mapInvoiceEvidenceError(error) };
  }
  return { versionId: data.id };
}

export async function verifyInvoiceEvidenceVersionForActiveTenant(rawInput: unknown): Promise<InvoiceEvidenceActionResult> {
  const parsed = verifyInvoiceEvidenceVersionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { error } = await verifyInvoiceEvidenceVersion(parsed.data.versionId);
  if (error) {
    return { error: mapInvoiceEvidenceError(error) };
  }
  return {};
}

export async function rejectInvoiceEvidenceVersionForActiveTenant(rawInput: unknown): Promise<InvoiceEvidenceActionResult> {
  const parsed = rejectInvoiceEvidenceVersionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { error } = await rejectInvoiceEvidenceVersion(parsed.data.versionId, parsed.data.reason);
  if (error) {
    return { error: mapInvoiceEvidenceError(error) };
  }
  return {};
}

export interface SignedUrlResult extends InvoiceEvidenceActionResult {
  url?: string;
}

export async function getInvoiceEvidenceSignedUrlForActiveTenant(
  rawInput: unknown,
  ttlSeconds: number,
): Promise<SignedUrlResult> {
  const parsed = getInvoiceEvidenceSignedUrlInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await createInvoiceEvidenceSignedUrl(parsed.data.versionId, ttlSeconds);
  if (error || !data?.signedUrl) {
    return { error: "Gagal membuka dokumen. Silakan coba lagi." };
  }
  return { url: data.signedUrl };
}
