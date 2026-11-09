import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { MongoClient } from "mongodb";
import { loadDevEnv, validateDevEnv } from "./lib/dev-env.mjs";

let client;
try {
  const env = loadDevEnv();
  if (validateDevEnv(env).length) throw new Error();
  const id = process.argv[2];
  if (!id || !/^[a-f0-9]{32}$/.test(id)) throw new Error();
  const path = join(process.cwd(), ".fiscal-test-runs", `integration-${id}.json`);
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  const prefix = `__impreco_test_${id}_`;
  if (manifest.runId !== id || !Array.isArray(manifest.collections) || !manifest.collections.length ||
      !manifest.collections.every(name => typeof name === "string" && name.startsWith(prefix) && /^[a-zA-Z0-9_]+$/.test(name))) throw new Error();
  client = await MongoClient.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  const db = client.db("storify_catalina_dev");
  for (const name of manifest.collections) {
    try { await db.dropCollection(name); } catch (error) { if (error.code !== 26) throw error; }
  }
  unlinkSync(path);
  console.log("Only the selected run's synthetic collections were removed.");
} catch {
  console.error("Cleanup refused or failed. Check DEV configuration and the exact integration run manifest; no broad cleanup is allowed.");
  process.exitCode = 1;
} finally { await client?.close(); }
