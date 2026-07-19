import { requireTenantContext } from "@/lib/auth/tenant";
import { listExpenseCategoriesForActiveTenant } from "@/lib/master-data/expense-categories/service";
import { SearchForm } from "@/components/master-data/SearchForm";
import { CollapsibleCreatePanel } from "@/components/master-data/CollapsibleCreatePanel";
import { ExpenseCategoryCreateForm } from "./ExpenseCategoryCreateForm";
import { ExpenseCategoryRow } from "./ExpenseCategoryRow";

export default async function ExpenseCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const context = await requireTenantContext();
  const canMutate = context.roles.some((role) => role === "owner" || role === "admin");
  const categories = await listExpenseCategoriesForActiveTenant(q);
  const nameById = new Map(categories.map((category) => [category.id, category.name]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Expense Categories</h2>
        <SearchForm placeholder="Cari nama kategori..." defaultValue={q} />
      </div>

      {canMutate ? (
        <CollapsibleCreatePanel label="Tambah Kategori Biaya">
          <ExpenseCategoryCreateForm categories={categories} />
        </CollapsibleCreatePanel>
      ) : null}

      {categories.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          {q ? "Tidak ada kategori yang cocok dengan pencarian." : "Belum ada kategori biaya."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {categories.map((category) => (
            <ExpenseCategoryRow
              key={category.id}
              category={category}
              parentName={category.parent_id ? (nameById.get(category.parent_id) ?? null) : null}
              canMutate={canMutate}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
