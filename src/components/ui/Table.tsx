// Shared table shell — sticky-style header, horizontal scroll on overflow,
// right/center column alignment helpers. Not yet consumed by any page: the
// existing transaction/import tables (TransactionTable.tsx, RowTable.tsx)
// already have their own tested implementations and are out of this
// redesign's scope — this is a ready-for-reuse shared primitive per the
// design system's Table spec, for the next page that needs one.
export function Table({
  children,
  minWidth,
  className = "",
}: {
  children: React.ReactNode;
  minWidth?: string;
  className?: string;
}) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800 ${className}`}>
      <table className="w-full border-collapse" style={minWidth ? { minWidth } : undefined}>
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-neutral-50 dark:bg-neutral-900">{children}</thead>;
}

export function TableRow({
  children,
  muted = false,
  className = "",
}: {
  children: React.ReactNode;
  muted?: boolean;
  className?: string;
}) {
  return (
    <tr className={`border-b border-neutral-200 last:border-b-0 dark:border-neutral-800 ${muted ? "text-neutral-400" : ""} ${className}`}>
      {children}
    </tr>
  );
}

const ALIGN_CLASSES = { left: "text-left", right: "text-right", center: "text-center" } as const;

export function Th({
  children,
  align = "left",
  density = "comfortable",
}: {
  children?: React.ReactNode;
  align?: keyof typeof ALIGN_CLASSES;
  density?: "comfortable" | "compact";
}) {
  return (
    <th
      className={`${ALIGN_CLASSES[align]} ${density === "compact" ? "py-1.5 px-3.5" : "py-3 px-3.5"} text-[11px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  density = "comfortable",
  className = "",
  ...rest
}: {
  children?: React.ReactNode;
  align?: keyof typeof ALIGN_CLASSES;
  density?: "comfortable" | "compact";
  className?: string;
} & React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={`${ALIGN_CLASSES[align]} ${density === "compact" ? "py-1.5 px-3.5 text-xs" : "py-3 px-3.5 text-sm"} ${className}`}
      {...rest}
    >
      {children}
    </td>
  );
}
