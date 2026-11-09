import { MongoClient } from "mongodb";
import { loadDevEnv } from "./lib/dev-env.mjs";
import { diagnoseMongoError } from "./lib/mongodb-diagnostic.mjs";
import { findAuthSecretProblem } from "../lib/auth/auth-secret.ts";
import { resolveSmtpConfig } from "../lib/settings/credentials.ts";

const env = loadDevEnv();
const target = "melvin01rd@gmail.com";
const preview = "https://impreco-pnjxsyit4-melvin01rds-projects.vercel.app";
let client;
const deadline = setTimeout(() => { console.error("Inspection timed out; no writes."); process.exit(1); }, 25000);
try {
  if (env.MONGODB_DB_NAME !== "storify_catalina_dev") throw new Error("DEV_REQUIRED");
  console.log(JSON.stringify({
    scope: "local environment; not Vercel environment variables",
    secretCheck: findAuthSecretProblem(env.BETTER_AUTH_SECRET)?.kind ?? "passes local minimum checks",
    authUrlMatchesPreview: env.BETTER_AUTH_URL === preview,
    publicUrlMatchesPreview: env.NEXT_PUBLIC_APP_URL === preview,
  }));
  client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000, maxPoolSize: 1 });
  await client.connect();
  const db = client.db("storify_catalina_dev");
  const users = await db.collection("user").find({ email: /^melvin01rd@gmail\.com$/i }, {
    projection: { _id: 1, email: 1, role: 1, roles: 1, status: 1, emailVerified: 1, twoFactorEnabled: 1 },
  }).limit(2).toArray();
  console.log(JSON.stringify({ database: "storify_catalina_dev", target, matches: users.length }));
  if (users.length !== 1) throw new Error("UNIQUE_USER_REQUIRED");
  const user = users[0];
  console.log(JSON.stringify({ id: String(user._id), role: user.role, roles: user.roles, status: user.status, emailVerified: user.emailVerified, twoFactorEnabled: Boolean(user.twoFactorEnabled) }));
  const ids = [user._id, String(user._id)];
  // The server projects a boolean. The stored hash never leaves MongoDB.
  const accounts = await db.collection("account").aggregate([
    { $match: { userId: { $in: ids }, providerId: "credential" } },
    { $project: { _id: 0, hasPassword: { $and: [{ $eq: [{ $type: "$password" }, "string"] }, { $ne: ["$password", ""] }] }, userIdType: { $type: "$userId" } } },
  ]).toArray();
  const settings = await db.collection("settings").findOne({}, { projection: { email: 1, "security.smtpVerifiedAt": 1 } });
  console.log(JSON.stringify({ credentialAccounts: accounts, activeSessions: await db.collection("session").countDocuments({ userId: { $in: ids }, expiresAt: { $gt: new Date() } }), smtpConfiguredLocallyOrInDatabase: Boolean(resolveSmtpConfig(settings)), priorSmtpVerificationRecorded: Boolean(settings?.security?.smtpVerifiedAt) }));
  if (process.argv.includes("--preview")) {
    const response = await fetch(`${preview}/api/auth/get-session`, { redirect: "manual", signal: AbortSignal.timeout(10000) });
    const location = response.headers.get("location");
    const redirect = location ? new URL(location, preview) : null;
    console.log(JSON.stringify({ previewAnonymousSessionProbe: response.status, redirectHost: redirect?.hostname, vercelAuthenticationGate: redirect?.hostname === "vercel.com" && /sso|login/.test(redirect.pathname), note: "No credentials or cookies sent. Redirect query omitted. This does not verify the remote database name or administrator access." }));
  }
} catch (error) {
  const safe = ["DEV_REQUIRED", "UNIQUE_USER_REQUIRED"].includes(error?.message) ? error.message : diagnoseMongoError(error);
  console.error(`Inspection failed: ${safe}`);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  await client?.close();
}
