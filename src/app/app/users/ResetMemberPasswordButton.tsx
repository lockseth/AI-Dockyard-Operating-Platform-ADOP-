"use client";

import { useActionState, useState, useTransition } from "react";
import { acknowledgeTemporaryPasswordAction, resetMemberTemporaryPasswordAction } from "@/lib/user-management/actions";
import type { ProvisionMemberActionResult } from "@/lib/user-management/types";
import { FormError } from "@/components/master-data/FormError";
import { Button } from "@/components/ui/Button";
import { TemporaryPasswordReveal } from "./TemporaryPasswordReveal";

const initialState: ProvisionMemberActionResult = {};

// Owner-only "Reset Password Sementara" — rendered only for active,
// non-self members (see MemberRow's canMutateThisRow && status === "active"
// guard). Never changes role/status; issues a fresh temporary password and
// forces a change on next login. Unlike the provisioning flows, acknowledging
// here doesn't need the member list itself to change — so after "Sudah
// Disalin" this simply goes back to showing the button again, alongside
// the (mostly no-op, but consistent) list-refresh every temporary-password
// reveal performs.
export function ResetMemberPasswordButton({
  membershipId,
  accountName,
  accountEmail,
}: {
  membershipId: string;
  accountName: string;
  accountEmail: string;
}) {
  const [state, formAction, isPending] = useActionState(resetMemberTemporaryPasswordAction, initialState);
  const [isAcknowledging, startAcknowledge] = useTransition();
  const [acknowledged, setAcknowledged] = useState(false);

  if (state.temporaryPassword && !acknowledged) {
    return (
      <TemporaryPasswordReveal
        temporaryPassword={state.temporaryPassword}
        accountName={accountName}
        accountEmail={accountEmail}
        isAcknowledging={isAcknowledging}
        onAcknowledge={() => {
          startAcknowledge(() => acknowledgeTemporaryPasswordAction());
          setAcknowledged(true);
        }}
      />
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="membershipId" value={membershipId} />
      <Button type="submit" variant="secondary" size="sm" loading={isPending}>
        {isPending ? "Memproses..." : "Reset Password Sementara"}
      </Button>
      <FormError error={state.error} />
    </form>
  );
}
