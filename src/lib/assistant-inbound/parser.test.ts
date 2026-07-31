import { describe, expect, it } from "vitest";
import { parseAssistantInboundCommand } from "./parser";

describe("parseAssistantInboundCommand", () => {
  it("parses an exact PAIR command", () => {
    expect(parseAssistantInboundCommand("PAIR ABCDEF")).toEqual({ type: "pair", code: "ABCDEF" });
  });

  it("parses an exact VERIFY command", () => {
    expect(parseAssistantInboundCommand("VERIFY 234HJK")).toEqual({ type: "verify", code: "234HJK" });
  });

  it("parses a bare valid code as the client-friendly PAIR default", () => {
    expect(parseAssistantInboundCommand("ABCDEF")).toEqual({ type: "pair", code: "ABCDEF" });
    expect(parseAssistantInboundCommand("abcdef")).toEqual({ type: "pair", code: "abcdef" });
    expect(parseAssistantInboundCommand("  234HJK  ")).toEqual({ type: "pair", code: "234HJK" });
  });

  it("is case-insensitive on the keyword", () => {
    expect(parseAssistantInboundCommand("pair ABCDEF")).toEqual({ type: "pair", code: "ABCDEF" });
    expect(parseAssistantInboundCommand("Pair ABCDEF")).toEqual({ type: "pair", code: "ABCDEF" });
    expect(parseAssistantInboundCommand("verify ABCDEF")).toEqual({ type: "verify", code: "ABCDEF" });
  });

  it("accepts a lowercase code (the RPC upper()s before hashing)", () => {
    expect(parseAssistantInboundCommand("PAIR abcdef")).toEqual({ type: "pair", code: "abcdef" });
  });

  it("trims surrounding whitespace deterministically", () => {
    expect(parseAssistantInboundCommand("  PAIR ABCDEF  ")).toEqual({ type: "pair", code: "ABCDEF" });
  });

  it("collapses internal whitespace runs between keyword and code", () => {
    expect(parseAssistantInboundCommand("PAIR    ABCDEF")).toEqual({ type: "pair", code: "ABCDEF" });
    expect(parseAssistantInboundCommand("PAIR\tABCDEF")).toEqual({ type: "pair", code: "ABCDEF" });
  });

  it.each([
    ["empty string", ""],
    ["whitespace only", "   "],
    ["keyword only, no code", "PAIR"],
    ["three tokens", "PAIR ABCDEF EXTRA"],
    ["unrecognized keyword", "HELLO ABCDEF"],
    ["natural language approximation", "please pair my number ABCDEF"],
    ["code too short", "PAIR ABCDE"],
    ["code too long", "PAIR ABCDEFG"],
    ["code with excluded ambiguous character O", "PAIR ABCDEO"],
    ["code with excluded ambiguous character 0", "PAIR ABCDE0"],
    ["code with excluded ambiguous character I", "PAIR ABCDEI"],
    ["code with excluded ambiguous character 1", "PAIR ABCDE1"],
    ["code with punctuation", "PAIR ABC-EF"],
    ["bare code too short", "ABCDE"],
    ["bare code too long", "ABCDEFG"],
    ["bare code with excluded ambiguous character O", "ABCDEO"],
    ["bare code with punctuation", "ABC-EF"],
    ["STOP/BERHENTI opt-out text — not a command in this gate's closed surface", "STOP"],
  ])("returns unsupported for: %s (%s)", (_label, input) => {
    expect(parseAssistantInboundCommand(input)).toEqual({ type: "unsupported" });
  });

  it("never sends the message to any classifier beyond this deterministic parse (no LLM call site exists in this module)", () => {
    const source = parseAssistantInboundCommand.toString();
    expect(source).not.toMatch(/fetch|openai|anthropic|claude|llm/i);
  });
});
