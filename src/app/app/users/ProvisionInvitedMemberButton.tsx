"use client";

import { useActionState } from "react";
import { provisionInvitedMemberDirectlyAction } from "@/lib/user-management/actions";
import type { PendingInvitationForTenant, ProvisionInvitedMemberActionResult } from "@/lib/user-management/types";
import { FormError } from "@/components/master-data/FormError";
import { Callout } from "@/components/ui/Callout";
import { Button } from "@/components/ui/Button";

const initialState: ProvisionInvitedMemberActionResult = {};

// Recovery path for a pending invitation whose target already has an
// auth.users account but never received a working accept email (Gate
// 6G-H) — creates the membership directly and returns a one-time temporary
// password. `expectedRole` is submitted back exactly as displayed, so the
// server can reject a stale page instead of trusting this form blindly.
// Rendered only for owners, next to the pending-invitation row it applies
// to — there is no email input here; the target is always resolved
// server-side from this exact invitationId.
export function ProvisionInvitedMemberButton({ invitation }: { invitation: PendingInvitationForTenant }) {
  const [state, formAction, isPending] = useActionState(provisionInvitedMemberDirectlyAction, initialState);

  if (state.temporaryPassword) {
    return (
      <Callout tone="warning" role="alert" className="text-xs" title="Kata Sandi Sementara">
        <p className="mb-1">
          Berikan kata sandi ini kepada pengguna secara aman. Kata sandi ini hanya ditampilkan satu kali dan
          tidak akan bisa dilihat lagi setelah ini.
        </p>
        <code className="block rounded bg-black/5 px-2 py-1 font-mono text-sm break-all dark:bg-white/10">
          {state.temporaryPassword}
        </code>
      </Callout>
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
