// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResetMemberPasswordButton } from "./ResetMemberPasswordButton";

const resetMemberTemporaryPasswordAction = vi.fn();
const acknowledgeTemporaryPasswordAction = vi.fn();
vi.mock("@/lib/user-management/actions", () => ({
  resetMemberTemporaryPasswordAction: (...args: unknown[]) => resetMemberTemporaryPasswordAction(...args),
  acknowledgeTemporaryPasswordAction: (...args: unknown[]) => acknowledgeTemporaryPasswordAction(...args),
}));

describe("ResetMemberPasswordButton — Reset Password Sementara reveal/acknowledge flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  function renderButton() {
    return render(
      <ResetMemberPasswordButton membershipId="membership-1" accountName="Budi Santoso" accountEmail="budi@example.com" />,
    );
  }

  it("shows the fresh temporary password after a successful reset, without acknowledging yet", async () => {
    resetMemberTemporaryPasswordAction.mockResolvedValue({ temporaryPassword: "Fresh-Temp-1" });
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: "Reset Password Sementara" }));

    expect(await screen.findByText("Fresh-Temp-1")).toBeInTheDocument();
    expect(acknowledgeTemporaryPasswordAction).not.toHaveBeenCalled();
  });

  it("returns to the Reset Password Sementara button after the owner clicks Sudah Disalin", async () => {
    resetMemberTemporaryPasswordAction.mockResolvedValue({ temporaryPassword: "Fresh-Temp-1" });
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: "Reset Password Sementara" }));
    await screen.findByText("Fresh-Temp-1");

    await user.click(screen.getByRole("button", { name: "Sudah Disalin" }));

    expect(acknowledgeTemporaryPasswordAction).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Reset Password Sementara" })).toBeInTheDocument();
    expect(screen.queryByText("Fresh-Temp-1")).not.toBeInTheDocument();
  });

  it("shows the server error (e.g. self-target) without revealing a password", async () => {
    resetMemberTemporaryPasswordAction.mockResolvedValue({ error: "Anda tidak dapat mereset kata sandi Anda sendiri." });
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: "Reset Password Sementara" }));

    expect(await screen.findByText("Anda tidak dapat mereset kata sandi Anda sendiri.")).toBeInTheDocument();
    expect(screen.queryByText("Kata Sandi Sementara")).not.toBeInTheDocument();
  });
});
