import readline from "node:readline";

// Gate 6G-B3: on Windows, a long-lived readline.Interface stayed subscribed
// to stdin's 'data'/'keypress' events for the whole CLI session while
// promptHidden's raw-mode reader also read from the same stream — two
// concurrent consumers of one input. readline does its own
// application-level echo of every keystroke it observes (independent of
// the terminal's raw-mode echo state), so the password leaked into
// readline's echo, and once that shared interface's internal state had
// been driven by both consumers, the following confirmation-token
// `rl.question()` could receive nothing at all.
//
// The fix: every prompt call here owns stdin exclusively for its own
// lifetime only. promptVisible creates a fresh readline.Interface and
// closes it (which detaches its listeners) before resolving; promptHidden
// attaches its own listener only after no readline.Interface is alive.
// Callers get this guarantee for free by simply awaiting each prompt
// before starting the next one — email, then display name, then (apply
// only) the hidden password, then the confirmation token.

export type HiddenInputStream = NodeJS.ReadableStream & {
  setRawMode?: (mode: boolean) => void;
  isTTY?: boolean;
};

// process.stdin is backed by a ref-counted handle (net.Socket/tty.ReadStream)
// once something has read from it: pause() stops the flow of 'data' events
// but does NOT release that ref, so a paused-but-still-open stdin keeps the
// event loop — and the process — alive indefinitely even after every
// prompt has resolved and the report has been printed. unref() releases it
// without destroying the stream, so the *next* prompt call can still
// resume/re-ref it normally. Generic Readable/Writable streams (e.g. the
// PassThrough test doubles this module is unit-tested against) don't
// expose unref(), hence the optional call.
function unrefIfPossible(stream: NodeJS.ReadableStream): void {
  (stream as { unref?: () => void }).unref?.();
}

// Matching counterpart to unrefIfPossible: called when a prompt starts
// reading, since unref() is sticky — resuming a stream does not implicitly
// re-ref it, so without this the *next* prompt after the first one would
// leave the handle unref'd and the process could exit before it finishes.
function refIfPossible(stream: NodeJS.ReadableStream): void {
  (stream as { ref?: () => void }).ref?.();
}

// Resolves to "" if the stream ends (EOF/closed) before an answer is
// typed, instead of leaving the promise pending forever — an unresolved
// promise doesn't keep Node's event loop alive by itself, so the process
// used to exit silently with no report at all when confirmation input was
// empty or piped input hit EOF.
export function promptVisible(
  question: string,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<string> {
  return new Promise((resolve) => {
    refIfPossible(input);
    const rl = readline.createInterface({ input, output });
    let settled = false;

    // rl.close() detaches readline's own listeners but — per Node's own
    // behavior — does NOT pause the underlying stream, so a resumed
    // process.stdin is left in flowing mode holding the event loop open.
    // Pausing here is what lets the process exit once the caller is done
    // with every prompt, instead of hanging after the final report.
    const finish = (answer: string) => {
      if (settled) return;
      settled = true;
      resolve(answer);
      input.pause();
      unrefIfPossible(input);
    };

    rl.once("close", () => finish(""));

    rl.question(question, (answer) => {
      // finish() must run before rl.close(), not after — close() emits
      // 'close' synchronously, and the 'close' handler above would
      // otherwise win the `settled` race and resolve "" over this answer.
      finish(answer);
      rl.close();
    });
  });
}

// No masked-input package available/needed — raw-mode stdin muting is the
// standard dependency-free recipe for hiding a terminal password prompt.
// Never echoes the typed characters to `output` in either the masked
// (TTY) or unmasked (piped/non-TTY) path.
export function promptHidden(
  question: string,
  input: HiddenInputStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<string> {
  return new Promise((resolve, reject) => {
    output.write(question);

    let value = "";
    let settled = false;
    const canMask = typeof input.setRawMode === "function" && input.isTTY === true;
    if (canMask) {
      input.setRawMode!(true);
    }
    refIfPossible(input);
    input.resume();
    input.setEncoding("utf8");

    const cleanup = () => {
      if (canMask) {
        input.setRawMode!(false);
      }
      input.pause();
      unrefIfPossible(input);
      input.removeListener("data", onData);
      input.removeListener("end", onEnd);
    };

    const finish = (result: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      output.write("\n");
      resolve(result);
    };

    // Scans every character in the chunk, not just the first. A real raw-mode
    // TTY typically delivers one byte per keystroke event, but that is not
    // guaranteed (fast typing/paste can coalesce bytes) and piped/non-TTY
    // input routinely delivers a whole line in a single chunk — treating
    // only `chunk[0]` as significant would silently swallow everything
    // after it, including the terminating newline.
    const onData = (chunk: string) => {
      for (const char of chunk) {
        const code = char.charCodeAt(0);
        // Enter (LF/CR) or Ctrl-D (EOF) ends input.
        if (code === 10 || code === 13 || code === 4) {
          finish(value);
          return;
        }
        // Ctrl-C aborts.
        if (code === 3) {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error("Aborted."));
          return;
        }
        // DEL or backspace.
        if (code === 127 || code === 8) {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };

    // Genuine stream closure (piped input ending without a final Enter) —
    // same "explicit result, never hang" contract as the Ctrl-D/EOF
    // keycode case above, just triggered by the stream itself.
    const onEnd = () => finish(value);

    input.on("data", onData);
    input.once("end", onEnd);
  });
}
