import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { promptHidden, promptVisible, type HiddenInputStream } from "./cli-io";

// Fake TTY stdin: a PassThrough exposes none of isTTY/setRawMode, which
// only exercises the non-masked fallback. Gate 6G-B3's bug was specifically
// a raw-mode/readline ownership conflict, so these tests also drive the
// masked path with a stub setRawMode.
function fakeTtyInput(): HiddenInputStream & PassThrough {
  const stream = new PassThrough() as HiddenInputStream & PassThrough;
  stream.isTTY = true;
  stream.setRawMode = vi.fn();
  return stream;
}

function collectOutput() {
  const chunks: string[] = [];
  const output = new PassThrough();
  output.on("data", (chunk) => chunks.push(chunk.toString("utf8")));
  return { output, text: () => chunks.join("") };
}

describe("promptVisible", () => {
  it("echoes the question and resolves with the typed line", async () => {
    const input = new PassThrough();
    const { output, text } = collectOutput();
    const result = promptVisible("Email: ", input, output);
    input.write("founder-demo@example.test\n");
    await expect(result).resolves.toBe("founder-demo@example.test");
    expect(text()).toContain("Email: ");
  });

  it("resolves to '' instead of hanging when the stream ends before an answer (EOF)", async () => {
    const input = new PassThrough();
    const { output } = collectOutput();
    const result = promptVisible("Type the confirmation token: ", input, output);
    input.end();
    await expect(result).resolves.toBe("");
  });
});

describe("promptHidden", () => {
  it("never writes the typed characters to output", async () => {
    const input = new PassThrough();
    const { output, text } = collectOutput();
    const result = promptHidden("Password: ", input, output);
    input.write("S3cret-Value-9");
    input.write("\n");
    await expect(result).resolves.toBe("S3cret-Value-9");
    expect(text()).toBe("Password: \n");
    expect(text()).not.toContain("S3cret-Value-9");
  });

  it("masks via setRawMode when the stream reports isTTY, and restores it afterward", async () => {
    const input = fakeTtyInput();
    const { output } = collectOutput();
    const result = promptHidden("Password: ", input, output);
    input.write("hunter2\n");
    await expect(result).resolves.toBe("hunter2");
    expect(input.setRawMode).toHaveBeenNthCalledWith(1, true);
    expect(input.setRawMode).toHaveBeenNthCalledWith(2, false);
  });

  it("resolves with whatever was typed instead of hanging when the stream ends without Enter", async () => {
    const input = new PassThrough();
    const { output } = collectOutput();
    const result = promptHidden("Password: ", input, output);
    input.write("partial");
    input.end();
    await expect(result).resolves.toBe("partial");
  });

  it("supports backspace before the terminating Enter", async () => {
    const input = new PassThrough();
    const { output } = collectOutput();
    const result = promptHidden("Password: ", input, output);
    input.write("abcx");
    input.write("\x7f"); // backspace/DEL removes the trailing "x"
    input.write("\n");
    await expect(result).resolves.toBe("abc");
  });
});

describe("sequential ownership — email, hidden password, confirmation token over one shared stream", () => {
  it("does not leak listeners between prompts and delivers each value to the right call", async () => {
    const input = new PassThrough();
    const { output } = collectOutput();

    const emailPromise = promptVisible("Internal Founder owner email: ", input, output);
    input.write("founder-demo@example.test\n");
    const email = await emailPromise;
    expect(input.listenerCount("data")).toBe(0);

    const namePromise = promptVisible("Internal Founder owner display name: ", input, output);
    input.write("Founder Demo Owner\n");
    const displayName = await namePromise;
    expect(input.listenerCount("data")).toBe(0);

    const passwordPromise = promptHidden("Internal Founder owner password (hidden): ", input, output);
    input.write("Correct-Horse-9\n");
    const password = await passwordPromise;
    // promptHidden's own 'data'/'end' listeners must be fully detached
    // before the next prompt attaches its own — this is the exact
    // ownership property that was broken on Windows (Gate 6G-B3).
    expect(input.listenerCount("data")).toBe(0);
    expect(input.listenerCount("end")).toBe(0);

    const tokenPromise = promptVisible('Type "lgdxxntwpdrlzyhysuzu pt-pelayaran-gema-bahari-demo" to confirm: ', input, output);
    input.write("lgdxxntwpdrlzyhysuzu pt-pelayaran-gema-bahari-demo\n");
    const confirmationToken = await tokenPromise;

    expect({ email, displayName, password, confirmationToken }).toEqual({
      email: "founder-demo@example.test",
      displayName: "Founder Demo Owner",
      password: "Correct-Horse-9",
      confirmationToken: "lgdxxntwpdrlzyhysuzu pt-pelayaran-gema-bahari-demo",
    });
  });

  it("an EOF confirmation token after a real password does not hang and resolves to ''", async () => {
    const input = new PassThrough();
    const { output } = collectOutput();

    input.write("founder-demo@example.test\n");
    const email = await promptVisible("Email: ", input, output);
    input.write("Founder Demo Owner\n");
    const displayName = await promptVisible("Display name: ", input, output);
    input.write("Correct-Horse-9\n");
    const password = await promptHidden("Password: ", input, output);

    const tokenPromise = promptVisible("Type the confirmation token: ", input, output);
    input.end(); // EOF instead of a typed token — must resolve, not hang
    const confirmationToken = await tokenPromise;

    expect({ email, displayName, password, confirmationToken }).toEqual({
      email: "founder-demo@example.test",
      displayName: "Founder Demo Owner",
      password: "Correct-Horse-9",
      confirmationToken: "",
    });
  });
});
