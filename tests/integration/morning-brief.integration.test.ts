import { beforeEach, describe, expect, it, vi } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createAdminClient } from "./support/members";

// Gate 6J-E1-B — real local Supabase AND the real Next.js route handlers:
// the morning-brief compose+enqueue+claim route, plus the EXISTING,
// unmodified complete/fail routes it hands off to — invoked directly as
// functions (no HTTP server needed), same harness as assistant-inbound.
// integration.test.ts. pgTAP (morning_brief_notification_outbox_extension.
// test.sql) is the exhaustive state-machine proof for the RPC itself; this
// suite proves what a single pgTAP connection cannot: the real HTTP/env
// boundary (auth, validation, env-only tenant resolution, no internal-id
// leakage) and true concurrency across real HTTP-level callers.
//
// Unlike sibling integration files (e.g. owner-approved-cash-import-commit.
// integration.test.ts's randomBusinessDate()), business_date here is NOT
// caller-controlled — it is always derived server-side from real wall-clock
// time (getJakartaBusinessDate(new Date())) — so this file cannot dodge
// same-day collisions with its own previous runs the way cash-import's
// fixtures do. It assumes a freshly-reset local database (`pnpm db:reset`)
// so that today's (pilot tenant, business_date) row does not already exist
// when the concurrency test below runs; re-run `pnpm db:reset` before
// re-running this file on the same calendar day.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;
const PILOT_TENANT_SLUG = process.env.MORNING_BRIEF_PILOT_TENANT_SLUG;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !INTERNAL_SECRET || !PILOT_TENANT_SLUG) {
  throw new Error(
    "morning-brief.integration.test requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, " +
      "INTERNAL_API_SECRET and MORNING_BRIEF_PILOT_TENANT_SLUG in .env.local — run `pnpm supabase:start` first.",
  );
}

// Seeded by supabase/seed.sql. This file's fixtures assume
// MORNING_BRIEF_PILOT_TENANT_SLUG in .env.local points at tenant-a — the
// second seeded tenant (tenant-b) is used for the fail-callback test so it
// gets its own fresh (tenant, business_date) row instead of colliding with
// tenant-a's single slot for today.
const PILOT_TENANT_SLUG_SEEDED = "tenant-a";
const PILOT_TENANT_ID = "a1111111-1111-4111-8111-111111111111";
const SECOND_TENANT_SLUG_SEEDED = "tenant-b";

if (PILOT_TENANT_SLUG !== PILOT_TENANT_SLUG_SEEDED) {
  throw new Error(
    `morning-brief.integration.test expects MORNING_BRIEF_PILOT_TENANT_SLUG=${PILOT_TENANT_SLUG_SEEDED} in ` +
      `.env.local (the seeded active tenant this file's fixtures assume), got "${PILOT_TENANT_SLUG}".`,
  );
}

const admin: SupabaseClient = createAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function importRoute(): Promise<typeof import("@/app/api/internal/morning-brief/route")> {
  vi.resetModules();
  return import("@/app/api/internal/morning-brief/route");
}

async function importNotificationCallbackRoutes(): Promise<{
  complete: typeof import("@/app/api/internal/notifications/complete/route");
  fail: typeof import("@/app/api/internal/notifications/fail/route");
}> {
  const [complete, fail] = await Promise.all([
    import("@/app/api/internal/notifications/complete/route"),
    import("@/app/api/internal/notifications/fail/route"),
  ]);
  return { complete, fail };
}

function buildRequest(url: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function buildMorningBriefRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return buildRequest("http://localhost/api/internal/morning-brief", body, headers);
}

function stubBaseEnv(pilotSlug: string): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL!);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY!);
  vi.stubEnv("INTERNAL_API_SECRET", INTERNAL_SECRET!);
  vi.stubEnv("MORNING_BRIEF_PILOT_TENANT_SLUG", pilotSlug);
}

describe("POST /api/internal/morning-brief — real local Supabase", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    stubBaseEnv(PILOT_TENANT_SLUG_SEEDED);
  });

  it("rejects a request with no secret header — 401, never reaches the service", async () => {
    const { POST } = await importRoute();
    const response = await POST(buildMorningBriefRequest({ workerId: "mb-it-1" }));
    expect(response.status).toBe(401);
  });

  it("rejects a request with the wrong secret — 401", async () => {
    const { POST } = await importRoute();
    const response = await POST(buildMorningBriefRequest({ workerId: "mb-it-1" }, { "x-internal-secret": "wrong-secret" }));
    expect(response.status).toBe(401);
  });

  it("rejects an invalid body (empty workerId) — 400, even with a correct secret", async () => {
    const { POST } = await importRoute();
    const response = await POST(buildMorningBriefRequest({ workerId: "" }, { "x-internal-secret": INTERNAL_SECRET! }));
    expect(response.status).toBe(400);
  });

  // service_role has no direct SELECT grant on notification_events at all
  // (discovered while writing this suite — an earlier draft tried a raw
  // .from("notification_events").select(...) read via the admin client and
  // got 42501 "permission denied for table notification_events"). Access is
  // RPC-only by design (see 20260721000000_owner_control_notification_
  // outbox.sql's own design comment: "service_role has no direct UPDATE
  // grant... mutation is RPC-only" — the same is true of reads). Asserted
  // here explicitly so this privilege boundary has a real-connection proof,
  // not just an absence of a grant statement in the migration.
  it("service_role cannot read notification_events directly — access is RPC-only, not table-granted", async () => {
    const { error } = await admin.from("notification_events").select("id").limit(1);
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  it("dryRun=true returns a real composed preview and is safely repeatable (never claims anything)", async () => {
    const { POST } = await importRoute();

    const first = await POST(buildMorningBriefRequest({ workerId: "mb-it-dryrun-1", dryRun: true }, { "x-internal-secret": INTERNAL_SECRET! }));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.preview).toBe(true);
    expect(typeof firstBody.businessDate).toBe("string");
    expect(typeof firstBody.message).toBe("string");
    expect(firstBody.message).toContain("Selamat pagi, Pak Hanafi.");

    // previewMorningBrief() is a pure read path — see composeForPilotTenant
    // in src/lib/morning-brief/service.ts, which the dryRun branch calls
    // instead of composeAndEnqueueMorningBrief (already unit-proven via
    // mocks in route.test.ts's "never calls the enqueue path" case). Calling
    // it twice against the exact same underlying tenant state must produce
    // byte-identical output — proof against the real read-model, not a mock,
    // that no RPC call/mutation happened in between to shift the state.
    const second = await POST(buildMorningBriefRequest({ workerId: "mb-it-dryrun-2", dryRun: true }, { "x-internal-secret": INTERNAL_SECRET! }));
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody).toEqual(firstBody);
  });

  it("an unset pilot tenant slug fails closed with 503, never falling back to a default tenant", async () => {
    vi.unstubAllEnvs();
    stubBaseEnv("");
    const { POST } = await importRoute();

    const response = await POST(buildMorningBriefRequest({ workerId: "mb-it-no-slug" }, { "x-internal-secret": INTERNAL_SECRET! }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "PILOT_TENANT_UNAVAILABLE" });
  });

  it("an unknown pilot tenant slug fails closed with 503 — tenant selection comes only from env, never the body", async () => {
    vi.unstubAllEnvs();
    stubBaseEnv(`no-such-tenant-${crypto.randomUUID()}`);
    const { POST } = await importRoute();

    // Even a forged tenantId in the body changes nothing — the route never
    // reads a tenant field from the request at all (see also
    // route.test.ts's mocked "never accepts a tenantId in the body" case).
    const response = await POST(
      buildMorningBriefRequest(
        { workerId: "mb-it-bad-slug", tenantId: PILOT_TENANT_ID },
        { "x-internal-secret": INTERNAL_SECRET! },
      ),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "PILOT_TENANT_UNAVAILABLE" });
  });

  it(
    "N concurrent real (non-dryRun) requests for the pilot tenant produce at most one fresh claim; a further " +
      "call afterwards still reports duplicate; the response never exposes a tenant id or internal row field",
    async () => {
      const { POST } = await importRoute();

      const attempts = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          POST(buildMorningBriefRequest({ workerId: `mb-it-race-${i}` }, { "x-internal-secret": INTERNAL_SECRET! })),
        ),
      );

      for (const response of attempts) {
        expect(response.status).toBe(200);
      }
      const bodies = await Promise.all(attempts.map((r) => r.json()));

      const businessDates = new Set(bodies.map((b) => b.businessDate));
      expect(businessDates.size).toBe(1);

      const claimedIndexes = bodies.map((b, i) => (b.event !== null ? i : -1)).filter((i) => i >= 0);
      const duplicates = bodies.filter((b) => b.event === null);

      // The true concurrency-safety property: never more than one caller in
      // the burst wins a fresh claim, regardless of whether this exact
      // (tenant, business_date) row already existed before the burst ran
      // (see file header re: db reset precondition). Immediately after
      // `pnpm db:reset` this is exactly 1; the assertion below additionally
      // pins that intended happy path.
      expect(claimedIndexes.length).toBeLessThanOrEqual(1);
      expect(claimedIndexes.length + duplicates.length).toBe(5);
      for (const dup of duplicates) {
        expect(dup.duplicate).toBe(true);
      }
      if (claimedIndexes.length === 0) {
        throw new Error(
          "tenant-a already has a morning_brief row for today's business_date from a prior run (all 5 attempts " +
            "reported duplicate) — run `pnpm db:reset` before re-running this file on the same calendar day.",
        );
      }
      expect(claimedIndexes).toHaveLength(1);

      const winnerIndex = claimedIndexes[0];
      const winner = bodies[winnerIndex];

      // Response shape never leaks a tenant id or any other internal row
      // field beyond the notification event id the caller needs to
      // complete/fail it.
      expect(Object.keys(winner.event).sort()).toEqual(["id", "message"]);
      expect(Object.keys(winner).sort()).toEqual(["businessDate", "event"]);
      expect(JSON.stringify(winner)).not.toContain(PILOT_TENANT_ID);

      // Close the loop through the EXISTING, unmodified complete route —
      // proves complete_notification_event works unmodified on a
      // morning_brief row via the real HTTP path, not just pgTAP.
      const { complete } = await importNotificationCallbackRoutes();
      const completeResponse = await complete.POST(
        buildRequest(
          "http://localhost/api/internal/notifications/complete",
          { id: winner.event.id, workerId: `mb-it-race-${winnerIndex}`, providerMessageId: "integration-test-mb-1" },
          { "x-internal-secret": INTERNAL_SECRET! },
        ),
      );
      expect(completeResponse.status).toBe(200);
      const completeBody = await completeResponse.json();
      expect(completeBody.status).toBe("sent");

      // A further call after completion still reports duplicate, not a
      // second row — the once-per-business_date guarantee holds across
      // calls, not just within one concurrent burst, and survives past the
      // terminal 'sent' state.
      const after = await POST(buildMorningBriefRequest({ workerId: "mb-it-race-after" }, { "x-internal-secret": INTERNAL_SECRET! }));
      const afterBody = await after.json();
      expect(afterBody.event).toBeNull();
      expect(afterBody.duplicate).toBe(true);
    },
  );

  it("the existing fail route records a retryable failure for a fresh morning_brief claim (tenant-b)", async () => {
    vi.unstubAllEnvs();
    stubBaseEnv(SECOND_TENANT_SLUG_SEEDED);
    const { POST } = await importRoute();

    const claimResponse = await POST(buildMorningBriefRequest({ workerId: "mb-it-fail-1" }, { "x-internal-secret": INTERNAL_SECRET! }));
    expect(claimResponse.status).toBe(200);
    const claimBody = await claimResponse.json();

    if (claimBody.event === null) {
      // Same same-day-rerun caveat as the concurrency test above — if this
      // file already ran once today without an intervening db reset,
      // tenant-b's row for today is already claimed/sent; nothing left to
      // fail against.
      throw new Error(
        "tenant-b already has a morning_brief row for today's business_date from a prior run — " +
          "run `pnpm db:reset` before re-running this file on the same calendar day.",
      );
    }

    const { fail } = await importNotificationCallbackRoutes();
    const failResponse = await fail.POST(
      buildRequest(
        "http://localhost/api/internal/notifications/fail",
        { id: claimBody.event.id, workerId: "mb-it-fail-1", error: "fonnte send failed (integration test)" },
        { "x-internal-secret": INTERNAL_SECRET! },
      ),
    );
    expect(failResponse.status).toBe(200);
    const failBody = await failResponse.json();
    // Bounded retry: attempt_count is 1 (from the initial claim above),
    // below max_attempts (5, default) — the row goes back to 'pending',
    // claimable again, not straight to terminal 'failed'. Exact column-level
    // state (claimed_by cleared, last_error stored, attempt_count) is
    // exhaustively proven generically by owner_control_notification_outbox.
    // test.sql's own bounded-retry section and specifically for morning_
    // brief rows by morning_brief_notification_outbox_extension.test.sql's
    // lease-expiry-reclaim case — both run as table owner, which is the
    // only role that can actually read this table's columns directly (see
    // the "service_role cannot read notification_events directly" case
    // above). This suite instead proves the retry contract behaviorally,
    // through the same RPC surface a real caller has: a fresh claim call
    // for the same tenant+business_date must succeed again.
    expect(failBody.status).toBe("pending");

    const retryClaimResponse = await POST(
      buildMorningBriefRequest({ workerId: "mb-it-fail-retry" }, { "x-internal-secret": INTERNAL_SECRET! }),
    );
    expect(retryClaimResponse.status).toBe(200);
    const retryClaimBody = await retryClaimResponse.json();
    expect(retryClaimBody.businessDate).toBe(claimBody.businessDate);
    // Same row (same id), now claimable again by a different worker — not a
    // second row for the same tenant+business_date.
    expect(retryClaimBody.event.id).toBe(claimBody.event.id);
  });
});
