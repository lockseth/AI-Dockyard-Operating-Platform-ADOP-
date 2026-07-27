import { describe, expect, it } from "vitest";
import { canAccessExecutiveReport } from "./access";

describe("canAccessExecutiveReport", () => {
  it("allows owner and admin", () => {
    expect(canAccessExecutiveReport(["owner"])).toBe(true);
    expect(canAccessExecutiveReport(["admin"])).toBe(true);
  });

  it("rejects reviewer and viewer — same gate as Invoice & Evidence", () => {
    expect(canAccessExecutiveReport(["reviewer"])).toBe(false);
    expect(canAccessExecutiveReport(["viewer"])).toBe(false);
  });

  it("rejects a user with no roles", () => {
    expect(canAccessExecutiveReport([])).toBe(false);
  });
});
