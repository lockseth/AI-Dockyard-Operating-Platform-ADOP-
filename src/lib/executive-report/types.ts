// Gate 5C — Executive Report. Attention tags are a fixed, closed set (no
// overdue/at-risk/prediction status is invented here); a project may carry
// more than one compatible tag at once (e.g. NOT_DELIVERED + NOT_ACKNOWLEDGED).
export type ExecutiveAttentionTag =
  | "UNBILLED"
  | "DRAFT_INCOMPLETE"
  | "NOT_DELIVERED"
  | "DELIVERY_FAILED"
  | "NOT_ACKNOWLEDGED";

export interface ExecutiveAttentionItem {
  projectId: string;
  label: string;
  tags: ExecutiveAttentionTag[];
  // Read verbatim from the canonical row that produced the tag(s) — never a
  // sum of cost + billed value (see buildExecutiveReportSummary).
  amount: number | null;
  traceUrl: string;
}

// Non-exclusive per-tag counts — do not sum these into a total; a project
// with multiple tags must only count once (see attentionTotalCount).
export interface ExecutiveAttentionBreakdown {
  unbilled: number;
  draftIncomplete: number;
  notDelivered: number;
  deliveryFailed: number;
  notAcknowledged: number;
}

export interface ExecutiveReportSummary {
  activeProjectCount: number;
  // "Biaya Berjalan" — running cost across active Project Kapal. Never
  // combined with issuedInvoices.valueTotal into one figure.
  costRunningTotal: number;
  unbilled: { count: number; amountTotal: number };
  // "Nilai Tertagih" — issued invoices only.
  issuedInvoices: { count: number; valueTotal: number };
  attentionItems: ExecutiveAttentionItem[];
  attentionTotalCount: number;
  attentionBreakdown: ExecutiveAttentionBreakdown;
}
