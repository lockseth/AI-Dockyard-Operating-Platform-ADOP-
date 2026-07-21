export function PageHeader({
  title,
  operationalDateLabel,
}: {
  title: string;
  operationalDateLabel?: string;
}) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {operationalDateLabel ? <p className="text-sm text-neutral-500">{operationalDateLabel}</p> : null}
      </div>
      <span
        aria-hidden
        className="rounded-full p-2 text-neutral-400 dark:text-neutral-500"
        title="Notifikasi"
      >
        🔔
      </span>
    </header>
  );
}
