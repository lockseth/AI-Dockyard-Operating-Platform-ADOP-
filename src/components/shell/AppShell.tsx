import { logoutAction } from "@/lib/auth/actions";
import { requireTenantContext, type TenantContext } from "@/lib/auth/tenant";
import { resolvePrimaryIdentity } from "@/lib/shell/identity";
import { getNavGroupsForRoles } from "./nav";
import { Sidebar } from "./Sidebar";
import { PageHeader } from "./PageHeader";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  reviewer: "Reviewer",
  viewer: "Viewer",
};

function formatRoleLabel(roles: TenantContext["roles"]): string {
  if (roles.length === 0) return "-";
  return roles.map((role) => ROLE_LABELS[role] ?? role).join(", ");
}

export async function AppShell({
  title,
  operationalDateLabel,
  children,
}: {
  title: string;
  operationalDateLabel?: string;
  children: React.ReactNode;
}) {
  const context = await requireTenantContext();
  const identity = resolvePrimaryIdentity(context.legalEntities, context.tenantDisplayName);
  const navGroups = getNavGroupsForRoles(context.roles);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        identity={identity}
        navGroups={navGroups}
        userLabel={context.email ?? context.userId}
        roleLabel={formatRoleLabel(context.roles)}
        logoutAction={logoutAction}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader title={title} operationalDateLabel={operationalDateLabel} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
