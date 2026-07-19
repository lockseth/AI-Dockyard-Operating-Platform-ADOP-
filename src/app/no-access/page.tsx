import { logoutAction } from "@/lib/auth/actions";
import { requireAuthenticatedUser } from "@/lib/auth/session";

// Deliberately does not query or render any tenant list here — a user
// without an active membership must never learn what tenants exist.
export default async function NoAccessPage() {
  await requireAuthenticatedUser();

  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
        Akses Tidak Tersedia
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">
        Belum ada akses tenant aktif
      </h1>
      <p className="max-w-sm text-sm text-neutral-500">
        Akun Anda belum memiliki keanggotaan tenant yang aktif. Hubungi admin
        ADOP Anda untuk mendapatkan akses.
      </p>
      <form action={logoutAction}>
        <button
          type="submit"
          className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          Keluar
        </button>
      </form>
    </main>
  );
}
