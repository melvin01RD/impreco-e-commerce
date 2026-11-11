import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough, Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { createInteractiveInput } from "../scripts/lib/hidden-input.mjs";
import { readValidatedPassword, passwordErrorMessages } from "../scripts/lib/recovery-password.mjs";

function fixture() {
  const input = new PassThrough();
  input.isTTY = true;
  const modes = [];
  input.setRawMode = (mode) => { modes.push(mode); };
  let text = "";
  const output = new Writable({ write(chunk, _encoding, cb) { text += chunk; cb(); } });
  output.isTTY = true;
  const terminal = createInteractiveInput(input, output);
  return { input, output, terminal, modes, text: () => text, close() { terminal.close(); input.destroy(); } };
}

test("waits for delayed authorization and ignores empty CRLF instead of exiting", async () => {
  const f = fixture();
  try {
    let answered = false;
    const reply = f.terminal.ask("Confirm: ", { hidden: false, ignoreEmpty: true });
    reply.then(() => { answered = true; });
    f.input.write("\r\n");
    await delay(30);
    assert.equal(answered, false);
    f.input.write("SIMULAR\r\n");
    assert.equal(await reply, "SIMULAR");
  } finally { f.close(); }
});

test("three sequential prompts share one terminal and never echo hidden answers", async () => {
  const f = fixture();
  try {
    const approval = f.terminal.ask("Confirm: ", { hidden: false });
    f.input.write("SIMULAR\r\n");
    assert.equal(await approval, "SIMULAR");
    for (const prompt of ["Hidden: ", "Repeat: "]) {
      const answer = f.terminal.ask(prompt);
      await delay(10);
      f.input.write("invented-sample\r\n");
      assert.equal(await answer, "invented-sample");
    }
    assert.ok(!f.text().includes("invented-sample"));
    assert.deepEqual(f.modes, [true]);
    f.terminal.close();
    assert.deepEqual(f.modes, [true, false]);
  } finally { f.close(); }
});

test("EOF rejects pending input and a later confirmation cannot authorize", async () => {
  const f = fixture();
  try {
    const reply = f.terminal.ask("Confirm: ", { hidden: false });
    const rejected = assert.rejects(reply, /INPUT_CLOSED/);
    f.input.end();
    await rejected;
    f.input.emit("data", Buffer.from("SIMULAR\r\n"));
    await assert.rejects(f.terminal.ask("Confirm again: "), /INPUT_CLOSED/);
  } finally { f.close(); }
});

test("Ctrl+C rejects authorization and restores terminal mode", async () => {
  const f = fixture();
  try {
    const rejected = assert.rejects(f.terminal.ask("Confirm: "), /INPUT_CANCELLED/);
    f.input.write("\u0003");
    await rejected;
    assert.deepEqual(f.modes, [true, false]);
  } finally { f.close(); }
});

test("EOF with an unterminated confirmation is not an answer", async () => {
  const f = fixture();
  try {
    const rejected = assert.rejects(f.terminal.ask("Confirm: "), /INPUT_CLOSED/);
    f.input.end("SIMULAR");
    await rejected;
  } finally { f.close(); }
});

test("input errors are sanitized rather than propagated with sensitive content", async () => {
  const f = fixture();
  try {
    const rejected = assert.rejects(f.terminal.ask("Hidden: "), /^Error: INPUT_READ_FAILED$/);
    f.input.emit("error", new Error("invented-sensitive-content"));
    await rejected;
    assert.ok(!f.text().includes("invented-sensitive-content"));
  } finally { f.close(); }
});

test("clears text already processed between prompts and does not pre-authorize", async () => {
  const f = fixture();
  try {
    f.input.write("SIMULAR\r\nleftover");
    await delay(0); // Let readline process idle text; do not drain stdin manually.
    const reply = f.terminal.ask("Confirm: ", { hidden: false, ignoreEmpty: true });
    f.input.write("OTHER\r\n");
    assert.equal(await reply, "OTHER");
  } finally { f.close(); }
});

test("buffered bytes are rejected without reading or silently discarding them", async () => {
  const f = fixture();
  try {
    f.input.pause();
    f.input.write("invented-buffered-answer\r\n");
    const length = f.input.readableLength;
    assert.ok(length > 0);
    await assert.rejects(f.terminal.ask("Hidden: "), /INPUT_PENDING_DATA/);
    assert.equal(f.input.readableLength, length);
    assert.equal(f.text(), "");
  } finally { f.close(); }
});

test("rejects pipes and previously closed streams before asking", () => {
  assert.throws(() => createInteractiveInput({ isTTY: false }, { isTTY: true }), /LOCAL_TTY_REQUIRED/);
  assert.throws(() => createInteractiveInput({ isTTY: true, readableEnded: true }, { isTTY: true }), /INPUT_CLOSED/);
});

const policy = { minPasswordLength: 16, requireUppercase: true, requireNumbers: true, requireSpecialChars: true };
const email = "fixture@example.invalid";
const valid = "Fictitious-Only-482!";
for (const [name, first, second, expected] of [
  ["valid", valid, valid, null],
  ["mismatch", valid, "Different-Fiction-482!", "PASSWORD_MISMATCH"],
  ["too short", "Short-2!", "Short-2!", "PASSWORD_POLICY_FAILED"],
  ["missing uppercase", "fictitious-only-482!", "fictitious-only-482!", "PASSWORD_POLICY_FAILED"],
  ["missing number", "Fictitious-Only-Text!", "Fictitious-Only-Text!", "PASSWORD_POLICY_FAILED"],
  ["missing special character", "FictitiousOnlyText482", "FictitiousOnlyText482", "PASSWORD_POLICY_FAILED"],
  ["contains email", `Fiction-482!${email.toUpperCase()}`, `Fiction-482!${email.toUpperCase()}`, "PASSWORD_CONTAINS_EMAIL"],
]) {
  test(`password validation: ${name}, safe code and correct phase`, async () => {
    const answers = [first, second];
    const phases = [];
    const operation = readValidatedPassword({ ask: async () => answers.shift() }, policy, email, (phase) => phases.push(phase));
    if (expected) {
      await assert.rejects(operation, (error) => {
        assert.equal(error.message, expected);
        const message = passwordErrorMessages[error.message];
        assert.ok(message.startsWith(expected));
        for (const sensitive of [first, second, email]) assert.ok(!message.includes(sensitive));
        assert.equal(error.cause, undefined);
        return true;
      });
    } else {
      // Boolean assertion avoids displaying a password even on test failure.
      assert.ok((await operation) === first);
    }
    assert.deepEqual(phases, ["password input (no writes)", "password validation (no writes)"]);
  });
}

test("terminal close during confirmation remains an input error, never a validation error", async () => {
  const f = fixture();
  const phases = [];
  try {
    const result = readValidatedPassword(f.terminal, policy, email, (phase) => phases.push(phase));
    const rejected = assert.rejects(result, /INPUT_CLOSED/);
    f.input.write(`${valid}\r\n`);
    await delay(0);
    f.input.end();
    await rejected;
    assert.deepEqual(phases, ["password input (no writes)"]);
    assert.ok(!f.text().includes(valid));
  } finally { f.close(); }
});

test("two hidden questions feed the real password validator without echo", async () => {
  const f = fixture();
  const phases = [];
  try {
    const result = readValidatedPassword(f.terminal, policy, email, (phase) => phases.push(phase));
    f.input.write(`${valid}\r\n`);
    await delay(0);
    f.input.write(`${valid}\r\n`);
    assert.ok((await result) === valid);
    assert.ok(!f.text().includes(valid));
    assert.deepEqual(phases, ["password input (no writes)", "password validation (no writes)"]);
  } finally { f.close(); }
});
