"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updatePasswordAction, type SetPasswordActionState } from "@/lib/auth/actions";
import { TextField } from "@/components/master-data/fields";
import { FormError } from "@/components/master-data/FormError";
import { Button } from "@/components/ui/Button";

const initialState: SetPasswordActionState = {};

// Shared by /reset-password (flow="recovery") and /invite/accept
// (flow="invite") — both land here only after /auth/confirm's verifyOtp
// call has already established a recovery-scoped session server-side.
// `hasValidSession` reflects that check (done by the server-component page
// via getAuthenticatedUser()) plus the confirm route's own `?error=expired`
// query param — both cases render the same "request a new link" explanation
// rather than a broken form.
export function SetPasswordForm({
  flow,
  hasValidSession,
}: {
  flow: "recovery" | "invite";
  hasValidSession: boolean;
}) {
  const boundAction = updatePasswordAction.bind(null, flow);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  if (!hasValidSession) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-neutral-600 dark:text-neutral-400">
          Tautan ini tidak valid atau sudah kedaluwarsa.
        </p>
        <Link
          href="/forgot-password"
          className="font-medium text-blue-700 underline underline-offset-4 dark:text-blue-300"
        >
          Minta tautan baru
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField
        label="Kata Sandi Baru"
        name="password"
        type="password"
        required
        errors={state.fieldErrors?.password}
      />
      <TextField
        label="Konfirmasi Kata Sandi"
        name="confirmPassword"
        type="password"
        required
        errors={state.fieldErrors?.confirmPassword}
      />
      <FormError error={state.error} />
      <Button type="submit" variant="primary" size="lg" loading={isPending} className="w-full">
        {isPending ? "Menyimpan..." : "Simpan Kata Sandi"}
      </Button>
    </form>
  );
}
