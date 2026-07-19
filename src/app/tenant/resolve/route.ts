import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { applyActiveTenantSelection, listActiveMemberships } from "@/lib/auth/tenant";

// Bootstrap-only resolver for the single-active-membership case, where the
// active-tenant cookie is missing/forged and there is exactly one valid
// choice to begin with — not a "switch" (there's nothing to switch from),
// so it doesn't need the picker UI/form in /select-tenant. Explicit tenant
// switching between two or more memberships still only happens through
// selectTenantAction (a Server Action). Re-derives and re-validates
// membership fresh on every call; never trusts a client-supplied tenantId.
export async function GET() {
  const user = await requireAuthenticatedUser();
  const memberships = await listActiveMemberships(user.userId);

  if (memberships.length === 0) {
    redirect("/no-access");
  }

  if (memberships.length > 1) {
    redirect("/select-tenant");
  }

  const ok = await applyActiveTenantSelection(user.userId, memberships[0].tenantId);
  redirect(ok ? "/app" : "/select-tenant");
}
