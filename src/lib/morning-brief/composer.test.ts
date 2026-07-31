import { describe, expect, it } from "vitest";
import type { ExecutiveReportSummary } from "@/lib/executive-report/types";
import { composeMorningBrief } from "./composer";

const ZERO_SUMMARY: ExecutiveReportSummary = {
  activeProjectCount: 0,
  costRunningTotal: 0,
  unbilled: { count: 0, amountTotal: 0 },
  issuedInvoices: { count: 0, valueTotal: 0 },
  attentionItems: [],
  attentionTotalCount: 0,
  attentionBreakdown: {
    unbilled: 0,
    draftIncomplete: 0,
    notDelivered: 0,
    deliveryFailed: 0,
    notAcknowledged: 0,
  },
};

const NORMAL_SUMMARY: ExecutiveReportSummary = {
  activeProjectCount: 4,
  costRunningTotal: 125_000_000,
  unbilled: { count: 2, amountTotal: 45_500_000 },
  issuedInvoices: { count: 3, valueTotal: 210_750_000 },
  attentionItems: [],
  attentionTotalCount: 6,
  attentionBreakdown: {
    unbilled: 2,
    draftIncomplete: 1,
    notDelivered: 1,
    deliveryFailed: 1,
    notAcknowledged: 1,
  },
};

describe("composeMorningBrief", () => {
  it("renders every fixed section with all-zero figures — a zero-item day is still a valid, fully-shaped brief", () => {
    const message = composeMorningBrief({
      businessDate: "2026-07-31",
      summary: ZERO_SUMMARY,
      executiveReportUrl: "https://adop.example.com/app/executive-report",
    });

    expect(message).toContain("Selamat pagi, Pak Hanafi.");
    expect(message).toContain("Project Kapal Aktif: 0");
    expect(message).toContain("Biaya Berjalan: Rp 0");
    expect(message).toContain("Kapal Belum Ditagihkan: 0 project (Rp 0)");
    expect(message).toContain("Invoice Diterbitkan: 0 invoice (Rp 0)");
    expect(message).toContain("Perlu Tindakan: 0 item");
    expect(message).toContain("- Belum Ditagih: 0");
    expect(message).toContain("- Draft Belum Lengkap: 0");
    expect(message).toContain("- Belum Dikirim: 0");
    expect(message).toContain("- Pengiriman Gagal: 0");
    expect(message).toContain("- Belum Diterima: 0");
  });

  it("formats every figure as Indonesian Rupiah, never a bare number", () => {
    const message = composeMorningBrief({
      businessDate: "2026-07-31",
      summary: NORMAL_SUMMARY,
      executiveReportUrl: "https://adop.example.com/app/executive-report",
    });

    expect(message).toContain("Biaya Berjalan: Rp 125.000.000");
    expect(message).toContain("Kapal Belum Ditagihkan: 2 project (Rp 45.500.000)");
    expect(message).toContain("Invoice Diterbitkan: 3 invoice (Rp 210.750.000)");
  });

  it("labels the business date in Asia/Jakarta long-form Indonesian, not a raw ISO string", () => {
    const message = composeMorningBrief({
      businessDate: "2026-07-31",
      summary: ZERO_SUMMARY,
      executiveReportUrl: "",
    });

    expect(message).toContain("Ringkasan ADOP — 31 Juli 2026");
    expect(message).not.toContain("2026-07-31");
  });

  it("renders the attention breakdown using the exact same labels as the Executive Report page", () => {
    const message = composeMorningBrief({
      businessDate: "2026-07-31",
      summary: NORMAL_SUMMARY,
      executiveReportUrl: "https://adop.example.com/app/executive-report",
    });

    for (const label of ["Belum Ditagih", "Draft Belum Lengkap", "Belum Dikirim", "Pengiriman Gagal", "Belum Diterima"]) {
      expect(message).toContain(label);
    }
  });

  it("includes the executive report link when a URL is provided", () => {
    const message = composeMorningBrief({
      businessDate: "2026-07-31",
      summary: ZERO_SUMMARY,
      executiveReportUrl: "https://adop.example.com/app/executive-report",
    });

    expect(message).toContain("Lihat detail: https://adop.example.com/app/executive-report");
  });

  it("omits the link line entirely when APP_URL is unconfigured, rather than emitting a broken relative link", () => {
    const message = composeMorningBrief({
      businessDate: "2026-07-31",
      summary: ZERO_SUMMARY,
      executiveReportUrl: "",
    });

    expect(message).not.toContain("Lihat detail");
  });

  it("never emits AI narrative/prediction language — only fixed labels and figures read verbatim from the summary", () => {
    const message = composeMorningBrief({
      businessDate: "2026-07-31",
      summary: NORMAL_SUMMARY,
      executiveReportUrl: "https://adop.example.com/app/executive-report",
    });

    for (const forbidden of ["mungkin", "diprediksi", "perkiraan", "sepertinya", "kemungkinan"]) {
      expect(message.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("is fully deterministic — identical input always produces byte-identical output", () => {
    const input = {
      businessDate: "2026-07-31",
      summary: NORMAL_SUMMARY,
      executiveReportUrl: "https://adop.example.com/app/executive-report",
    };

    expect(composeMorningBrief(input)).toBe(composeMorningBrief(input));
  });
});
