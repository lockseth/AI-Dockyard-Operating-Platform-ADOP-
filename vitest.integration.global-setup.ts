import { existsSync } from "node:fs";
import path from "node:path";

// Runs once, before any integration test file starts. `supabase db reset`
// returns as soon as it has restarted the containers — PostgREST can still
// be mid-reload of its schema cache for a moment after that, and a test file
// that opens its first connection during that window gets a genuine but
// misleading "Could not query the database for the schema cache. Retrying."
// error that has nothing to do with the test's own logic. Waiting here for
// PostgREST to actually answer removes that race without retrying or
// weakening any test assertion.
export default async function setup() {
  const envLocalPath = path.resolve(__dirname, ".env.local");
  if (existsSync(envLocalPath)) {
    process.loadEnvFile(envLocalPath);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return;
  }

  const deadline = Date.now() + 30_000;
  let lastError: string | null = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/rest/v1/`, {
        headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
      });
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}: ${await response.text()}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `PostgREST did not become ready within 30s (last error: ${lastError}). ` +
      "If this follows `supabase db reset`, the schema cache may still be reloading.",
  );
}
