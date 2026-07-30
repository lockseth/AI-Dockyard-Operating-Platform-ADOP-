import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getSafeReplyText } from "@/lib/assistant-inbound/safe-replies";
import type { SafeReplyCode } from "@/lib/assistant-inbound/types";

// Gate 6J-D6 — reconciliation of a candidate D5 export produced outside this
// repo (a supervised n8n editing session, per the Founder). This file proves
// the LOCAL JSON claims made during that reconciliation — never imports,
// activates, or executes anything against a real n8n/ADOP/Fonnte instance.
// Node names carry a literal "1" suffix (e.g. "Webhook Inbound1") because
// that is what the real export contains — this file is not renamed
// cosmetically per the Gate 6J-D6 authorization scope.

const D5_PATH = path.resolve(__dirname, "gema-assistant-inbound-pair-verify.gate-6j-d5-native-crypto.json");
const FROZEN_PATH = path.resolve(__dirname, "gema-assistant-inbound-pair-verify.json");
const FONNTE_FIXTURE_PATH = path.resolve(__dirname, "fonnte-inbound-payload.fixture.json");

interface WorkflowConnectionEdge {
  node: string;
  type: string;
  index: number;
}

interface WorkflowNode {
  name: string;
  type: string;
  parameters?: Record<string, unknown>;
  credentials?: Record<string, { id: string; name: string }>;
}

interface Workflow {
  active: boolean;
  nodes: WorkflowNode[];
  connections: Record<string, { main: WorkflowConnectionEdge[][] }>;
  meta?: Record<string, unknown>;
}

function loadWorkflow(p: string): Workflow {
  return JSON.parse(readFileSync(p, "utf8")) as Workflow;
}

const raw = readFileSync(D5_PATH, "utf8");
const d5 = loadWorkflow(D5_PATH);
const frozen = loadWorkflow(FROZEN_PATH);
const fonnteFixtures = JSON.parse(readFileSync(FONNTE_FIXTURE_PATH, "utf8")) as {
  wrapped: Record<string, { body: Record<string, unknown> }>;
};

function findNode(wf: Workflow, name: string): WorkflowNode {
  const node = wf.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`node not found: ${name}`);
  return node;
}

function runNormalizeNode(payload: unknown): { envelope: Record<string, unknown>; canonicalBody: string } {
  const node = findNode(d5, "Normalize Provider Payload1");
  const jsCode = node.parameters?.jsCode as string;
  const fn = new Function("$input", jsCode) as (input: { item: { json: unknown } }) => Array<{ json: unknown }>;
  const result = fn({ item: { json: payload } });
  return result[0].json as { envelope: Record<string, unknown>; canonicalBody: string };
}

const REPLY_CODES_WITH_TEXT: SafeReplyCode[] = [
  "paired",
  "verified",
  "invalid_or_expired",
  "locked",
  "ambiguous",
  "duplicate",
  "rate_limited",
];

describe("gema-assistant-inbound-pair-verify.gate-6j-d5-native-crypto.json — Gate 6J-D6 reconciliation", () => {
  it("is inactive", () => {
    expect(d5.active).toBe(false);
  });

  it("the frozen Gate 6J-C workflow remains completely untouched by this reconciliation", () => {
    expect(findNode(frozen, "Sign Canonical Request").type).toBe("n8n-nodes-base.code");
    expect(frozen.nodes.some((n) => n.name === "Sign Canonical Request (Native Crypto)")).toBe(false);
  });

  describe("graph — canonical edges and fail-closed paths", () => {
    const edgeExists = (from: string, to: string) =>
      (d5.connections[from]?.main ?? []).some((branch) => branch.some((e) => e.node === to));

    it("contains the required edges (webhook -> normalize -> validate -> timestamp -> sign -> post -> reply gate -> map -> fonnte -> outcome)", () => {
      expect(edgeExists("Webhook Inbound1", "Normalize Provider Payload1")).toBe(true);
      expect(edgeExists("Normalize Provider Payload1", "Validate Required Fields1")).toBe(true);
      expect(edgeExists("Validate Required Fields1", "Compute Timestamp")).toBe(true);
      expect(edgeExists("Compute Timestamp", "Sign Canonical Request (Native Crypto)")).toBe(true);
      expect(edgeExists("Sign Canonical Request (Native Crypto)", "Post ADOP Inbound1")).toBe(true);
      expect(edgeExists("Post ADOP Inbound1", "Has Reply?1")).toBe(true);
      expect(edgeExists("Has Reply?1", "Map Safe Reply Text1")).toBe(true);
      expect(edgeExists("Map Safe Reply Text1", "Send Safe Reply via Fonnte1")).toBe(true);
      expect(edgeExists("Send Safe Reply via Fonnte1", "Fonnte Send Success?1")).toBe(true);
      expect(edgeExists("Fonnte Send Success?1", "Reply Sent1")).toBe(true);
      expect(edgeExists("Fonnte Send Success?1", "Reply Send Failed1")).toBe(true);
    });

    it("Validate Required Fields1 has no wired false-branch — a failed validation dead-ends before signing/POST/Fonnte", () => {
      expect(d5.connections["Validate Required Fields1"].main.length).toBe(1);
    });

    it("Has Reply?1 has no wired false-branch — 'no reply needed' dead-ends before Fonnte", () => {
      expect(d5.connections["Has Reply?1"].main.length).toBe(1);
    });

    it("every connection source and target references a real node name", () => {
      const nodeNames = new Set(d5.nodes.map((n) => n.name));
      for (const [source, outputs] of Object.entries(d5.connections)) {
        expect(nodeNames.has(source)).toBe(true);
        for (const branch of outputs.main) {
          for (const edge of branch) {
            expect(nodeNames.has(edge.node)).toBe(true);
          }
        }
      }
    });

    it("has no duplicate node names", () => {
      const names = d5.nodes.map((n) => n.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe("Validate Required Fields1 — required-field validation", () => {
    const node = findNode(d5, "Validate Required Fields1");

    it("requires senderAddress, receiverAddress, messageText, and providerTimestamp, combined with AND", () => {
      const conditions = (node.parameters?.conditions as { combinator: string; conditions: Array<{ id: string; operator: { operation: string } }> });
      expect(conditions.combinator).toBe("and");
      const ids = conditions.conditions.map((c) => c.id);
      expect(ids).toEqual(
        expect.arrayContaining(["has-sender-address", "has-receiver-address", "has-message-text", "has-provider-timestamp"]),
      );
      for (const c of conditions.conditions) {
        expect(c.operator.operation).toBe("notEmpty");
      }
    });
  });

  describe("Normalize Provider Payload1 — PAIR/VERIFY mapping", () => {
    it("is byte-identical to the frozen Gate 6J-C workflow's canonical body construction", () => {
      expect(findNode(d5, "Normalize Provider Payload1").parameters?.jsCode).toBe(
        findNode(frozen, "Normalize Provider Payload").parameters?.jsCode,
      );
    });

    it("maps device -> receiverAddress, sender -> senderAddress, message -> messageText, timestamp -> providerTimestamp", () => {
      const { envelope } = runNormalizeNode(fonnteFixtures.wrapped.withInboxId);
      expect(envelope.receiverAddress).toBe("6289999999999");
      expect(envelope.senderAddress).toBe("6281234567890");
      expect(envelope.messageText).toBe("PAIR ABCDEF");
      expect(envelope.providerTimestamp).toBe("1783148400");
    });

    it("never uses senderid as providerMessageId", () => {
      const { envelope, canonicalBody } = runNormalizeNode(fonnteFixtures.wrapped.withInboxId);
      expect(envelope.providerMessageId).not.toContain("@lid");
      expect(canonicalBody).not.toMatch(/@lid/);
    });

    it("inboxid=0 produces no literal providerMessageId — the derived-id path (ADOP server-side) stays reachable", () => {
      const { envelope, canonicalBody } = runNormalizeNode(fonnteFixtures.wrapped.withoutInboxId);
      expect(envelope).not.toHaveProperty("providerMessageId");
      expect(JSON.parse(canonicalBody)).not.toHaveProperty("providerMessageId");
    });

    it("emits a namespaced fonnte:inbox:<id> providerMessageId when inboxid is a positive integer", () => {
      const { envelope } = runNormalizeNode(fonnteFixtures.wrapped.withInboxId);
      expect(envelope.providerMessageId).toBe("fonnte:inbox:482913");
    });
  });

  describe("credential bindings — names only, values never present", () => {
    it("Sign Canonical Request (Native Crypto) uses the 'ADOP Assistant Inbound Signing Secret' crypto credential", () => {
      const node = findNode(d5, "Sign Canonical Request (Native Crypto)");
      expect(node.credentials?.crypto?.name).toBe("ADOP Assistant Inbound Signing Secret");
      expect(node.credentials?.crypto?.id).toBeTruthy();
    });

    it("Post ADOP Inbound1 uses the 'ADOP Internal API Secret' httpHeaderAuth credential (Founder-confirmed as the 'ADOP Internal API' credential referenced by the gate contract)", () => {
      const node = findNode(d5, "Post ADOP Inbound1");
      expect(node.parameters?.authentication).toBe("genericCredentialType");
      expect(node.parameters?.genericAuthType).toBe("httpHeaderAuth");
      expect(node.credentials?.httpHeaderAuth?.name).toBe("ADOP Internal API Secret");
    });

    it("Post ADOP Inbound1 targets exactly the production ADOP inbound endpoint", () => {
      const node = findNode(d5, "Post ADOP Inbound1");
      expect(node.parameters?.url).toBe("https://adop-demo-gema.vercel.app/api/internal/assistant/inbound");
    });

    it("Send Safe Reply via Fonnte1 uses the 'ADOP Fonnte Sender Device Token' httpHeaderAuth credential — not $env", () => {
      const node = findNode(d5, "Send Safe Reply via Fonnte1");
      expect(node.parameters?.authentication).toBe("genericCredentialType");
      expect(node.parameters?.genericAuthType).toBe("httpHeaderAuth");
      expect(node.credentials?.httpHeaderAuth?.name).toBe("ADOP Fonnte Sender Device Token");
      expect(JSON.stringify(node.parameters)).not.toMatch(/\$env\./);
    });
  });

  it("Map Safe Reply Text1's template keys are a subset of the real SafeReplyCode allowlist, and every value matches safe-replies.ts exactly", () => {
    const node = findNode(d5, "Map Safe Reply Text1");
    const jsCode = node.parameters?.jsCode as string;
    const templateObjectMatch = jsCode.match(/const TEMPLATES = (\{[\s\S]*?\});/);
    expect(templateObjectMatch).toBeTruthy();
    const templates = new Function(`return ${templateObjectMatch![1]}`)() as Record<string, string>;

    for (const [code, text] of Object.entries(templates)) {
      expect(REPLY_CODES_WITH_TEXT).toContain(code);
      expect(text).toBe(getSafeReplyText(code as SafeReplyCode));
    }
  });

  it("no $env reference anywhere in the file", () => {
    expect(raw).not.toMatch(/\$env\./);
  });

  it("no plaintext secret/token literal anywhere in the nodes or connections (meta.instanceId is n8n's own non-secret instance identifier, intentionally excluded)", () => {
    const nodesAndConnections = JSON.stringify({ nodes: d5.nodes, connections: d5.connections });
    expect(nodesAndConnections).not.toMatch(/['"]sk-|['"][0-9a-f]{32,}['"]/);
  });

  it("never hardcodes a phone number literal (E.164-shaped string) anywhere in the file", () => {
    expect(raw).not.toMatch(/"\+[1-9][0-9]{6,14}"/);
  });

  it("never hardcodes a tenant id (uuid literal) in any node's parameters", () => {
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    for (const node of d5.nodes) {
      expect(JSON.stringify(node.parameters ?? {})).not.toMatch(uuidPattern);
    }
  });
});
