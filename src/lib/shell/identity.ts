import type { LegalEntitySummary } from "@/lib/auth/tenant";

export interface PrimaryIdentity {
  legalName: string;
  logoPath: string | null;
}

// The active tenant may have zero legal entities, or one whose legal_name/
// logo_path haven't been set yet (both are valid, expected states — never
// fabricate a name or logo here). Falls back to the tenant's own display
// name so the shell always has something safe to render.
export function resolvePrimaryIdentity(
  legalEntities: LegalEntitySummary[],
  tenantDisplayName: string,
): PrimaryIdentity {
  const primary = legalEntities[0];
  return {
    legalName: primary?.legalName ?? primary?.displayName ?? tenantDisplayName,
    logoPath: primary?.logoPath ?? null,
  };
}
