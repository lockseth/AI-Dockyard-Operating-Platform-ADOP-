"use client";

import { useActionState, useState } from "react";
import { loginAction, type LoginActionState } from "@/lib/auth/actions";
import { inputClassName } from "@/components/master-data/fields";
import { Button } from "@/components/ui/Button";

const initialState: LoginActionState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-[12.5px] font-semibold text-neutral-700 dark:text-neutral-300">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={inputClassName}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-[12.5px] font-semibold text-neutral-700 dark:text-neutral-300">
          Kata Sandi
        </label>
        <div className="flex h-[42px] items-center overflow-hidden rounded-lg border-[1.5px] border-neutral-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30 dark:border-neutral-700">
          <input
            id="password"
            name="password"
            type={passwordVisible ? "text" : "password"}
            autoComplete="current-password"
            required
            className="h-full flex-1 border-none bg-white px-3 text-sm text-neutral-900 focus:outline-none focus:ring-0 dark:bg-neutral-900 dark:text-neutral-100"
          />
          <button
            type="button"
            onClick={() => setPasswordVisible((value) => !value)}
            aria-label={passwordVisible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            className="flex h-full w-11 shrink-0 items-center justify-center bg-white text-neutral-400 hover:text-neutral-600 focus:outline-none dark:bg-neutral-900 dark:hover:text-neutral-200"
          >
            {passwordVisible ? "🙈" : "👁"}
          </button>
        </div>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="lg" loading={isPending} className="w-full">
        {isPending ? "Memproses…" : "Masuk"}
      </Button>
      <p className="text-center text-xs text-neutral-400">
        Butuh bantuan akses? Hubungi administrator ADOP di perusahaan Anda.
      </p>
    </form>
  );
}
