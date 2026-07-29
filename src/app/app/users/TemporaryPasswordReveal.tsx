"use client";

import { useState } from "react";
import { Callout } from "@/components/ui/Callout";
import { Button } from "@/components/ui/Button";

const SECONDARY_LINK_BUTTON_CLASSNAME =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-[7px] border-[1.5px] border-neutral-300 bg-white px-3 text-[12.5px] font-semibold text-brand-navy hover:bg-neutral-100 active:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800";

// Shared by every place a one-time temporary password is issued (owner
// direct-provisioning, stuck-invitation recovery, Reset Password Sementara).
// Purely presentational — copy-to-clipboard and the mailto link are local
// UI concerns, and the actual "refresh the list" decision is entirely the
// caller's via `onAcknowledge` (see actions.ts's acknowledgeTemporaryPasswordAction
// and each call site's own CORRECTIVE comment on why this must never
// revalidate/unmount before the owner clicks "Sudah Disalin").
export function TemporaryPasswordReveal({
  temporaryPassword,
  accountName,
  accountEmail,
  onAcknowledge,
  isAcknowledging = false,
}: {
  temporaryPassword: string;
  accountName: string;
  accountEmail: string;
  onAcknowledge: () => void;
  isAcknowledging?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
    } catch {
      // Clipboard API can be unavailable (insecure context, permission
      // denied) — the password is still shown in full below, so this is a
      // convenience failure only, never a blocker for the owner.
    }
  }

  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
  // Deliberately excludes the password itself — the owner shares it
  // out-of-band (verbally, in person, or a channel of their choosing), this
  // link only points the recipient at where to log in.
  const mailBody = [
    `Halo ${accountName},`,
    "",
    "Akun ADOP Anda sudah aktif.",
    `Email: ${accountEmail}`,
    `Login di: ${loginUrl}`,
    "",
    "Kata sandi sementara akan diberikan terpisah oleh Owner.",
  ].join("\n");
  const mailtoHref = `mailto:${encodeURIComponent(accountEmail)}?subject=${encodeURIComponent(
    "Akun ADOP Anda sudah aktif",
  )}&body=${encodeURIComponent(mailBody)}`;

  return (
    <Callout tone="warning" role="alert" className="flex flex-col gap-2 text-xs" title="Kata Sandi Sementara">
      <p>
        Berikan kata sandi ini kepada pengguna secara aman. Kata sandi ini hanya ditampilkan satu kali dan tidak akan
        bisa dilihat lagi setelah ini.
      </p>
      <code className="block rounded bg-black/5 px-2 py-1 font-mono text-sm break-all dark:bg-white/10">
        {temporaryPassword}
      </code>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
          {copied ? "Tersalin" : "Salin Password"}
        </Button>
        <a href={mailtoHref} className={SECONDARY_LINK_BUTTON_CLASSNAME}>
          Kirim Tautan Login
        </a>
        <Button type="button" variant="primary" size="sm" loading={isAcknowledging} onClick={onAcknowledge}>
          Sudah Disalin
        </Button>
      </div>
    </Callout>
  );
}
