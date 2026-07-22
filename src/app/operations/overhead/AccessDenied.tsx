import { logoutAction } from "@/lib/auth/actions";
import { Badge } from "@/components/ui/Badge";

export function AccessDenied() {
  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <Badge tone="danger">Akses Ditolak</Badge>
      <h1 className="text-2xl font-bold tracking-tight">Anda tidak memiliki akses ke halaman ini</h1>
      <p className="max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
        Alokasi Biaya Bersama/Overhead hanya dapat diakses oleh Admin atau Owner. Hubungi Pak Hanafi jika Anda
        memerlukan akses.
      </p>
      <form action={logoutAction}>
        <button
          type="submit"
          className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          Keluar
        </button>
      </form>
    </main>
  );
}
