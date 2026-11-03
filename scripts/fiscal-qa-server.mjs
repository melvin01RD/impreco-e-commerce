import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { MongoClient, ObjectId } from "mongodb";
import { hashPassword } from "better-auth/crypto";

// Clear local application configuration in the CHILD environment before Next loads dotenv.
// Only keys are parsed; values are never used or printed. The user's files stay untouched.
const env = { ...process.env };
for (const file of [".env", ".env.local", ".env.development", ".env.development.local", ".env.production", ".env.production.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match && !["PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "TEMP", "TMP", "COMSPEC"].includes(match[1].toUpperCase())) env[match[1]] = "";
  }
}
const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: "8.0.17", downloadDir: "node_modules/.cache/mongodb-binaries" } });
const uri = replica.getUri();
const client = await MongoClient.connect(uri);
await client.db("fiscal_qa").collection("settings").insertOne({ key: "singleton", installedAt: new Date(), general: { storeName: "IMPRECO QA aislado", defaultCurrency: "DOP", defaultLanguage: "es" }, maintenance: { enabled: false } });
const password = await hashPassword("Synthetic-QA-Only-2026!");
for (const role of ["admin", "customer"]) {
  const id = new ObjectId();
  await client.db("fiscal_qa").collection("user").insertOne({ _id: id, name: `QA ${role}`, email: `${role}@fiscal-test.invalid`, emailVerified: true, role, roles: [role], status: "active", createdAt: new Date(), updatedAt: new Date() });
  await client.db("fiscal_qa").collection("account").insertOne({ userId: id, accountId: id.toString(), providerId: "credential", password, createdAt: new Date(), updatedAt: new Date() });
  if (role === "customer") await client.db("fiscal_qa").collection("orders").insertOne({
    _id: new ObjectId("000000000000000000000011"), orderNumber: "QA-PDF-001", customerId: id,
    items: [{ productId: new ObjectId(), vendorId: new ObjectId(), name: "Synthetic product", sku: "QA-001", price: 100, quantity: 1 }],
    shippingAddress: { fullName: "Synthetic customer", street: "Test", city: "Test", state: "Test", country: "DO", postalCode: "00000" },
    subtotal: 100, tax: 18, discount: 0, shippingCost: 0, total: 118, paymentStatus: "paid", paymentMethod: "cod", status: "delivered", subOrders: [], createdAt: new Date(), updatedAt: new Date(),
  });
}
await client.close();
const build = process.argv[2] === "build";
Object.assign(env, {
  MONGODB_URI: uri, MONGODB_DB_NAME: "fiscal_qa", MONGODB_MAX_POOL_SIZE: "5",
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:3197",
  NEXT_PUBLIC_APP_URL: "http://localhost:3197", NEXT_DIST_DIR: build ? ".next-fiscal-build" : ".next-fiscal-e2e",
  BUILD_MAX_CPUS: "2", NEXT_TELEMETRY_DISABLED: "1", NODE_OPTIONS: "--max-old-space-size=6144",
  NODE_ENV: build ? "production" : "development", MEDASOFT_SANDBOX_API_KEY: "", MEDASOFT_SANDBOX_API_SECRET: "", MEDASOFT_SANDBOX_ISSUER_RNC: "",
});
const args = ["node_modules/next/dist/bin/next", ...(build ? ["build", "--webpack"] : ["dev", "--webpack", "--hostname", "localhost", "--port", "3197"])];
const child = spawn(process.execPath, args, { env, stdio: "inherit", windowsHide: true });
const cleanup = async () => {
  if (process.platform === "win32" && child.pid) {
    // Next dev has a child server: terminate only the tree this launcher owns.
    await new Promise(resolve => {
      const stop = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      stop.once("exit", resolve); stop.once("error", resolve);
    });
  } else child.kill();
  await replica.stop();
};
process.once("SIGINT", cleanup);
process.once("SIGTERM", cleanup);
child.once("error", async () => { await replica.stop(); process.exitCode = 1; });
child.once("exit", async code => { await replica.stop(); process.exitCode = code ?? 1; });
