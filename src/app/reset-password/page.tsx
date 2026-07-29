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
  // A user redirected here by requireAuthenticatedUser() because
  // app_metadata.must_change_password is set gets the "forced" flow (stay
  // signed in, redirect to /app afterward) instead of the classic
  // forgot-password recovery flow (sign out, redirect to /login) — existing
  // owners following a real recovery-email link are completely unaffected.
  const flow = user?.mustChangePassword ? "forced" : "recovery";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#fbfaf9] px-6 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-bold tracking-tight text-neutral-900">Atur Ulang Kata Sandi</h1>
        <p className="mb-6 text-sm text-neutral-500">Masukkan kata sandi baru untuk akun Anda.</p>
        <SetPasswordForm flow={flow} hasValidSession={hasValidSession} />
      </div>
    </main>
  );
}
