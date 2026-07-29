"use client";

import { useActionState, useTransition } from "react";
import { acknowledgeTemporaryPasswordAction, provisionInvitedMemberDirectlyAction } from "@/lib/user-management/actions";
import type { PendingInvitationForTenant, ProvisionInvitedMemberActionResult } from "@/lib/user-management/types";
import { FormError } from "@/components/master-data/FormError";
import { Button } from "@/components/ui/Button";
import { TemporaryPasswordReveal } from "./TemporaryPasswordReveal";

const initialState: ProvisionInvitedMemberActionResult = {};

// Recovery path for a pending invitation whose target already has an
// auth.users account but never received a working accept email (Gate
// 6G-H) — creates the membership directly and returns a one-time temporary
// password. `expectedRole` is submitted back exactly as displayed, so the
// server can reject a stale page instead of trusting this form blindly.
// Rendered only for owners, next to the pending-invitation row it applies
// to — there is no email input here; the target is always resolved
// server-side from this exact invitationId.
//
// The list only refreshes once the owner clicks "Sudah Disalin" (see
// acknowledgeTemporaryPasswordAction and provisionInvitedMemberDirectlyAction's
// CORRECTIVE comment) — until then this row keeps showing the password
// even though the invitation itself is already accepted server-side.
export function ProvisionInvitedMemberButton({ invitation }: { invitation: PendingInvitationForTenant }) {
  const [state, formAction, isPending] = useActionState(provisionInvitedMemberDirectlyAction, initialState);
  const [isAcknowledging, startAcknowledge] = useTransition();

  if (state.temporaryPassword) {
    return (
      <TemporaryPasswordReveal
        temporaryPassword={state.temporaryPassword}
        accountName={invitation.email}
        accountEmail={invitation.email}
        isAcknowledging={isAcknowledging}
        onAcknowledge={() => startAcknowledge(() => acknowledgeTemporaryPasswordAction())}
      />
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="invitationId" value={invitation.id} />
      <input type="hidden" name="expectedRole" value={invitation.role} />
      <Button type="submit" variant="secondary" size="sm" loading={isPending}>
        {isPending ? "Memproses..." : "Aktifkan Langsung"}
      </Button>
      <FormError error={state.error} />
    </form>
  );
}
