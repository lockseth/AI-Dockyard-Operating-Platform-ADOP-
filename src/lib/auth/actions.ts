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
import { requireAuthenticatedUser } from "@/lib/auth/session";
import {
  GENERIC_LOGIN_ERROR,
  GENERIC_PASSWORD_RESET_REQUESTED_MESSAGE,
  forgotPasswordFormSchema,
  loginFormSchema,
  setPasswordFormSchema,
} from "@/lib/auth/validation";

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
    redirect("/app");
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

  redirect("/app");
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

// Shared by both the recovery ("Lupa kata sandi?") and invite-acceptance
// flows — both land here with an active session established by
// /auth/confirm's verifyOtp call. `flow` is bound at the call site
// (invite/accept vs reset-password), never read from client input.
//
// Only the "recovery" flow signs the session out afterward. The "invite"
// flow deliberately stays signed in and returns to /invite/accept: setting a
// password is a prerequisite for a brand-new account, not the acceptance
// itself — the user still has to explicitly accept the specific invitation
// shown there (see public.accept_tenant_invitation), which requires an
// active session to call.
export async function updatePasswordAction(
  flow: "recovery" | "invite",
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

  await supabase.rpc("log_own_password_reset_completed");
  await supabase.auth.signOut();
  redirect("/login?passwordUpdated=1");
}
