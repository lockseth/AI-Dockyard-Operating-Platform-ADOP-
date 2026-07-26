"use client";

import { useActionState } from "react";
import { requestPasswordResetAction, type ForgotPasswordActionState } from "@/lib/auth/actions";
import { TextField } from "@/components/master-data/fields";
import { Button } from "@/components/ui/Button";

const initialState: ForgotPasswordActionState = {};

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordResetAction, initialState);

  if (state.message) {
    return (
      <p role="status" className="text-sm text-neutral-700 dark:text-neutral-300">
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField label="Email" name="email" type="email" required errors={state.fieldErrors?.email} />
      <Button type="submit" variant="primary" size="lg" loading={isPending} className="w-full">
        {isPending ? "Mengirim..." : "Kirim Tautan Reset"}
      </Button>
    </form>
  );
}
