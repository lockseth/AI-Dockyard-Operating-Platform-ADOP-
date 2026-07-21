// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OpenCashSection } from "./OpenCashSection";
import type { CashPoolRow } from "@/lib/cash-pool/repository";

vi.mock("@/lib/operations-daily/actions", () => ({
  ensureDailyCashPoolAction: vi.fn(),
  recordCashPoolEntryAction: vi.fn(),
}));

function makePool(overrides: Partial<CashPoolRow> = {}): CashPoolRow {
  return {
    id: "pool-1",
    tenant_id: "tenant-1",
    business_date: "2026-07-21",
    created_by: "user-1",
    created_at: "2026-07-21T00:00:00Z",
    daily_close_status: "open",
    financial_version: 1,
    opening_cash_posted: false,
    ...overrides,
  };
}

describe("OpenCashSection — duplicate opening balance BLOCKED status", () => {
  beforeEach(() => {
    cleanup();
  });

  it("shows the opening-cash entry form when no opening balance has been posted yet", () => {
    render(<OpenCashSection businessDate="2026-07-21" pool={makePool({ opening_cash_posted: false })} summary={null} />);

    expect(screen.getByLabelText("Nominal Catat Opening Cash")).toBeInTheDocument();
    expect(screen.queryByText("BLOCKED")).not.toBeInTheDocument();
  });

  it("shows a BLOCKED status instead of the entry form once opening cash is already posted for this date", () => {
    render(<OpenCashSection businessDate="2026-07-21" pool={makePool({ opening_cash_posted: true })} summary={null} />);

    expect(screen.getByText("BLOCKED")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nominal Catat Opening Cash")).not.toBeInTheDocument();
  });
});
