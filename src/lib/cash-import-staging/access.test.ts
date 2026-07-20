import { describe, expect, it } from "vitest";
import { canApproveCashImportStaging, canReadCashImportStaging, canWriteCashImportStaging } from "./access";

describe("canWriteCashImportStaging", () => {
  it("allows admin", () => {
    expect(canWriteCashImportStaging(["admin"])).toBe(true);
  });

  it("rejects owner", () => {
    expect(canWriteCashImportStaging(["owner"])).toBe(false);
  });

  it("rejects reviewer and viewer", () => {
    expect(canWriteCashImportStaging(["reviewer"])).toBe(false);
    expect(canWriteCashImportStaging(["viewer"])).toBe(false);
  });

  it("rejects a user with no roles", () => {
    expect(canWriteCashImportStaging([])).toBe(false);
  });
});

describe("canReadCashImportStaging", () => {
  it("allows admin and owner", () => {
    expect(canReadCashImportStaging(["admin"])).toBe(true);
    expect(canReadCashImportStaging(["owner"])).toBe(true);
  });

  it("rejects reviewer and viewer", () => {
    expect(canReadCashImportStaging(["reviewer"])).toBe(false);
    expect(canReadCashImportStaging(["viewer"])).toBe(false);
  });

  it("rejects a user with no roles", () => {
    expect(canReadCashImportStaging([])).toBe(false);
  });
});

describe("canApproveCashImportStaging", () => {
  it("allows owner only", () => {
    expect(canApproveCashImportStaging(["owner"])).toBe(true);
  });

  it("rejects admin — admin cannot approve/commit its own staged batch", () => {
    expect(canApproveCashImportStaging(["admin"])).toBe(false);
  });

  it("rejects reviewer and viewer", () => {
    expect(canApproveCashImportStaging(["reviewer"])).toBe(false);
    expect(canApproveCashImportStaging(["viewer"])).toBe(false);
  });

  it("rejects a user with no roles", () => {
    expect(canApproveCashImportStaging([])).toBe(false);
  });
});
