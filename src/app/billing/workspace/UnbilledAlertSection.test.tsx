// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { BillingWorkspaceRow } from "@/lib/billing-workspace/types";
import { UnbilledAlertSection } from "./UnbilledAlertSection";

afterEach(() => {
  cleanup();
});

function row(overrides: Partial<BillingWorkspaceRow> = {}): BillingWorkspaceRow {
  return {
    projectId: "project-1",
    vesselName: "KM Contoh",
    projectCode: "PRJ-001",
    clientId: "client-1",
    clientName: "PT Contoh",
    lifecycleStatus: "closed",
    closedAt: new Date().toISOString(),
    status: "NO_INVOICE",
    activeInvoice: null,
    isUnbilledAlert: true,
    unbilledTransactionCount: 3,
    unbilledAmountTotal: 750_000,
    lastVoidedInvoiceId: null,
    lastVoidReason: null,
    ...overrides,
  };
}

describe("UnbilledAlertSection", () => {
  it("shows a calm confirmation when there is nothing unbilled", () => {
    render(<UnbilledAlertSection rows={[]} />);
    expect(screen.getByText(/Tidak ada kapal yang belum ditagihkan/)).toBeInTheDocument();
  });

  it("renders each unbilled project with its transaction count and CTA link", () => {
    render(<UnbilledAlertSection rows={[row()]} />);
    expect(screen.getByText(/KM Contoh/)).toBeInTheDocument();
    expect(screen.getByText(/3 transaksi belum ditagihkan/)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/billing/workspace/project-1");
  });

  it("explains a void-without-successor case with the last void reason (Contract §13.1 #3)", () => {
    render(
      <UnbilledAlertSection
        rows={[row({ lastVoidedInvoiceId: "invoice-old", lastVoidReason: "Salah nomor invoice" })]}
      />,
    );
    expect(screen.getByText(/di-void: Salah nomor invoice/)).toBeInTheDocument();
  });
});
