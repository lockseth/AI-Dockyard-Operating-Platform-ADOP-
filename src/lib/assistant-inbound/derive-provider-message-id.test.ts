import { describe, expect, it } from "vitest";
import { canonicalSerialize, deriveFonnteProviderMessageId } from "./derive-provider-message-id";
import type { AssistantInboundEnvelopeInput } from "./validation";

const BASE: AssistantInboundEnvelopeInput = {
  provider: "fonnte",
  channel: "whatsapp",
  senderAddress: "+6281234567890",
  receiverAddress: "+6289999999999",
  messageText: "PAIR ABCDEF",
  providerTimestamp: "1783148400",
};

describe("deriveFonnteProviderMessageId", () => {
  it("is namespaced fonnte:derived:v1:<sha256 hex>", () => {
    const id = deriveFonnteProviderMessageId(BASE);
    expect(id).toMatch(/^fonnte:derived:v1:[0-9a-f]{64}$/);
  });

  it("is fully deterministic — an identical retry produces an identical id", () => {
    expect(deriveFonnteProviderMessageId(BASE)).toBe(deriveFonnteProviderMessageId({ ...BASE }));
  });

  it("produces a different id when providerTimestamp differs (same sender/device/message)", () => {
    const idA = deriveFonnteProviderMessageId(BASE);
    const idB = deriveFonnteProviderMessageId({ ...BASE, providerTimestamp: "1783148401" });
    expect(idA).not.toBe(idB);
  });

  it("produces a different id when messageText differs", () => {
    const idA = deriveFonnteProviderMessageId(BASE);
    const idB = deriveFonnteProviderMessageId({ ...BASE, messageText: "VERIFY ABCDEF" });
    expect(idA).not.toBe(idB);
  });

  it("produces a different id when senderAddress differs", () => {
    const idA = deriveFonnteProviderMessageId(BASE);
    const idB = deriveFonnteProviderMessageId({ ...BASE, senderAddress: "+6281234567891" });
    expect(idA).not.toBe(idB);
  });

  it("produces a different id when receiverAddress (device) differs", () => {
    const idA = deriveFonnteProviderMessageId(BASE);
    const idB = deriveFonnteProviderMessageId({ ...BASE, receiverAddress: "+6289999999998" });
    expect(idA).not.toBe(idB);
  });

  it("throws for a non-fonnte provider rather than silently deriving one", () => {
    expect(() => deriveFonnteProviderMessageId({ ...BASE, provider: "other-provider" })).toThrow();
  });

  it("throws when receiverAddress is missing rather than deriving an incomplete id", () => {
    const withoutReceiver: AssistantInboundEnvelopeInput = { ...BASE, receiverAddress: undefined };
    expect(() => deriveFonnteProviderMessageId(withoutReceiver)).toThrow();
  });
});

describe("canonicalSerialize — delimiter-collision resistance", () => {
  it("length-prefixes fields so no naive delimiter join could collide", () => {
    // A plain "|"-join of ["1|2", "3"] and ["1", "2|3"] both produce
    // "1|2|3" — the exact ambiguity this scheme must avoid.
    const a = canonicalSerialize(["1|2", "3"]);
    const b = canonicalSerialize(["1", "2|3"]);
    expect(a).not.toBe(b);
  });

  it("is deterministic for the same input", () => {
    expect(canonicalSerialize(["a", "b", "c"])).toBe(canonicalSerialize(["a", "b", "c"]));
  });
});
