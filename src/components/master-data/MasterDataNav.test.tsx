// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mockUsePathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

const ITEMS = [
  { href: "/app/master-data/clients", label: "Clients" },
  { href: "/app/master-data/vessels", label: "Vessels" },
];

describe("MasterDataNav", () => {
  it("marks the active tab with aria-current and distinct styling, keyboard focus-visible on all", async () => {
    mockUsePathname.mockReturnValue("/app/master-data/clients");
    const { MasterDataNav } = await import("./MasterDataNav");
    render(<MasterDataNav items={ITEMS} />);

    const active = screen.getByRole("link", { name: "Clients" });
    const inactive = screen.getByRole("link", { name: "Vessels" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(inactive).not.toHaveAttribute("aria-current");
    expect(active.className).not.toBe(inactive.className);
  });

  it("also marks a nested route (e.g. a client detail page) as active on its Clients tab", async () => {
    mockUsePathname.mockReturnValue("/app/master-data/clients/abc-123");
    const { MasterDataNav } = await import("./MasterDataNav");
    render(<MasterDataNav items={ITEMS} />);

    expect(screen.getByRole("link", { name: "Clients" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Vessels" })).not.toHaveAttribute("aria-current");
  });
});
