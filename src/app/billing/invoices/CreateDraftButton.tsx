"use client";

import { useActionState } from "react";
import { createDraftInvoiceAction } from "@/lib/invoice-evidence/actions";
import type { BillableProjectOption, CreateDraftInvoiceResult } from "@/lib/invoice-evidence/service";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/master-data/FormError";

const initialState: CreateDraftInvoiceResult = {};

// Phase 2A Contract §5.1: project_id is required and locked at creation —
// the admin must pick the Project Kapal being billed up front, it is never
// inferred later from the first transaction bound.
export function CreateDraftButton({ projects }: { projects: BillableProjectOption[] }) {
  const [state, formAction, isPending] = useActionState(createDraftInvoiceAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        Project Kapal (closed)
        <select
          name="projectId"
          required
          disabled={projects.length === 0}
          className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
          defaultValue=""
        >
          <option value="" disabled>
            Pilih project…
          </option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.label}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" loading={isPending} disabled={projects.length === 0}>
        {isPending ? "Membuat Draft..." : "Buat Draft Invoice"}
      </Button>
      {projects.length === 0 && (
        <p className="text-xs text-neutral-500">Belum ada Project Kapal closed yang bisa ditagihkan.</p>
      )}
      <FormError error={state.error} />
    </form>
  );
}
