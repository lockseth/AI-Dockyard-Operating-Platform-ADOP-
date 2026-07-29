import { describe, expect, it } from "vitest";
import { getCashImportBatchStatusBanner } from "./status-banner";

describe("getCashImportBatchStatusBanner", () => {
  it("marks draft and mapping_required as staging (not yet in operational data)", () => {
    for (const status of ["draft", "mapping_required"] as const) {
      const banner = getCashImportBatchStatusBanner(status);
      expect(banner.tone).toBe("warning");
      expect(banner.message).toContain("BELUM MASUK");
    }
  });

  it("marks ready_for_review as awaiting approval", () => {
    const banner = getCashImportBatchStatusBanner("ready_for_review");
    expect(banner.tone).toBe("informational");
    expect(banner.message).toContain("MENUNGGU PERSETUJUAN");
    expect(banner.message).toContain("BELUM MASUK");
  });

  it("marks committed as applied — must not claim it is still staging/unapplied", () => {
    const banner = getCashImportBatchStatusBanner("committed");
    expect(banner.tone).toBe("success");
    expect(banner.message).toContain("DISETUJUI");
    expect(banner.message).not.toContain("BELUM MASUK");
    expect(banner.message.toUpperCase()).not.toContain("STAGING");
  });

  it("marks rolled_back honestly — does not claim data never entered operational records", () => {
    const banner = getCashImportBatchStatusBanner("rolled_back");
    expect(banner.tone).toBe("neutral");
    expect(banner.message).not.toContain("BELUM MASUK");
    expect(banner.message.toUpperCase()).not.toContain("STAGING");
  });

  it("marks superseded honestly without claiming active operational data", () => {
    const banner = getCashImportBatchStatusBanner("superseded");
    expect(banner.tone).toBe("neutral");
    expect(banner.message).not.toContain("STAGING");
  });
});
