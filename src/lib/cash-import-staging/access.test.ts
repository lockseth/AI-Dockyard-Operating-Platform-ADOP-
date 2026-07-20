import { describe, expect, it } from "vitest";
import { canReadCashImportStaging, canWriteCashImportStaging } from "./access";

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
