import { describe, expect, it } from "vitest";
import { parseCliArgs } from "./cli-args";

describe("parseCliArgs", () => {
  it("defaults to apply=false, help=false with no arguments", () => {
    expect(parseCliArgs([])).toEqual({ apply: false, help: false });
  });

  it("sets apply=true only when --apply is passed", () => {
    expect(parseCliArgs(["--apply"])).toEqual({ apply: true, help: false });
  });

  it("accepts an explicit --dry-run as a no-op", () => {
    expect(parseCliArgs(["--dry-run"])).toEqual({ apply: false, help: false });
  });

  it("sets help=true when --help is passed", () => {
    expect(parseCliArgs(["--help"])).toEqual({ apply: false, help: true });
  });

  it("sets help=true when -h is passed", () => {
    expect(parseCliArgs(["-h"])).toEqual({ apply: false, help: true });
  });

  it("allows --help alongside --apply without erroring", () => {
    expect(parseCliArgs(["--apply", "--help"])).toEqual({ apply: true, help: true });
  });

  it("tolerates the literal '--' delimiter pnpm forwards for `pnpm demo:owner-bootstrap -- --apply`", () => {
    expect(parseCliArgs(["--", "--apply"])).toEqual({ apply: true, help: false });
  });

  it("refuses --email as a CLI argument", () => {
    expect(() => parseCliArgs(["--email=someone@example.test"])).toThrow(/CLI argument/);
  });

  it("refuses --password as a CLI argument", () => {
    expect(() => parseCliArgs(["--password", "hunter2"])).toThrow(/CLI argument/);
  });

  it("refuses --display-name as a CLI argument", () => {
    expect(() => parseCliArgs(["--display-name=Someone"])).toThrow(/CLI argument/);
  });

  it("rejects unknown flags", () => {
    expect(() => parseCliArgs(["--force"])).toThrow(/Unknown argument/);
  });
});
