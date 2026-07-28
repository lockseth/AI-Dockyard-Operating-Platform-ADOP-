import { describe, expect, it, vi } from "vitest";
import { collectIdentityInput } from "./cli-flow";

function fakePrompts(hiddenAnswer = "Correct-Horse-9") {
  const promptVisible = vi
    .fn<(question: string) => Promise<string>>()
    .mockResolvedValueOnce("founder-demo@example.test")
    .mockResolvedValueOnce("Founder Demo Owner");
  const promptHidden = vi.fn<(question: string) => Promise<string>>().mockResolvedValue(hiddenAnswer);
  return { promptVisible, promptHidden };
}

describe("collectIdentityInput — dry-run (apply=false)", () => {
  it("never calls the hidden password prompt", async () => {
    const prompts = fakePrompts();
    await collectIdentityInput(false, prompts);
    expect(prompts.promptHidden).not.toHaveBeenCalled();
  });

  it("resolves without a password field at all", async () => {
    const prompts = fakePrompts();
    const result = await collectIdentityInput(false, prompts);
    expect(result).toEqual({
      email: "founder-demo@example.test",
      displayName: "Founder Demo Owner",
    });
    expect(result.password).toBeUndefined();
    expect(Object.hasOwn(result, "password")).toBe(false);
  });

  it("still asks for email and display name", async () => {
    const prompts = fakePrompts();
    await collectIdentityInput(false, prompts);
    expect(prompts.promptVisible).toHaveBeenCalledTimes(2);
  });
});

describe("collectIdentityInput — apply (apply=true)", () => {
  it("calls the hidden password prompt exactly once", async () => {
    const prompts = fakePrompts();
    await collectIdentityInput(true, prompts);
    expect(prompts.promptHidden).toHaveBeenCalledTimes(1);
    expect(prompts.promptHidden).toHaveBeenCalledWith("Internal Founder owner password (hidden): ");
  });

  it("returns the password the hidden prompt resolved with", async () => {
    const prompts = fakePrompts("S3cret-Value-9");
    const result = await collectIdentityInput(true, prompts);
    expect(result.password).toBe("S3cret-Value-9");
  });
});
