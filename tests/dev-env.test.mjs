import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { validateDevEnv } from "../scripts/lib/dev-env.mjs";

const valid = {
  MONGODB_URI: "mongodb://synthetic:secret@127.0.0.1:27017/storify_catalina_dev",
  MONGODB_DB_NAME: "storify_catalina_dev", BETTER_AUTH_SECRET: "synthetic-secret",
  INSTALL_TOKEN: "synthetic-install", BETTER_AUTH_URL: "http://localhost:3000",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000", FISCAL_PROVIDER_MODE: "dgii-free",
  FISCAL_MEDASOFT_NETWORK: "false",
};
test("DEV validation accepts complete configuration without connecting", () => {
  assert.deepEqual(validateDevEnv(valid), []);
});
test("placeholder errors never echo a URI or its password", () => {
  const errors = validateDevEnv({ ...valid, MONGODB_URI: "mongodb+srv://synthetic:sensitive@<cluster-host>/dev" });
  assert.ok(errors.some(e => e.includes("MONGODB_URI")));
  assert.ok(!errors.join().includes("sensitive"));
});
test("DEV commands reject QA databases and production runtime", () => {
  assert.ok(validateDevEnv({ ...valid, MONGODB_DB_NAME: "impreco_qa" }).length);
  assert.ok(validateDevEnv({ ...valid, NODE_ENV: "production" }).length);
});
test("URI examples without angle brackets are rejected", () => {
  for (const host of ["cluster.xxxxx.mongodb.net", "example.mongodb.net", "host.invalid"]) {
    assert.ok(validateDevEnv({ ...valid, MONGODB_URI: `mongodb+srv://synthetic:secret@${host}/storify_catalina_dev` }).length);
  }
});
test("DEV validation rejects enabled fiscal network and nonlocal auth origins", () => {
  assert.ok(validateDevEnv({ ...valid, FISCAL_MEDASOFT_NETWORK: "true" }).length);
  assert.ok(validateDevEnv({ ...valid, BETTER_AUTH_URL: "https://example.invalid" }).length);
});

test("Atlas SRV syntax and encoded credential characters pass without connecting", () => {
  // Synthetic credentials and hostname; validates syntax, not Atlas availability.
  const uri = "mongodb+srv://dev-user:placeholder%40your_secret%24@cluster0.abc12.mongodb.net/storify_catalina_dev?retryWrites=true&w=majority";
  assert.deepEqual(validateDevEnv({ ...valid, MONGODB_URI: uri }), []);
  const result = spawnSync(process.execPath, ["scripts/check-mongodb.mjs", "--config-only"], {
    encoding: "utf8", timeout: 10000,
    env: { ...process.env, ...valid, MONGODB_URI: uri, NODE_ENV: "development" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("Configuración DEV válida"));
  assert.ok(!(result.stdout + result.stderr).includes(uri));
  assert.ok(!(result.stdout + result.stderr).includes("placeholder%40"));
});

test("driver rejects malformed connection strings without exposing them", () => {
  for (const uri of ["https://localhost/dev", "mongodb://", "mongodb+srv://host:27017/dev"]) {
    const errors = validateDevEnv({ ...valid, MONGODB_URI: uri });
    assert.ok(errors.some(error => error.startsWith("MONGODB_URI:")));
    assert.ok(!errors.join().includes(uri));
  }
});
