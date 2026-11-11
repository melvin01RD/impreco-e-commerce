import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

test("DEV integration models cannot address shared commercial or fiscal collections", async () => {
  Object.assign(process.env, {
    MONGODB_URI: "mongodb://127.0.0.1:1/storify_catalina_dev",
    MONGODB_DB_NAME: "storify_catalina_dev", BETTER_AUTH_SECRET: "synthetic-secret",
    INSTALL_TOKEN: "synthetic-token", BETTER_AUTH_URL: "http://localhost:3000",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000", FISCAL_PROVIDER_MODE: "dgii-free",
    FISCAL_MEDASOFT_NETWORK: "false", NODE_ENV: "development",
  });
  await import("../scripts/lib/fiscal-dev-isolation.mjs");
  await import("../models/order.model");
  await import("../models/fiscal-case.model");
  await import("../models/fiscal-invoice.model");
  const names = Object.values(mongoose.models).map(model => model.collection.collectionName);
  assert.ok(names.length >= 6);
  assert.ok(names.every(name => /^__impreco_test_[a-f0-9]{32}_/.test(name)));
  assert.equal(new Set(names.map(name => name.slice(0, 48))).size, 1);
  assert.equal(mongoose.connection.readyState, 0);
});
