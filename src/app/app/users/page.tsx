import { requireTenantContext } from "@/lib/auth/tenant";
import { canManageUserManagement, canViewUserManagement } from "@/lib/user-management/access";
import { ROLE_LABELS } from "@/lib/user-management/labels";
import { listMembersForActiveTenant, listPendingInvitationsForActiveTenant } from "@/lib/user-management/service";
import { AppShell } from "@/components/shell/AppShell";
import { CollapsibleCreatePanel } from "@/components/master-data/CollapsibleCreatePanel";
import { AccessDenied } from "./AccessDenied";
import { InviteUserForm } from "./InviteUserForm";
import { MemberRow } from "./MemberRow";
import { ProvisionInvitedMemberButton } from "./ProvisionInvitedMemberButton";

export default async function UsersPage() {
  const context = await requireTenantContext();

  if (!canViewUserManagement(context.roles)) {
    return (
      <AppShell title="User & Hak Akses">
        <AccessDenied />
      </AppShell>
    );
  }

  const canManage = canManageUserManagement(context.roles);
  const [members, pendingInvitations] = await Promise.all([
    listMembersForActiveTenant(),
    listPendingInvitationsForActiveTenant(),
  ]);

  return (
    <AppShell title="User & Hak Akses">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
        {canManage ? (
          <CollapsibleCreatePanel label="Undang User">
            <InviteUserForm />
          </CollapsibleCreatePanel>
        ) : null}

        {members.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
            Belum ada user pada tenant ini.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <MemberRow
                    key={member.membershipId}
                    member={member}
                    canManage={canManage}
                    currentUserId={context.userId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pendingInvitations.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Undangan Tertunda</h3>
            <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
                  <tr>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Kedaluwarsa</th>
                    {canManage ? <th className="px-4 py-3" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {pendingInvitations.map((invitation) => (
                    <tr key={invitation.id} className="border-t border-neutral-200 dark:border-neutral-800">
                      <td className="px-4 py-3">{invitation.email}</td>
                      <td className="px-4 py-3">{ROLE_LABELS[invitation.role]}</td>
                      <td className="px-4 py-3 text-neutral-500">
                        {new Date(invitation.expiresAt).toLocaleDateString("id-ID")}
                      </td>
                      {canManage ? (
                        <td className="px-4 py-3 text-right">
                          <ProvisionInvitedMemberButton invitation={invitation} />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
