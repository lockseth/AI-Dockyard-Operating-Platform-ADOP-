import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const registerOwnerWhatsappNumberForActiveTenant = vi.fn();
vi.mock("./service", () => ({ registerOwnerWhatsappNumberForActiveTenant }));

beforeEach(() => {
  vi.clearAllMocks();
});

function formDataWith(rawNumber: string | null): FormData {
  const formData = new FormData();
  if (rawNumber !== null) formData.set("rawNumber", rawNumber);
  return formData;
}

describe("registerOwnerWhatsappNumberAction", () => {
  it("passes formData rawNumber through to the service and revalidates on success", async () => {
    registerOwnerWhatsappNumberForActiveTenant.mockResolvedValue({
      data: { outcome: "challenge_issued", normalizedAddress: "+6281234567890", challengeCode: "ABCDEF" },
    });
    const { registerOwnerWhatsappNumberAction } = await import("./actions");

    const result = await registerOwnerWhatsappNumberAction({}, formDataWith("081234567890"));

    expect(registerOwnerWhatsappNumberForActiveTenant).toHaveBeenCalledWith({ rawNumber: "081234567890" });
    expect(revalidatePath).toHaveBeenCalledWith("/app/settings/personal");
    expect(result.data?.outcome).toBe("challenge_issued");
  });

  it("does not revalidate when the service returns a field error", async () => {
    registerOwnerWhatsappNumberForActiveTenant.mockResolvedValue({
      fieldErrors: { rawNumber: ["Nomor tidak valid."] },
    });
    const { registerOwnerWhatsappNumberAction } = await import("./actions");

    await registerOwnerWhatsappNumberAction({}, formDataWith("invalid"));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does not revalidate when the service returns a generic error", async () => {
    registerOwnerWhatsappNumberForActiveTenant.mockResolvedValue({ error: "Gagal." });
    const { registerOwnerWhatsappNumberAction } = await import("./actions");

    await registerOwnerWhatsappNumberAction({}, formDataWith("081234567890"));
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("converts an UnauthorizedTenantRoleError thrown by the service into a friendly message, never leaking the raw error", async () => {
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    registerOwnerWhatsappNumberForActiveTenant.mockRejectedValue(new UnauthorizedTenantRoleError());
    const { registerOwnerWhatsappNumberAction } = await import("./actions");

    const result = await registerOwnerWhatsappNumberAction({}, formDataWith("081234567890"));
    expect(result.error).toBe("Anda tidak memiliki izin untuk melakukan aksi ini.");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("passes null through when rawNumber is missing from the form", async () => {
    registerOwnerWhatsappNumberForActiveTenant.mockResolvedValue({ fieldErrors: { rawNumber: ["wajib diisi"] } });
    const { registerOwnerWhatsappNumberAction } = await import("./actions");

    await registerOwnerWhatsappNumberAction({}, formDataWith(null));
    expect(registerOwnerWhatsappNumberForActiveTenant).toHaveBeenCalledWith({ rawNumber: null });
  });
});
