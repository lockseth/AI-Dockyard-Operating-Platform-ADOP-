import { KAS_LABEL, OVERHEAD_LABEL } from "@/lib/cash-import/constants";
import type { CashImportMappingKind } from "./types";

// UI-only hint, never written to the database by itself — a row only ever
// carries a mapping_kind once an admin actually confirms it through
// set_cash_import_label_mapping. LOCK: "saran bukan commit otomatis".
export function suggestMappingKindForLabel(vesselLabel: string | null): CashImportMappingKind {
  if (vesselLabel === null) {
    return "unresolved";
  }
  if (vesselLabel === KAS_LABEL) {
    return "cash";
  }
  if (vesselLabel === OVERHEAD_LABEL) {
    return "shared_overhead";
  }
  return "new_project_candidate";
}
