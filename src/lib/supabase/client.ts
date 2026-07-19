import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env/public";

// Browser-safe boundary — only anon key/public URL, no service-role access.
// Safe to import from Client Components.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
