import { MongoClient } from "mongodb";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { isDeepStrictEqual } from "node:util";
import { loadDevEnv } from "./lib/dev-env.mjs";
import { hiddenInput } from "./lib/hidden-input.mjs";
import { createLocalRecovery } from "./lib/local-auth-recovery.mjs";
import { findAuthSecretProblem } from "../lib/auth/auth-secret.ts";
import { normalizePasswordPolicy, checkPasswordPolicy } from "../lib/auth/password-policy.ts";

const target = "melvin01rd@gmail.com";
const expectedId = "6ad19767a6d56eabba338093";
const args = process.argv.slice(2);
// No password argument, environment variable or piped input is supported.
if (args.length !== 1 || args[0] !== "--execute") {
  console.log("No changes. Read docs/IMP-AUTH-018-recovery.md; then run locally with --execute after identity verification and authorization.");
  process.exit(args.length ? 1 : 0);
}
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error("A private local interactive terminal is required. Do not run in an agent terminal or transcript.");
  process.exit(1);
}

let client;
let password;
let confirmation;
let phase = "preflight (no writes)";
try {
  const env = loadDevEnv();
  if (env.MONGODB_DB_NAME !== "storify_catalina_dev" || env.FISCAL_PROVIDER_MODE !== "dgii-free" || env.FISCAL_MEDASOFT_NETWORK !== "false") throw new Error();
  if (findAuthSecretProblem(env.BETTER_AUTH_SECRET)) throw new Error();
  client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000, maxPoolSize: 1 });
  await client.connect();
  const db = client.db("storify_catalina_dev");
  const users = await db.collection("user").find({ email: /^melvin01rd@gmail\.com$/i }, {
    projection: { _id: 1, email: 1, role: 1, roles: 1, permissions: 1, status: 1, emailVerified: 1, twoFactorEnabled: 1 },
  }).limit(2).toArray();
  if (users.length !== 1) throw new Error();
  const user = users[0];
  if (String(user._id) !== expectedId || user.email !== target || user.status !== "active" || !(user.role === "admin" || user.roles?.includes("admin"))) throw new Error();
  const userIds = [user._id, String(user._id)];
  const credentials = await db.collection("account").find({ userId: { $in: userIds }, providerId: "credential" }, { projection: { _id: 1, userId: 1 } }).toArray();
  // Refuse missing/duplicate/legacy-linked accounts instead of creating one.
  if (credentials.length !== 1 || !isDeepStrictEqual(credentials[0].userId, user._id)) throw new Error();
  console.log(`Existing active admin: ${target}; ID ${user._id}; database storify_catalina_dev.`);
  console.log("STOP unless the owner's identity has been independently verified and the recovery authorized. This terminal confirmation is an attestation, not identity verification.");
  const approval = await hiddenInput(`After verification, type AUTORIZO ${target}: `);
  if (approval !== `AUTORIZO ${target}`) throw new Error();
  const settings = await db.collection("settings").findOne({}, { projection: { security: 1 } });
  const policy = { ...normalizePasswordPolicy(settings?.security), requireUppercase: true, requireNumbers: true, requireSpecialChars: true };
  policy.minPasswordLength = Math.max(16, policy.minPasswordLength);
  console.log(`New unique password: ${policy.minPasswordLength}–128 characters, uppercase, number and special character. Input is hidden.`);
  password = await hiddenInput("New password: ");
  confirmation = await hiddenInput("Confirm password: ");
  if (password !== confirmation || checkPasswordPolicy(password, policy) || password.toLowerCase().includes(target)) throw new Error();
  confirmation = undefined;

  // Recheck identity/privileges immediately before mutation.
  const projection = { _id: 1, email: 1, role: 1, roles: 1, permissions: 1, status: 1, emailVerified: 1, twoFactorEnabled: 1 };
  if (!isDeepStrictEqual(user, await db.collection("user").findOne({ _id: user._id }, { projection }))) throw new Error();
  phase = "invalidate previous recovery links";
  await db.collection("passwordresets").updateMany({ userId: { $in: userIds }, used: false }, { $set: { used: true } });
  // Official reset values store a string user ID; never touch other verifications.
  await db.collection("verification").deleteMany({ value: String(user._id), identifier: /^reset-password:/ });
  phase = "Better Auth reset and session revocation";
  const recovery = createLocalRecovery({
    database: mongodbAdapter(db, { client, transaction: false }),
    secret: env.BETTER_AUTH_SECRET, targetId: String(user._id), email: target,
    minPasswordLength: policy.minPasswordLength,
  });
  await recovery.reset(password);
  password = undefined;
  phase = "post-reset verification";
  if (!isDeepStrictEqual(user, await db.collection("user").findOne({ _id: user._id }, { projection }))) throw new Error();
  if (await db.collection("session").countDocuments({ userId: { $in: userIds } })) throw new Error();
  const after = await db.collection("account").find({ userId: { $in: userIds }, providerId: "credential" }, { projection: { _id: 1, userId: 1 } }).toArray();
  if (!isDeepStrictEqual(credentials, after)) throw new Error();
  console.log("Password reset through Better Auth. Existing identity/roles/permissions preserved; all stored sessions revoked. Verify one browser login after correcting Preview origins.");
} catch {
  console.error(`Recovery stopped during: ${phase}. Details suppressed to protect secrets. If mutation had begun, do not assume rollback or retry automatically; inspect the account/session state first.`);
  process.exitCode = 1;
} finally {
  password = undefined;
  confirmation = undefined;
  await client?.close();
}
