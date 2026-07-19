"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  applyActiveTenantSelection,
  clearActiveTenantCookie,
  listActiveMemberships,
} from "@/lib/auth/tenant";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { GENERIC_LOGIN_ERROR, loginFormSchema } from "@/lib/auth/validation";

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
    redirect("/no-access");
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
