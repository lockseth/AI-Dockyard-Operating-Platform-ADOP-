import type { Enums } from "@/types/database";

export type RecordStatus = Enums<"record_status">;

// Mirrors the entity_type values written by every domain's service layer —
// kept as a union here so a typo can't silently create a new audit category.
export type MasterDataEntityType =
  | "client"
  | "client_contact"
  | "vessel"
  | "vendor"
  | "service_type"
  | "facility_location"
  | "expense_category";

export type MasterDataAuditAction = "create" | "update" | "activate" | "deactivate";
