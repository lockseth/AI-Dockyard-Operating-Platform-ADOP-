import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import type { MasterDataAuditAction, MasterDataEntityType } from "./types";

// Writes through private.log_master_data_audit_event() — the ONLY insert
// path into master_data_audit_events (see the Gate 1A migration); the
// authenticated role has no direct table INSERT grant. Runs on the same
// RLS-scoped client the mutation itself used, never service-role. Errors
// are not swallowed: if the audit RPC fails after a successful mutation,
// the caller decides how to surface that (see each domain's service.ts).
export async function logMasterDataAuditEvent(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string;
    entityType: MasterDataEntityType;
    entityId: string;
    action: MasterDataAuditAction;
    beforeData?: Record<string, unknown> | null;
    afterData?: Record<string, unknown> | null;
  },
): Promise<void> {
  const { error } = await supabase.rpc("log_master_data_audit_event", {
    p_tenant_id: params.tenantId,
    p_entity_type: params.entityType,
    p_entity_id: params.entityId,
    p_action: params.action,
    p_before_data: (params.beforeData ?? null) as Json,
    p_after_data: (params.afterData ?? null) as Json,
  });

  if (error) {
    throw new Error(`Gagal mencatat audit master data: ${error.message}`);
  }
}
