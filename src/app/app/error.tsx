"use client";

// Route-segment error boundary (Next.js App Router convention). Catches
// failures from AppPage's server-side reads (e.g. a transient Supabase
// error) without taking down the whole app shell — reset() re-invokes the
// server component render.
export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-start gap-4 px-6 py-12">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Dashboard gagal dimuat</h2>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Terjadi kesalahan saat memuat data dashboard. Silakan coba lagi.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-navy px-[18px] text-sm font-semibold text-white hover:bg-brand-navy-hover"
      >
        Muat Ulang
      </button>
    </div>
  );
}
