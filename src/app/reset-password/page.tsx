import { getAuthenticatedUser } from "@/lib/auth/session";
import { SetPasswordForm } from "@/components/auth/SetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await getAuthenticatedUser();
  const hasValidSession = !!user && error !== "expired";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#fbfaf9] px-6 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-bold tracking-tight text-neutral-900">Atur Ulang Kata Sandi</h1>
        <p className="mb-6 text-sm text-neutral-500">Masukkan kata sandi baru untuk akun Anda.</p>
        <SetPasswordForm flow="recovery" hasValidSession={hasValidSession} />
      </div>
    </main>
  );
}
