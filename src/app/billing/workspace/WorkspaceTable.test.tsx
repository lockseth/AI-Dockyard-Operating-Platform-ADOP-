// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { BillingWorkspaceRow } from "@/lib/billing-workspace/types";
import { WorkspaceTable } from "./WorkspaceTable";

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
    closedAt: "2026-02-01T00:00:00Z",
    status: "NO_INVOICE",
    activeInvoice: null,
    isUnbilledAlert: true,
    unbilledTransactionCount: 2,
    unbilledAmountTotal: 500_000,
    lastVoidedInvoiceId: null,
    lastVoidReason: null,
    ...overrides,
  };
}

describe("WorkspaceTable", () => {
  it("shows an empty state when there are no matching rows", () => {
    render(<WorkspaceTable rows={[]} />);
    expect(screen.getByText(/Tidak ada Project Kapal/)).toBeInTheDocument();
  });

  it("renders vessel, client, project status, and billing status badge for each row", () => {
    render(<WorkspaceTable rows={[row()]} />);
    expect(screen.getByText("KM Contoh")).toBeInTheDocument();
    expect(screen.getByText("PT Contoh")).toBeInTheDocument();
    expect(screen.getByText("Belum Ditagih")).toBeInTheDocument();
    // Nilai Tagihan and Invoice Terkait both render "-" when there is no
    // active invoice — two dashes, not one.
    expect(screen.getAllByText("-")).toHaveLength(2);
  });

  it("shows the linked invoice id and formatted billing value when an active invoice exists", () => {
    render(
      <WorkspaceTable
        rows={[
          row({
            status: "READY_TO_SEND",
            activeInvoice: {
              id: "11111111-2222-3333-4444-555555555555",
              total_amount: 2_500_000,
            } as BillingWorkspaceRow["activeInvoice"],
          }),
        ]}
      />,
    );
    expect(screen.getByText("Siap Dikirim")).toBeInTheDocument();
    expect(screen.getByText("11111111")).toBeInTheDocument();
  });
});
