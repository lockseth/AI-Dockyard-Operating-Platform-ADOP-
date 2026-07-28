import type { TargetDescriptor } from "./types";

// The single allowlisted target for Gate 6G-B. Deliberately a hardcoded
// constant, not read from an operator-supplied env/flag — accepting an
// external override would defeat the "fail closed, no arbitrary target"
// requirement. The candidate passed to evaluateTarget() below is whatever
// the runtime environment happens to be configured with; it is only ever
// compared against this constant, never trusted on its own.
export const ALLOWED_TARGET: TargetDescriptor = {
  ref: "lgdxxntwpdrlzyhysuzu",
  url: "https://lgdxxntwpdrlzyhysuzu.supabase.co",
};

export type TargetRejectionReason =
  | "empty_ref"
  | "empty_url"
  | "forbidden_marker"
  | "url_ref_inconsistent"
  | "ref_mismatch"
  | "url_mismatch";

export type TargetGuardResult =
  | { ok: true }
  | { ok: false; reason: TargetRejectionReason; detail: string };

export interface TargetCandidate {
  ref: string | null | undefined;
  url: string | null | undefined;
}

// Markers that must never appear in a bootstrap target regardless of what
// the allowlist says: local dev stacks, this repo's own sibling project
// (AODP — see supabase/config.toml's project_id comment), a similarly-named
// unrelated project (ASOS), and anything self-describing as production.
const FORBIDDEN_MARKERS = ["localhost", "127.0.0.1", "asos", "aodp", "production", "prod."];

function derivedRefFromUrl(url: string): string | null {
  const match = /^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i.exec(url.trim());
  return match ? match[1].toLowerCase() : null;
}

function reject(reason: TargetRejectionReason, detail: string): TargetGuardResult {
  return { ok: false, reason, detail };
}

// Pure, fail-closed comparison against ALLOWED_TARGET. Every rejection path
// is checked before the allowlist comparison so a caller always gets the
// most specific reason (empty > forbidden marker > internal inconsistency >
// allowlist mismatch).
export function evaluateTarget(candidate: TargetCandidate): TargetGuardResult {
  const ref = (candidate.ref ?? "").trim();
  const url = (candidate.url ?? "").trim();

  if (!ref) {
    return reject("empty_ref", "Project ref is empty.");
  }
  if (!url) {
    return reject("empty_url", "Supabase URL is empty.");
  }

  const lowerRef = ref.toLowerCase();
  const lowerUrl = url.toLowerCase();

  for (const marker of FORBIDDEN_MARKERS) {
    if (lowerRef.includes(marker) || lowerUrl.includes(marker)) {
      return reject("forbidden_marker", `Target contains forbidden marker "${marker}".`);
    }
  }

  const derivedRef = derivedRefFromUrl(url);
  if (!derivedRef || derivedRef !== lowerRef) {
    return reject(
      "url_ref_inconsistent",
      "Project ref does not match the ref encoded in the Supabase URL.",
    );
  }

  if (lowerRef !== ALLOWED_TARGET.ref.toLowerCase()) {
    return reject("ref_mismatch", "Project ref is not the allowlisted demo project.");
  }
  if (lowerUrl !== ALLOWED_TARGET.url.toLowerCase()) {
    return reject("url_mismatch", "Supabase URL is not the allowlisted demo project.");
  }

  return { ok: true };
}
