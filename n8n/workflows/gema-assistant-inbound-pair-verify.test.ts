import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getSafeReplyText } from "@/lib/assistant-inbound/safe-replies";
import type { SafeReplyCode } from "@/lib/assistant-inbound/types";

// Gate 6J-C1 verified-capture fixture — synthetic field shape only, no real
// number/credential (see fixture file header-less content; values mirror
// the repeating-digit placeholders already used across this suite's other
// tests, e.g. src/lib/assistant-inbound/validation.test.ts).
const FONNTE_FIXTURE_PATH = path.resolve(__dirname, "fonnte-inbound-payload.fixture.json");
const fonnteFixtures = JSON.parse(readFileSync(FONNTE_FIXTURE_PATH, "utf8")) as Record<string, Record<string, unknown>>;

// Structural/security contract for the canonical n8n workflow — this gate
// never imports/activates the hosted n8n runtime (task LOCK), so this test
// can only validate the JSON graph itself: node uniqueness, connection
// validity, inactive status, absence of AI/LLM nodes or out-of-scope
// routing, and no literal secret/phone/tenant value anywhere in the file.

interface WorkflowConnectionEdge {
  node: string;
  type: string;
  index: number;
}

interface WorkflowNode {
  name: string;
  type: string;
  parameters?: Record<string, unknown>;
}

interface Workflow {
  active: boolean;
  nodes: WorkflowNode[];
  connections: Record<string, { main: WorkflowConnectionEdge[][] }>;
}

const WORKFLOW_PATH = path.resolve(__dirname, "gema-assistant-inbound-pair-verify.json");
const raw = readFileSync(WORKFLOW_PATH, "utf8");
const workflow = JSON.parse(raw) as Workflow;

const REPLY_CODES_WITH_TEXT: SafeReplyCode[] = [
  "paired",
  "verified",
  "invalid_or_expired",
  "locked",
  "ambiguous",
  "duplicate",
  "rate_limited",
];

function findNode(name: string): WorkflowNode {
  const node = workflow.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`node not found: ${name}`);
  return node;
}

// Actually executes the Normalize Provider Payload node's real jsCode
// against a fixture payload (rather than regex-matching the source), the
// same way n8n's Code node would run it: $input.item.json in, [{ json }]
// out.
function runNormalizeNode(payload: unknown): { envelope: Record<string, unknown>; canonicalBody: string } {
  const node = findNode("Normalize Provider Payload");
  const jsCode = node.parameters?.jsCode as string;
  const fn = new Function("$input", jsCode) as (input: { item: { json: unknown } }) => Array<{ json: unknown }>;
  const result = fn({ item: { json: payload } });
  return result[0].json as { envelope: Record<string, unknown>; canonicalBody: string };
}

describe("gema-assistant-inbound-pair-verify.json — n8n workflow contract", () => {
  it("is inactive", () => {
    expect(workflow.active).toBe(false);
  });

  it("has no duplicate node names", () => {
    const names = workflow.nodes.map((n) => n.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every connection source and target references a real node name", () => {
    const nodeNames = new Set(workflow.nodes.map((n) => n.name));
    for (const [source, outputs] of Object.entries(workflow.connections)) {
      expect(nodeNames.has(source)).toBe(true);
      for (const branch of outputs.main) {
        for (const edge of branch) {
          expect(nodeNames.has(edge.node)).toBe(true);
        }
      }
    }
  });

  it("contains the required canonical edges (webhook -> normalize -> validate -> sign -> post -> reply gate -> map -> fonnte -> outcome)", () => {
    const edgeExists = (from: string, to: string) =>
      (workflow.connections[from]?.main ?? []).some((branch) => branch.some((e) => e.node === to));

    expect(edgeExists("Webhook Inbound", "Normalize Provider Payload")).toBe(true);
    expect(edgeExists("Normalize Provider Payload", "Validate Required Fields")).toBe(true);
    expect(edgeExists("Validate Required Fields", "Sign Canonical Request")).toBe(true);
    expect(edgeExists("Sign Canonical Request", "Post ADOP Inbound")).toBe(true);
    expect(edgeExists("Post ADOP Inbound", "Has Reply?")).toBe(true);
    expect(edgeExists("Has Reply?", "Map Safe Reply Text")).toBe(true);
    expect(edgeExists("Map Safe Reply Text", "Send Safe Reply via Fonnte")).toBe(true);
    expect(edgeExists("Send Safe Reply via Fonnte", "Fonnte Send Success?")).toBe(true);
    expect(edgeExists("Fonnte Send Success?", "Reply Sent")).toBe(true);
    expect(edgeExists("Fonnte Send Success?", "Reply Send Failed")).toBe(true);
  });

  it("has no AI/LLM node of any kind", () => {
    for (const node of workflow.nodes) {
      expect(node.type.toLowerCase()).not.toMatch(/openai|langchain|agent|anthropic|llm|chatmodel/);
    }
  });

  it("has no Morning Brief, invoice, or anomaly-alert routing (out of scope for this gate)", () => {
    expect(raw.toLowerCase()).not.toMatch(/morning.?brief|invoice|anomaly/);
  });

  it("never hardcodes a secret/token value — every credential/URL is read from $env", () => {
    for (const node of workflow.nodes) {
      const serialized = JSON.stringify(node);
      if (/secret|token|authorization/i.test(serialized)) {
        // Every occurrence of these words in a `value` field must be an
        // n8n expression pulling from $env, never a literal.
        const valueMatches = serialized.match(/"value":\s*"([^"]*)"/g) ?? [];
        for (const match of valueMatches) {
          if (/secret|token|authorization/i.test(match)) {
            expect(match).toMatch(/\$env\./);
          }
        }
      }
    }
  });

  it("never hardcodes a phone number literal (E.164-shaped string) anywhere in the file", () => {
    // A real number would appear as a bare quoted literal; $env/expression
    // references are exempt since they never embed the actual digits.
    expect(raw).not.toMatch(/"\+[1-9][0-9]{6,14}"/);
  });

  it("never hardcodes a tenant id (uuid literal) anywhere in the file", () => {
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    for (const node of workflow.nodes) {
      // node "id" fields are n8n's own internal slug ids (kebab-case, not
      // UUIDs) — only check the parameters payload for a UUID literal.
      expect(JSON.stringify(node.parameters ?? {})).not.toMatch(uuidPattern);
    }
  });

  it("the Map Safe Reply Text node's template keys are a subset of the real SafeReplyCode allowlist, and every value matches safe-replies.ts exactly", () => {
    const mapNode = findNode("Map Safe Reply Text");
    const jsCode = mapNode.parameters?.jsCode as string;

    const templateObjectMatch = jsCode.match(/const TEMPLATES = (\{[\s\S]*?\});/);
    expect(templateObjectMatch).toBeTruthy();
    const templates = new Function(`return ${templateObjectMatch![1]}`)() as Record<string, string>;

    for (const [code, text] of Object.entries(templates)) {
      expect(REPLY_CODES_WITH_TEXT).toContain(code);
      expect(text).toBe(getSafeReplyText(code as SafeReplyCode));
    }
  });

  it("the Sign Canonical Request node reads its secret only from $env, never a literal", () => {
    const signNode = findNode("Sign Canonical Request");
    const jsCode = signNode.parameters?.jsCode as string;
    expect(jsCode).toMatch(/\$env\.ADOP_ASSISTANT_INBOUND_SIGNING_SECRET/);
    expect(jsCode).not.toMatch(/['"]sk-|['"][0-9a-f]{32,}['"]/);
  });

  it("the outbound Fonnte call never sends a raw error/messageText — only the mapped replyText", () => {
    const sendNode = findNode("Send Safe Reply via Fonnte");
    const bodyParameters = sendNode.parameters?.bodyParameters as { parameters: Array<{ name: string; value: string }> };
    const messageParam = bodyParameters.parameters.find((p) => p.name === "message");
    expect(messageParam?.value).toBe("={{ $json.replyText }}");
  });

  describe("Normalize Provider Payload — Gate 6J-C1 verified Fonnte payload shape", () => {
    it("maps device -> receiverAddress, sender -> senderAddress, message -> messageText, timestamp -> providerTimestamp verbatim", () => {
      const { envelope } = runNormalizeNode(fonnteFixtures.withInboxId);
      expect(envelope.receiverAddress).toBe("6289999999999");
      expect(envelope.senderAddress).toBe("6281234567890");
      expect(envelope.messageText).toBe("PAIR ABCDEF");
      expect(envelope.providerTimestamp).toBe("1783148400");
    });

    it("emits a namespaced fonnte:inbox:<id> providerMessageId when inboxid is a positive integer", () => {
      const { envelope } = runNormalizeNode(fonnteFixtures.withInboxId);
      expect(envelope.providerMessageId).toBe("fonnte:inbox:482913");
    });

    it("omits providerMessageId entirely (never an empty string) when inboxid is 0", () => {
      const { envelope, canonicalBody } = runNormalizeNode(fonnteFixtures.withoutInboxId);
      expect(envelope).not.toHaveProperty("providerMessageId");
      expect(JSON.parse(canonicalBody)).not.toHaveProperty("providerMessageId");
    });

    it("never uses senderid as providerMessageId", () => {
      const { envelope, canonicalBody } = runNormalizeNode(fonnteFixtures.withInboxId);
      expect(envelope.providerMessageId).not.toContain("@lid");
      expect(canonicalBody).not.toMatch(/@lid/);
    });

    it("never falls back to Fonnte's button-text field for messageText", () => {
      const { envelope } = runNormalizeNode(fonnteFixtures.buttonReplyShape);
      expect(envelope.messageText).toBe("PAIR ABCDEF");
      expect(envelope.messageText).not.toBe("Ya, lanjutkan");
    });

    it("the canonicalBody sent to ADOP is the exact same object Sign Canonical Request will HMAC", () => {
      const { envelope, canonicalBody } = runNormalizeNode(fonnteFixtures.withInboxId);
      expect(JSON.parse(canonicalBody)).toEqual(envelope);
    });
  });

  describe("Validate Required Fields — Gate 6J-C1", () => {
    const validateNode = findNode("Validate Required Fields");

    it("no longer requires providerMessageId (Fonnte legitimately omits it)", () => {
      const conditions = (
        validateNode.parameters?.conditions as { conditions: Array<{ id: string; leftValue: string }> }
      ).conditions;
      expect(conditions.some((c) => c.id === "has-provider-message-id")).toBe(false);
    });

    it("requires senderAddress, receiverAddress, messageText, and providerTimestamp", () => {
      const conditions = (
        validateNode.parameters?.conditions as { conditions: Array<{ id: string; leftValue: string }> }
      ).conditions;
      const ids = conditions.map((c) => c.id);
      expect(ids).toEqual(
        expect.arrayContaining(["has-sender-address", "has-receiver-address", "has-message-text", "has-provider-timestamp"]),
      );
    });
  });
});
