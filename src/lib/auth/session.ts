import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthenticatedUser {
  userId: string;
  email: string | null;
  // Set by admin-repository.ts (createUserWithTemporaryPassword /
  // setTemporaryPasswordAndConfirm) whenever a temporary password is
  // issued — read directly off the verified JWT's app_metadata claim, never
  // re-queried, so this reflects exactly what was true when the current
  // access token was minted (see requireAuthenticatedUser's gate below).
  mustChangePassword: boolean;
}

// Verifies the JWT via getClaims() (falls back to a network check against
// Auth for symmetric-signed local tokens) — never trusts getSession()'s
// unverified cookie payload for authorization decisions.
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return null;
  }

  return {
    userId: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    mustChangePassword: data.claims.app_metadata?.must_change_password === true,
  };
}

// The single server-side gate for must_change_password (LOGIN ENFORCEMENT,
// Gate 6G-H): every /app/*, /select-tenant, and /tenant/* page ultimately
// calls this (directly or via requireTenantContext), so a flagged user is
// redirected to /reset-password before any of them ever runs a query or
// renders protected data. /reset-password itself calls getAuthenticatedUser()
// (the non-redirecting function above) instead of this one, so there is no
// loop. proxy.ts stays optimistic-only, unaware of this flag, per this
// repo's convention that middleware is never the authorization gate.
export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }
  if (user.mustChangePassword) {
    redirect("/reset-password");
  }
  return user;
}
