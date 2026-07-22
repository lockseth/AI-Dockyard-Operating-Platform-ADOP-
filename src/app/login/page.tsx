import Image from "next/image";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { branding } from "@/lib/branding";
import { pilotTenantLoginIdentity } from "@/lib/shell/pilot-tenant-identity";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const user = await getAuthenticatedUser();
  if (user) {
    redirect("/app");
  }

  return (
    <main className="flex min-h-screen flex-col md:flex-row">
      <section className="hidden flex-1 flex-col justify-between bg-brand-navy p-14 text-white md:flex">
        <div>
          <p className="text-lg font-extrabold tracking-tight">{branding.productName}</p>
          <p className="text-xs font-medium text-white/60">{branding.subtitle}</p>
        </div>
        <div className="max-w-md">
          <h1 className="mb-3 text-3xl leading-snug font-extrabold">
            Kendali operasional dan kas galangan, dalam satu platform.
          </h1>
          <p className="text-sm font-medium text-white/70">
            Kelola proyek kapal, biaya operasional, dan persetujuan owner secara terpusat dan dapat diaudit.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Image
            src={pilotTenantLoginIdentity.logoPath}
            alt={pilotTenantLoginIdentity.legalName}
            width={30}
            height={30}
            className="h-[30px] w-[30px] rounded object-contain"
          />
          <div>
            <p className="text-[12.5px] font-bold">{pilotTenantLoginIdentity.legalName}</p>
            <p className="text-[10.5px] text-white/50">{branding.poweredByLabel}</p>
          </div>
        </div>
      </section>

      <section className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-10">
        <div className="flex w-full max-w-sm flex-col items-center gap-3 md:hidden">
          <Image
            src={pilotTenantLoginIdentity.logoPath}
            alt={pilotTenantLoginIdentity.legalName}
            width={48}
            height={48}
            className="h-12 w-12 rounded object-contain"
          />
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {pilotTenantLoginIdentity.legalName}
          </p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
            {branding.statusLabel}
          </span>
          <h2 className="text-xl font-bold tracking-tight">Selamat Datang Kembali</h2>
        </div>
        <LoginForm />
        <footer className="text-xs text-neutral-400 md:hidden">{branding.poweredByLabel}</footer>
      </section>
    </main>
  );
}
