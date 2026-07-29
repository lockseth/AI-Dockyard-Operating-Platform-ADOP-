// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddInternalUserForm } from "./AddInternalUserForm";

const provisionMemberDirectlyAction = vi.fn();
const acknowledgeTemporaryPasswordAction = vi.fn();
const generateTemporaryPasswordAction = vi.fn();
vi.mock("@/lib/user-management/actions", () => ({
  provisionMemberDirectlyAction: (...args: unknown[]) => provisionMemberDirectlyAction(...args),
  acknowledgeTemporaryPasswordAction: (...args: unknown[]) => acknowledgeTemporaryPasswordAction(...args),
  generateTemporaryPasswordAction: (...args: unknown[]) => generateTemporaryPasswordAction(...args),
}));

describe("AddInternalUserForm — temporary password field", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateTemporaryPasswordAction.mockResolvedValue("Generated-Str0ng-Pass1");
    cleanup();
  });

  it("auto-generates and displays a strong temporary password on mount, without any click", async () => {
    render(<AddInternalUserForm />);

    expect(await screen.findByDisplayValue("Generated-Str0ng-Pass1")).toBeInTheDocument();
    expect(generateTemporaryPasswordAction).toHaveBeenCalledTimes(1);
  });

  it("Buat Ulang issues a fresh candidate and replaces the field's value", async () => {
    const user = userEvent.setup();
    render(<AddInternalUserForm />);
    await screen.findByDisplayValue("Generated-Str0ng-Pass1");

    generateTemporaryPasswordAction.mockResolvedValue("Another-Str0ng-Pass2");
    await user.click(screen.getByRole("button", { name: "Buat Ulang" }));

    expect(await screen.findByDisplayValue("Another-Str0ng-Pass2")).toBeInTheDocument();
  });

  it("the owner can edit the generated password before submitting", async () => {
    const user = userEvent.setup();
    render(<AddInternalUserForm />);
    const passwordField = await screen.findByDisplayValue("Generated-Str0ng-Pass1");

    await user.clear(passwordField);
    await user.type(passwordField, "Owner-Chosen-Pass3");

    expect(screen.getByDisplayValue("Owner-Chosen-Pass3")).toBeInTheDocument();
  });
});
