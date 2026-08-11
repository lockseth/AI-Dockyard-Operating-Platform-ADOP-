"use client";

import { useActionState, useState } from "react";
import { registerOwnerWhatsappNumberAction } from "@/lib/assistant-identity/actions";
import type { AssistantIdentityActionResult } from "@/lib/assistant-identity/service";
import type { OwnerWhatsappRegistration, RegisterOwnerWhatsappResult } from "@/lib/assistant-identity/types";
import { FieldError, FormError } from "@/components/master-data/FormError";
import { inputClassName } from "@/components/master-data/fields";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import type { Tone } from "@/components/ui/tone";

const initialState: AssistantIdentityActionResult<RegisterOwnerWhatsappResult> = {};

const STATUS_LABEL: Record<OwnerWhatsappRegistration["status"], string> = {
  not_registered: "Belum Terdaftar",
  pending: "Terdaftar (Menunggu Verifikasi)",
  verified: "Terverifikasi",
};

const STATUS_TONE: Record<OwnerWhatsappRegistration["status"], Tone> = {
  not_registered: "neutral",
  pending: "warning",
  verified: "success",
};

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

// Gate 1L-R4A: Settings/Personal's only form — one number field, one save
// button, one status readout (task LOCK). initialRegistration is the
// Server Component's authoritative read (refreshed by the action's own
// revalidatePath); the challenge code returned by a fresh submit is shown
// exactly once from action state, the same "one-time reveal" pattern as
// TemporaryPasswordReveal in src/app/app/users.
export function OwnerWhatsappRegistrationForm({
  initialRegistration,
}: {
  initialRegistration: OwnerWhatsappRegistration;
}) {
  const [state, formAction, isPending] = useActionState(registerOwnerWhatsappNumberAction, initialState);
  const [rawNumber, setRawNumber] = useState("");
  const [revealDismissed, setRevealDismissed] = useState(false);

  const showReveal =
    !revealDismissed && state.data?.outcome === "challenge_issued" && !!state.data.challengeCode;

  return (
    <div className="flex flex-col gap-4">
      <Callout
        tone={STATUS_TONE[initialRegistration.status]}
        title={`Status: ${STATUS_LABEL[initialRegistration.status]}`}
        className="text-sm"
      >
        {initialRegistration.normalizedAddress ? (
          <p className="mt-1 font-mono text-sm">{initialRegistration.normalizedAddress}</p>
        ) : (
          <p className="mt-1">Belum ada nomor WhatsApp terdaftar untuk menerima notifikasi ADOP.</p>
        )}
      </Callout>

      {showReveal && state.data?.challengeCode ? (
        <Callout tone="warning" role="alert" className="flex flex-col gap-2 text-xs" title="Kode Verifikasi WhatsApp">
          <p>
            Kirim pesan WhatsApp berikut dari nomor <strong>{state.data.normalizedAddress}</strong> ke nomor
            bisnis ADOP untuk menyelesaikan verifikasi:
          </p>
          <code className="block rounded bg-black/5 px-2 py-1 font-mono text-sm break-all dark:bg-white/10">
            PAIR {state.data.challengeCode}
          </code>
          {state.data.challengeExpiresAt ? (
            <p>Kode berlaku sampai {formatExpiry(state.data.challengeExpiresAt)}.</p>
          ) : null}
          <p>
            Jika pengiriman WhatsApp real belum aktif pada demo ini, verifikasi dapat diselesaikan oleh operator
            melalui jalur internal terkontrol (demo — bukan production).
          </p>
          <div>
            <Button type="button" variant="secondary" size="sm" onClick={() => setRevealDismissed(true)}>
              Sudah Dicatat
            </Button>
          </div>
        </Callout>
      ) : null}

      {!showReveal && state.data?.outcome === "already_verified" ? (
        <Callout tone="success" className="text-sm">
          Nomor ini sudah terdaftar dan terverifikasi. Tidak ada perubahan.
        </Callout>
      ) : null}

      <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex flex-col gap-1">
          <label htmlFor="rawNumber" className="text-sm font-medium">
            Nomor WhatsApp
            <span className="text-red-600 dark:text-red-400"> *</span>
          </label>
          <input
            id="rawNumber"
            name="rawNumber"
            required
            inputMode="tel"
            placeholder="08xxxxxxxxxx"
            value={rawNumber}
            onChange={(event) => setRawNumber(event.target.value)}
            aria-invalid={!!state.fieldErrors?.rawNumber?.length}
            className={inputClassName}
          />
          <p className="text-xs text-neutral-500">Format: 08xxxxxxxxxx, 628xxxxxxxxxx, atau +628xxxxxxxxxx.</p>
          <FieldError messages={state.fieldErrors?.rawNumber} />
        </div>
        <FormError error={state.error} />
        <div>
          <Button type="submit" variant="primary" loading={isPending}>
            {isPending ? "Menyimpan..." : "Simpan Nomor WhatsApp"}
          </Button>
        </div>
      </form>
    </div>
  );
}
