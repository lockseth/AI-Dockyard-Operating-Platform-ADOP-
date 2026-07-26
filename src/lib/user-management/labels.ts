import type { TenantRole } from "@/lib/auth/tenant";
import type { MembershipStatus } from "./types";

export const ROLE_LABELS: Record<TenantRole, string> = {
  owner: "Owner",
  admin: "Admin",
  reviewer: "Reviewer",
  viewer: "Viewer",
};

export const STATUS_LABELS: Record<MembershipStatus, string> = {
  invited: "Diundang",
  active: "Aktif",
  suspended: "Nonaktif",
};

export const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as TenantRole[]).map((value) => ({
  value,
  label: ROLE_LABELS[value],
}));
