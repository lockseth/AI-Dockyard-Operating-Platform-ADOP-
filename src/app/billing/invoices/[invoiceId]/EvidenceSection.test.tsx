// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const finalizeInvoiceEvidenceVersionAction = vi.fn(async (_input: unknown) => ({ versionId: "v1", alreadyCurrent: false }));
vi.mock("@/lib/invoice-evidence/actions", () => ({
  finalizeInvoiceEvidenceVersionAction: (...args: [unknown]) => finalizeInvoiceEvidenceVersionAction(...args),
  verifyInvoiceEvidenceVersionAction: vi.fn(async () => ({})),
  rejectInvoiceEvidenceVersionAction: vi.fn(async () => ({})),
}));

let uploadResolvers: Array<() => void> = [];
const storageUpload = vi.fn(
  (..._args: unknown[]) =>
    new Promise((resolve) => {
      uploadResolvers.push(() => resolve({ error: null }));
    }),
);
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    storage: { from: () => ({ upload: (...args: unknown[]) => storageUpload(...args) }) },
  }),
}));

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_ID = "a1111111-1111-4111-8111-111111111111";

function pdfFile(name = "evidence.pdf", sizeBytes = 1024) {
  return new File([new Uint8Array(sizeBytes)], name, { type: "application/pdf" });
}

beforeEach(() => {
  vi.clearAllMocks();
  uploadResolvers = [];
});

afterEach(() => {
  cleanup();
});

describe("EvidenceSection — Unggah Versi Baru discoverability", () => {
  it("always renders the upload button, disabled with a 'pilih file' hint before any file is chosen", async () => {
    const { EvidenceSection } = await import("./EvidenceSection");
    render(<EvidenceSection invoiceId={INVOICE_ID} tenantId={TENANT_ID} invoiceStatus="issued" versions={[]} />);

    const button = screen.getByRole("button", { name: "Unggah Versi Baru" });
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
    expect(screen.getByText("Pilih file terlebih dahulu.")).toBeInTheDocument();
  });

  it("enables the button and shows the file name once a valid file is picked, hiding the hint", async () => {
    const user = userEvent.setup();
    const { EvidenceSection } = await import("./EvidenceSection");
    render(<EvidenceSection invoiceId={INVOICE_ID} tenantId={TENANT_ID} invoiceStatus="issued" versions={[]} />);

    const input = screen.getByLabelText(/Unggah Dokumen Bertanda Tangan/) as HTMLInputElement;
    await user.upload(input, pdfFile("kwitansi.pdf"));

    expect(screen.getByRole("button", { name: "Unggah Versi Baru" })).toBeEnabled();
    expect(screen.getByText(/kwitansi\.pdf/)).toBeInTheDocument();
    expect(screen.queryByText("Pilih file terlebih dahulu.")).not.toBeInTheDocument();
  });

  it("rejects a disallowed MIME type, keeps the button disabled, and does not weaken the existing error message", async () => {
    // fireEvent (not userEvent.upload) — userEvent honors the input's
    // `accept` attribute and would silently refuse to select a mismatched
    // file, which would never exercise the app's own JS validation. A real
    // user can still get a mismatched file past `accept` (OS "all files"
    // picker override), which is exactly the case this validation guards.
    const { EvidenceSection } = await import("./EvidenceSection");
    render(<EvidenceSection invoiceId={INVOICE_ID} tenantId={TENANT_ID} invoiceStatus="issued" versions={[]} />);

    const input = screen.getByLabelText(/Unggah Dokumen Bertanda Tangan/) as HTMLInputElement;
    const badFile = new File(["x"], "notes.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [badFile] } });

    expect(screen.getByText("Format file tidak didukung — gunakan PDF, JPEG, atau PNG.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unggah Versi Baru" })).toBeDisabled();
  });

  it("rejects an oversized file with the existing size-limit message and keeps the button disabled", async () => {
    const user = userEvent.setup();
    const { EvidenceSection } = await import("./EvidenceSection");
    render(<EvidenceSection invoiceId={INVOICE_ID} tenantId={TENANT_ID} invoiceStatus="issued" versions={[]} />);

    const input = screen.getByLabelText(/Unggah Dokumen Bertanda Tangan/) as HTMLInputElement;
    await user.upload(input, pdfFile("besar.pdf", 52_428_801));

    expect(screen.getByText("Ukuran file harus antara 1 byte hingga 50MB.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unggah Versi Baru" })).toBeDisabled();
  });

  it("goes back to disabled with the hint restored when the file selection is cleared", async () => {
    const user = userEvent.setup();
    const { EvidenceSection } = await import("./EvidenceSection");
    render(<EvidenceSection invoiceId={INVOICE_ID} tenantId={TENANT_ID} invoiceStatus="issued" versions={[]} />);

    const input = screen.getByLabelText(/Unggah Dokumen Bertanda Tangan/) as HTMLInputElement;
    await user.upload(input, pdfFile());
    expect(screen.getByRole("button", { name: "Unggah Versi Baru" })).toBeEnabled();

    await user.upload(input, []);
    expect(screen.getByRole("button", { name: "Unggah Versi Baru" })).toBeDisabled();
    expect(screen.getByText("Pilih file terlebih dahulu.")).toBeInTheDocument();
  });

  it("disables the button and switches the label to 'Mengunggah...' while the upload is in flight, and never marks the new version verified/final itself", async () => {
    const user = userEvent.setup();
    const { EvidenceSection } = await import("./EvidenceSection");
    render(<EvidenceSection invoiceId={INVOICE_ID} tenantId={TENANT_ID} invoiceStatus="issued" versions={[]} />);

    const input = screen.getByLabelText(/Unggah Dokumen Bertanda Tangan/) as HTMLInputElement;
    await user.upload(input, pdfFile());
    await user.click(screen.getByRole("button", { name: "Unggah Versi Baru" }));

    const uploadingButton = await screen.findByRole("button", { name: "Mengunggah..." });
    expect(uploadingButton).toBeDisabled();

    uploadResolvers.forEach((resolve) => resolve());
    await waitFor(() => expect(finalizeInvoiceEvidenceVersionAction).toHaveBeenCalledTimes(1));

    // The action is only ever called to register a fresh (server-side "pending") version —
    // this component has no verify/finalize call path of its own.
    expect(finalizeInvoiceEvidenceVersionAction).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: INVOICE_ID }),
    );
    await screen.findByText(/Menunggu verifikasi/);
    expect(screen.getByRole("button", { name: "Unggah Versi Baru" })).toBeDisabled();
    expect(screen.getByText("Pilih file terlebih dahulu.")).toBeInTheDocument();
  });

  it("does not render the upload form at all when the invoice isn't issued yet (existing gate, unchanged)", async () => {
    const { EvidenceSection } = await import("./EvidenceSection");
    render(<EvidenceSection invoiceId={INVOICE_ID} tenantId={TENANT_ID} invoiceStatus="draft" versions={[]} />);
    expect(screen.queryByRole("button", { name: /Unggah Versi Baru/ })).not.toBeInTheDocument();
  });
});
