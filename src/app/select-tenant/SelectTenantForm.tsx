"use client";

import { useActionState } from "react";
import {
  selectTenantAction,
  type SelectTenantActionState,
} from "@/lib/auth/actions";
import type { TenantMembership } from "@/lib/auth/tenant";

const initialState: SelectTenantActionState = {};

export function SelectTenantForm({
  memberships,
}: {
  memberships: TenantMembership[];
}) {
  const [state, formAction, isPending] = useActionState(
    selectTenantAction,
    initialState,
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      {memberships.map((membership) => (
        <form key={membership.tenantId} action={formAction}>
          <input type="hidden" name="tenantId" value={membership.tenantId} />
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-md border border-neutral-300 px-4 py-3 text-left text-sm hover:border-neutral-500 disabled:opacity-60 dark:border-neutral-700"
          >
            <span className="block font-medium">
              {membership.tenantDisplayName}
            </span>
            <span className="block text-xs text-neutral-500">
              {membership.roles.join(", ") || "-"}
            </span>
          </button>
        </form>
      ))}
      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
