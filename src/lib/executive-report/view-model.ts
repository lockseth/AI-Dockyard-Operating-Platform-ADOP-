import type { TenantRole } from "@/lib/auth/tenant";
import type { BillingWorkspaceRow } from "@/lib/billing-workspace/types";
import type { InvoiceDeliveryEventRow } from "@/lib/invoice-delivery/types";
import { buildActiveProjectCostRows, buildUnbilledVesselIndicator } from "@/lib/owner-control/view-model";
import type { VesselRow } from "@/lib/master-data/vessels/repository";
import type { VesselProjectCostSummaryRow, VesselProjectRow } from "@/lib/vessel-projects/repository";
import type { ExecutiveAttentionBreakdown, ExecutiveAttentionItem, ExecutiveAttentionTag, ExecutiveReportSummary } from "./types";

// Founder UAT follow-up (severity map, round 3) — explicit, five-level
// business-risk ranking, one distinct level per tag, Founder-corrected order
// (round 2 had UNBILLED above DELIVERY_FAILED; Founder flipped it: an
// active, in-flight failure outranks a project that simply hasn't started
// billing yet). Deliberately NOT derived from labels.ts's
// EXECUTIVE_ATTENTION_TAG_TONE (a 3-value color scale for the badge/strip,
// presentation-only) — coupling domain ordering to a UI tone would let a
// future palette change silently reorder business data, and a 3-tier scale
// can't express 5 distinct ranks anyway. Order, most to least severe:
//   0 DELIVERY_FAILED    — invoice issued, a send attempt actively failed;
//                          broken and needs an operational retry now.
//   1 UNBILLED           — closed project, no invoice exists at all; revenue
//                          not yet captured, nothing in flight to fix it.
//   2 NOT_DELIVERED      — invoice issued and finalized but never sent; nothing
//                          blocks it, it is simply sitting idle.
//   3 DRAFT_INCOMPLETE   — invoice not yet finalized (missing required
//                          data/evidence); earliest pipeline stage, no
//                          receivable clock has started yet.
//   4 NOT_ACKNOWLEDGED   — sent/delivered and progressing normally, waiting
//                          on the client; expected pipeline state, not a stall.
const ATTENTION_TAG_SEVERITY: Record<ExecutiveAttentionTag, number> = {
  DELIVERY_FAILED: 0,
  UNBILLED: 1,
  NOT_DELIVERED: 2,
  DRAFT_INCOMPLETE: 3,
  NOT_ACKNOWLEDGED: 4,
};

// A project's rank is its single most-severe tag (lowest number wins) — a
// project carrying both NOT_DELIVERED and NOT_ACKNOWLEDGED ranks as
// NOT_DELIVERED, not by whichever tag was pushed first.
function attentionSeverityRank(tags: ExecutiveAttentionTag[]): number {
  return Math.min(...tags.map((tag) => ATTENTION_TAG_SEVERITY[tag]));
}

function projectLabel(row: BillingWorkspaceRow): string {
  return row.projectCode ? `${row.vesselName} — ${row.projectCode}` : row.vesselName;
}

// Prefers the invoice detail page (where DeliverySection lives) whenever an
// active invoice exists — draft or issued — and falls back to the
// project's own Billing Workspace record when there is no invoice at all
// (the UNBILLED-only case).
function traceUrlFor(row: BillingWorkspaceRow): string {
  return row.activeInvoice ? `/billing/invoices/${row.activeInvoice.id}` : `/billing/workspace/${row.projectId}`;
}

// Mirrors DeliverySection's own `latest`/`isAcknowledged` reads verbatim
// (src/app/billing/invoices/[invoiceId]/DeliverySection.tsx) so this list's
// tags never diverge from what the invoice detail page itself would show —
// `latestEvent` must already be the event_seq-DESC most-recent row.
function deliveryTagsFor(latestEvent: InvoiceDeliveryEventRow | null): ExecutiveAttentionTag[] {
  const tags: ExecutiveAttentionTag[] = [];
  if (!latestEvent) {
    tags.push("NOT_DELIVERED");
  } else if (latestEvent.event_type === "failed") {
    tags.push("DELIVERY_FAILED");
  }

  const isAcknowledged = latestEvent?.event_type === "acknowledged";
  if (!isAcknowledged) {
    tags.push("NOT_ACKNOWLEDGED");
  }
  return tags;
}

// Founder correction (round 3): tie-break must prove a genuine per-tag
// "unresolved since" timestamp, not reuse one universal field (project
// closedAt) for every tag. Each tag family has its own real trigger moment:
//   UNBILLED         → the project's own closed_at. Unbilled eligibility
//                       requires lifecycle_status = 'closed' (Contract §13 /
//                       unbilled_vessel_projects), and no earlier
//                       "went-unbilled" event is tracked anywhere upstream —
//                       closed_at is the true, only available start point
//                       for this specific tag (not a generic fallback).
//   DRAFT_INCOMPLETE  → the draft invoice's own created_at (invoice_billing_
//                       summary.created_at). The draft has never been
//                       complete since the moment it was created; there is
//                       no separate "went incomplete" event.
//   NOT_DELIVERED /
//   DELIVERY_FAILED /
//   NOT_ACKNOWLEDGED  → all three describe the current delivery state of the
//                       same issued invoice, so they share one true anchor:
//                       the latest delivery event's own created_at, or — if
//                       no event has ever been recorded yet (NOT_DELIVERED
//                       with nothing attempted) — the invoice's issued_at,
//                       since that is the instant this state began.
// The dominant (most severe) tag on an item is what determines which of
// these timestamps is used — a project sorts by the unresolved-since moment
// of the specific condition that made it rank where it did, not a blend.
function deliveryUnresolvedSince(latestEvent: InvoiceDeliveryEventRow | null, issuedAt: string | null): string | null {
  return latestEvent?.created_at ?? issuedAt;
}

function dominantAttentionTag(tags: ExecutiveAttentionTag[]): ExecutiveAttentionTag {
  return tags.reduce((worst, tag) => (ATTENTION_TAG_SEVERITY[tag] < ATTENTION_TAG_SEVERITY[worst] ? tag : worst));
}

// Pure — every input is already-loaded/composed rows (BillingWorkspaceRow
// from the Billing Workspace composition, plus one latest-delivery-event
// lookup per issued invoice). One item per Project Kapal, never per invoice
// event, so a project with multiple compatible tags (e.g. NOT_DELIVERED +
// NOT_ACKNOWLEDGED) still counts once.
export function buildExecutiveAttentionItems(params: {
  billingRows: BillingWorkspaceRow[];
  latestDeliveryEventByInvoiceId: Map<string, InvoiceDeliveryEventRow | null>;
}): ExecutiveAttentionItem[] {
  const { billingRows, latestDeliveryEventByInvoiceId } = params;
  // unresolvedSince is carried alongside each item purely as a sort key
  // (not part of ExecutiveAttentionItem's public shape) — it is the
  // dominant tag's own timestamp, per the per-tag mapping above.
  const ranked: Array<{ item: ExecutiveAttentionItem; unresolvedSince: string | null }> = [];

  for (const row of billingRows) {
    const tags: ExecutiveAttentionTag[] = [];
    const unresolvedSinceByTag: Partial<Record<ExecutiveAttentionTag, string | null>> = {};
    const activeInvoice = row.activeInvoice;

    if (row.isUnbilledAlert) {
      tags.push("UNBILLED");
      unresolvedSinceByTag.UNBILLED = row.closedAt;
    }

    // DRAFT_INCOMPLETE only applies to draft invoices and is never combined
    // with a delivery tag (delivery tags only evaluate issued invoices).
    if (activeInvoice?.status === "draft") {
      if (row.status === "DRAFT_INCOMPLETE") {
        tags.push("DRAFT_INCOMPLETE");
        unresolvedSinceByTag.DRAFT_INCOMPLETE = activeInvoice.created_at;
      }
    } else if (activeInvoice?.status === "issued" && activeInvoice.id) {
      const latest = latestDeliveryEventByInvoiceId.get(activeInvoice.id) ?? null;
      const deliveryTags = deliveryTagsFor(latest);
      tags.push(...deliveryTags);
      const since = deliveryUnresolvedSince(latest, activeInvoice.issued_at);
      for (const tag of deliveryTags) {
        unresolvedSinceByTag[tag] = since;
      }
    }

    if (tags.length === 0) continue;

    ranked.push({
      item: {
        projectId: row.projectId,
        label: projectLabel(row),
        tags,
        amount: activeInvoice?.total_amount ?? (row.isUnbilledAlert ? row.unbilledAmountTotal : null),
        traceUrl: traceUrlFor(row),
      },
      unresolvedSince: unresolvedSinceByTag[dominantAttentionTag(tags)] ?? null,
    });
  }

  // Primary key: severity rank, most severe first. Tie-break: the dominant
  // tag's own unresolvedSince, ascending — the longest-unresolved project
  // sorts first. Equal or null unresolvedSince falls back to the original
  // input order (billingRows' own order), tracked explicitly via `index`
  // rather than left to sort-stability alone.
  return ranked
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => {
      const severityDiff = attentionSeverityRank(a.item.tags) - attentionSeverityRank(b.item.tags);
      if (severityDiff !== 0) return severityDiff;

      if (a.unresolvedSince !== null && b.unresolvedSince !== null) {
        const sinceDiff = a.unresolvedSince.localeCompare(b.unresolvedSince);
        if (sinceDiff !== 0) return sinceDiff;
      }

      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

// Non-exclusive per-tag counts — intentionally not summed into a total
// (see buildExecutiveReportSummary.attentionTotalCount for the deduplicated
// count).
export function buildExecutiveAttentionBreakdown(items: ExecutiveAttentionItem[]): ExecutiveAttentionBreakdown {
  return {
    unbilled: items.filter((item) => item.tags.includes("UNBILLED")).length,
    draftIncomplete: items.filter((item) => item.tags.includes("DRAFT_INCOMPLETE")).length,
    notDelivered: items.filter((item) => item.tags.includes("NOT_DELIVERED")).length,
    deliveryFailed: items.filter((item) => item.tags.includes("DELIVERY_FAILED")).length,
    notAcknowledged: items.filter((item) => item.tags.includes("NOT_ACKNOWLEDGED")).length,
  };
}

// Top-level composition — pure, no reads. costRunningTotal (from active
// Project Kapal cost rows) and issuedInvoices.valueTotal (from issued
// invoices' snapshot totals) are always kept as separate fields; they are
// never added together into one "nilai pekerjaan" figure.
export function buildExecutiveReportSummary(params: {
  roles: TenantRole[];
  projects: VesselProjectRow[];
  vessels: VesselRow[];
  costSummaries: VesselProjectCostSummaryRow[];
  billingRows: BillingWorkspaceRow[];
  latestDeliveryEventByInvoiceId: Map<string, InvoiceDeliveryEventRow | null>;
}): ExecutiveReportSummary {
  const { roles, projects, vessels, costSummaries, billingRows, latestDeliveryEventByInvoiceId } = params;

  const activeProjectCostRows = buildActiveProjectCostRows(projects, vessels, costSummaries);
  const costRunningTotal = activeProjectCostRows.reduce((sum, row) => sum + row.totalCost, 0);

  const unbilled = buildUnbilledVesselIndicator(roles, billingRows) ?? { count: 0, amountTotal: 0 };

  const issuedRows = billingRows.filter((row) => row.activeInvoice?.status === "issued");
  const issuedInvoices = {
    count: issuedRows.length,
    valueTotal: issuedRows.reduce((sum, row) => sum + (row.activeInvoice?.total_amount ?? 0), 0),
  };

  const attentionItems = buildExecutiveAttentionItems({ billingRows, latestDeliveryEventByInvoiceId });
  const attentionBreakdown = buildExecutiveAttentionBreakdown(attentionItems);

  return {
    activeProjectCount: activeProjectCostRows.length,
    costRunningTotal,
    unbilled,
    issuedInvoices,
    attentionItems,
    attentionTotalCount: attentionItems.length,
    attentionBreakdown,
  };
}
