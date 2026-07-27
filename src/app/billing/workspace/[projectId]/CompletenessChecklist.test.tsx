// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { BillingCompleteness } from "@/lib/billing-workspace/completeness";
import { CompletenessChecklist } from "./CompletenessChecklist";

afterEach(() => {
  cleanup();
});

function completeness(overrides: Partial<BillingCompleteness> = {}): BillingCompleteness {
  return {
    result: "BELUM_LENGKAP",
    checks: [
      {
        key: "billing_record_exists",
        label: "Draft/invoice terkait ditemukan",
        ok: false,
        blocking: true,
        detail: "Belum ada Billing Record (draft/invoice) untuk project ini.",
      },
    ],
    ...overrides,
  };
}

describe("CompletenessChecklist", () => {
  it("renders the result badge and every check's label/detail", () => {
    render(<CompletenessChecklist completeness={completeness()} />);
    expect(screen.getByText("Belum Lengkap")).toBeInTheDocument();
    expect(screen.getByText("Draft/invoice terkait ditemukan")).toBeInTheDocument();
    expect(screen.getByText(/Belum ada Billing Record/)).toBeInTheDocument();
  });

  it("renders Siap Ditagih when the result is fully clean", () => {
    render(
      <CompletenessChecklist
        completeness={completeness({
          result: "SIAP_DITAGIH",
          checks: [{ key: "ok", label: "Semua siap", ok: true, blocking: true, detail: "Tidak ada blocker." }],
        })}
      />,
    );
    expect(screen.getByText("Siap Ditagih")).toBeInTheDocument();
  });
});
