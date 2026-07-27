import { logoutAction } from "@/lib/auth/actions";

export function AccessDenied() {
  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">Akses Ditolak</span>
      <h1 className="text-2xl font-semibold tracking-tight">Anda tidak memiliki akses ke halaman ini</h1>
      <p className="max-w-sm text-sm text-neutral-500">
        Invoice dan dokumen evidence hanya dapat diakses oleh Owner dan Admin. Hubungi Pak Hanafi jika Anda memerlukan
        akses.
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
