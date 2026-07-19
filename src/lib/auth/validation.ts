import { z } from "zod";

export const loginFormSchema = z.object({
  email: z.string().trim().min(1).email(),
  password: z.string().min(1),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

// Never surface which field was wrong (unknown email vs wrong password) —
// a single generic message for every failure mode, validation or auth.
export const GENERIC_LOGIN_ERROR = "Email atau password tidak valid.";
