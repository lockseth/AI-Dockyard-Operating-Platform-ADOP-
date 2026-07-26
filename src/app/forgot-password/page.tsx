import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export default async function ForgotPasswordPage() {
  const user = await getAuthenticatedUser();
  if (user) {
    redirect("/app");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#fbfaf9] px-6 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-bold tracking-tight text-neutral-900">Lupa Kata Sandi</h1>
        <p className="mb-6 text-sm text-neutral-500">
          Masukkan email Anda. Jika terdaftar, kami akan mengirimkan tautan untuk mengatur ulang kata sandi.
        </p>
        <ForgotPasswordForm />
        <p className="mt-7 text-center text-xs text-neutral-500">
          <Link href="/login" className="font-medium underline underline-offset-4">
            Kembali ke halaman masuk
          </Link>
        </p>
      </div>
    </main>
  );
}
