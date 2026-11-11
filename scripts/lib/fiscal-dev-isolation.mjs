import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadDevEnv, validateDevEnv } from "./dev-env.mjs";

// Imported BEFORE application models by integration tests. No production code
// or schema changes: all models in this test process use run-owned collections.
const env = loadDevEnv();
const errors = validateDevEnv(env);
if (errors.length) throw new Error(errors.join("\n"));
// Transition tests may enable the provider gate for synthetic results. They
// must never inherit usable provider credentials from the developer's file.
for (const key of Object.keys(process.env)) if (key.startsWith("MEDASOFT_")) process.env[key] = "";
if (Object.keys(mongoose.models).length) throw new Error("Load DEV isolation before any model.");
const runId = randomUUID().replaceAll("-", "");
const prefix = `__impreco_test_${runId}_`;
const manifestPath = join(process.cwd(), ".fiscal-test-runs", `integration-${runId}.json`);
const collections = new Set();
const originalModel = mongoose.model;
mongoose.model = function (name, schema, collection, options) {
  if (!schema) return originalModel.call(this, name);
  const isolated = prefix + (collection || schema.options.collection || mongoose.pluralize()(name));
  collections.add(isolated);
  return originalModel.call(this, name, schema, isolated, options);
};

export async function connectFiscalDevSandbox() {
  let ownsCollections = false;
  async function cleanup() {
    if (ownsCollections) for (const name of collections) {
      if (!name.startsWith(prefix) || mongoose.connection.db.databaseName !== "storify_catalina_dev") {
        throw new Error("Refusing cleanup outside this DEV test run.");
      }
      try { await mongoose.connection.db.dropCollection(name); }
      catch (error) { if (error.code !== 26) throw new Error(`DEV cleanup failed; retain integration-${runId}.json.`); }
    }
    if (existsSync(manifestPath)) unlinkSync(manifestPath);
  }
  try {
    await mongoose.connect(env.MONGODB_URI, {
      dbName: "storify_catalina_dev", serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000, autoCreate: false, autoIndex: false,
    });
    if (!await mongoose.connection.db.listCollections({ name: "settings" }).hasNext()) {
      throw new Error("DEV must already exist and contain settings.");
    }
    if (await mongoose.connection.db.listCollections({ name: { $in: [...collections] } }).hasNext()) {
      throw new Error("Test collection collision.");
    }
    mkdirSync(join(process.cwd(), ".fiscal-test-runs"), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify({ runId, collections: [...collections] }));
    ownsCollections = true;
    // Explicit collection/index initialization is necessary for transaction tests.
    for (const model of Object.values(mongoose.models)) {
      await model.createCollection();
      await model.createIndexes();
    }
  } catch {
    try { await cleanup(); } finally { await mongoose.disconnect(); }
    throw new Error("Fiscal DEV setup failed. Run pnpm db:check; no temporary database is used.");
  }
  return {
    async close() {
      try {
        await cleanup();
      } finally { await mongoose.disconnect(); }
    },
  };
}
