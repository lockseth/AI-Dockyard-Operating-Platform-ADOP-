"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { setVesselStatusAction, updateVesselAction } from "@/lib/master-data/vessels/actions";
import type { MasterDataActionResult } from "@/lib/master-data/clients/service";
import type { VesselRow as VesselRowData } from "@/lib/master-data/vessels/repository";
import { TextField } from "@/components/master-data/fields";
import { FormError } from "@/components/master-data/FormError";
import { StatusBadge } from "@/components/master-data/StatusBadge";
import { StatusToggleForm } from "@/components/master-data/StatusToggleForm";
import { useCloseEditOnSuccess } from "@/components/master-data/useCloseEditOnSuccess";

const initialState: MasterDataActionResult = {};

// Reused on both the top-level /app/master-data/vessels list (showClientLink)
// and the client detail page's vessel section (clientLink omitted) — there is
// no /vessels/[id] route, so edit happens inline in whichever list it's
// rendered in.
export function VesselRow({
  vessel,
  canMutate,
  clientLink,
}: {
  vessel: VesselRowData;
  canMutate: boolean;
  clientLink?: { href: string; label: string };
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState(updateVesselAction, initialState);
  useCloseEditOnSuccess(state, initialState, setEditing);

  if (!editing) {
    const details = [vessel.vessel_code, vessel.registration_number, vessel.vessel_type]
      .filter(Boolean)
      .join(" · ");

    return (
      <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
        <div>
          <div className="font-medium">{vessel.vessel_name}</div>
          <div className="text-xs text-neutral-500">
            {details || "-"}
            {clientLink ? (
              <>
                {" · "}
                <Link href={clientLink.href} className="underline underline-offset-4">
                  {clientLink.label}
                </Link>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={vessel.status} />
          {canMutate ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                Edit
              </button>
              <StatusToggleForm
                id={vessel.id}
                currentStatus={vessel.status}
                action={setVesselStatusAction}
                extraFields={{ clientId: vessel.client_id }}
              />
            </>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={vessel.id} />
        <input type="hidden" name="clientId" value={vessel.client_id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Nama Kapal"
            name="vesselName"
            defaultValue={vessel.vessel_name}
            required
            errors={state.fieldErrors?.vesselName}
          />
          <TextField
            label="Kode Kapal"
            name="vesselCode"
            defaultValue={vessel.vessel_code}
            errors={state.fieldErrors?.vesselCode}
          />
          <TextField
            label="Nomor Registrasi"
            name="registrationNumber"
            defaultValue={vessel.registration_number}
            errors={state.fieldErrors?.registrationNumber}
          />
          <TextField
            label="Tipe Kapal"
            name="vesselType"
            defaultValue={vessel.vessel_type}
            errors={state.fieldErrors?.vesselType}
          />
        </div>
        <FormError error={state.error} />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {isPending ? "Menyimpan..." : "Simpan"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700"
          >
            Batal
          </button>
        </div>
      </form>
    </li>
  );
}
