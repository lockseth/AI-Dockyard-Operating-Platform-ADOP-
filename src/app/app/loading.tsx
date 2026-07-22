// Route-segment loading skeleton (Next.js App Router convention) — shown
// automatically while AppPage's server-side data fetch is in flight. No
// sidebar/header here since /app has no layout.tsx of its own yet; the
// skeleton itself is the loading signal for this route's data.
export default function DashboardLoading() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10" aria-busy="true" aria-label="Memuat dashboard">
      {Array.from({ length: 4 }).map((_, sectionIndex) => (
        <div key={sectionIndex} className="flex flex-col gap-3">
          <div className="h-4 w-48 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((__, cardIndex) => (
              <div
                key={cardIndex}
                className="h-24 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
