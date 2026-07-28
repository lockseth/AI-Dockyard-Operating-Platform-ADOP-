import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Pure graph-shape contract for the canonical n8n workflow JSON — no n8n
// runtime, no HTTP, no Fonnte call. Guards against the class of bug this
// gate corrects: a node's `name` field drifting out of sync with the keys
// n8n's `connections` object uses to reference it, silently severing the
// graph without any JSON-schema error.
type WorkflowNode = { name: string };
type WorkflowConnections = Record<
  string,
  { main: Array<Array<{ node: string; type: string; index: number }>> }
>;
type Workflow = {
  nodes: WorkflowNode[];
  connections: WorkflowConnections;
  active: boolean;
};

const workflowPath = path.join(__dirname, "owner-control-whatsapp-notification.json");
const workflow: Workflow = JSON.parse(readFileSync(workflowPath, "utf-8"));

const SEND_VIA_FONNTE = "Send via Fonnte (Hendro's paired device -> owner recipient)";

function edgeTargets(sourceName: string): string[] {
  const branches = workflow.connections[sourceName]?.main ?? [];
  return branches.flatMap((branch) => branch.map((edge) => edge.node));
}

describe("owner-control-whatsapp-notification.json graph contract", () => {
  const nodeNames = workflow.nodes.map((node) => node.name);

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
    expect(edgeTargets("Every Minute")).toEqual(["Claim Notification"]);
    expect(edgeTargets("Claim Notification")).toEqual(["Has Event?"]);
    expect(edgeTargets(SEND_VIA_FONNTE)).toEqual(["Fonnte Success?"]);
    expect(edgeTargets("Fonnte Success?")).toEqual([
      "Complete Notification",
      "Fail Notification",
    ]);
  });

  it("routes the Has Event? true branch to the Fonnte send node", () => {
    const trueBranch = workflow.connections["Has Event?"]?.main[0] ?? [];
    expect(trueBranch.map((edge) => edge.node)).toEqual([SEND_VIA_FONNTE]);
  });

  it("stops safely on the Has Event? false branch — no message is sent", () => {
    const falseBranch = workflow.connections["Has Event?"]?.main[1] ?? [];
    expect(falseBranch).toEqual([]);
  });

  it("stays inactive in the canonical (checked-in) workflow", () => {
    expect(workflow.active).toBe(false);
  });
});
