import { describe, expect, it } from "vitest";
import {
  getCashPoolDailyCloseStatusLabel,
  getCashReconciliationStatusLabel,
  getExpenseSubmissionStatusLabel,
} from "./labels";

describe("getExpenseSubmissionStatusLabel", () => {
  it("maps every expense submission status to its locked Indonesian label", () => {
    expect(getExpenseSubmissionStatusLabel("draft")).toBe("Draft");
    expect(getExpenseSubmissionStatusLabel("submitted")).toBe("Menunggu Pak Hanafi");
    expect(getExpenseSubmissionStatusLabel("needs_correction")).toBe("Perlu Diperbaiki");
    expect(getExpenseSubmissionStatusLabel("approved")).toBe("Disetujui");
    expect(getExpenseSubmissionStatusLabel("rejected")).toBe("Ditolak");
    expect(getExpenseSubmissionStatusLabel("cancelled")).toBe("Dibatalkan");
  });
});

describe("getCashPoolDailyCloseStatusLabel", () => {
  it("reports 'Belum Dibuat' when no pool exists yet", () => {
    expect(getCashPoolDailyCloseStatusLabel(null)).toBe("Belum Dibuat");
  });

  it("maps every cash pool daily close status", () => {
    expect(getCashPoolDailyCloseStatusLabel("open")).toBe("Open");
    expect(getCashPoolDailyCloseStatusLabel("pending_close")).toBe("Menunggu Penutupan");
    expect(getCashPoolDailyCloseStatusLabel("closed")).toBe("Sudah Ditutup");
  });
});

describe("getCashReconciliationStatusLabel", () => {
  it("reports 'Belum Dibuat' when no reconciliation exists yet", () => {
    expect(getCashReconciliationStatusLabel(null)).toBe("Belum Dibuat");
  });

  it("maps every cash reconciliation status", () => {
    expect(getCashReconciliationStatusLabel("draft")).toBe("Draft");
    expect(getCashReconciliationStatusLabel("submitted")).toBe("Menunggu Review Pak Hanafi");
    expect(getCashReconciliationStatusLabel("needs_correction")).toBe("Perlu Diperbaiki");
    expect(getCashReconciliationStatusLabel("approved")).toBe("Disetujui");
    expect(getCashReconciliationStatusLabel("rejected")).toBe("Ditolak");
  });
});
