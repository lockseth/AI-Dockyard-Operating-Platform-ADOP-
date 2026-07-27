import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
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
  rejectInvoiceEvidenceVersion,
  reissueInvoice,
  unbindInvoiceTransaction,
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
} from "./types";
import {
  bindInvoiceTransactionInputSchema,
  finalizeInvoiceEvidenceVersionInputSchema,
  getInvoiceEvidenceSignedUrlInputSchema,
  issueInvoiceInputSchema,
  reissueInvoiceInputSchema,
  rejectInvoiceEvidenceVersionInputSchema,
  unbindInvoiceTransactionInputSchema,
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

export interface CreateDraftInvoiceResult extends InvoiceEvidenceActionResult {
  invoiceId?: string;
}

export async function createDraftInvoiceForActiveTenant(): Promise<CreateDraftInvoiceResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await createDraftInvoice(context.tenantId);
  if (error || !data) {
    return { error: mapInvoiceEvidenceError(error) };
  }
  return { invoiceId: data.id };
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
