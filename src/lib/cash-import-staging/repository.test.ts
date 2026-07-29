import { beforeEach, describe, expect, it, vi } from "vitest";

// Gate 6I-C regression: hasExistingFinancialEntriesForBusinessDate is read
// straight into DecisionSummaryPanel's Blocked stat for every batch status,
// including 'committed'. Without excluding the calling batch's own postings,
// a successfully-applied batch would forever see its own ledger rows as an
// OPENING_BALANCE_CONFLICT against itself.
function chain(result: unknown) {
  const builder: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    or: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
  } = {
    select: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    maybeSingle: vi.fn(async () => result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  return builder;
}

const fromMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: fromMock }),
}));

describe("hasExistingFinancialEntriesForBusinessDate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("excludes the batch's own postings, so a committed batch never conflicts with itself", async () => {
    const poolChain = chain({ data: { id: "pool-1" }, error: null });
    const entryChain = chain({ count: 0, error: null });
    const costChain = chain({ count: 0, error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === "cash_pools") return poolChain;
      if (table === "cash_pool_entries") return entryChain;
      if (table === "project_cost_ledger_entries") return costChain;
      throw new Error(`unexpected table ${table}`);
    });

    const { hasExistingFinancialEntriesForBusinessDate } = await import("./repository");
    const result = await hasExistingFinancialEntriesForBusinessDate("tenant-1", "2036-07-17", "batch-1");

    expect(result).toBe(false);
    expect(entryChain.or).toHaveBeenCalledWith(expect.stringContaining("batch-1"));
    expect(costChain.or).toHaveBeenCalledWith(expect.stringContaining("batch-1"));
  });

  it("still reports a conflict when a DIFFERENT batch already posted entries for this business date", async () => {
    const poolChain = chain({ data: { id: "pool-1" }, error: null });
    const entryChain = chain({ count: 1, error: null });
    const costChain = chain({ count: 0, error: null });
    fromMock.mockImplementation((table: string) =>
      table === "cash_pools" ? poolChain : table === "cash_pool_entries" ? entryChain : costChain,
    );

    const { hasExistingFinancialEntriesForBusinessDate } = await import("./repository");
    expect(await hasExistingFinancialEntriesForBusinessDate("tenant-1", "2036-07-17", "batch-1")).toBe(true);
  });

  it("preserves the pre-approval preview behavior when no excludeBatchId is passed", async () => {
    const poolChain = chain({ data: { id: "pool-1" }, error: null });
    const entryChain = chain({ count: 1, error: null });
    const costChain = chain({ count: 0, error: null });
    fromMock.mockImplementation((table: string) =>
      table === "cash_pools" ? poolChain : table === "cash_pool_entries" ? entryChain : costChain,
    );

    const { hasExistingFinancialEntriesForBusinessDate } = await import("./repository");
    expect(await hasExistingFinancialEntriesForBusinessDate("tenant-1", "2036-07-17")).toBe(true);
    expect(entryChain.or).not.toHaveBeenCalled();
    expect(costChain.or).not.toHaveBeenCalled();
  });

  it("returns false with no pool for this business date, regardless of excludeBatchId", async () => {
    const poolChain = chain({ data: null, error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === "cash_pools") return poolChain;
      throw new Error(`unexpected table ${table}`);
    });

    const { hasExistingFinancialEntriesForBusinessDate } = await import("./repository");
    expect(await hasExistingFinancialEntriesForBusinessDate("tenant-1", "2036-07-17", "batch-1")).toBe(false);
  });
});
