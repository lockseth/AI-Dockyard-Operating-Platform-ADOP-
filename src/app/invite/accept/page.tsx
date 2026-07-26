import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { listPendingInvitationsForCurrentUser } from "@/lib/user-management/service";
import { SetPasswordForm } from "@/components/auth/SetPasswordForm";
import { AcceptInvitationForm } from "./AcceptInvitationForm";

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await getAuthenticatedUser();

  // Organic navigation with no session and no error param (not someone
  // bouncing off an expired/invalid link) — just send them to log in
  // normally; existing account holders reach their pending invitations here
  // after that, same as anyone else.
  if (!user && !error) {
    redirect("/login");
  }

  const hasValidSession = !!user && error !== "expired";
  const invitations = hasValidSession ? await listPendingInvitationsForCurrentUser() : [];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#fbfaf9] px-6 py-10">
      <div className="flex w-full max-w-md flex-col gap-8">
        <div>
          <h1 className="mb-1 text-xl font-bold tracking-tight text-neutral-900">Undangan Tenant</h1>
          <p className="text-sm text-neutral-500">Selesaikan pendaftaran dan terima undangan Anda.</p>
        </div>

        {!hasValidSession ? (
          <SetPasswordForm flow="invite" hasValidSession={false} />
        ) : (
          <>
            <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
              <h2 className="text-sm font-semibold">Atur Kata Sandi</h2>
              <SetPasswordForm flow="invite" hasValidSession />
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">Undangan Tertunda</h2>
              {invitations.length === 0 ? (
                <p className="text-sm text-neutral-500">Tidak ada undangan tertunda untuk akun Anda.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {invitations.map((invitation) => (
                    <AcceptInvitationForm key={invitation.id} invitation={invitation} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
