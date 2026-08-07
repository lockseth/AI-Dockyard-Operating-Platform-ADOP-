import { describe, expect, it } from "vitest";
import { parseCliArgs } from "./cli-args";

describe("parseCliArgs", () => {
  it("defaults to dry-run with the default expiry", () => {
    expect(parseCliArgs([])).toEqual({ apply: false, help: false, expiresHours: 72 });
  });

  it("parses --apply, --help, and --expires-hours", () => {
    expect(parseCliArgs(["--apply"]).apply).toBe(true);
    expect(parseCliArgs(["--help"]).help).toBe(true);
    expect(parseCliArgs(["-h"]).help).toBe(true);
    expect(parseCliArgs(["--expires-hours=24"]).expiresHours).toBe(24);
  });

  it("ignores the pnpm '--' delimiter and the explicit --dry-run no-op", () => {
    expect(parseCliArgs(["--", "--apply"]).apply).toBe(true);
    expect(parseCliArgs(["--dry-run"]).apply).toBe(false);
  });

  it("rejects an out-of-range --expires-hours", () => {
    expect(() => parseCliArgs(["--expires-hours=0"])).toThrow();
    expect(() => parseCliArgs(["--expires-hours=1000"])).toThrow();
    expect(() => parseCliArgs(["--expires-hours=abc"])).toThrow();
  });

  it("refuses identity flags outright", () => {
    expect(() => parseCliArgs(["--slug=foo"])).toThrow(/never be passed as a CLI argument/);
    expect(() => parseCliArgs(["--email=a@b.com"])).toThrow(/never be passed as a CLI argument/);
  });

  it("rejects unknown flags", () => {
    expect(() => parseCliArgs(["--bogus"])).toThrow(/Unknown argument/);
  });
});
