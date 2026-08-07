import Link from "next/link";
import { resolveBootstrapClaim } from "@/lib/first-owner-bootstrap/claim-repository";
import { ClaimForm } from "./ClaimForm";

// Public, pre-session route — the token itself IS the credential (see the
// migration's header comment). No auth check runs here on purpose: whoever
// holds this exact one-time link is the intended claimant.
export default async function FirstOwnerBootstrapClaimPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await resolveBootstrapClaim(token);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#fbfaf9] px-6 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-bold tracking-tight text-neutral-900">Aktivasi Akun Owner</h1>
        {!resolved ? (
          <>
            <p className="mb-6 text-sm text-neutral-500">Tautan ini tidak valid atau sudah kedaluwarsa.</p>
            <Link
              href="/login"
              className="font-medium text-blue-700 underline underline-offset-4 dark:text-blue-300"
            >
              Kembali ke Login
            </Link>
          </>
        ) : (
          <>
            <p className="mb-2 text-sm text-neutral-500">
              Selamat datang di <span className="font-medium">{resolved.tenantDisplayName}</span>. Atur kata sandi
              Anda untuk menjadi Owner pertama tenant ini.
            </p>
            <p className="mb-6 text-xs text-neutral-500">Email: {resolved.email}</p>
            <ClaimForm token={token} />
          </>
        )}
      </div>
    </main>
  );
}
