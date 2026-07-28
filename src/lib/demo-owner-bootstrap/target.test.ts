import { describe, expect, it } from "vitest";
import { ALLOWED_TARGET, evaluateTarget } from "./target";

describe("evaluateTarget", () => {
  it("accepts the exact allowlisted ref/url pair", () => {
    expect(evaluateTarget(ALLOWED_TARGET)).toEqual({ ok: true });
  });

  it("rejects an empty ref", () => {
    const result = evaluateTarget({ ref: "", url: ALLOWED_TARGET.url });
    expect(result).toMatchObject({ ok: false, reason: "empty_ref" });
  });

  it("rejects an empty url", () => {
    const result = evaluateTarget({ ref: ALLOWED_TARGET.ref, url: "" });
    expect(result).toMatchObject({ ok: false, reason: "empty_url" });
  });

  it("rejects null/undefined ref and url", () => {
    expect(evaluateTarget({ ref: null, url: undefined }).ok).toBe(false);
  });

  it("rejects localhost", () => {
    const result = evaluateTarget({ ref: "localhost", url: "http://localhost:54321" });
    expect(result).toMatchObject({ ok: false, reason: "forbidden_marker" });
  });

  it("rejects 127.0.0.1", () => {
    const result = evaluateTarget({ ref: "abc", url: "http://127.0.0.1:54321" });
    expect(result).toMatchObject({ ok: false, reason: "forbidden_marker" });
  });

  it("rejects a ref referencing the sibling AODP project", () => {
    const result = evaluateTarget({ ref: "aodp-project", url: "https://aodp-project.supabase.co" });
    expect(result).toMatchObject({ ok: false, reason: "forbidden_marker" });
  });

  it("rejects a ref referencing the unrelated ASOS project", () => {
    const result = evaluateTarget({ ref: "asos-prod", url: "https://asos-prod.supabase.co" });
    expect(result).toMatchObject({ ok: false, reason: "forbidden_marker" });
  });

  it("rejects anything self-describing as production", () => {
    const result = evaluateTarget({
      ref: "adop-production",
      url: "https://adop-production.supabase.co",
    });
    expect(result).toMatchObject({ ok: false, reason: "forbidden_marker" });
  });

  it("rejects a ref that does not match the URL's encoded ref", () => {
    const result = evaluateTarget({ ref: "someotherref", url: ALLOWED_TARGET.url });
    expect(result).toMatchObject({ ok: false, reason: "url_ref_inconsistent" });
  });

  it("rejects a ref that is internally consistent with its URL but not allowlisted", () => {
    const result = evaluateTarget({
      ref: "someotherref",
      url: "https://someotherref.supabase.co",
    });
    expect(result).toMatchObject({ ok: false, reason: "ref_mismatch" });
  });

  it("rejects a URL that does not match the allowlisted URL even if the ref matches", () => {
    const result = evaluateTarget({
      ref: ALLOWED_TARGET.ref,
      url: `https://${ALLOWED_TARGET.ref}.supabase.co/some/path`,
    });
    expect(result.ok).toBe(false);
  });

  it("does not accept an arbitrary override even when internally self-consistent", () => {
    // A fully well-formed, internally consistent target that simply isn't
    // the allowlisted one — proves there is no override mechanism, only a
    // fixed comparison.
    const result = evaluateTarget({
      ref: "totallydifferent",
      url: "https://totallydifferent.supabase.co",
    });
    expect(result).toMatchObject({ ok: false, reason: "ref_mismatch" });
  });

  it("is case-insensitive when comparing against the allowlist", () => {
    const result = evaluateTarget({
      ref: ALLOWED_TARGET.ref.toUpperCase(),
      url: ALLOWED_TARGET.url.toUpperCase(),
    });
    expect(result).toEqual({ ok: true });
  });
});
