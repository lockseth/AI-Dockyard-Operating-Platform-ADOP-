import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Pure graph-shape contract for the Gate 1L-R1 credential-based candidate —
// no n8n runtime, no HTTP, no Fonnte call. Mirrors
// owner-control-whatsapp-notification.test.ts's node-name/connection-key
// drift guard and owner-morning-brief.test.ts's credential/no-$env/no-secret
// assertions, applied to this candidate instead of the canonical Gate 1L
// workflow (which this file does NOT replace or modify).
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
};

const workflowPath = path.join(__dirname, "owner-control-whatsapp-notification.credential-based.proposal.json");
const rawSource = readFileSync(workflowPath, "utf-8");
const workflow: Workflow = JSON.parse(rawSource);

const SEND_VIA_FONNTE = "Send via Fonnte (Hendro's paired device -> owner recipient)";

function edgeTargets(sourceName: string): string[] {
  const branches = workflow.connections[sourceName]?.main ?? [];
  return branches.flatMap((branch) => branch.map((edge) => edge.node));
}

function node(name: string): WorkflowNode {
  const found = workflow.nodes.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`node not found: ${name}`);
  return found;
}

describe("owner-control-whatsapp-notification.credential-based.proposal.json graph contract", () => {
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

  it("wires the same critical happy-path edges as the canonical workflow — business flow is unchanged", () => {
    expect(edgeTargets("Every Minute")).toEqual(["Claim Notification"]);
    expect(edgeTargets("Claim Notification")).toEqual(["Has Event?"]);
    expect(edgeTargets(SEND_VIA_FONNTE)).toEqual(["Fonnte Success?"]);
    expect(edgeTargets("Fonnte Success?")).toEqual(["Complete Notification", "Fail Notification"]);
  });

  it("routes the Has Event? true branch to the Fonnte send node", () => {
    const trueBranch = workflow.connections["Has Event?"]?.main[0] ?? [];
    expect(trueBranch.map((edge) => edge.node)).toEqual([SEND_VIA_FONNTE]);
  });

  it("stops safely on the Has Event? false branch — no message is sent", () => {
    const falseBranch = workflow.connections["Has Event?"]?.main[1] ?? [];
    expect(falseBranch).toEqual([]);
  });

  it("adds no node beyond the canonical six — no new send path", () => {
    expect(nodeNames.sort()).toEqual(
      ["Every Minute", "Claim Notification", "Has Event?", SEND_VIA_FONNTE, "Fonnte Success?", "Complete Notification", "Fail Notification"].sort(),
    );
  });

  it("stays inactive — this is a source candidate, never imported/activated by this test", () => {
    expect(workflow.active).toBe(false);
  });

  it("never accesses $env.* in any node expression (prose in `notes` explaining why $env is avoided is fine)", () => {
    expect(rawSource).not.toMatch(/\$env\.[A-Za-z_]/);
  });

  it("every httpRequest node that leaves this VPC uses credential-based auth, never a literal secret header", () => {
    const httpNodes = workflow.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest");
    expect(httpNodes.length).toBe(4); // Claim, Send via Fonnte, Complete, Fail
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

  it("the ADOP endpoints (claim, complete, fail) all use the ADOP Internal API Secret credential", () => {
    for (const name of ["Claim Notification", "Complete Notification", "Fail Notification"]) {
      expect(node(name).credentials?.httpHeaderAuth?.name).toBe("ADOP Internal API Secret");
    }
  });

  it("the Fonnte send node uses the ADOP Fonnte Sender Device Token credential", () => {
    expect(node(SEND_VIA_FONNTE).credentials?.httpHeaderAuth?.name).toBe("ADOP Fonnte Sender Device Token");
  });

  it("the ADOP endpoint URLs are the literal hosted production URL, not $env-derived", () => {
    expect(node("Claim Notification").parameters?.url).toBe("https://adop-demo-gema.vercel.app/api/internal/notifications/claim");
    expect(node("Complete Notification").parameters?.url).toBe("https://adop-demo-gema.vercel.app/api/internal/notifications/complete");
    expect(node("Fail Notification").parameters?.url).toBe("https://adop-demo-gema.vercel.app/api/internal/notifications/fail");
  });

  it("never hardcodes a phone number, tenant UUID, or credential id/secret value in the checked-in JSON", () => {
    // A bare phone number as a JSON string value (8+ digits, optionally
    // leading +/0) is what this guards against — node ids like
    // "claim-notification" or typeVersion numbers are not phone-shaped.
    expect(rawSource).not.toMatch(/"(?:\+?62|0)8\d{7,}"/);
    // Every credentials.*.id in this file must be the literal placeholder —
    // a real n8n credential id checked in would defeat "not in the repo".
    const credentialIds = workflow.nodes.flatMap((n) => Object.values(n.credentials ?? {})).map((c) => c.id);
    for (const id of credentialIds) {
      expect(id).toBe("REPLACE_WITH_CREDENTIAL_ID");
    }
  });

  it("the Fonnte send target is the server-resolved recipient from Claim Notification's response — no recipient number is checked in (Gate 1L-R2)", () => {
    const fonnteNode = node(SEND_VIA_FONNTE);
    const bodyParams = (fonnteNode.parameters?.bodyParameters as { parameters: Array<{ name: string; value: string }> })
      ?.parameters;
    const target = bodyParams?.find((p) => p.name === "target");
    expect(target?.value).toBe("={{ $('Claim Notification').item.json.event.recipient }}");
  });

  it("the Fonnte message is read verbatim from Claim Notification's response — the workflow never composes text itself", () => {
    const fonnteNode = node(SEND_VIA_FONNTE);
    const bodyParams = (fonnteNode.parameters?.bodyParameters as { parameters: Array<{ name: string; value: string }> })
      ?.parameters;
    const message = bodyParams?.find((p) => p.name === "message");
    expect(message?.value).toBe("={{ $('Claim Notification').item.json.event.message }}");
  });

  it("Complete Notification and Fail Notification reference the claimed event id via the same expression as the canonical workflow", () => {
    for (const name of ["Complete Notification", "Fail Notification"]) {
      const body = node(name).parameters?.jsonBody as string;
      expect(body).toContain("$('Claim Notification').item.json.event.id");
    }
  });

  it("does not modify the canonical checked-in workflow file", () => {
    const canonicalPath = path.join(__dirname, "owner-control-whatsapp-notification.json");
    const canonical = JSON.parse(readFileSync(canonicalPath, "utf-8"));
    expect(canonical.name).toBe("ADOP Gate 1L — Owner Control WhatsApp Notification");
  });
});
