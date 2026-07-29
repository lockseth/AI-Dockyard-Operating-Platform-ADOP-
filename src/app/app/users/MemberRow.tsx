"use client";

import { useActionState, useState } from "react";
import { changeMembershipRoleAction, setMembershipStatusAction } from "@/lib/user-management/actions";
import type { TenantMemberSummary, UserManagementActionResult } from "@/lib/user-management/types";
import { ROLE_LABELS, ROLE_OPTIONS, STATUS_LABELS } from "@/lib/user-management/labels";
import { SelectField } from "@/components/master-data/fields";
import { FormError } from "@/components/master-data/FormError";
import { useCloseEditOnSuccess } from "@/components/master-data/useCloseEditOnSuccess";
import { Badge } from "@/components/ui/Badge";
import { ResetMemberPasswordButton } from "./ResetMemberPasswordButton";

const initialState: UserManagementActionResult = {};

function StatusBadge({ status }: { status: TenantMemberSummary["status"] }) {
  const tone = status === "active" ? "success" : status === "invited" ? "neutral" : "warning";
  return <Badge tone={tone}>{STATUS_LABELS[status]}</Badge>;
}

function DeactivateReactivateForm({ member }: { member: TenantMemberSummary }) {
  const [state, formAction, isPending] = useActionState(setMembershipStatusAction, initialState);
  const nextStatus = member.status === "active" ? "suspended" : "active";

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="membershipId" value={member.membershipId} />
      <input type="hidden" name="status" value={nextStatus} />
      <button
        type="submit"
        disabled={isPending}
        className="text-xs font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-900 disabled:opacity-60 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        {isPending ? "Memproses..." : nextStatus === "suspended" ? "Nonaktifkan" : "Aktifkan"}
      </button>
      <FormError error={state.error} />
    </form>
  );
}

export function MemberRow({ member, canManage, currentUserId }: {
  member: TenantMemberSummary;
  canManage: boolean;
  currentUserId: string;
}) {
  const [editingRole, setEditingRole] = useState(false);
  const [state, formAction, isPending] = useActionState(changeMembershipRoleAction, initialState);
  useCloseEditOnSuccess(state, initialState, setEditingRole);

  const isSelf = member.userId === currentUserId;
  const canMutateThisRow = canManage && !isSelf;
  const roleLabel = member.roles.map((role) => ROLE_LABELS[role]).join(", ") || "-";

  return (
    <tr className="border-t border-neutral-200 dark:border-neutral-800">
      <td className="px-4 py-3">
        <div className="font-medium">
          {member.displayName ?? member.email ?? "-"}
          {isSelf ? <span className="ml-2 text-xs font-normal text-neutral-400">(Anda)</span> : null}
        </div>
        <div className="text-xs text-neutral-500">{member.email ?? "-"}</div>
      </td>
      <td className="px-4 py-3">
        {editingRole ? (
          <form action={formAction} className="flex flex-col gap-2">
            <input type="hidden" name="membershipId" value={member.membershipId} />
            <SelectField
              label=""
              name="role"
              defaultValue={member.roles[0]}
              options={ROLE_OPTIONS}
              errors={state.fieldErrors?.role}
            />
            <FormError error={state.error} />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
              >
                {isPending ? "Menyimpan..." : "Simpan"}
              </button>
              <button
                type="button"
                onClick={() => setEditingRole(false)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700"
              >
                Batal
              </button>
            </div>
          </form>
        ) : (
          roleLabel
        )}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={member.status} />
      </td>
      <td className="px-4 py-3 text-right">
        {canMutateThisRow && !editingRole ? (
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setEditingRole(true)}
              className="text-xs font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              Ubah Role
            </button>
            {member.status !== "invited" ? <DeactivateReactivateForm member={member} /> : null}
            {member.status === "active" ? (
              <ResetMemberPasswordButton
                membershipId={member.membershipId}
                accountName={member.displayName ?? member.email ?? "-"}
                accountEmail={member.email ?? ""}
              />
            ) : null}
          </div>
        ) : null}
      </td>
    </tr>
  );
}
