import "server-only";
import type { NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env/server";
import { verifyInternalSecret } from "./secret";

const INTERNAL_SECRET_HEADER = "x-internal-secret";

// Fails closed when INTERNAL_API_SECRET is unconfigured (empty) — see
// verifyInternalSecret. Header-only, never a body field, so the secret can
// never end up logged alongside a JSON payload by accident.
export function isAuthorizedInternalRequest(request: NextRequest): boolean {
  const env = getServerEnv();
  const provided = request.headers.get(INTERNAL_SECRET_HEADER);
  return verifyInternalSecret(provided, env.INTERNAL_API_SECRET);
}
