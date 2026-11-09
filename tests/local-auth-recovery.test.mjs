import test from "node:test";
import assert from "node:assert/strict";
import { memoryAdapter } from "better-auth/adapters/memory";
import { betterAuth } from "better-auth";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { PassThrough, Writable } from "node:stream";
import { spawnSync } from "node:child_process";
import { createLocalRecovery } from "../scripts/lib/local-auth-recovery.mjs";
import { hiddenInput } from "../scripts/lib/hidden-input.mjs";

test("official reset preserves existing identity, replaces password and revokes only target sessions", async () => {
  // Synthetic fixture only; never connected to Atlas or the actual admin.
  const db = {
    user: [{ id: "synthetic-owner", name: "Fixture", email: "owner@example.invalid", emailVerified: true, role: "admin", roles: ["admin"], permissions: ["fixture:read"], createdAt: new Date(), updatedAt: new Date() }],
    account: [{ id: "synthetic-account", userId: "synthetic-owner", providerId: "credential", accountId: "synthetic-owner", password: await hashPassword("Old-synthetic-password-123!") }],
    session: [{ id: "old-session", token: "synthetic-session", userId: "synthetic-owner", expiresAt: new Date(Date.now() + 60000) }, { id: "other-session", token: "other-synthetic-session", userId: "other-user", expiresAt: new Date(Date.now() + 60000) }],
    verification: [],
    orders: [{ id: "unrelated-order" }], inventory: [{ id: "unrelated-stock" }], fiscal: [{ id: "unrelated-fiscal" }],
  };
  const before = structuredClone({ user: db.user, orders: db.orders, inventory: db.inventory, fiscal: db.fiscal });
  const recovery = createLocalRecovery({ database: memoryAdapter(db), secret: "synthetic-secret-for-tests-only-at-least-32-characters", targetId: "synthetic-owner", email: "owner@example.invalid", minPasswordLength: 16 });
  const result = await recovery.reset("New-synthetic-password-456!");
  assert.equal(result, undefined, "No password or token is returned");
  assert.deepEqual({ user: db.user, orders: db.orders, inventory: db.inventory, fiscal: db.fiscal }, before);
  assert.equal(db.account.length, 1);
  assert.equal(db.account[0].id, "synthetic-account");
  assert.ok(await verifyPassword({ hash: db.account[0].password, password: "New-synthetic-password-456!" }));
  assert.ok(!await verifyPassword({ hash: db.account[0].password, password: "Old-synthetic-password-123!" }));
  assert.deepEqual(db.session.map(s => s.id), ["other-session"]);
  assert.equal(db.verification.length, 0, "Consumed token cannot be reused");
});

test("missing user cannot be created by recovery", async () => {
  const db = { user: [], account: [], session: [], verification: [] };
  const recovery = createLocalRecovery({ database: memoryAdapter(db), secret: "synthetic-secret-for-tests-only-at-least-32-characters", targetId: "missing", email: "missing@example.invalid", minPasswordLength: 16 });
  await assert.rejects(recovery.reset("Synthetic-valid-password-456!"), /RESET_NOT_ISSUED/);
  assert.deepEqual(db, { user: [], account: [], session: [], verification: [] });
});

test("installed Better Auth rejects expired and replayed reset tokens", async () => {
  const db = {
    user: [{ id: "fixture", name: "Fixture", email: "fixture@example.invalid", emailVerified: true }],
    account: [{ id: "fixture-account", userId: "fixture", providerId: "credential", accountId: "fixture", password: await hashPassword("Old-synthetic-password-123!") }],
    session: [], verification: [],
  };
  let token;
  const auth = betterAuth({
    database: memoryAdapter(db), baseURL: "http://localhost:3000",
    secret: "synthetic-secret-for-tests-only-at-least-32-characters",
    logger: { disabled: true },
    emailAndPassword: { enabled: true, resetPasswordTokenExpiresIn: 300, revokeSessionsOnPasswordReset: true, sendResetPassword: async (data) => { token = data.token; } },
  });
  await auth.api.requestPasswordReset({ body: { email: "fixture@example.invalid" } });
  db.verification[0].expiresAt = new Date(0);
  const reset = () => auth.api.resetPassword({ body: { token, newPassword: "New-synthetic-password-456!" } });
  await assert.rejects(reset(), error => error.body?.code === "INVALID_TOKEN");
  await auth.api.requestPasswordReset({ body: { email: "fixture@example.invalid" } });
  await reset();
  await assert.rejects(reset(), error => error.body?.code === "INVALID_TOKEN");
});

test("hidden input never echoes characters and refuses non-interactive input", async () => {
  assert.throws(() => hiddenInput("Password: ", { isTTY: false }, { isTTY: true }), /LOCAL_TTY_REQUIRED/);
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => {};
  let displayed = "";
  const output = new Writable({ write(chunk, _encoding, cb) { displayed += chunk; cb(); } });
  output.isTTY = true;
  const pending = hiddenInput("Password: ", input, output);
  input.write("synthetic-hidden-text\r");
  assert.equal(await pending, "synthetic-hidden-text");
  assert.equal(displayed, "Password: \n");
  input.destroy();
});

test("CLI cannot execute through an agent pipe and never echoes supplied arguments", () => {
  const refused = spawnSync(process.execPath, ["--import", "tsx", "scripts/recover-existing-admin.mjs", "--execute"], { encoding: "utf8" });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /private local interactive terminal/);
  const argumentsRejected = spawnSync(process.execPath, ["--import", "tsx", "scripts/recover-existing-admin.mjs", "synthetic-secret-argument"], { encoding: "utf8" });
  assert.equal(argumentsRejected.status, 1);
  assert.ok(!`${argumentsRejected.stdout}${argumentsRejected.stderr}`.includes("synthetic-secret-argument"));
});
