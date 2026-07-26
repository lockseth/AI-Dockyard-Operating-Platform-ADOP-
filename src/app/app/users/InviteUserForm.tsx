"use client";

import { useActionState } from "react";
import { inviteMemberAction } from "@/lib/user-management/actions";
import type { UserManagementActionResult } from "@/lib/user-management/types";
import { ROLE_OPTIONS } from "@/lib/user-management/labels";
import { SelectField, TextField } from "@/components/master-data/fields";
import { FormError } from "@/components/master-data/FormError";

const initialState: UserManagementActionResult = {};

export function InviteUserForm() {
  const [state, formAction, isPending] = useActionState(inviteMemberAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Nama" name="displayName" required errors={state.fieldErrors?.displayName} />
        <TextField label="Email" name="email" type="email" required errors={state.fieldErrors?.email} />
        <SelectField label="Role" name="role" options={ROLE_OPTIONS} errors={state.fieldErrors?.role} />
      </div>
      <FormError error={state.error} />
      <div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {isPending ? "Mengirim..." : "Kirim Undangan"}
        </button>
      </div>
    </form>
  );
}
