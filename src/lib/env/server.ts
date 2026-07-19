import "server-only";
import { z } from "zod";

// Business date/day-boundary and display logic must use APP_TIMEZONE.
// Database timestamps stay UTC regardless of this setting.
function isValidTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const serverEnvSchema = z.object({
  APP_ENV: z.string().min(1).default("local"),
  // Server-only — do not add a NEXT_PUBLIC_APP_URL alias.
  APP_URL: z.string().default(""),
  APP_TIMEZONE: z
    .string()
    .min(1)
    .default("Asia/Jakarta")
    .refine(isValidTimeZone, "Invalid IANA timezone"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(""),
  AI_PROVIDER: z.string().default(""),
  AI_API_KEY: z.string().default(""),
  AI_MODEL: z.string().default(""),
  // WHATSAPP_PROVIDER belum LOCK — nilai "unconfigured" wajib diterima
  // dan tidak boleh menyebabkan crash. Jangan asumsikan provider spesifik.
  WHATSAPP_PROVIDER: z.string().min(1).default("unconfigured"),
  WHATSAPP_API_BASE_URL: z.string().default(""),
  WHATSAPP_API_TOKEN: z.string().default(""),
  WHATSAPP_SENDER_ID: z.string().default(""),
  INTERNAL_API_SECRET: z.string().default(""),
  CRON_SECRET: z.string().default(""),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedServerEnv: ServerEnv | null = null;

// Lazy + cached so a single invalid/missing var can't crash the app at
// import time — integrations that aren't configured yet resolve to "".
export function getServerEnv(): ServerEnv {
  if (!cachedServerEnv) {
    cachedServerEnv = serverEnvSchema.parse(process.env);
  }
  return cachedServerEnv;
}
