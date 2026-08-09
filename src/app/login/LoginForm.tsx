"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction, type LoginActionState } from "@/lib/auth/actions";
import { Spinner } from "@/components/ui/Button";

const initialState: LoginActionState = {};

// 44px height, matches the approved login prototype. Deliberately not
// components/master-data/fields.ts's shared inputClassName (42px) — that
// token is reused across every form in the app, and this task is a login-
// page visual match, not a global input-height change.
const loginInputClassName =
  "h-11 w-full rounded-lg border-[1.5px] border-neutral-300 bg-white px-3.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-adop-accent focus:ring-2 focus:ring-adop-accent/30 focus:outline-none aria-[invalid=true]:border-red-500";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <form action={formAction} className="flex w-full flex-col">
      <div className="mb-4 flex flex-col gap-1.5">
        <label htmlFor="email" className="text-[12.5px] font-semibold text-adop-ink-700">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className={loginInputClassName} />
      </div>

      <div className="mb-2 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-[12.5px] font-semibold text-adop-ink-700">
            Kata Sandi
          </label>
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-adop-accent-800 underline-offset-4 hover:underline"
          >
            Lupa kata sandi?
          </Link>
        </div>
        <div className="flex h-11 items-center overflow-hidden rounded-lg border-[1.5px] border-neutral-300 bg-white focus-within:border-adop-accent focus-within:ring-2 focus-within:ring-adop-accent/30">
          <input
            id="password"
            name="password"
            type={passwordVisible ? "text" : "password"}
            autoComplete="current-password"
            required
            className="h-full flex-1 border-none bg-transparent px-3.5 text-sm text-neutral-900 focus:ring-0 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setPasswordVisible((value) => !value)}
            aria-label={passwordVisible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            className="flex h-full w-11 shrink-0 items-center justify-center bg-transparent text-adop-ink-500 hover:text-adop-ink-700 focus:outline-none"
          >
            {passwordVisible ? "🙈" : "👁"}
          </button>
        </div>
      </div>

      <label className="my-3.5 flex items-center gap-2">
        {/* Visual only — not submitted with the form. "Remember me" would
            change session lifetime, which is an auth-behavior change out of
            this visual-fidelity task's scope. */}
        <input type="checkbox" defaultChecked className="h-[17px] w-[17px] accent-brand-navy" />
        <span className="text-[13px] font-medium text-adop-ink-700">Ingat saya di perangkat ini</span>
      </label>

      {state.error ? (
        <p role="alert" className="mb-2 text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="adop-login-cta mt-1 inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-[9px] px-6 text-[15px] font-semibold text-adop-accent-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed"
      >
        {isPending ? <Spinner /> : null}
        {isPending ? "Memproses…" : "Masuk"}
      </button>

      <div className="my-6 flex items-center gap-2.5">
        <div className="h-px flex-1 bg-neutral-200" />
        <span className="text-[11.5px] text-adop-ink-500">atau</span>
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

      {/* SSO provider stays open/unconfigured — disabled rather than wired
          to a non-existent flow. */}
      <button
        type="button"
        disabled
        title="Single Sign-On belum dikonfigurasi"
        className="flex h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border-[1.5px] border-neutral-300 bg-white text-[13.5px] font-semibold text-neutral-400"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" />
        </svg>
        Masuk dengan Single Sign-On
      </button>

      <p className="mt-7 text-center text-xs text-adop-ink-500">
        Butuh bantuan akses? Hubungi administrator ADOP di perusahaan Anda.
      </p>
    </form>
  );
}
