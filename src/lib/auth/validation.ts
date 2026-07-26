import { z } from "zod";

export const loginFormSchema = z.object({
  email: z.string().trim().min(1).email(),
  password: z.string().min(1),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

// Never surface which field was wrong (unknown email vs wrong password) —
// a single generic message for every failure mode, validation or auth.
export const GENERIC_LOGIN_ERROR = "Email atau password tidak valid.";

export const forgotPasswordFormSchema = z.object({
  email: z.string().trim().min(1).email(),
});

// Same shape as GENERIC_LOGIN_ERROR's rule: the response to a password-reset
// request must never reveal whether the email is registered.
export const GENERIC_PASSWORD_RESET_REQUESTED_MESSAGE =
  "Jika email terdaftar, tautan reset kata sandi telah dikirim.";

// Mirrors supabase/config.toml's `minimum_password_length` (6) but sets a
// stronger app-level floor (8) — Supabase Auth itself still enforces its own
// configured minimum server-side regardless of this schema.
export const passwordSchema = z
  .string()
  .min(8, "Kata sandi minimal 8 karakter.")
  .max(72, "Kata sandi maksimal 72 karakter.");

export const setPasswordFormSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Konfirmasi kata sandi tidak sama.",
    path: ["confirmPassword"],
  });

// Post-auth-callback redirect targets this app actually has — anything else
// (including an absolute URL or a path outside this list) is rejected, so
// the `next` query param on /auth/confirm can never be used as an open
// redirect.
const ALLOWED_POST_AUTH_REDIRECTS = ["/reset-password", "/invite/accept"] as const;

export function isAllowedPostAuthRedirect(next: string | null): next is (typeof ALLOWED_POST_AUTH_REDIRECTS)[number] {
  return next !== null && (ALLOWED_POST_AUTH_REDIRECTS as readonly string[]).includes(next);
}
