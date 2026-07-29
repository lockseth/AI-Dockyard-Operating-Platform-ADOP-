// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiJ9.fake-access-token-payload.signature";
const REFRESH_TOKEN = "fake-refresh-token-value-should-never-leak";

const setSession = vi.fn(async () => ({ error: null as { message: string } | null }));
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { setSession: (...args: [unknown]) => setSession(...args) },
  }),
}));

function setLocation({ search = "", hash = "" }: { search?: string; hash?: string }) {
  const replace = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: {
      pathname: "/auth/implicit-confirm",
      search,
      hash,
      replace,
    },
  });
  return replace;
}

beforeEach(() => {
  vi.clearAllMocks();
  setSession.mockResolvedValue({ error: null });
  vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
});

describe("ImplicitConfirmClient", () => {
  it("valid invite fragment: sets the session from access_token/refresh_token and redirects to the allowlisted invite target", async () => {
    const locationReplace = setLocation({
      search: "?next=%2Finvite%2Faccept",
      hash: `#access_token=${ACCESS_TOKEN}&refresh_token=${REFRESH_TOKEN}&expires_in=3600&token_type=bearer&type=invite`,
    });
    const { ImplicitConfirmClient } = await import("./ImplicitConfirmClient");
    render(<ImplicitConfirmClient />);

    await waitFor(() => expect(locationReplace).toHaveBeenCalledWith("/invite/accept"));
    expect(setSession).toHaveBeenCalledWith({ access_token: ACCESS_TOKEN, refresh_token: REFRESH_TOKEN });
  });

  it("valid recovery fragment: sets the session and redirects to the allowlisted reset-password target", async () => {
    const locationReplace = setLocation({
      search: "?next=%2Freset-password",
      hash: `#access_token=${ACCESS_TOKEN}&refresh_token=${REFRESH_TOKEN}&expires_in=3600&token_type=bearer&type=recovery`,
    });
    const { ImplicitConfirmClient } = await import("./ImplicitConfirmClient");
    render(<ImplicitConfirmClient />);

    await waitFor(() => expect(locationReplace).toHaveBeenCalledWith("/reset-password"));
    expect(setSession).toHaveBeenCalledWith({ access_token: ACCESS_TOKEN, refresh_token: REFRESH_TOKEN });
  });

  it("missing/malformed token: shows the expired/invalid message and never calls setSession or redirects", async () => {
    const locationReplace = setLocation({
      search: "?next=%2Finvite%2Faccept",
      hash: `#access_token=${ACCESS_TOKEN}&token_type=bearer`, // no refresh_token
    });
    const { ImplicitConfirmClient } = await import("./ImplicitConfirmClient");
    render(<ImplicitConfirmClient />);

    await waitFor(() => expect(screen.getByText("Tautan ini tidak valid atau sudah kedaluwarsa.")).toBeInTheDocument());
    expect(setSession).not.toHaveBeenCalled();
    expect(locationReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Kembali ke Login" })).toHaveAttribute("href", "/login");
  });

  it("provider error fragment: shows the expired/invalid message and never calls setSession or redirects", async () => {
    const locationReplace = setLocation({
      search: "?next=%2Freset-password",
      hash: "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    });
    const { ImplicitConfirmClient } = await import("./ImplicitConfirmClient");
    render(<ImplicitConfirmClient />);

    await waitFor(() => expect(screen.getByText("Tautan ini tidak valid atau sudah kedaluwarsa.")).toBeInTheDocument());
    expect(setSession).not.toHaveBeenCalled();
    expect(locationReplace).not.toHaveBeenCalled();
  });

  it("rejects a next value outside the allowlist and falls back to /login instead of following it (no open redirect)", async () => {
    const locationReplace = setLocation({
      search: "?next=https%3A%2F%2Fevil.example.com",
      hash: `#access_token=${ACCESS_TOKEN}&refresh_token=${REFRESH_TOKEN}&type=recovery`,
    });
    const { ImplicitConfirmClient } = await import("./ImplicitConfirmClient");
    render(<ImplicitConfirmClient />);

    await waitFor(() => expect(locationReplace).toHaveBeenCalledWith("/login"));
    expect(locationReplace).not.toHaveBeenCalledWith(expect.stringContaining("evil.example.com"));
  });

  it("clears the URL fragment via history.replaceState before redirecting", async () => {
    const locationReplace = setLocation({
      search: "?next=%2Finvite%2Faccept",
      hash: `#access_token=${ACCESS_TOKEN}&refresh_token=${REFRESH_TOKEN}&type=invite`,
    });
    const { ImplicitConfirmClient } = await import("./ImplicitConfirmClient");
    render(<ImplicitConfirmClient />);

    await waitFor(() => expect(locationReplace).toHaveBeenCalled());

    const replaceStateSpy = window.history.replaceState as unknown as ReturnType<typeof vi.fn>;
    expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/auth/implicit-confirm?next=%2Finvite%2Faccept");

    const replaceStateOrder = replaceStateSpy.mock.invocationCallOrder[0];
    const redirectOrder = locationReplace.mock.invocationCallOrder[0];
    expect(replaceStateOrder).toBeLessThan(redirectOrder);
  });

  it("setSession failure: shows the expired/invalid message and does not redirect", async () => {
    setSession.mockResolvedValue({ error: { message: "invalid token" } });
    const locationReplace = setLocation({
      search: "?next=%2Freset-password",
      hash: `#access_token=${ACCESS_TOKEN}&refresh_token=${REFRESH_TOKEN}&type=recovery`,
    });
    const { ImplicitConfirmClient } = await import("./ImplicitConfirmClient");
    render(<ImplicitConfirmClient />);

    await waitFor(() => expect(screen.getByText("Tautan ini tidak valid atau sudah kedaluwarsa.")).toBeInTheDocument());
    expect(locationReplace).not.toHaveBeenCalled();
  });

  it("never leaks the access/refresh token into console output or rendered UI, success or failure", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    setSession.mockResolvedValue({ error: { message: "invalid token" } });
    setLocation({
      search: "?next=%2Freset-password",
      hash: `#access_token=${ACCESS_TOKEN}&refresh_token=${REFRESH_TOKEN}&type=recovery`,
    });
    const { ImplicitConfirmClient } = await import("./ImplicitConfirmClient");
    render(<ImplicitConfirmClient />);

    await waitFor(() => expect(screen.getByText("Tautan ini tidak valid atau sudah kedaluwarsa.")).toBeInTheDocument());

    const allConsoleText = [...consoleLog.mock.calls, ...consoleError.mock.calls, ...consoleWarn.mock.calls]
      .flat()
      .map((value) => (typeof value === "string" ? value : JSON.stringify(value)))
      .join("\n");
    expect(allConsoleText).not.toContain(ACCESS_TOKEN);
    expect(allConsoleText).not.toContain(REFRESH_TOKEN);

    expect(document.body.textContent ?? "").not.toContain(ACCESS_TOKEN);
    expect(document.body.textContent ?? "").not.toContain(REFRESH_TOKEN);
    expect(document.body.innerHTML).not.toContain(ACCESS_TOKEN);
    expect(document.body.innerHTML).not.toContain(REFRESH_TOKEN);

    consoleLog.mockRestore();
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });
});
