import { AppShell } from "@/components/shell/AppShell";

export default async function CompanyProfilePage() {
  return (
    <AppShell title="Profil Perusahaan">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-10">
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-sm text-neutral-500 dark:border-neutral-700">
          Profil Perusahaan belum diimplementasikan. Identitas legal entity saat ini dikelola melalui konfigurasi
          tenant/legal-entity (lihat Master Data untuk data yang sudah tersedia).
        </p>
      </div>
    </AppShell>
  );
}
