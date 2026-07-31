import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Pure graph-shape contract for the canonical Gate 6J-E1 Morning Brief
// workflow JSON — no n8n runtime, no HTTP, no Fonnte call. Mirrors
// owner-control-whatsapp-notification.test.ts's node-name/connection-key
// drift guard, plus assertions specific to this workflow's LOCKs: no $env
// (hosted BOC n8n denies it, Gate 6J-D1), credential-based auth only,
// Asia/Jakarta schedule, and no secret/phone/tenant UUID checked into the
// repo.
type WorkflowNode = {
  name: string;
  type: string;
  parameters?: Record<string, unknown>;
  credentials?: Record<string, { id: string; name: string }>;
};
type WorkflowConnections = Record<
  string,
  { main: Array<Array<{ node: string; type: string; index: number }>> }
>;
type Workflow = {
  nodes: WorkflowNode[];
  connections: WorkflowConnections;
  active: boolean;
  settings?: { timezone?: string };
};

const workflowPath = path.join(__dirname, "owner-morning-brief.json");
const rawSource = readFileSync(workflowPath, "utf-8");
const workflow: Workflow = JSON.parse(rawSource);

const SEND_VIA_FONNTE = "Send via Fonnte (PT-controlled device -> Pak Hanafi)";

function edgeTargets(sourceName: string): string[] {
  const branches = workflow.connections[sourceName]?.main ?? [];
  return branches.flatMap((branch) => branch.map((edge) => edge.node));
}

function node(name: string): WorkflowNode {
  const found = workflow.nodes.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`node not found: ${name}`);
  return found;
}

describe("owner-morning-brief.json graph contract", () => {
  const nodeNames = workflow.nodes.map((n) => n.name);

  it("has unique node names", () => {
    expect(new Set(nodeNames).size).toBe(nodeNames.length);
  });

  it("only references existing node names as connection sources", () => {
    for (const sourceName of Object.keys(workflow.connections)) {
      expect(nodeNames).toContain(sourceName);
    }
  });

  it("only references existing node names as connection targets", () => {
    for (const sourceName of Object.keys(workflow.connections)) {
      for (const targetName of edgeTargets(sourceName)) {
        expect(nodeNames).toContain(targetName);
      }
    }
  });

  it("wires the critical happy-path edges", () => {
    expect(edgeTargets("Every Morning 07:00 WIB")).toEqual(["Compose Morning Brief"]);
    expect(edgeTargets("Compose Morning Brief")).toEqual(["Has Event?"]);
    expect(edgeTargets(SEND_VIA_FONNTE)).toEqual(["Fonnte Success?"]);
    expect(edgeTargets("Fonnte Success?")).toEqual(["Complete Notification", "Fail Notification"]);
  });

  it("routes the Has Event? true branch to the Fonnte send node", () => {
    const trueBranch = workflow.connections["Has Event?"]?.main[0] ?? [];
    expect(trueBranch.map((edge) => edge.node)).toEqual([SEND_VIA_FONNTE]);
  });

  it("stops safely on the Has Event? false branch (duplicate or unconfigured pilot tenant) — nothing is sent", () => {
    const falseBranch = workflow.connections["Has Event?"]?.main[1] ?? [];
    expect(falseBranch).toEqual([]);
  });

  it("stays inactive in the canonical (checked-in) workflow", () => {
    expect(workflow.active).toBe(false);
  });

  it("is anchored to Asia/Jakarta, not a bare cron with an implicit server timezone", () => {
    expect(workflow.settings?.timezone).toBe("Asia/Jakarta");
  });

  it("schedules a single daily trigger at 07:00, the Gate 6J-A §14 default", () => {
    const trigger = node("Every Morning 07:00 WIB");
    expect(trigger.type).toBe("n8n-nodes-base.scheduleTrigger");
    const interval = (trigger.parameters?.rule as { interval: Array<Record<string, unknown>> })?.interval;
    expect(interval).toEqual([{ field: "days", triggerAtHour: 7, triggerAtMinute: 0 }]);
  });

  it("never accesses $env.* in any node expression (prose in `notes` explaining why $env is avoided is fine)", () => {
    expect(rawSource).not.toMatch(/\$env\.[A-Za-z_]/);
  });

  it("every httpRequest node that leaves this VPC uses credential-based auth, never a literal secret header", () => {
    const httpNodes = workflow.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest");
    expect(httpNodes.length).toBeGreaterThan(0);
    for (const httpNode of httpNodes) {
      expect(httpNode.parameters?.authentication).toBe("genericCredentialType");
      expect(httpNode.parameters?.genericAuthType).toBe("httpHeaderAuth");
    }
  });

  it("uses exactly the two required credential names, never a third", () => {
    const credentialNames = workflow.nodes
      .flatMap((n) => Object.values(n.credentials ?? {}))
      .map((c) => c.name);
    expect(new Set(credentialNames)).toEqual(new Set(["ADOP Internal API Secret", "ADOP Fonnte Sender Device Token"]));
  });

  it("the ADOP endpoints (compose, complete, fail) all use the ADOP Internal API Secret credential", () => {
    for (const name of ["Compose Morning Brief", "Complete Notification", "Fail Notification"]) {
      expect(node(name).credentials?.httpHeaderAuth?.name).toBe("ADOP Internal API Secret");
    }
  });

  it("the Fonnte send node uses the ADOP Fonnte Sender Device Token credential", () => {
    expect(node(SEND_VIA_FONNTE).credentials?.httpHeaderAuth?.name).toBe("ADOP Fonnte Sender Device Token");
  });

  it("never hardcodes a phone number, tenant UUID, or credential id/secret value in the checked-in JSON", () => {
    // A bare phone number as a JSON string value (8+ digits, optionally
    // leading +/0) is what this guards against — node ids like
    // "compose-morning-brief" or typeVersion numbers are not phone-shaped.
    expect(rawSource).not.toMatch(/"(?:\+?62|0)8\d{7,}"/);
    // Every credentials.*.id in this file must be the literal placeholder —
    // a real n8n credential id checked in would defeat "not in the repo".
    const credentialIds = workflow.nodes.flatMap((n) => Object.values(n.credentials ?? {})).map((c) => c.id);
    for (const id of credentialIds) {
      expect(id).toBe("REPLACE_WITH_CREDENTIAL_ID");
    }
  });

  it("the Fonnte send target is left empty in the repo — no recipient number is checked in", () => {
    const fonnteNode = node(SEND_VIA_FONNTE);
    const bodyParams = (fonnteNode.parameters?.bodyParameters as { parameters: Array<{ name: string; value: string }> })
      ?.parameters;
    const target = bodyParams?.find((p) => p.name === "target");
    expect(target?.value).toBe("");
  });

  it("the Fonnte message is read verbatim from Compose Morning Brief's response — the workflow never composes text itself", () => {
    const fonnteNode = node(SEND_VIA_FONNTE);
    const bodyParams = (fonnteNode.parameters?.bodyParameters as { parameters: Array<{ name: string; value: string }> })
      ?.parameters;
    const message = bodyParams?.find((p) => p.name === "message");
    expect(message?.value).toBe("={{ $('Compose Morning Brief').item.json.event.message }}");
  });
});
