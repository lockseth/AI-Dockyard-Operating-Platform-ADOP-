"use client";

import { useActionState } from "react";
import { claimFirstOwnerBootstrapAction, type ClaimActionState } from "./actions";
import { TextField } from "@/components/master-data/fields";
import { FormError } from "@/components/master-data/FormError";
import { Button } from "@/components/ui/Button";

const initialState: ClaimActionState = {};

export function ClaimForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(claimFirstOwnerBootstrapAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
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
        {isPending ? "Memproses..." : "Aktifkan Akun Owner"}
      </Button>
    </form>
  );
}
