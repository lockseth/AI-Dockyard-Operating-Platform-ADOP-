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
    <main className="flex min-h-screen flex-1 flex-col items-center justify-between gap-8 px-6 py-10">
      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image
            src={pilotTenantLoginIdentity.logoPath}
            alt={pilotTenantLoginIdentity.legalName}
            width={56}
            height={56}
            className="h-14 w-14 rounded object-contain"
          />
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {pilotTenantLoginIdentity.legalName}
          </p>
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
              {branding.statusLabel}
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">
              {branding.productName}
            </h1>
            <p className="text-sm text-neutral-400">{branding.brandedBy}</p>
          </div>
        </div>
        <LoginForm />
      </div>
      <footer className="text-xs text-neutral-400">{branding.poweredByLabel}</footer>
    </main>
  );
}
