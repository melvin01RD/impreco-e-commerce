import { createInterface } from "node:readline";
import { Writable } from "node:stream";

/** Only use in the owner's local terminal, never an agent tool/recorded PTY. */
export function hiddenInput(prompt, input = process.stdin, output = process.stdout) {
  if (!input.isTTY || !output.isTTY) throw new Error("LOCAL_TTY_REQUIRED");
  return new Promise((resolve, reject) => {
    const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    const rl = createInterface({ input, output: muted, terminal: true, historySize: 0 });
    output.write(prompt);
    let answered = false;
    rl.on("SIGINT", () => rl.close());
    rl.on("close", () => {
      output.write("\n");
      if (!answered) reject(new Error("INPUT_CANCELLED"));
    });
    rl.question("", (answer) => {
      answered = true;
      rl.close();
      resolve(answer);
    });
  });
}
