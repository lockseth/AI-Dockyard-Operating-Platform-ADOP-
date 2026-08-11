import { describe, expect, it } from "vitest";
import { getNavGroupsForRoles } from "./nav";

function flatten(groups: ReturnType<typeof getNavGroupsForRoles>) {
  return groups.flatMap((group) => group.items.map((item) => item.label));
}

describe("getNavGroupsForRoles — Owner", () => {
  it("shows exactly the four approved entries, in the approved group structure", () => {
    const groups = getNavGroupsForRoles(["owner"]);

    expect(groups.map((g) => ({ title: g.title, items: g.items.map((i) => i.label) }))).toEqual([
      { title: "RINGKASAN", items: ["Dashboard Owner"] },
      { title: "OWNER", items: ["Laporan Eksekutif"] },
      { title: "PENGATURAN", items: ["Profil & Notifikasi WhatsApp", "User & Hak Akses"] },
    ]);
  });

  it("keeps PENGATURAN as a single group, not a duplicate section per item", () => {
    const groups = getNavGroupsForRoles(["owner"]);
    const pengaturanGroups = groups.filter((g) => g.title === "PENGATURAN");
    expect(pengaturanGroups).toHaveLength(1);
  });

  it("never includes operational/data/billing menu items", () => {
    const labels = flatten(getNavGroupsForRoles(["owner"]));

    for (const excluded of [
      "Operasional Harian",
      "Riwayat Transaksi",
      "Biaya Bersama/Overhead",
      "Project Kapal",
      "Review & Approval",
      "Master Data",
      "Import Data",
      "Ringkasan Billing",
      "Invoice & Evidence",
      "Dashboard",
    ]) {
      expect(labels).not.toContain(excluded);
    }
  });

  it("points Dashboard Owner at /owner/control", () => {
    const groups = getNavGroupsForRoles(["owner"]);
    expect(groups[0].items[0]).toEqual({ href: "/owner/control", label: "Dashboard Owner" });
  });

  it("stays owner-minimal even if the membership also carries the admin role", () => {
    const groups = getNavGroupsForRoles(["owner", "admin"]);
    expect(groups.map((g) => g.title)).toEqual(["RINGKASAN", "OWNER", "PENGATURAN"]);
  });
});

describe("getNavGroupsForRoles — Admin", () => {
  it("keeps the full operational nav unchanged", () => {
    const groups = getNavGroupsForRoles(["admin"]);

    expect(groups.map((g) => ({ title: g.title, items: g.items.map((i) => i.label) }))).toEqual([
      { title: "RINGKASAN", items: ["Dashboard"] },
      {
        title: "OPERASIONAL",
        items: ["Operasional Harian", "Riwayat Transaksi", "Biaya Bersama/Overhead", "Project Kapal", "Review & Approval"],
      },
      { title: "MANAJEMEN DATA", items: ["Master Data", "Import Data"] },
      { title: "BILLING", items: ["Ringkasan Billing", "Invoice & Evidence"] },
      { title: "OWNER", items: ["Laporan Eksekutif"] },
      { title: "AKSES", items: ["User & Hak Akses"] },
    ]);
  });
});

describe("getNavGroupsForRoles — other roles", () => {
  it("reviewer sees the generic dashboard, no owner-only or write-oriented items", () => {
    const labels = flatten(getNavGroupsForRoles(["reviewer"]));
    expect(labels).toContain("Dashboard");
    expect(labels).not.toContain("Dashboard Owner");
    expect(labels).not.toContain("Import Data");
    expect(labels).not.toContain("User & Hak Akses");
  });
});
