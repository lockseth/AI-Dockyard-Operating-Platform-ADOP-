import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";
import { getServerEnv } from "@/lib/env/server";

// Service-role boundary. Deliberately NOT used by any page or the health
// endpoint — bypasses RLS, so only call this from trusted server-only
// workflows once one actually needs it.
//
// Fails closed: throws instead of returning a client with a missing key.
export function createSupabaseAdminClient() {
  const server = getServerEnv();

  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error(
      "Supabase admin client unavailable: NEXT_PUBLIC_SUPABASE_URL is not configured.",
    );
  }

  if (!server.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase admin client unavailable: SUPABASE_SERVICE_ROLE_KEY is not configured.",
    );
  }

  return createClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    server.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
