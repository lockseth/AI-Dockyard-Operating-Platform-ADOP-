"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/master-data/FormError";
import { createDraftInvoiceAction } from "@/lib/invoice-evidence/actions";
import type { CreateDraftInvoiceResult } from "@/lib/invoice-evidence/service";

const initialState: CreateDraftInvoiceResult = {};

// Same action/mutation as CreateDraftButton on /billing/invoices — this is
// just a single-project shortcut (no project picker, since the project is
// already fixed by the page it's on) so the create-draft logic itself is
// never duplicated.
export function CreateDraftForProjectButton({ projectId }: { projectId: string }) {
  const [state, formAction, isPending] = useActionState(createDraftInvoiceAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <Button type="submit" loading={isPending}>
        {isPending ? "Membuat Draft..." : "Buat Draft Invoice"}
      </Button>
      <FormError error={state.error} />
    </form>
  );
}
