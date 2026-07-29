"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAllowedPostAuthRedirect } from "@/lib/auth/validation";

const DEFAULT_REDIRECT = "/login";
const EXPIRED_MESSAGE = "Tautan ini tidak valid atau sudah kedaluwarsa.";

type Status = "loading" | "error";

// Handles the *default* Supabase-hosted email templates (`{{ .ConfirmationURL }}`),
// which — without Custom SMTP — cannot be pointed at /auth/confirm's
// token_hash/type contract: the hosted template only supports the implicit
// flow, delivering access_token/refresh_token on the URL fragment instead of
// a server-visible query param. Fragments never reach the server, so this
// has to run client-side: read the fragment once, hand the tokens to
// setSession (which persists the session into the same cookies the server
// client reads via next/headers), scrub the fragment from the address bar
// immediately, then do a full navigation to the allowlisted `next` target so
// the destination Server Component sees a fresh session via cookies.
// /auth/confirm keeps handling any future custom TokenHash templates — this
// route exists only for the default hosted one.
export function ImplicitConfirmClient() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const nextParam = new URLSearchParams(window.location.search).get("next");
      const next = isAllowedPostAuthRedirect(nextParam) ? nextParam : DEFAULT_REDIRECT;

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const providerError = hashParams.get("error") ?? hashParams.get("error_description");

      // Scrub the fragment before doing anything else — this is the last
      // moment the tokens exist anywhere outside local variables in memory.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);

      if (providerError || !accessToken || !refreshToken) {
        if (!cancelled) setStatus("error");
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        if (!cancelled) setStatus("error");
        return;
      }

      window.location.replace(next);
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "error") {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-neutral-600 dark:text-neutral-400">{EXPIRED_MESSAGE}</p>
        <Link href="/login" className="font-medium text-blue-700 underline underline-offset-4 dark:text-blue-300">
          Kembali ke Login
        </Link>
      </div>
    );
  }

  return <p className="text-sm text-neutral-500">Memverifikasi tautan...</p>;
}
