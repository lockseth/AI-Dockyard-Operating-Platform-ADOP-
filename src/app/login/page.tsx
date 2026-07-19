import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { branding } from "@/lib/branding";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const user = await getAuthenticatedUser();
  if (user) {
    redirect("/app");
  }

  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
          {branding.statusLabel}
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">
          {branding.productName}
        </h1>
        <p className="text-sm text-neutral-400">{branding.brandedBy}</p>
      </div>
      <LoginForm />
    </main>
  );
}
