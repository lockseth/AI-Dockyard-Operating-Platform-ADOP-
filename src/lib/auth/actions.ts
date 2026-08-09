"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env/server";
import {
  applyActiveTenantSelection,
  clearActiveTenantCookie,
  hasPendingInvitations,
  listActiveMemberships,
} from "@/lib/auth/tenant";
import { getAuthenticatedUser, requireAuthenticatedUser } from "@/lib/auth/session";
import {
  GENERIC_LOGIN_ERROR,
  GENERIC_PASSWORD_RESET_REQUESTED_MESSAGE,
  forgotPasswordFormSchema,
  loginFormSchema,
  setPasswordFormSchema,
} from "@/lib/auth/validation";
import { clearMustChangePasswordFlag } from "@/lib/user-management/admin-repository";
import { resolvePostAuthDestination } from "@/lib/owner-control/access";

export interface LoginActionState {
  error?: string;
}

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = loginFormSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: GENERIC_LOGIN_ERROR };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    return { error: GENERIC_LOGIN_ERROR };
  }

  const memberships = await listActiveMemberships(data.user.id);

  if (memberships.length === 0) {
    redirect((await hasPendingInvitations()) ? "/invite/accept" : "/no-access");
  }

  if (memberships.length === 1) {
    await applyActiveTenantSelection(data.user.id, memberships[0].tenantId);
    redirect(resolvePostAuthDestination(memberships[0].roles));
  }

  redirect("/select-tenant");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  await clearActiveTenantCookie();
  redirect("/login");
}

export interface SelectTenantActionState {
  error?: string;
}

export async function selectTenantAction(
  _prevState: SelectTenantActionState,
  formData: FormData,
): Promise<SelectTenantActionState> {
  const user = await requireAuthenticatedUser();
  const tenantId = formData.get("tenantId");

  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return { error: "Pilihan tenant tidak valid." };
  }

  const ok = await applyActiveTenantSelection(user.userId, tenantId);
  if (!ok) {
    return { error: "Anda tidak memiliki akses ke tenant tersebut." };
  }

  const memberships = await listActiveMemberships(user.userId);
  const selected = memberships.find((m) => m.tenantId === tenantId);
  redirect(resolvePostAuthDestination(selected?.roles ?? []));
}

export interface ForgotPasswordActionState {
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

// Always returns the same message regardless of whether the email is
// registered, whether Supabase found an account, or whether sending failed —
// email enumeration must not be observable from this response. Supabase's
// own resetPasswordForEmail already avoids revealing existence; this action
// does not add a second branch that could leak it back.
export async function requestPasswordResetAction(
  _prevState: ForgotPasswordActionState,
  formData: FormData,
): Promise<ForgotPasswordActionState> {
  const parsed = forgotPasswordFormSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const redirectTo = `${getServerEnv().APP_URL}/auth/implicit-confirm?next=${encodeURIComponent("/reset-password")}`;
  await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });

  return { message: GENERIC_PASSWORD_RESET_REQUESTED_MESSAGE };
}

export interface SetPasswordActionState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

// Shared by the recovery ("Lupa kata sandi?"), invite-acceptance, and
// forced (must_change_password) flows — all three land here with an active
// session already established (verifyOtp for the first two, an ordinary
// login with a temporary password for "forced"). `flow` is bound at the
// call site (invite/accept vs reset-password), never read from client
// input.
//
// Only "recovery" signs the session out afterward. "invite" deliberately
// stays signed in and returns to /invite/accept: setting a password is a
// prerequisite for a brand-new account, not the acceptance itself — the
// user still has to explicitly accept the specific invitation shown there
// (see public.accept_tenant_invitation), which requires an active session
// to call. "forced" also stays signed in and goes straight to /app: the
// LOGIN ENFORCEMENT contract (Gate 6G-H) is "change password once, then
// proceed" — not a second sign-in step.
export async function updatePasswordAction(
  flow: "recovery" | "invite" | "forced",
  _prevState: SetPasswordActionState,
  formData: FormData,
): Promise<SetPasswordActionState> {
  const parsed = setPasswordFormSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (updateError) {
    return { error: "Gagal memperbarui kata sandi. Tautan mungkin sudah tidak valid atau kedaluwarsa." };
  }

  if (flow === "invite") {
    redirect("/invite/accept");
  }

  if (flow === "forced") {
    const user = await getAuthenticatedUser();
    if (!user) {
      redirect("/login");
    }

    const cleared = await clearMustChangePasswordFlag(user.userId);
    if (cleared.error) {
      return { error: "Kata sandi tersimpan, tetapi gagal menghapus tanda wajib-ganti-kata-sandi. Silakan coba lagi." };
    }

    // The access token already in this session's cookies was minted before
    // the app_metadata clear above, so it would still read
    // must_change_password = true and bounce straight back to this page —
    // forcing a refresh here re-mints it against the now-current auth.users
    // row (this repo's convention: getClaims() is always re-verified from
    // the current token, never a session-scoped cache) before redirecting.
    await supabase.auth.refreshSession();
    // Single-membership is the common case and unambiguous; with more than
    // one membership there's no active-tenant cookie yet at this point in
    // the forced flow, so this falls back to /app (unchanged from before
    // this fix) rather than guessing which tenant's role should apply.
    const memberships = await listActiveMemberships(user.userId);
    redirect(memberships.length === 1 ? resolvePostAuthDestination(memberships[0].roles) : "/app");
  }

  await supabase.rpc("log_own_password_reset_completed");
  await supabase.auth.signOut();
  redirect("/login?passwordUpdated=1");
}
