import { createInterface } from "node:readline";
import { Writable } from "node:stream";

/** One readline lifetime for the whole dialogue. Use only in a private local
 * terminal. EOF/cancellation are failures, never authorization. */
export function createInteractiveInput(input = process.stdin, output = process.stdout) {
  if (!input.isTTY || !output.isTTY) throw new Error("LOCAL_TTY_REQUIRED");
  if (input.readableEnded || input.destroyed) throw new Error("INPUT_CLOSED");
  let pending;
  let closed = false;
  let echo = false;
  const sink = new Writable({ write(chunk, _encoding, callback) {
    if (echo) output.write(chunk);
    callback();
  } });
  const rl = createInterface({ input, output: sink, terminal: true, historySize: 0, crlfDelay: Infinity });
  function close(code = "INPUT_CLOSED") {
    if (closed) return;
    closed = true;
    echo = false;
    const active = pending;
    pending = undefined;
    rl.close();
    input.removeListener("error", onError);
    if (active) {
      output.write("\n");
      active.reject(new Error(code));
    }
  }
  function onError() { close("INPUT_READ_FAILED"); }
  input.on("error", onError);
  rl.on("error", onError);
  rl.on("SIGINT", () => close("INPUT_CANCELLED"));
  rl.on("close", () => close("INPUT_CLOSED"));
  rl.on("line", (answer) => {
    if (closed || !pending) return;
    if (input.readableEnded || input.destroyed) return close("INPUT_CLOSED");
    if (pending.ignoreEmpty && !answer.trim()) {
      output.write(pending.prompt);
      return;
    }
    const active = pending;
    pending = undefined;
    echo = false;
    if (active.hidden) output.write("\n");
    active.resolve(answer);
  });
  return {
    ask(prompt, { hidden = true, ignoreEmpty = false } = {}) {
      if (closed || input.readableEnded || input.destroyed) return Promise.reject(new Error("INPUT_CLOSED"));
      if (pending) return Promise.reject(new Error("INPUT_BUSY"));
      // Readline is the sole stdin consumer. Draining with input.read() here
      // could steal an answer or emit data/end reentrantly before pending is set.
      // Buffered pre-prompt bytes have ambiguous ownership: fail closed instead.
      if (input.readableLength > 0) return Promise.reject(new Error("INPUT_PENDING_DATA"));
      // Clear only text readline already processed while no question was active.
      echo = false;
      rl.line = "";
      rl.cursor = 0;
      return new Promise((resolve, reject) => {
        pending = { resolve, reject, prompt, hidden, ignoreEmpty };
        echo = !hidden;
        output.write(prompt);
        rl.resume();
        input.resume();
      });
    },
    close,
  };
}

export function hiddenInput(prompt, input = process.stdin, output = process.stdout) {
  const terminal = createInteractiveInput(input, output);
  return terminal.ask(prompt).finally(() => terminal.close());
}
