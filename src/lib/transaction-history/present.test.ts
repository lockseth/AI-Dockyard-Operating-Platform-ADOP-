import { describe, expect, it } from "vitest";
import { buildEffectClauses, formatSignedAmount } from "./present";
import type { TrustedTransactionRow } from "./types";

function row(overrides: Partial<TrustedTransactionRow>): TrustedTransactionRow {
  return {
    logical_transaction_id: "cash_pool:x",
    tenant_id: "t",
    business_date: "2036-01-06",
    created_at: "2036-01-06T00:00:00Z",
    transaction_type: "cash_top_up",
    transaction_direction: "cash_in",
    status: "active",
    display_amount: 0,
    signed_cash_effect: 0,
    signed_project_cost_effect: 0,
    signed_shared_overhead_effect: 0,
    project_id: null,
    project_code: null,
    vessel_name: null,
    pool_id: "p",
    actor_user_id: null,
    source: "direct_manual",
    import_batch_id: null,
    import_row_id: null,
    cash_entry_id: null,
    cost_entry_id: null,
    cash_reverses_entry_id: null,
    cost_reverses_entry_id: null,
    reversal_of_logical_id: null,
    reversed_by_logical_id: null,
    description: null,
    reference_number: null,
    ...overrides,
  };
}

describe("buildEffectClauses", () => {
  it("describes a pure cash-in transaction with a single clause", () => {
    const clauses = buildEffectClauses(row({ signed_cash_effect: 500000 }));
    expect(clauses).toEqual(["Kas bertambah Rp 500.000"]);
  });

  it("describes a project expense with both cash and cost clauses, never doubled", () => {
    const clauses = buildEffectClauses(
      row({ signed_cash_effect: -200000, signed_project_cost_effect: 200000, vessel_name: "KM Nusantara" }),
    );
    expect(clauses).toEqual(["Kas berkurang Rp 200.000", "biaya Project Kapal KM Nusantara bertambah Rp 200.000"]);
  });

  it("describes a paired project refund as one cash clause plus one cost-reduction clause", () => {
    const clauses = buildEffectClauses(
      row({ signed_cash_effect: 50000, signed_project_cost_effect: -50000, vessel_name: "KM Nusantara" }),
    );
    expect(clauses).toEqual(["Kas bertambah Rp 50.000", "biaya Project Kapal KM Nusantara berkurang Rp 50.000"]);
  });

  it("describes a shared-overhead expense with cash and overhead clauses, no project clause", () => {
    const clauses = buildEffectClauses(row({ signed_cash_effect: -80000, signed_shared_overhead_effect: 80000 }));
    expect(clauses).toEqual(["Kas berkurang Rp 80.000", "biaya overhead bersama bertambah Rp 80.000"]);
  });

  it("returns no clauses when every effect is zero", () => {
    expect(buildEffectClauses(row({}))).toEqual([]);
  });
});

describe("formatSignedAmount", () => {
  it("formats a positive amount with a plus sign", () => {
    expect(formatSignedAmount(50000)).toEqual({ text: "+ Rp 50.000", isPositive: true, isZero: false });
  });

  it("formats a negative amount with a minus sign and an absolute value", () => {
    expect(formatSignedAmount(-50000)).toEqual({ text: "- Rp 50.000", isPositive: false, isZero: false });
  });

  it("formats zero and null as the same zero state, never relying on sign", () => {
    expect(formatSignedAmount(0)).toEqual({ text: "Rp 0", isPositive: false, isZero: true });
    expect(formatSignedAmount(null)).toEqual({ text: "Rp 0", isPositive: false, isZero: true });
  });
});
