// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const createExpenseDraftAction = vi.fn(async (_prevState: unknown, _formData: FormData) => ({
  error: "Isian tidak valid.",
  fieldErrors: { amount: ["Nominal wajib diisi."] },
}));
vi.mock("@/lib/operations-daily/actions", () => ({
  createExpenseDraftAction: (...args: [unknown, FormData]) => createExpenseDraftAction(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

const BASE_PROPS = {
  poolId: "11111111-1111-4111-8111-111111111111",
  businessDate: "2026-07-27",
  mutationOpen: true,
  openingCashAlreadyPosted: true, // defaults activeType straight to "expense"
  projectOptions: [],
  categoryOptions: [],
  vendorOptions: [],
  facilityOptions: [],
  onClose: () => {},
};

describe("TransactionWorkspace — Tambah Transaksi discoverability", () => {
  it("shows the four-step guidance list above the accordions", async () => {
    const { TransactionWorkspace } = await import("./TransactionWorkspace");
    render(<TransactionWorkspace {...BASE_PROPS} />);

    expect(screen.getByText("Pilih Jenis Transaksi")).toBeInTheDocument();
    expect(screen.getByText("Isi Informasi Utama")).toBeInTheDocument();
    expect(screen.getByText("Tentukan Alokasi Project")).toBeInTheDocument();
    expect(screen.getByText("Periksa dan Simpan")).toBeInTheDocument();
  });

  it("shows guidance text near Simpan Transaksi so the button is never just silently disabled", async () => {
    const { TransactionWorkspace } = await import("./TransactionWorkspace");
    render(<TransactionWorkspace {...BASE_PROPS} />);

    expect(screen.getByRole("button", { name: "Simpan Transaksi" })).toBeEnabled();
    expect(screen.getByText(/Pastikan Informasi Utama dan Alokasi Project sudah terisi/)).toBeInTheDocument();
  });

  it("both Informasi Utama and Alokasi Project sections already start open (auto-opened for the expense flow)", async () => {
    const { TransactionWorkspace } = await import("./TransactionWorkspace");
    render(<TransactionWorkspace {...BASE_PROPS} />);

    expect(screen.getByRole("button", { name: /Informasi Utama/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Alokasi Project/ })).toHaveAttribute("aria-expanded", "true");
  });
});
