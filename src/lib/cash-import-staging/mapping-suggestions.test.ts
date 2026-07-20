import { describe, expect, it } from "vitest";
import { suggestMappingKindForLabel } from "./mapping-suggestions";

describe("suggestMappingKindForLabel", () => {
  it("suggests cash for the Kas label", () => {
    expect(suggestMappingKindForLabel("Kas")).toBe("cash");
  });

  it("suggests shared_overhead for the Lain-lain label", () => {
    expect(suggestMappingKindForLabel("Lain-lain")).toBe("shared_overhead");
  });

  it("suggests new_project_candidate for any other vessel label", () => {
    expect(suggestMappingKindForLabel("KM Sejahtera")).toBe("new_project_candidate");
  });

  it("suggests unresolved for a null label", () => {
    expect(suggestMappingKindForLabel(null)).toBe("unresolved");
  });
});
