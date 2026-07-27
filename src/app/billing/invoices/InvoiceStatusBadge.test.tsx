// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DocumentStatusBadge, InvoiceStatusBadge } from "./InvoiceStatusBadge";

afterEach(() => {
  cleanup();
});

describe("InvoiceStatusBadge", () => {
  it("renders the Indonesian label for each invoice status", () => {
    render(<InvoiceStatusBadge status="draft" />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
    cleanup();
    render(<InvoiceStatusBadge status="issued" />);
    expect(screen.getByText("Diterbitkan")).toBeInTheDocument();
    cleanup();
    render(<InvoiceStatusBadge status="void" />);
    expect(screen.getByText("Void")).toBeInTheDocument();
  });
});

// Gate 4A Contract §5 / Test Matrix V-06: only current + verified is ever
// labeled the final signed document — pending/rejected stay visible (never
// hidden) but must never be mislabeled as final.
describe("DocumentStatusBadge", () => {
  it("shows 'Belum Diunggah' when there is no evidence at all", () => {
    render(<DocumentStatusBadge currentVersionStatus={null} isFinalDocument={null} />);
    expect(screen.getByText("Belum Diunggah")).toBeInTheDocument();
  });

  it("labels a pending current version as pending, not final", () => {
    render(<DocumentStatusBadge currentVersionStatus="pending" isFinalDocument={false} />);
    expect(screen.getByText("Menunggu Verifikasi")).toBeInTheDocument();
    expect(screen.queryByText("Dokumen Final Sah")).not.toBeInTheDocument();
  });

  it("labels a rejected current version as rejected, not final — stays visible, never hidden", () => {
    render(<DocumentStatusBadge currentVersionStatus="rejected" isFinalDocument={false} />);
    expect(screen.getByText("Ditolak")).toBeInTheDocument();
    expect(screen.queryByText("Dokumen Final Sah")).not.toBeInTheDocument();
  });

  it("labels current + verified as the final signed document", () => {
    render(<DocumentStatusBadge currentVersionStatus="verified" isFinalDocument={true} />);
    expect(screen.getByText("Dokumen Final Sah")).toBeInTheDocument();
  });
});
