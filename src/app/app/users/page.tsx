import { AppShell } from "@/components/shell/AppShell";

export default async function UsersPage() {
  return (
    <AppShell title="User & Hak Akses">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-10">
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-sm text-neutral-500 dark:border-neutral-700">
          Manajemen User & Hak Akses belum diimplementasikan. Aktivasi user dan role saat ini dikelola melalui
          security workflow terpisah, bukan self-service UI.
        </p>
      </div>
    </AppShell>
  );
}
