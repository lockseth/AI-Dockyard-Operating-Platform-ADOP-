import "server-only";
import { getServerEnv } from "@/lib/env/server";

// Pointer only — never treated as proof of authorization. Every read of this
// value is re-validated against tenant_memberships server-side before use.
export const ACTIVE_TENANT_COOKIE = "adop_active_tenant_id";

export function activeTenantCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // Local development runs over plain HTTP — `secure` would silently drop
    // the cookie there. Anything other than APP_ENV=local gets `secure`.
    secure: getServerEnv().APP_ENV !== "local",
    path: "/",
  };
}
