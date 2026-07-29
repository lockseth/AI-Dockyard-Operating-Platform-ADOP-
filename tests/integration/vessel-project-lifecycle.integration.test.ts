import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  createEphemeralMember as createEphemeralMemberBase,
  signInAsMember as signInAsMemberBase,
  type EphemeralMember,
} from "./support/members";

// Real local Supabase only — never point this at demo/production. Exercises
// the same RLS-scoped PostgREST/RPC surface the vessel-projects repository/
// service layer uses (real authenticated HTTP requests, not mocks), same
// split as master-data.integration.test.ts from Gate 1A.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "vessel-project-lifecycle.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in " +
      ".env.local — run `pnpm supabase:start` first.",
  );
}

// Seeded by supabase/seed.sql.
const TENANT_A_ID = "a1111111-1111-4111-8111-111111111111";
const TENANT_B_ID = "b2222222-2222-4222-8222-222222222222";

const admin: SupabaseClient = createAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function createEphemeralMember(params: {
  emailPrefix: string;
  tenantId: string;
  role: "owner" | "admin" | "reviewer" | "viewer";
}): Promise<EphemeralMember> {
  return createEphemeralMemberBase(admin, {
    emailPrefix: params.emailPrefix,
    memberships: [{ tenantId: params.tenantId, role: params.role }],
  });
}

async function signInAsMember(email: string): Promise<SupabaseClient> {
  return signInAsMemberBase(SUPABASE_URL!, ANON_KEY!, email);
}

describe("vessel project lifecycle — real local Supabase", () => {
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  let ownerA: EphemeralMember;
  let adminA: EphemeralMember;
  let reviewerA: EphemeralMember;
  let viewerA: EphemeralMember;
  let ownerB: EphemeralMember;

  let clientAId: string;
  let vesselAId: string;
  let serviceTypeAId: string;
  let facilityLocationAId: string;
  let clientBId: string;
  let vesselBId: string;
  let serviceTypeBId: string;
  let facilityLocationBId: string;

  beforeAll(async () => {
    ownerA = await createEphemeralMember({ emailPrefix: "vp-owner-a", tenantId: TENANT_A_ID, role: "owner" });
    createdUserIds.push(ownerA.id);
    adminA = await createEphemeralMember({ emailPrefix: "vp-admin-a", tenantId: TENANT_A_ID, role: "admin" });
    createdUserIds.push(adminA.id);
    reviewerA = await createEphemeralMember({ emailPrefix: "vp-reviewer-a", tenantId: TENANT_A_ID, role: "reviewer" });
    createdUserIds.push(reviewerA.id);
    viewerA = await createEphemeralMember({ emailPrefix: "vp-viewer-a", tenantId: TENANT_A_ID, role: "viewer" });
    createdUserIds.push(viewerA.id);
    ownerB = await createEphemeralMember({ emailPrefix: "vp-owner-b", tenantId: TENANT_B_ID, role: "owner" });
    createdUserIds.push(ownerB.id);

    // Master-data anchors, created via the service-role admin client — same
    // fixture-setup posture as master-data.integration.test.ts.
    const { data: clientA } = await admin
      .from("clients")
      .insert({ tenant_id: TENANT_A_ID, created_by: ownerA.id, display_name: "VP Anchor Client A" })
      .select("id")
      .single();
    clientAId = clientA!.id;

    const { data: vesselA } = await admin
      .from("vessels")
      .insert({ tenant_id: TENANT_A_ID, client_id: clientAId, created_by: ownerA.id, vessel_name: "VP Anchor Vessel A" })
      .select("id")
      .single();
    vesselAId = vesselA!.id;

    const { data: serviceTypeA } = await admin
      .from("service_types")
      .select("id")
      .eq("tenant_id", TENANT_A_ID)
      .eq("code", "standard")
      .single();
    serviceTypeAId = serviceTypeA!.id;

    const { data: facilityLocationA } = await admin
      .from("facility_locations")
      .insert({ tenant_id: TENANT_A_ID, name: "VP Anchor Facility A" })
      .select("id")
      .single();
    facilityLocationAId = facilityLocationA!.id;

    const { data: clientB } = await admin
      .from("clients")
      .insert({ tenant_id: TENANT_B_ID, created_by: ownerB.id, display_name: "VP Anchor Client B" })
      .select("id")
      .single();
    clientBId = clientB!.id;

    const { data: vesselB } = await admin
      .from("vessels")
      .insert({ tenant_id: TENANT_B_ID, client_id: clientBId, created_by: ownerB.id, vessel_name: "VP Anchor Vessel B" })
      .select("id")
      .single();
    vesselBId = vesselB!.id;

    const { data: serviceTypeB } = await admin
      .from("service_types")
      .select("id")
      .eq("tenant_id", TENANT_B_ID)
      .eq("code", "standard")
      .single();
    serviceTypeBId = serviceTypeB!.id;

    const { data: facilityLocationB } = await admin
      .from("facility_locations")
      .insert({ tenant_id: TENANT_B_ID, name: "VP Anchor Facility B" })
      .select("id")
      .single();
    facilityLocationBId = facilityLocationB!.id;
  });

  afterAll(async () => {
    if (createdProjectIds.length > 0) {
      await admin.from("vessel_projects").delete().in("id", createdProjectIds);
    }
    await admin.from("clients").delete().in("id", [clientAId, clientBId].filter(Boolean));
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("owner A can create a project, which starts active with one creation event", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);

    const { data: created, error: insertError } = await ownerAClient
      .from("vessel_projects")
      .insert({
        tenant_id: TENANT_A_ID,
        vessel_id: vesselAId,
        client_id: clientAId,
        service_type_id: serviceTypeAId,
        facility_location_id: facilityLocationAId,
        project_code: "IT-VP-01",
        start_date: "2026-01-15",
        created_by: ownerA.id,
      })
      .select("*")
      .single();
    expect(insertError).toBeNull();
    expect(created?.lifecycle_status).toBe("active");
    expect(created?.ready_to_close_at).toBeNull();
    expect(created?.closed_at).toBeNull();
    if (created) createdProjectIds.push(created.id);

    const { data: events } = await ownerAClient
      .from("vessel_project_lifecycle_events")
      .select("*")
      .eq("project_id", created!.id);
    expect(events).toHaveLength(1);
    expect(events![0].from_status).toBeNull();
    expect(events![0].to_status).toBe("active");
    expect(events![0].actor_user_id).toBe(ownerA.id);
  });

  it("admin A has the same create rights as owner A; reviewer/viewer cannot create", async () => {
    const adminAClient = await signInAsMember(adminA.email);
    const { data: created, error } = await adminAClient
      .from("vessel_projects")
      .insert({
        tenant_id: TENANT_A_ID,
        vessel_id: vesselAId,
        client_id: clientAId,
        service_type_id: serviceTypeAId,
        facility_location_id: facilityLocationAId,
        start_date: "2026-01-15",
        created_by: adminA.id,
      })
      .select("*")
      .single();
    expect(error).toBeNull();
    if (created) createdProjectIds.push(created.id);

    const reviewerAClient = await signInAsMember(reviewerA.email);
    const { error: reviewerError } = await reviewerAClient
      .from("vessel_projects")
      .insert({
        tenant_id: TENANT_A_ID,
        vessel_id: vesselAId,
        client_id: clientAId,
        service_type_id: serviceTypeAId,
        facility_location_id: facilityLocationAId,
        start_date: "2026-01-15",
        created_by: reviewerA.id,
      });
    expect(reviewerError).not.toBeNull();

    const viewerAClient = await signInAsMember(viewerA.email);
    const { error: viewerError } = await viewerAClient
      .from("vessel_projects")
      .insert({
        tenant_id: TENANT_A_ID,
        vessel_id: vesselAId,
        client_id: clientAId,
        service_type_id: serviceTypeAId,
        facility_location_id: facilityLocationAId,
        start_date: "2026-01-15",
        created_by: viewerA.id,
      });
    expect(viewerError).not.toBeNull();
  });

  it("a project cannot reference a vessel/client from a different tenant", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const { error } = await ownerAClient.from("vessel_projects").insert({
      tenant_id: TENANT_A_ID,
      vessel_id: vesselBId,
      client_id: clientAId,
      service_type_id: serviceTypeAId,
      facility_location_id: facilityLocationAId,
      start_date: "2026-01-15",
      created_by: ownerA.id,
    });
    expect(error).not.toBeNull();
  });

  it("owner A can drive a project through its full valid lifecycle via the transition RPC", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);

    const { data: created } = await ownerAClient
      .from("vessel_projects")
      .insert({
        tenant_id: TENANT_A_ID,
        vessel_id: vesselAId,
        client_id: clientAId,
        service_type_id: serviceTypeAId,
        facility_location_id: facilityLocationAId,
        project_code: "IT-VP-LIFECYCLE",
        start_date: "2026-01-15",
        created_by: ownerA.id,
      })
      .select("*")
      .single();
    createdProjectIds.push(created!.id);

    const { data: readyToClose, error: readyError } = await ownerAClient.rpc("transition_vessel_project_lifecycle", {
      p_project_id: created!.id,
      p_to_status: "ready_to_close",
      p_reason: "siap tutup",
    });
    expect(readyError).toBeNull();
    expect(readyToClose?.lifecycle_status).toBe("ready_to_close");
    expect(readyToClose?.ready_to_close_at).not.toBeNull();

    const { data: closed, error: closedError } = await ownerAClient.rpc("transition_vessel_project_lifecycle", {
      p_project_id: created!.id,
      p_to_status: "closed",
    });
    expect(closedError).toBeNull();
    expect(closed?.lifecycle_status).toBe("closed");
    expect(closed?.closed_at).not.toBeNull();
    expect(closed?.closed_by).toBe(ownerA.id);

    const { data: events } = await ownerAClient
      .from("vessel_project_lifecycle_events")
      .select("*")
      .eq("project_id", created!.id)
      .order("created_at", { ascending: true });
    expect(events).toHaveLength(3);
    expect(events!.map((e) => e.to_status)).toEqual(["active", "ready_to_close", "closed"]);
    expect(events![1].reason).toBe("siap tutup");

    // Skip/reverse/reopen are all rejected — the trigger, not the app, is
    // the source of truth for this.
    const { error: skipError } = await ownerAClient.rpc("transition_vessel_project_lifecycle", {
      p_project_id: created!.id,
      p_to_status: "active",
    });
    expect(skipError).not.toBeNull();
  });

  // Gate 6I-A corrective: pgTAP already exhaustively proves the deterministic
  // rules (missing/cross-tenant facility rejected, complete draft activates,
  // unauthorized/cross-tenant rejected — supabase/tests/database/import_
  // candidate_projects_and_exception_review.test.sql Scenario 9). This is
  // the one thing that needs a real HTTP round trip: true concurrent
  // "Lengkapi & Aktifkan" calls racing on the SAME incomplete draft.
  it("concurrent complete-and-activate: two simultaneous transitions on the same incomplete draft succeed exactly once", async () => {
    const { data: draft } = await admin
      .from("vessel_projects")
      .insert({
        tenant_id: TENANT_A_ID,
        vessel_id: vesselAId,
        client_id: clientAId,
        service_type_id: serviceTypeAId,
        facility_location_id: null,
        lifecycle_status: "draft",
        start_date: "2026-01-15",
        created_by: ownerA.id,
      })
      .select("*")
      .single();
    expect(draft?.lifecycle_status).toBe("draft");
    createdProjectIds.push(draft!.id);

    const ownerAClientOne = await signInAsMember(ownerA.email);
    const ownerAClientTwo = await signInAsMember(ownerA.email);

    const [resultOne, resultTwo] = await Promise.all([
      ownerAClientOne.rpc("transition_vessel_project_lifecycle", {
        p_project_id: draft!.id,
        p_to_status: "active",
        p_facility_location_id: facilityLocationAId,
      }),
      ownerAClientTwo.rpc("transition_vessel_project_lifecycle", {
        p_project_id: draft!.id,
        p_to_status: "active",
        p_facility_location_id: facilityLocationAId,
      }),
    ]);

    const outcomes = [resultOne, resultTwo];
    const succeeded = outcomes.filter((r) => r.error === null);
    const failed = outcomes.filter((r) => r.error !== null);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    // The loser's row lock waits for the winner's commit, then sees lifecycle_
    // status already changed — the trigger's own "unchanged" guard rejects it,
    // never a second activation.
    expect(failed[0].error!.message).toContain("status unchanged");

    const { data: finalProject } = await admin
      .from("vessel_projects")
      .select("lifecycle_status, facility_location_id")
      .eq("id", draft!.id)
      .single();
    expect(finalProject!.lifecycle_status).toBe("active");
    expect(finalProject!.facility_location_id).toBe(facilityLocationAId);

    const { count: activeEventCount } = await admin
      .from("vessel_project_lifecycle_events")
      .select("id", { count: "exact", head: true })
      .eq("project_id", draft!.id)
      .eq("to_status", "active");
    expect(activeEventCount).toBe(1);
  });

  it("a reviewer cannot transition a project's lifecycle", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const { data: created } = await ownerAClient
      .from("vessel_projects")
      .insert({
        tenant_id: TENANT_A_ID,
        vessel_id: vesselAId,
        client_id: clientAId,
        service_type_id: serviceTypeAId,
        facility_location_id: facilityLocationAId,
        start_date: "2026-01-15",
        created_by: ownerA.id,
      })
      .select("*")
      .single();
    createdProjectIds.push(created!.id);

    const reviewerAClient = await signInAsMember(reviewerA.email);
    const { error } = await reviewerAClient.rpc("transition_vessel_project_lifecycle", {
      p_project_id: created!.id,
      p_to_status: "ready_to_close",
    });
    expect(error).not.toBeNull();

    const { data: stillActive } = await ownerAClient
      .from("vessel_projects")
      .select("lifecycle_status")
      .eq("id", created!.id)
      .single();
    expect(stillActive?.lifecycle_status).toBe("active");
  });

  it("Tenant A and Tenant B vessel projects are isolated from each other", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const ownerBClient = await signInAsMember(ownerB.email);

    const { data: projectB } = await ownerBClient
      .from("vessel_projects")
      .insert({
        tenant_id: TENANT_B_ID,
        vessel_id: vesselBId,
        client_id: clientBId,
        service_type_id: serviceTypeBId,
        facility_location_id: facilityLocationBId,
        start_date: "2026-01-15",
        created_by: ownerB.id,
      })
      .select("*")
      .single();
    createdProjectIds.push(projectB!.id);

    const { data: seenByA } = await ownerAClient.from("vessel_projects").select("id").eq("id", projectB!.id);
    expect(seenByA).toHaveLength(0);

    const { error: transitionError } = await ownerAClient.rpc("transition_vessel_project_lifecycle", {
      p_project_id: projectB!.id,
      p_to_status: "ready_to_close",
    });
    expect(transitionError).not.toBeNull();
  });

  it("a project cannot be hard-deleted by an authenticated member", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const { data: created } = await ownerAClient
      .from("vessel_projects")
      .insert({
        tenant_id: TENANT_A_ID,
        vessel_id: vesselAId,
        client_id: clientAId,
        service_type_id: serviceTypeAId,
        facility_location_id: facilityLocationAId,
        start_date: "2026-01-15",
        created_by: ownerA.id,
      })
      .select("*")
      .single();
    createdProjectIds.push(created!.id);

    const { error: deleteError } = await ownerAClient.from("vessel_projects").delete().eq("id", created!.id);
    expect(deleteError).not.toBeNull();

    const { data: stillThere } = await ownerAClient.from("vessel_projects").select("id").eq("id", created!.id);
    expect(stillThere).toHaveLength(1);
  });

  it("lifecycle events cannot be updated or deleted by an authenticated member", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const { data: created } = await ownerAClient
      .from("vessel_projects")
      .insert({
        tenant_id: TENANT_A_ID,
        vessel_id: vesselAId,
        client_id: clientAId,
        service_type_id: serviceTypeAId,
        facility_location_id: facilityLocationAId,
        start_date: "2026-01-15",
        created_by: ownerA.id,
      })
      .select("*")
      .single();
    createdProjectIds.push(created!.id);

    const { error: updateError } = await ownerAClient
      .from("vessel_project_lifecycle_events")
      .update({ reason: "tampered" })
      .eq("project_id", created!.id);
    expect(updateError).not.toBeNull();

    const { error: deleteError } = await ownerAClient
      .from("vessel_project_lifecycle_events")
      .delete()
      .eq("project_id", created!.id);
    expect(deleteError).not.toBeNull();

    // Viewer can read the project's current status, but not the lifecycle
    // event trail — same visibility posture as master_data_audit_events.
    const viewerAClient = await signInAsMember(viewerA.email);
    const { data: viewerEvents } = await viewerAClient
      .from("vessel_project_lifecycle_events")
      .select("id")
      .eq("project_id", created!.id);
    expect(viewerEvents).toHaveLength(0);
  });

  it("anonymous requests get zero access to vessel_projects", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anonClient = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await anonClient.from("vessel_projects").select("id");
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});
