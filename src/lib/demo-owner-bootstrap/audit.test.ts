import { describe, expect, it } from "vitest";
import {
  buildLegalEntityAuditEvent,
  buildPrivilegedBootstrapAuditEvent,
  buildTenantCreatedAuditEvent,
} from "./audit";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const LEGAL_ENTITY_ID = "22222222-2222-4222-8222-222222222222";

describe("audit event builders", () => {
  it("builds a tenant create event matching the access_audit_events shape", () => {
    const event = buildTenantCreatedAuditEvent(TENANT_ID, "PT PELAYARAN GEMA BAHARI");
    expect(event).toMatchObject({
      tenant_id: TENANT_ID,
      entity_type: "tenant",
      entity_id: TENANT_ID,
      action: "create",
      actor_user_id: null,
    });
  });

  it("builds a legal entity audit event for create and update", () => {
    const created = buildLegalEntityAuditEvent(TENANT_ID, LEGAL_ENTITY_ID, "create", null, {
      legal_name: "PT PELAYARAN GEMA BAHARI",
    });
    expect(created.action).toBe("create");
    expect(created.entity_type).toBe("legal_entity");
    expect(created.entity_id).toBe(LEGAL_ENTITY_ID);

    const updated = buildLegalEntityAuditEvent(
      TENANT_ID,
      LEGAL_ENTITY_ID,
      "update",
      { legal_name: null },
      { legal_name: "PT PELAYARAN GEMA BAHARI" },
    );
    expect(updated.action).toBe("update");
  });

  it("builds a privileged bootstrap run summary event required for the run", () => {
    const event = buildPrivilegedBootstrapAuditEvent(
      TENANT_ID,
      ["resolve_or_create_tenant", "ensure_owner_role"],
      "lgdxxntwpdrlzyhysuzu",
    );
    expect(event).toMatchObject({
      tenant_id: TENANT_ID,
      entity_type: "tenant",
      entity_id: TENANT_ID,
      action: "privileged_bootstrap_run",
      actor_user_id: null,
    });
    expect(event.after_data).toMatchObject({
      applied_steps: ["resolve_or_create_tenant", "ensure_owner_role"],
      target_ref: "lgdxxntwpdrlzyhysuzu",
    });
  });

  it("never includes email, password, or key-shaped values in any built event", () => {
    const events = [
      buildTenantCreatedAuditEvent(TENANT_ID, "PT PELAYARAN GEMA BAHARI"),
      buildLegalEntityAuditEvent(TENANT_ID, LEGAL_ENTITY_ID, "create", null, {
        legal_name: "PT PELAYARAN GEMA BAHARI",
      }),
      buildPrivilegedBootstrapAuditEvent(TENANT_ID, ["resolve_or_create_tenant"], "lgdxxntwpdrlzyhysuzu"),
    ];
    const serialized = JSON.stringify(events);
    expect(serialized).not.toMatch(/@|password|service_role|eyJ/i);
  });
});
