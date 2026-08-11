import { requireTenantContext } from "@/lib/auth/tenant";
import { canAccessOwnerWhatsappRegistration } from "@/lib/assistant-identity/access";
import { getOwnerWhatsappRegistrationForActiveTenant } from "@/lib/assistant-identity/service";
import { AppShell } from "@/components/shell/AppShell";
import { AccessDenied } from "./AccessDenied";
import { OwnerWhatsappRegistrationForm } from "./OwnerWhatsappRegistrationForm";

export default async function PersonalSettingsPage() {
  const context = await requireTenantContext();

  if (!canAccessOwnerWhatsappRegistration(context.roles)) {
    return (
      <AppShell title="Profil & Notifikasi WhatsApp">
        <AccessDenied />
      </AppShell>
    );
  }

  const registration = await getOwnerWhatsappRegistrationForActiveTenant();

  return (
    <AppShell title="Profil & Notifikasi WhatsApp">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Notifikasi WhatsApp Owner</h2>
          <p className="text-sm text-neutral-500">
            Daftarkan nomor WhatsApp Anda untuk menerima notifikasi ADOP (mis. Morning Brief). Nomor perlu
            diverifikasi terlebih dahulu sebelum digunakan sebagai penerima notifikasi.
          </p>
          <OwnerWhatsappRegistrationForm initialRegistration={registration} />
        </section>
      </div>
    </AppShell>
  );
}
