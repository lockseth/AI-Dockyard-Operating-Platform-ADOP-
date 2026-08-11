import Image from "next/image";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { branding } from "@/lib/branding";
import { pilotTenantLoginIdentity } from "@/lib/shell/pilot-tenant-identity";
import { LoginForm } from "./LoginForm";
import { DockScene } from "./DockScene";

export default async function LoginPage() {
  const user = await getAuthenticatedUser();
  if (user) {
    redirect("/app");
  }

  return (
    <main className="flex min-h-screen flex-col md:flex-row">
      <section className="adop-sidebar-surface relative hidden flex-1 flex-col justify-between overflow-hidden p-14 md:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(115deg, #262e89 0px, #262e89 1px, transparent 1px, transparent 64px)",
          }}
        />

        <div className="relative z-10 flex items-center gap-3">
          <Image
            src={pilotTenantLoginIdentity.logoPath}
            alt={pilotTenantLoginIdentity.legalName}
            width={44}
            height={44}
            className="h-11 w-11 shrink-0 rounded-lg border border-adop-accent-900/15 bg-white object-contain"
          />
          <div>
            <p className="text-xl font-extrabold tracking-tight text-adop-accent-950">
              {pilotTenantLoginIdentity.legalName}
            </p>
            <p className="text-[11px] font-medium text-adop-accent-900/50">
              {branding.productName} — {branding.subtitle}
            </p>
          </div>
        </div>

        <div className="relative z-10 max-w-[480px]">
          <h1 className="mb-3.5 text-[30px] leading-[1.25] font-extrabold text-adop-accent-950">
            Kendali operasional dan keuangan galangan, dalam satu platform.
          </h1>
          <p className="text-[14.5px] font-medium text-adop-accent-900/70">
            Kelola proyek kapal, penagihan, piutang, dan persetujuan owner secara terpusat dan dapat diaudit.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-2.5">
          <Image
            src="/branding/chamelonix-logo.png"
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 shrink-0 rounded-md object-contain"
          />
          <p className="text-[10.5px] text-adop-accent-900/50">{branding.poweredByLabel}</p>
        </div>
      </section>

      {/* Fixed off-white surface, not theme-adaptive: the login split is a
          branded layout, not a themed one, so it must not fall back to the
          global dark-mode body background. */}
      <section className="flex flex-1 flex-col items-center justify-center gap-6 bg-[#fbfaf9] px-6 py-10">
        <div className="flex w-full max-w-sm flex-col items-center gap-3 md:hidden">
          <Image
            src={pilotTenantLoginIdentity.logoPath}
            alt={pilotTenantLoginIdentity.legalName}
            width={48}
            height={48}
            className="h-12 w-12 rounded-md object-contain"
          />
          <p className="text-sm font-medium text-neutral-700">{pilotTenantLoginIdentity.legalName}</p>
        </div>

        <div className="w-full max-w-sm">
          <DockScene />

          <div className="mt-6 mb-6">
            <span className="block text-[11.5px] font-bold tracking-[0.06em] text-adop-accent-700 uppercase">
              {branding.statusLabel}
            </span>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-neutral-900">Selamat Datang Kembali</h2>
          </div>

          <LoginForm />

          <footer className="mt-7 text-center text-xs text-adop-ink-500 md:hidden">
            {branding.poweredByLabel}
          </footer>
        </div>
      </section>
    </main>
  );
}
