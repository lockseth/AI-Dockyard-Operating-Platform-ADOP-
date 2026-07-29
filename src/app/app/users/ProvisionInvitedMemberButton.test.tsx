// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProvisionInvitedMemberButton } from "./ProvisionInvitedMemberButton";
import type { PendingInvitationForTenant } from "@/lib/user-management/types";

const provisionInvitedMemberDirectlyAction = vi.fn();
const acknowledgeTemporaryPasswordAction = vi.fn();
vi.mock("@/lib/user-management/actions", () => ({
  provisionInvitedMemberDirectlyAction: (...args: unknown[]) => provisionInvitedMemberDirectlyAction(...args),
  acknowledgeTemporaryPasswordAction: (...args: unknown[]) => acknowledgeTemporaryPasswordAction(...args),
}));

const INVITATION: PendingInvitationForTenant = {
  id: "invitation-1",
  email: "budi@example.com",
  role: "viewer",
  expiresAt: "2026-08-05T00:00:00Z",
};

// Regression test for the CORRECTIVE bug (Gate 6G-H): the list used to
// refresh (revalidatePath) immediately on a successful result, which always
// carries a one-time temporaryPassword — dropping the row before the owner
// could copy it. The fix moved that refresh behind an explicit "Sudah
// Disalin" click, so these prove the password stays visible until then and
// the refresh action isn't fired a moment early.
describe("ProvisionInvitedMemberButton — temporary password stays visible until acknowledged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("shows the temporary password after a successful direct provisioning, without acknowledging yet", async () => {
    provisionInvitedMemberDirectlyAction.mockResolvedValue({ temporaryPassword: "Sup3r-Secret-Temp!" });
    const user = userEvent.setup();
    render(<ProvisionInvitedMemberButton invitation={INVITATION} />);

    await user.click(screen.getByRole("button", { name: "Aktifkan Langsung" }));

    expect(await screen.findByText("Sup3r-Secret-Temp!")).toBeInTheDocument();
    expect(acknowledgeTemporaryPasswordAction).not.toHaveBeenCalled();
  });

  it("only calls the acknowledge (refresh) action once the owner explicitly clicks Sudah Disalin", async () => {
    provisionInvitedMemberDirectlyAction.mockResolvedValue({ temporaryPassword: "Sup3r-Secret-Temp!" });
    const user = userEvent.setup();
    render(<ProvisionInvitedMemberButton invitation={INVITATION} />);

    await user.click(screen.getByRole("button", { name: "Aktifkan Langsung" }));
    await screen.findByText("Sup3r-Secret-Temp!");
    expect(acknowledgeTemporaryPasswordAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Sudah Disalin" }));

    expect(acknowledgeTemporaryPasswordAction).toHaveBeenCalledTimes(1);
  });

  it("shows the server error and stays on the button (no password reveal) when provisioning fails", async () => {
    provisionInvitedMemberDirectlyAction.mockResolvedValue({ error: "Undangan tidak valid." });
    const user = userEvent.setup();
    render(<ProvisionInvitedMemberButton invitation={INVITATION} />);

    await user.click(screen.getByRole("button", { name: "Aktifkan Langsung" }));

    expect(await screen.findByText("Undangan tidak valid.")).toBeInTheDocument();
    expect(screen.queryByText("Kata Sandi Sementara")).not.toBeInTheDocument();
  });
});
