"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { performBootstrapClaim } from "@/lib/first-owner-bootstrap/claim-repository";
import { passwordSchema } from "@/lib/auth/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const claimFormSchema = z
  .object({
    token: z.string().trim().min(1),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Konfirmasi kata sandi tidak sama.",
    path: ["confirmPassword"],
  });

export interface ClaimActionState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

// Never distinguishes invalid vs expired vs already-claimed vs
// email-mismatch vs tenant-already-has-owner to the browser — same
// fail-closed-and-generic convention as every other pre-auth link flow in
// this codebase (implicit-confirm, SetPasswordForm). Distinguishing those
// reasons is only useful to an attacker probing which tokens exist.
const GENERIC_INVALID_MESSAGE = "Tautan ini tidak valid, sudah digunakan, atau sudah kedaluwarsa.";

export async function claimFirstOwnerBootstrapAction(
  _prevState: ClaimActionState,
  formData: FormData,
): Promise<ClaimActionState> {
  const parsed = claimFormSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const result = await performBootstrapClaim(parsed.data.token, parsed.data.password);
  if (!result.ok) {
    return { error: GENERIC_INVALID_MESSAGE };
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: result.email,
    password: parsed.data.password,
  });

  // The account, membership, and owner role are already committed at this
  // point regardless of what happens below — a sign-in hiccup here is only
  // a convenience-login failure, never a reason to report the claim itself
  // as failed.
  if (signInError) {
    redirect("/login?claimed=1");
  }

  redirect("/app");
}
