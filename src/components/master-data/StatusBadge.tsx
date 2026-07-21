import type { RecordStatus } from "@/lib/master-data/shared/types";
import { Badge } from "@/components/ui/Badge";

export function StatusBadge({ status }: { status: RecordStatus }) {
  const isActive = status === "active";
  return <Badge tone={isActive ? "success" : "neutral"}>{isActive ? "Aktif" : "Nonaktif"}</Badge>;
}
