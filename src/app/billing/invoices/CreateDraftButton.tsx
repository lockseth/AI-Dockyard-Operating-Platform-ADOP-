"use client";

import { useActionState } from "react";
import { createDraftInvoiceAction } from "@/lib/invoice-evidence/actions";
import type { CreateDraftInvoiceResult } from "@/lib/invoice-evidence/service";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/master-data/FormError";

const initialState: CreateDraftInvoiceResult = {};

export function CreateDraftButton() {
  const [state, formAction, isPending] = useActionState(createDraftInvoiceAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <Button type="submit" loading={isPending}>
        {isPending ? "Membuat Draft..." : "Buat Draft Invoice"}
      </Button>
      <FormError error={state.error} />
    </form>
  );
}
