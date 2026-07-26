"use client";

import { useActionState } from "react";
import { acceptInvitationAction } from "@/lib/user-management/actions";
import type { PendingInvitationForUser, UserManagementActionResult } from "@/lib/user-management/types";
import { ROLE_LABELS } from "@/lib/user-management/labels";
import { FormError } from "@/components/master-data/FormError";
import { Button } from "@/components/ui/Button";

const initialState: UserManagementActionResult = {};

export function AcceptInvitationForm({ invitation }: { invitation: PendingInvitationForUser }) {
  const [state, formAction, isPending] = useActionState(acceptInvitationAction, initialState);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <div>
        <div className="font-medium">{invitation.tenantDisplayName}</div>
        <div className="text-xs text-neutral-500">Role: {ROLE_LABELS[invitation.role]}</div>
      </div>
      <form action={formAction} className="flex flex-col items-end gap-1">
        <input type="hidden" name="invitationId" value={invitation.id} />
        <Button type="submit" variant="primary" size="sm" loading={isPending}>
          {isPending ? "Memproses..." : "Terima Undangan"}
        </Button>
        <FormError error={state.error} />
      </form>
    </li>
  );
}
