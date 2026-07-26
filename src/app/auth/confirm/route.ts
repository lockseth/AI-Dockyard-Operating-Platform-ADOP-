import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env/server";
import { isAllowedPostAuthRedirect } from "@/lib/auth/validation";

const DEFAULT_REDIRECT = "/login";

// Handles both the invite and password-recovery email links. Uses
// verifyOtp({ token_hash, type }) rather than exchangeCodeForSession(code) —
// the PKCE code/code_verifier pair only works when the same browser starts
// and finishes the flow, which is not true here: inviteUserByEmail has no
// initiating browser at all, and the person clicking a recovery email is
// very often on a different device than the one that requested it.
// verifyOtp has no such requirement. `next` is validated against a small
// allowlist so this route can never be used as an open redirect.
//
// Redirect targets are built from the trusted, explicitly-configured
// APP_URL — never from request.url/request.nextUrl. Next.js's dev server
// silently canonicalizes the request host (e.g. a request actually sent to
// 127.0.0.1:3000 reports request.url as localhost:3000), which would send
// the browser to a different origin than the one the verifyOtp session
// cookie was just set for — the cookie (no explicit Domain) is scoped to
// whatever host the browser actually connected to, so following a
// mismatched-host redirect silently drops the session and the next page
// sees no auth at all.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const nextParam = searchParams.get("next");
  const appUrl = getServerEnv().APP_URL;

  const next = isAllowedPostAuthRedirect(nextParam) ? nextParam : DEFAULT_REDIRECT;

  if (!tokenHash || (type !== "invite" && type !== "recovery")) {
    return NextResponse.redirect(new URL(`${next}?error=expired`, appUrl));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return NextResponse.redirect(new URL(`${next}?error=expired`, appUrl));
  }

  return NextResponse.redirect(new URL(next, appUrl));
}
