import type { ExecutiveReportSummary } from "@/lib/executive-report/types";
import { EXECUTIVE_ATTENTION_TAG_LABEL } from "@/lib/executive-report/labels";
import { formatBusinessDateLabel, formatRupiah } from "@/lib/operations-daily/format";

export interface MorningBriefComposerInput {
  // YYYY-MM-DD, Asia/Jakarta — see getJakartaBusinessDate.
  businessDate: string;
  summary: ExecutiveReportSummary;
  // Fully-qualified (APP_URL + /app/executive-report), or "" when APP_URL is
  // unconfigured — in which case the line is omitted rather than emitting a
  // broken relative link.
  executiveReportUrl: string;
}

// THE canonical Morning Brief composer (Gate 6J-A §14 LOCK: one composer,
// scheduled and any future interactive trigger both call this exact
// function — never a second calculation/formatting engine). Pure and
// deterministic: same ExecutiveReportSummary + businessDate always produce
// byte-identical text — no AI/LLM involvement, no narrative/prediction, only
// the fixed Indonesian labels below and figures read verbatim from the
// summary that was handed in. Every number is rendered exactly once — the
// same running-cost vs. issued-invoice-value separation the Executive
// Report itself enforces is preserved here, not re-derived.
export function composeMorningBrief(input: MorningBriefComposerInput): string {
  const { businessDate, summary, executiveReportUrl } = input;

  const lines: string[] = [
    "Selamat pagi, Pak Hanafi.",
    "",
    `Ringkasan ADOP — ${formatBusinessDateLabel(businessDate)}`,
    "",
    `Project Kapal Aktif: ${summary.activeProjectCount}`,
    `Biaya Berjalan: ${formatRupiah(summary.costRunningTotal)}`,
    `Kapal Belum Ditagihkan: ${summary.unbilled.count} project (${formatRupiah(summary.unbilled.amountTotal)})`,
    `Invoice Diterbitkan: ${summary.issuedInvoices.count} invoice (${formatRupiah(summary.issuedInvoices.valueTotal)})`,
    "",
    `Perlu Tindakan: ${summary.attentionTotalCount} item`,
    `- ${EXECUTIVE_ATTENTION_TAG_LABEL.UNBILLED}: ${summary.attentionBreakdown.unbilled}`,
    `- ${EXECUTIVE_ATTENTION_TAG_LABEL.DRAFT_INCOMPLETE}: ${summary.attentionBreakdown.draftIncomplete}`,
    `- ${EXECUTIVE_ATTENTION_TAG_LABEL.NOT_DELIVERED}: ${summary.attentionBreakdown.notDelivered}`,
    `- ${EXECUTIVE_ATTENTION_TAG_LABEL.DELIVERY_FAILED}: ${summary.attentionBreakdown.deliveryFailed}`,
    `- ${EXECUTIVE_ATTENTION_TAG_LABEL.NOT_ACKNOWLEDGED}: ${summary.attentionBreakdown.notAcknowledged}`,
  ];

  if (executiveReportUrl) {
    lines.push("", `Lihat detail: ${executiveReportUrl}`);
  }

  return lines.join("\n");
}
