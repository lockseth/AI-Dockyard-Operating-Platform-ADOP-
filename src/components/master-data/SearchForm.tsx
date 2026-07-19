// Plain progressive-enhancement GET form — no client JS needed for a
// simple ?q= search.
export function SearchForm({ placeholder, defaultValue }: { placeholder: string; defaultValue?: string }) {
  return (
    <form method="get" className="flex gap-2">
      <input
        type="search"
        name="q"
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-700"
      />
      <button
        type="submit"
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:border-neutral-500 dark:border-neutral-700"
      >
        Cari
      </button>
    </form>
  );
}
